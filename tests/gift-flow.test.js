const test = require('node:test');
const assert = require('node:assert');
const fakeUpstash = require('./fake-upstash');
const CATALOG = require('../api/_lib/catalog');
const store = require('../api/_lib/store');
const gift = require('../api/_lib/gift');
const { handleEvent } = require('../api/_lib/fulfil');

const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', SITE_URL: 'https://site.test',
  S3_ENDPOINT: 'https://r2.example.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
};
Object.assign(process.env, env);
const fake = fakeUpstash();
test.after(() => fake.restore());

const load = (name) => import(`../functions/api/${name}.js`);
const post = (path, body, type = 'application/json') => new Request(`https://x.test${path}`, {
  method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

function mailer() {
  const sent = [];
  return { sent, sendMail: async (msg) => { sent.push(msg); return 'sent'; } };
}
const giftEvent = (sid, evt = `evt_${sid}`) => ({
  id: evt, type: 'checkout.session.completed',
  data: {
    object: {
      id: sid, payment_status: 'paid', customer_details: { email: 'ada@example.com' },
      metadata: { product_id: 'booking-app', gift: 'true', gift_buyer_name: 'Ada Buyer', gift_recipient_email: 'sam@example.com', gift_message: 'Enjoy <b>this</b>' },
    },
  },
});
const codeFor = async (sid) => (await store.getJSON(`gift-session:${sid}`)).code;

test('a paid gift session creates one certificate and emails both people the code', async () => {
  const sid = 'cs_gift_1';
  const m = mailer();
  assert.strictEqual(await handleEvent(giftEvent(sid), { store, catalog: CATALOG, mail: m }), 'gift');
  assert.strictEqual(await store.getJSON(`order:${sid}`), null, 'the buyer gets no order or download');
  const code = await codeFor(sid);
  assert.match(code, /^SNOW-2027-/);
  assert.deepStrictEqual(m.sent.map((x) => x.to).sort(), ['ada@example.com', 'sam@example.com']);
  const recipient = m.sent.find((x) => x.to === 'sam@example.com');
  assert.ok(recipient.text.includes(code) && recipient.text.includes(`https://site.test/gift.html?code=${code}`));
  assert.ok(recipient.text.includes('Enjoy <b>this</b>'), 'the message is sent as plain text');
});

test('a repeated delivery for the same session sends nothing new and keeps the code', async () => {
  const sid = 'cs_gift_2';
  const m = mailer();
  await handleEvent(giftEvent(sid, 'evt_a'), { store, catalog: CATALOG, mail: m });
  const code = await codeFor(sid);
  await handleEvent(giftEvent(sid, 'evt_b'), { store, catalog: CATALOG, mail: m });
  assert.strictEqual(m.sent.length, 2);
  assert.strictEqual(await codeFor(sid), code);
});

test('when mail is not configured the webhook fails, and the retry sends the mail once', async () => {
  const sid = 'cs_gift_3';
  const off = { sendMail: async () => 'skipped' };
  await assert.rejects(handleEvent(giftEvent(sid, 'evt_c1'), { store, catalog: CATALOG, mail: off }), /not sent/);
  const code = await codeFor(sid);
  const on = mailer();
  await handleEvent(giftEvent(sid, 'evt_c2'), { store, catalog: CATALOG, mail: on });
  assert.strictEqual(on.sent.length, 2);
  assert.strictEqual(await codeFor(sid), code, 'the same certificate is reused on retry');
});

test('a code is redeemed once, then its downloads are served from the code', async () => {
  const sid = 'cs_gift_4';
  await handleEvent(giftEvent(sid), { store, catalog: CATALOG, mail: mailer() });
  const code = await codeFor(sid);
  const { onRequestGet } = await load('gift-download');
  const get = (qs) => onRequestGet({ request: new Request(`https://x.test/api/gift-download?${qs}`), env });

  assert.strictEqual((await get(`code=${code}&product=booking-app`)).status, 403, 'not redeemed yet');

  const { onRequestPost } = await load('gift-redeem');
  assert.strictEqual((await onRequestPost({ request: post('/api/gift-redeem', '{}', 'text/plain'), env })).status, 415);
  const first = await onRequestPost({ request: post('/api/gift-redeem', { code: code.toLowerCase(), email: 'sam@example.com' }), env });
  assert.strictEqual(first.status, 200);
  const body = await first.json();
  assert.strictEqual(body.productName, CATALOG['booking-app'].name);
  assert.deepStrictEqual(body.files, [{ id: 'booking-app', name: CATALOG['booking-app'].name }]);
  assert.strictEqual((await onRequestPost({ request: post('/api/gift-redeem', { code, email: 'other@example.com' }), env })).status, 400);

  const dl = await get(`code=${code}&product=booking-app`);
  assert.strictEqual(dl.status, 302);
  assert.match(dl.headers.get('Location'), /r2\.example\.com/);
  assert.strictEqual((await get(`code=${code}&product=invoice-generator`)).status, 404, 'not part of this gift');
  assert.strictEqual((await get(`code=${code}`)).status, 302, 'a single file needs no product choice');
});

test('gift downloads stop after the download limit', async () => {
  const sid = 'cs_gift_5';
  await handleEvent(giftEvent(sid), { store, catalog: CATALOG, mail: mailer() });
  const code = await codeFor(sid);
  const { onRequestPost } = await load('gift-redeem');
  await onRequestPost({ request: post('/api/gift-redeem', { code, email: 'sam@example.com' }), env });
  const { onRequestGet } = await load('gift-download');
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await onRequestGet({ request: new Request(`https://x.test/api/gift-download?code=${code}&product=booking-app`), env })).status);
  }
  assert.strictEqual(statuses.filter((s) => s === 302).length, 10);
  assert.strictEqual(statuses[10], 429);
});

test('a gift page request with no persistent store is refused rather than guessed at', async () => {
  const { onRequestGet } = await load('gift-download');
  const res = await onRequestGet({ request: new Request('https://x.test/api/gift-download?code=SNOW-2027-AAAA'), env: {} });
  assert.strictEqual(res.status, 503);
});

test('a gift that is not a valid sale is refused at the webhook level too', async () => {
  const bad = giftEvent('cs_gift_6', 'evt_bad');
  bad.data.object.metadata.gift_recipient_email = 'not-an-email';
  await assert.rejects(handleEvent(bad, { store, catalog: CATALOG, mail: mailer() }), gift.GiftError);
});
