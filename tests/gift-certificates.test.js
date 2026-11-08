const test = require('node:test');
const assert = require('node:assert');
const CATALOG = require('../api/_lib/catalog');
const store = require('../api/_lib/store');
const gift = require('../api/_lib/gift');

const NOW = Date.UTC(2026, 11, 1);
const buyer = { buyerName: 'Ada Buyer', buyerEmail: 'ada@example.com', recipientEmail: 'sam@example.com', message: 'Happy holidays!' };
const giftOf = (productId = 'booking-app', extra = {}) => ({ productId, ...buyer, ...extra });
const opts = { now: NOW, db: store, catalog: CATALOG };

test('codes look like SNOW-2027-XXXX and avoid easily confused characters', () => {
  const pattern = /^SNOW-2027-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
  for (let i = 0; i < 500; i++) assert.match(gift.newCode(), pattern);
  for (const bad of ['0', 'O', '1', 'I', 'L']) assert.ok(!gift.ALPHABET.includes(bad), `${bad} is excluded`);
});

test('a certificate can be created for a product on sale, and is stored under its code', async () => {
  const rec = await gift.createGift(giftOf(), opts);
  assert.match(rec.code, /^SNOW-2027-/);
  assert.strictEqual(rec.productName, CATALOG['booking-app'].name);
  assert.strictEqual(rec.redeemedAt, null);
  assert.strictEqual(rec.expiresAt, new Date(gift.EXPIRES_AT).toISOString());
  const stored = await gift.getGift(rec.code, opts);
  assert.strictEqual(stored.buyerName, 'Ada Buyer');
});

test('products that cannot be given are refused', async () => {
  for (const productId of ['christmas-solopreneur', 'business-launch', 'founders-membership', 'no-such-product']) {
    await assert.rejects(gift.createGift(giftOf(productId), opts), gift.GiftError, productId);
  }
  // A retired product is refused too.
  const retired = Object.keys(CATALOG).find((id) => CATALOG[id].retired && CATALOG[id].fileKey);
  if (retired) await assert.rejects(gift.createGift(giftOf(retired), opts), gift.GiftError);
});

test('creation checks the buyer, recipient and message', async () => {
  await assert.rejects(gift.createGift(giftOf('booking-app', { buyerName: '  ' }), opts), /Your name/);
  await assert.rejects(gift.createGift(giftOf('booking-app', { recipientEmail: 'not-an-email' }), opts), /Recipient email/);
  await assert.rejects(gift.createGift(giftOf('booking-app', { message: 'x'.repeat(501) }), opts), /500 characters/);
});

test('no certificates are sold after the year they are valid for ends', async () => {
  await assert.rejects(gift.createGift(giftOf(), { ...opts, now: gift.EXPIRES_AT }), /no longer available/);
});

test('a code is used once, however it is typed, and grants the product files', async () => {
  const rec = await gift.createGift(giftOf('booking-app'), opts);
  const typed = `  ${rec.code.toLowerCase().slice(0, 9)} ${rec.code.slice(9)}  `;
  const first = await gift.redeemGift(typed, 'sam@example.com', opts);
  assert.deepStrictEqual(first.downloads.map((d) => d.id), ['booking-app']);
  assert.strictEqual(first.gift.redeemedBy, 'sam@example.com');
  await assert.rejects(gift.redeemGift(rec.code, 'other@example.com', opts), /already been used/);
  assert.strictEqual((await gift.checkGift(rec.code, opts)).status, 'redeemed');
});

test('a code whose redemption marker is set counts as used, even if the record lags behind', async () => {
  const rec = await gift.createGift(giftOf('booking-app'), opts);
  await store.setJSONIfAbsent(`gift-redeemed:${rec.code}`, { redeemedBy: 'sam@example.com', at: new Date(NOW).toISOString() });
  assert.strictEqual((await gift.checkGift(rec.code, opts)).status, 'redeemed');
  await assert.rejects(gift.redeemGift(rec.code, 'sam@example.com', opts), /already been used/);
});

test('two simultaneous redemptions: exactly one succeeds', async () => {
  const rec = await gift.createGift(giftOf('booking-app'), opts);
  const results = await Promise.allSettled([
    gift.redeemGift(rec.code, 'a@example.com', opts),
    gift.redeemGift(rec.code, 'b@example.com', opts),
  ]);
  assert.strictEqual(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('checkGift reports each status', async () => {
  assert.strictEqual((await gift.checkGift('nope', opts)).status, 'invalid_format');
  assert.strictEqual((await gift.checkGift('SNOW-2027-AAAA', opts)).status, 'not_found');
  const rec = await gift.createGift(giftOf(), opts);
  assert.strictEqual((await gift.checkGift(rec.code, opts)).status, 'valid');
  assert.strictEqual((await gift.checkGift(rec.code, { ...opts, now: gift.EXPIRES_AT + 1 })).status, 'expired');
});

test('an expired code cannot be redeemed', async () => {
  const rec = await gift.createGift(giftOf(), opts);
  await assert.rejects(gift.redeemGift(rec.code, 'sam@example.com', { ...opts, now: gift.EXPIRES_AT + 1 }), /expired/);
});

test('a code that clashes with an existing one is retried, and gives up after five tries', async () => {
  let calls = 0;
  const flaky = { ...store, setJSONIfAbsent: async (key, val) => (++calls <= 2 ? false : store.setJSONIfAbsent(key, val)) };
  const rec = await gift.createGift(giftOf(), { ...opts, db: flaky });
  assert.strictEqual(calls, 3);
  assert.match(rec.code, /^SNOW-2027-/);
  const never = { ...store, setJSONIfAbsent: async () => false };
  await assert.rejects(gift.createGift(giftOf(), { ...opts, db: never }), /unique code/);
});

test('the certificate page shows the code, product and expiry, and escapes the message', async () => {
  const rec = await gift.createGift(giftOf('booking-app', { message: '<img src=x onerror=alert(1)> & "hi"' }), opts);
  const html = gift.renderCertificate(rec);
  assert.ok(html.includes(rec.code));
  assert.ok(html.includes('December 31, 2027'));
  assert.ok(html.includes(CATALOG['booking-app'].name));
  assert.ok(!html.includes('<img src=x'), 'raw HTML from the message must not appear');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;hi&quot;'));
});
