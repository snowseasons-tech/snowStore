const test = require('node:test');
const assert = require('node:assert');
const CATALOG = require('../api/_lib/catalog');
const store = require('../api/_lib/store');
const welcome = require('../api/_lib/welcome');

const T0 = Date.UTC(2026, 11, 1, 9);
const H = 60 * 60 * 1000;
const env = { SITE_URL: 'https://site.test', WELCOME_VIDEO_URL: 'https://video.test/intro' };

function mailer(result = 'sent') {
  const sent = [];
  return {
    sent,
    sendMail: async (msg) => {
      if (result instanceof Error) throw result;
      sent.push(msg);
      return result;
    },
  };
}

// Each test starts with an empty pending list, so runDue() only sees this test's buyers.
test.beforeEach(async () => { await store.release(welcome.PENDING); });

let seq = 0;
const newSession = () => `cs_welcome_${++seq}`;
const scheduleFor = (id, extra = {}) => welcome.schedule(store, id, {
  email: 'buyer@example.com', productId: 'booking-app', productName: CATALOG['booking-app'].name,
  product: CATALOG['booking-app'], catalog: CATALOG, siteUrl: env.SITE_URL, now: T0, ...extra,
});

test('only one-time products with a download get the series', () => {
  assert.strictEqual(welcome.eligible('booking-app', CATALOG['booking-app'], CATALOG), true);
  assert.strictEqual(welcome.eligible('founders-membership', CATALOG['founders-membership'], CATALOG), false, 'subscriptions are excluded');
  assert.strictEqual(welcome.eligible('managed-database', CATALOG['managed-database'], CATALOG), false, 'services have no download');
});

test('scheduling records emails 2 and 3 at +24h and +72h, once', async () => {
  const id = newSession();
  assert.strictEqual(await scheduleFor(id), true);
  assert.strictEqual(await scheduleFor(id), false, 'a second call changes nothing');
  const rec = await store.getJSON(`welcome:${id}`);
  assert.deepStrictEqual(rec.steps.map((s) => s.step), ['quickstart', 'faq']);
  assert.strictEqual(new Date(rec.steps[0].sendAt).getTime(), T0 + 24 * H);
  assert.strictEqual(new Date(rec.steps[1].sendAt).getTime(), T0 + 72 * H);
  assert.ok((await store.members(welcome.PENDING)).includes(id));
});

test('nothing is scheduled without an email or for an ineligible product', async () => {
  assert.strictEqual(await scheduleFor(newSession(), { email: '' }), false);
  const id = newSession();
  assert.strictEqual(await scheduleFor(id, { productId: 'founders-membership', product: CATALOG['founders-membership'] }), false);
  assert.strictEqual(await store.getJSON(`welcome:${id}`), null);
});

test('emails go out when due, once each, to the buyer with the order link', async () => {
  const id = newSession();
  await scheduleFor(id);
  const m = mailer();
  assert.deepStrictEqual(await welcome.runDue({ now: T0 + 23 * H, db: store, mailer: m, env }), { sent: 0, failed: 0, skipped: 0, waiting: 2 });
  assert.strictEqual(m.sent.length, 0);

  assert.strictEqual((await welcome.runDue({ now: T0 + 25 * H, db: store, mailer: m, env })).sent, 1);
  assert.strictEqual(m.sent.length, 1);
  assert.strictEqual(m.sent[0].to, 'buyer@example.com');
  assert.match(m.sent[0].text, new RegExp(`${env.SITE_URL}/success\\?session_id=${id}`));
  assert.match(m.sent[0].text, /video\.test\/intro/);

  assert.strictEqual((await welcome.runDue({ now: T0 + 73 * H, db: store, mailer: m, env })).sent, 1);
  assert.match(m.sent[1].subject, /Questions about/);

  const again = await welcome.runDue({ now: T0 + 500 * H, db: store, mailer: m, env });
  assert.strictEqual(again.sent, 0, 'nothing is sent twice');
  assert.strictEqual(m.sent.length, 2);
});

test('a failed send is retried on the next run', async () => {
  const id = newSession();
  await scheduleFor(id);
  const bad = mailer(new Error('mail 500'));
  assert.strictEqual((await welcome.runDue({ now: T0 + 25 * H, db: store, mailer: bad, env })).failed, 1);
  const good = mailer();
  assert.strictEqual((await welcome.runDue({ now: T0 + 26 * H, db: store, mailer: good, env })).sent, 1);
  assert.strictEqual(good.sent.length, 1);
});

test('when mail is not configured, the step waits instead of being marked sent', async () => {
  const id = newSession();
  await scheduleFor(id);
  const off = mailer('skipped');
  assert.strictEqual((await welcome.runDue({ now: T0 + 25 * H, db: store, mailer: off, env })).skipped, 1);
  assert.strictEqual(await store.getJSON(`welcome-sent:${id}:quickstart`), null);
  const on = mailer();
  assert.strictEqual((await welcome.runDue({ now: T0 + 26 * H, db: store, mailer: on, env })).sent, 1);
});

test('two runs at the same moment send each email once', async () => {
  const id = newSession();
  await scheduleFor(id);
  const m = mailer();
  await Promise.all([
    welcome.runDue({ now: T0 + 25 * H, db: store, mailer: m, env }),
    welcome.runDue({ now: T0 + 25 * H, db: store, mailer: m, env }),
  ]);
  assert.strictEqual(m.sent.filter((x) => /Get started/.test(x.subject)).length, 1);
});

test('the video and docs lines appear only when they are configured', () => {
  const plain = welcome.templates({ step: 'quickstart', productName: 'X', orderUrl: 'o', siteUrl: 's' });
  assert.ok(!plain.text.includes('Five-minute video'));
  const full = welcome.templates({ step: 'quickstart', productName: 'X', orderUrl: 'o', siteUrl: 's', videoUrl: 'v', docsUrl: 'd' });
  assert.ok(full.text.includes('Five-minute video walkthrough: v') && full.text.includes('Full guide: d'));
});

test('the FAQ email offers done-for-you setup and links the terms and refunds', () => {
  const faq = welcome.templates({ step: 'faq', productName: 'X', orderUrl: 'o', siteUrl: 'https://s.test' });
  assert.ok(faq.text.includes('https://s.test/terms') && faq.text.includes('https://s.test/refund'));
  assert.ok(/Done-for-you/.test(faq.text));
});

test('welcome-run refuses callers without the secret, and a weak secret is never accepted', async () => {
  const { onRequestPost } = await import('../functions/api/welcome-run.js');
  const strong = 'x'.repeat(40);
  const call = (auth, secret) => onRequestPost({
    request: new Request('https://x.test/api/welcome-run', { method: 'POST', headers: auth ? { Authorization: auth } : {} }),
    env: { WELCOME_RUN_SECRET: secret, UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't' },
  });
  assert.strictEqual((await call(`Bearer ${'y'.repeat(40)}`, strong)).status, 401, 'wrong secret');
  assert.strictEqual((await call(null, strong)).status, 401, 'no secret sent');
  assert.strictEqual((await call('Bearer short', 'short')).status, 503, 'weak configured secret');
  const noStore = await onRequestPost({
    request: new Request('https://x.test/api/welcome-run', { method: 'POST', headers: { Authorization: `Bearer ${strong}` } }),
    env: { WELCOME_RUN_SECRET: strong },
  });
  assert.strictEqual(noStore.status, 503, 'the right secret still needs the persistent store');
});
