// Digital gift certificates (playbook section 6). Stage 5: codes, creation, single-use redemption and the
// certificate page. Not wired to checkout, email or a download endpoint yet; see marketing/christmas-2026/gift-certificates.md.
const crypto = require('crypto');
const CATALOG = require('./catalog');
const store = require('./store');
const { downloadsFor } = require('./entitlements');
const mail = require('./mail');

// Codes use no 0/O, 1/I or L, so they are easy to read aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PREFIX = 'SNOW-2027-';
const CODE_PATTERN = new RegExp(`^${PREFIX}[${ALPHABET}]{4}$`);
// Valid through Dec 31, 2027 (end of day, UTC).
const EXPIRES_AT = Date.UTC(2027, 11, 31, 23, 59, 59);
const MAX_ATTEMPTS = 5;

class GiftError extends Error {}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A product can be given only if it is on sale in its own right and gives a download: its own file, or a bundle's files.
// Subscriptions are not given: a gift has no billing to end.
const giftable = (product) => !!product && !product.retired && !product.draft && !product.hidden
  && !!product.stripeProduct && product.kind !== 'subscription' && (!!product.fileKey || Array.isArray(product.includes));

function newCode() {
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return PREFIX + tail;
}

// Accepts a code typed in any case, with spaces or a missing prefix dash.
function normalize(code) {
  const c = String(code || '').toUpperCase().replace(/\s+/g, '');
  return CODE_PATTERN.test(c) ? c : null;
}

const text = (value, max, field) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > max) throw new GiftError(`${field} must be 1 to ${max} characters`);
  return v;
};
const email = (value, field) => {
  const v = text(value, 254, field);
  if (!v.includes('@')) throw new GiftError(`${field} must be an email address`);
  return v;
};

// Checks the buyer's details for a gift. Returns them trimmed; throws GiftError if anything is wrong.
function validateGiftInput(input = {}) {
  const message = input.message == null ? '' : String(input.message).trim();
  if (message.length > 500) throw new GiftError('Message must be 500 characters or fewer');
  return {
    buyerName: text(input.buyerName, 100, 'Your name'),
    buyerEmail: input.buyerEmail == null ? '' : email(input.buyerEmail, 'Your email'),
    recipientEmail: email(input.recipientEmail, 'Recipient email'),
    message,
  };
}

// Stripe checkout metadata for a gift. The webhook reads these back (see fulfilGiftSession).
// The buyer's email comes from Stripe, so it isn't sent here.
function giftMetadata(productId, input) {
  const g = validateGiftInput({ ...input, buyerEmail: 'buyer@example.com' });
  return {
    product_id: productId,
    gift: 'true',
    gift_buyer_name: g.buyerName,
    gift_recipient_email: g.recipientEmail,
    gift_message: g.message,
  };
}

// Creates an unused certificate for one catalog product. Returns the stored record.
async function createGift(input, { now = Date.now(), db = store, catalog = CATALOG } = {}) {
  if (now >= EXPIRES_AT) throw new GiftError('Gift certificates are no longer available');
  const product = Object.prototype.hasOwnProperty.call(catalog, input.productId) ? catalog[input.productId] : null;
  if (!giftable(product)) throw new GiftError('This product cannot be given as a gift');
  const checked = validateGiftInput(input);
  const record = {
    productId: input.productId,
    productName: product.name,
    buyerName: checked.buyerName,
    buyerEmail: email(input.buyerEmail, 'Your email'),
    recipientEmail: checked.recipientEmail,
    message: checked.message,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(EXPIRES_AT).toISOString(),
    redeemedAt: null,
    redeemedBy: null,
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = newCode();
    if (await db.setJSONIfAbsent(`gift:${code}`, { ...record, code })) return { ...record, code };
  }
  throw new GiftError('Could not create a unique code, please try again');
}

async function getGift(code, { db = store } = {}) {
  const c = normalize(code);
  if (!c) return null;
  const rec = await db.getJSON(`gift:${c}`);
  return rec ? { ...rec, code: c } : null;
}

// Says whether a code can be used now. Returns { status, gift? } where status is
// 'valid' | 'redeemed' | 'expired' | 'not_found' | 'invalid_format'.
async function checkGift(code, { now = Date.now(), db = store } = {}) {
  if (!normalize(code)) return { status: 'invalid_format' };
  const gift = await getGift(code, { db });
  if (!gift) return { status: 'not_found' };
  // The marker is the source of truth; the record can lag behind it if its update fails.
  if (gift.redeemedAt || await db.getJSON(`gift-redeemed:${gift.code}`)) return { status: 'redeemed', gift };
  if (now > EXPIRES_AT) return { status: 'expired', gift };
  return { status: 'valid', gift };
}

