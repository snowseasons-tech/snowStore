// Post-purchase welcome series for downloadable products (playbook section 6).
// Email 1 is the purchase email fulfil.js already sends (the order page with the download links).
// This module records emails 2 and 3 at purchase time, and sends the ones that are due when runDue() is called.
const { downloadsFor } = require('./entitlements');

const HOUR_MS = 60 * 60 * 1000;
const STEPS = [
  { step: 'quickstart', delayMs: 24 * HOUR_MS },
  { step: 'faq', delayMs: 72 * HOUR_MS },
];
const PENDING = 'welcome:pending';
const CONTACT = 'snowseasons@protonmail.com';
const LEASE_SEC = 10 * 60;
// A sent step is marked for longer than any retry window, so it is never sent twice.
const DONE = 'done';
const DONE_TTL_SEC = 400 * 24 * 60 * 60;

// Subscriptions have their own billing emails. Only one-time purchases that give a download get this series.
const eligible = (productId, product, catalog) => !!product && product.kind !== 'subscription'
  && downloadsFor(productId, catalog).length > 0;

function templates({ step, productName, orderUrl, siteUrl, videoUrl, docsUrl }) {
  if (step === 'quickstart') {
    return {
      subject: `Get started with ${productName}`,
      text: [
        `Thanks again for buying ${productName}. Here is a quick start.`,
        '',
        `1. Download your files from your order page: ${orderUrl}`,
        '2. Open the files and follow the instructions included with them.',
        `3. If something doesn't work, reply to this email or write to ${CONTACT}.`,
        ...(videoUrl ? ['', `Five-minute video walkthrough: ${videoUrl}`] : []),
        ...(docsUrl ? ['', `Full guide: ${docsUrl}`] : []),
        '',
        'Snow Seasons Tech',
      ].join('\n'),
    };
  }
  if (step === 'faq') {
    return {
      subject: `Questions about ${productName}?`,
      text: [
        `A few things buyers ask most about ${productName}:`,
        '',
        `- Licence and use: see the terms at ${siteUrl}/terms`,
        `- Refunds: see ${siteUrl}/refund`,
        `- Done-for-you setup and staff training: we can set ${productName} up with you. Reply to this email or write to ${CONTACT} and we'll talk it through.`,
        '',
        `Your order page, with your download links: ${orderUrl}`,
        '',
        'Snow Seasons Tech',
      ].join('\n'),
    };
  }
  throw new Error(`unknown welcome step ${step}`);
}

// Records the series for a paid order. Safe to call again: the first call wins. Returns true if it scheduled anything.
async function schedule(db, sessionId, { email, productId, productName, product, catalog, siteUrl, now = Date.now() }) {
  if (!email || !eligible(productId, product, catalog)) return false;
  const key = `welcome:${sessionId}`;
  if (await db.getJSON(key)) return false;
  const record = {
    sessionId, email, productName, siteUrl,
    steps: STEPS.map(({ step, delayMs }) => ({ step, sendAt: new Date(now + delayMs).toISOString() })),
  };
  // Add to the pending set before writing the record, so a failure in between can't leave a record nobody sends.
  await db.addMember(PENDING, sessionId);
  return db.setJSONIfAbsent(key, record);
}

// Sends every due email. Each step is claimed before it is sent and marked done afterwards, so two runs
// can't both send it. A failed or skipped send is released and tried again on the next run.
// Returns { sent, failed, skipped, waiting }.
async function runDue({ now = Date.now(), db, mailer, env = process.env, limit = 50 }) {
  const counts = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const ids = (await db.members(PENDING)).slice(0, limit);
  for (const id of ids) {
    const rec = await db.getJSON(`welcome:${id}`);
    if (!rec) continue;
    for (const s of rec.steps) {
      const key = `welcome-sent:${id}:${s.step}`;
      if ((await db.getJSON(key)) === DONE) continue;
      if (new Date(s.sendAt).getTime() > now) { counts.waiting++; continue; }
      if (!(await db.claim(key, LEASE_SEC))) { counts.waiting++; continue; }
      const siteUrl = rec.siteUrl || env.SITE_URL || 'https://snowseasonstech.store';
      const mail = templates({
        step: s.step,
        productName: rec.productName,
        orderUrl: `${siteUrl}/success?session_id=${id}`,
        siteUrl,
        videoUrl: env.WELCOME_VIDEO_URL || '',
        docsUrl: env.WELCOME_DOCS_URL || '',
      });
      try {
        const result = await mailer.sendMail({ to: rec.email, subject: mail.subject, text: mail.text }, env);
        if (result === 'sent') {
          await db.setJSON(key, DONE, DONE_TTL_SEC);
          counts.sent++;
        } else {
          // Mail isn't configured here (the mailer returns 'skipped'): leave the step for a later run.
          await db.release(key);
          counts.skipped++;
        }
      } catch (e) {
        await db.release(key).catch(() => {});
        counts.failed++;
        console.error('welcome send', id, s.step, e.message);
      }
    }
  }
  return counts;
}

module.exports = { STEPS, PENDING, eligible, templates, schedule, runDue };