// Redeems a code once. The first claim wins even if two requests race: setJSONIfAbsent is atomic.
// Returns { gift, downloads } so the caller can grant the product's files.
async function redeemGift(code, redeemerEmail, { now = Date.now(), db = store, catalog = CATALOG } = {}) {
  const who = email(redeemerEmail, 'Your email');
  const found = await checkGift(code, { now, db });
  if (found.status !== 'valid') throw new GiftError({
    not_found: 'Code not found',
    invalid_format: 'Enter a code like SNOW-2027-XXXX',
    redeemed: 'This code has already been used',
    expired: 'This code has expired',
  }[found.status]);
  const { gift } = found;
  const claimed = await db.setJSONIfAbsent(`gift-redeemed:${gift.code}`, { redeemedBy: who, at: new Date(now).toISOString() });
  if (!claimed) throw new GiftError('This code has already been used');
  const updated = { ...gift, redeemedAt: new Date(now).toISOString(), redeemedBy: who };
  delete updated.code;
  await db.setJSON(`gift:${gift.code}`, updated);
  // Lets the redeemed code fetch its files later (see functions/api/gift-download.js). Keyed by code, so no one else can use it.
  await db.setJSON(`gift-access:${gift.code}`, { productId: gift.productId, redeemedAt: updated.redeemedAt });
  return { gift: updated, downloads: downloadsFor(gift.productId, catalog) };
}

// Called by the Stripe webhook for a paid gift session. Creates the certificate once per session, then emails
// the recipient the code and the buyer a copy. Throws if mail isn't configured or fails, so Stripe retries.
async function fulfilGiftSession(session, { db = store, mailer = mail, env = process.env, now = Date.now(), catalog = CATALOG } = {}) {
  const meta = session.metadata || {};
  const claimKey = `gift-session:${session.id}`;
  let rec = await db.getJSON(claimKey);
  if (!rec) {
    const created = await createGift({
      productId: meta.product_id,
      buyerName: meta.gift_buyer_name,
      buyerEmail: (session.customer_details && session.customer_details.email) || '',
      recipientEmail: meta.gift_recipient_email,
      message: meta.gift_message,
    }, { now, db, catalog });
    rec = { code: created.code, productName: created.productName, buyerEmail: created.buyerEmail, recipientEmail: created.recipientEmail };
    // Two deliveries of one session can race. The first record stored wins; the loser's code is never sent.
    if (!(await db.setJSONIfAbsent(claimKey, rec))) rec = await db.getJSON(claimKey);
  }
  const siteUrl = env.SITE_URL || 'https://snowseasonstech.store';
  const redeemUrl = `${siteUrl}/gift.html?code=${rec.code}`;
  const sends = [
    {
      part: 'recipient', to: rec.recipientEmail,
      subject: `A gift for you: ${rec.productName}`,
      text: [
        `${meta.gift_buyer_name || 'Someone'} sent you a gift: ${rec.productName}.`,
        ...(meta.gift_message ? ['', meta.gift_message] : []),
        '',
        `Your code: ${rec.code}`,
        `Redeem it here: ${redeemUrl}`,
        `Valid through ${new Date(EXPIRES_AT).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}. One use.`,
        '',
        'Snow Seasons Tech',
      ].join('\n'),
    },
    {
      part: 'buyer', to: rec.buyerEmail,
      subject: `Your gift certificate for ${rec.productName}`,
      text: [
        `Thanks for your gift of ${rec.productName} to ${rec.recipientEmail}.`,
        '',
        `The code is ${rec.code}. We've also emailed it to them.`,
        `They can redeem it at: ${redeemUrl}`,
        '',
        'Snow Seasons Tech',
      ].join('\n'),
    },
  ];
  for (const m of sends) {
    if (!m.to) continue;
    const key = `gift-mail:${session.id}:${m.part}`;
    if ((await db.getJSON(key)) === 'done') continue;
    if (!(await db.claim(key, 10 * 60))) continue;
    try {
      const result = await mailer.sendMail({ to: m.to, subject: m.subject, text: m.text }, env);
      if (result !== 'sent') throw new Error(`gift mail not sent (${result})`);
      await db.setJSON(key, 'done', 400 * 24 * 60 * 60);
    } catch (e) {
      await db.release(key).catch(() => {});
      throw e;
    }
  }
  return 'gift';
}

// A standalone, printable certificate page. All user text is escaped.
function renderCertificate(gift, { siteUrl = 'https://snowseasonstech.store' } = {}) {
  const expires = new Date(gift.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const message = gift.message ? `<blockquote>${esc(gift.message)}</blockquote>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gift certificate ${esc(gift.code)}</title>
<style>
body{font-family:Georgia,serif;background:#f4f7fb;color:#101e39;margin:0;padding:24px}
.cert{max-width:680px;margin:0 auto;background:#fff;border:3px double #1f4e79;border-radius:12px;padding:40px;text-align:center}
h1{font-size:2rem;margin:0 0 8px}
.code{font-family:monospace;font-size:1.5rem;letter-spacing:.08em;margin:24px 0;padding:12px;border:1px dashed #1f4e79}
blockquote{font-style:italic;margin:20px auto;max-width:480px}
.fine{font-size:.9rem;color:#4a5568}
@media print{body{background:#fff}.cert{border-width:2px}}
</style></head>
<body><main class="cert">
<p>Snow Seasons Technologies gift certificate</p>
<h1>${esc(gift.productName)}</h1>
<p>A gift from ${esc(gift.buyerName)}</p>
${message}
<div class="code">${esc(gift.code)}</div>
<p>Redeem at <a href="${esc(siteUrl)}">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a> with this code.</p>
<p class="fine">Valid through ${esc(expires)}. One use. Questions: snowseasons@protonmail.com</p>
</main></body></html>`;
}

module.exports = {
  GiftError, EXPIRES_AT, ALPHABET, giftable, newCode, normalize, validateGiftInput, giftMetadata,
  createGift, getGift, checkGift, redeemGift, fulfilGiftSession, renderCertificate,
};
