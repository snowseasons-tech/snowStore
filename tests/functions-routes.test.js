const test = require('node:test');
const assert = require('node:assert');
const fakeUpstash = require('./fake-upstash');
const store = require('../api/_lib/store');
const auth = require('../api/_lib/auth');

const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', SITE_URL: 'https://site.test',
  STRIPE_SECRET_KEY: 'sk_test_123', RESEND_API_KEY: 're_1', MAIL_FROM: 'a@site.test',
  S3_ENDPOINT: 'https://r2.example.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
};
Object.assign(process.env, env);
const get = (path, headers) => ({ request: new Request(`https://x.test${path}`, { headers }), env });
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const mod = (n) => import(`../functions/api/${n}.js`);

test('order reports readiness from the webhook-written order only', async () => {
  const { onRequestGet } = await mod('order');
  const up = fakeUpstash();
  try {
    assert.strictEqual((await onRequestGet(get('/api/order?session_id=bad'))).status, 400);
    assert.deepStrictEqual(await (await onRequestGet(get('/api/order?session_id=cs_test_ord0000000001'))).json(), { ready: false });
    await store.setJSON('order:cs_test_ord0000000001', { productId: 'bookscan', customer: 'cus_1', subscriptionId: 'sub_1' });
    const res = await (await onRequestGet(get('/api/order?session_id=cs_test_ord0000000001'))).json();
    assert.deepStrictEqual([res.ready, res.product, res.download, res.manage], [true, 'BookScan Live', true, true]);
  } finally { up.restore(); }
});

test('download signs a URL, counts downloads, and enforces the limit', async () => {
  const { onRequestGet } = await mod('download');
  const up = fakeUpstash();
  const url = '/api/download?session_id=cs_test_dl00000000001';
  try {
    assert.strictEqual((await onRequestGet(get(url))).status, 403);
    await store.setJSON('order:cs_test_dl00000000001', { productId: 'bookscan' });
    const ok = await onRequestGet(get(url));
    assert.strictEqual(ok.status, 302);
    assert.match(ok.headers.get('location'), /^https:\/\/r2\.example\.com\/b\/bookscan-live\/bookscan-live\.html\?.*X-Amz-Expires=300.*X-Amz-Signature=/);
    for (let i = 1; i < 10; i++) assert.strictEqual((await onRequestGet(get(url))).status, 302);
    assert.strictEqual((await onRequestGet(get(url))).status, 429);
  } finally { up.restore(); }
});
test('download requires an active subscription for subscription orders', async () => {
  const { onRequestGet } = await mod('download');
  const up = fakeUpstash();
  try {
    await store.setJSON('order:cs_test_dl00000000002', { productId: 'bookscan', subscriptionId: 'sub_9' });
    assert.strictEqual((await onRequestGet(get('/api/download?session_id=cs_test_dl00000000002'))).status, 403);
    await store.setJSON('sub:sub_9', { status: 'active' });
    assert.strictEqual((await onRequestGet(get('/api/download?session_id=cs_test_dl00000000002'))).status, 302);
  } finally { up.restore(); }
});

test('app-download needs a session and entitlement', async () => {
  const { onRequestGet } = await mod('app-download');
  const up = fakeUpstash();
  try {
    const user = { hash: await auth.hashPassword('s3cret-password'), products: ['bookscan'] };
    await store.setJSON('user:pat@example.com', user);
    const cookie = `ss_session=${await auth.createSession('pat@example.com', user)}`;
    assert.strictEqual((await onRequestGet(get('/api/app-download?product=__proto__', { cookie }))).status, 404);
    assert.strictEqual((await onRequestGet(get('/api/app-download?product=bookscan'))).status, 401);
    const ok = await onRequestGet(get('/api/app-download?product=bookscan', { cookie }));
    assert.strictEqual(ok.status, 302);
    assert.match(ok.headers.get('location'), /X-Amz-Expires=120/);
    await store.setJSON('user:pat@example.com', { ...user, products: [] });
    assert.strictEqual((await onRequestGet(get('/api/app-download?product=bookscan', { cookie }))).status, 403);
  } finally { up.restore(); }
});

// Active prices as Stripe lists them (GET /v1/prices); product IDs are the live ones in api/_lib/catalog.js.
const stripePrices = (data) => (url) => {
  if (/coupons\/LAUNCH30$/.test(url)) return json({ id: 'LAUNCH30', valid: true, percent_off: 30, duration: 'once', duration_in_months: null });
  assert.match(url, /api\.stripe\.com\/v1\/prices\?/);
  return json({ object: 'list', data, has_more: false, url: '/v1/prices' });
};
const sp = (id, product, unit_amount, recurring = null, created = 1) => ({ id, object: 'price', product, unit_amount, currency: 'usd', recurring, created, active: true });

test('products reads display prices from Stripe', async () => {
  const { onRequestGet } = await mod('products');
  // A price on a product the site doesn't sell is ignored.
  const up = fakeUpstash(stripePrices([sp('price_123', 'prod_VWa43u70jMDMbP', 1900), sp('price_x', 'prod_somethingElse', 500)]));
  try {
    const res = await onRequestGet({ env });
    assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=60');
    const { products } = await res.json();
    // Only products with an active price in Stripe are listed.
    assert.deepStrictEqual(products.map((p) => [p.id, p.amount, p.currency, p.interval]), [['api-integration-basic', 1900, 'usd', null]]);
  } finally { up.restore(); }
});

test('products files each active price under its billing period', async () => {
  const { onRequestGet } = await mod('products');
  const M = 'prod_VWacOc9NLNnEkY';
  const up = fakeUpstash(stripePrices([
    sp('price_m_old', M, 3900, { interval: 'month', interval_count: 1 }, 1),
    sp('price_m', M, 4900, { interval: 'month', interval_count: 1 }, 2), // newest monthly wins
    sp('price_w', M, 1500, { interval: 'week', interval_count: 1 }),
    sp('price_3', M, 14700, { interval: 'month', interval_count: 3 }),
    sp('price_y', M, 52900, { interval: 'year', interval_count: 1 }),
    sp('price_2w', M, 2500, { interval: 'week', interval_count: 2 }), // not offered on the site
  ]));
  try {
    const p = (await (await onRequestGet({ env })).json()).products.find((x) => x.id === 'api-maintenance-basic');
    assert.deepStrictEqual([p.amount, p.interval], [4900, 'month']);
    assert.deepStrictEqual(p.periods.map((x) => [x.period, x.amount, x.interval, x.intervalCount]), [['1w', 1500, 'week', 1], ['3m', 14700, 'month', 3], ['12m', 52900, 'year', 1]]);
  } finally { up.restore(); }
});

test('products shows the launch discount while the coupon is valid', async () => {
  const { onRequestGet } = await mod('products');
  const up = fakeUpstash(stripePrices([sp('price_123', 'prod_VWa43u70jMDMbP', 1900)]));
  try {
    const { products } = await (await onRequestGet({ env: { ...env, LAUNCH_COUPON: 'LAUNCH30' } })).json();
    assert.deepStrictEqual([products[0].amount, products[0].discount], [1900, { percent: 30, amount: 1330, duration: 'once', months: null }]);
  } finally { up.restore(); }
});

test('portal emails a link, then redeems it for a Stripe billing portal session', async () => {
  const { onRequestPost, onRequestGet } = await mod('portal');
  let mailed; let portalBody;
  const up = fakeUpstash((url, init) => {
    if (url === 'https://api.resend.com/emails') { mailed = JSON.parse(init.body); return json({ id: 'em_1' }); }
    if (url === 'https://api.stripe.com/v1/billing_portal/sessions') { portalBody = String(init.body); return json({ id: 'bps_1', url: 'https://billing.stripe.test/p/1' }); }
    throw new Error(`unexpected fetch ${url}`);
  });
  const post = (body) => onRequestPost({ request: new Request('https://x.test/api/portal', { method: 'POST', body: JSON.stringify(body) }), env });
  try {
    assert.strictEqual((await post({ session_id: 'nope' })).status, 400);
    assert.strictEqual((await post({ session_id: 'cs_test_pt00000000001' })).status, 403);
    await store.setJSON('order:cs_test_pt00000000001', { productId: 'bookscan', customer: 'cus_7', subscriptionId: 'sub_7', email: 'pat@example.com' });
    assert.strictEqual((await post({ session_id: 'cs_test_pt00000000001' })).status, 200);
    assert.deepStrictEqual(mailed.to, ['pat@example.com']);
    assert.strictEqual((await post({ session_id: 'cs_test_pt00000000001' })).status, 429);

    const token = mailed.text.match(/\/api\/portal\?t=([\w-]+)/)[1];
    const open = await onRequestGet(get(`/api/portal?t=${token}`));
    assert.strictEqual(open.status, 302);
    assert.strictEqual(open.headers.get('location'), 'https://billing.stripe.test/p/1');
    assert.match(portalBody, /customer=cus_7/);
    assert.strictEqual((await onRequestGet(get(`/api/portal?t=${'a'.repeat(43)}`))).status, 410);
    assert.strictEqual((await onRequestGet(get('/api/portal?t=short'))).status, 400);
  } finally { up.restore(); }
});
test('portal answers other methods with 405 and its Allow list', async () => {
  const { onRequest } = await mod('portal');
  const res = onRequest();
  assert.deepStrictEqual([res.status, res.headers.get('allow')], [405, 'GET, POST']);
});

test('kit signup records the subscriber and returns a signed download URL', async () => {
  const { onRequestPost, onRequest } = await mod('kit');
  const up = fakeUpstash();
  const post = (body, ip = '203.0.113.7', type = 'application/json') => onRequestPost({ request: new Request('https://x.test/api/kit', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': type, 'CF-Connecting-IP': ip } }), env });
  try {
    assert.strictEqual((await post({ email: 'sam@example.com' }, undefined, 'text/plain')).status, 415);
    assert.strictEqual((await post({ email: 'not-an-email' })).status, 400);
    const ok = await post({ email: ' Sam@Example.com ' });
    assert.strictEqual(ok.status, 200);
    assert.match((await ok.json()).url, /^https:\/\/r2\.example\.com\/b\/landing-page-kit\/landing-page\.html\?.*X-Amz-Expires=300/);
    const sub = await store.getJSON('subscriber:sam@example.com');
    assert.deepStrictEqual([sub.source, typeof sub.subscribedAt], ['landing-page-kit', 'number']);
    assert.strictEqual((await post({ email: 'sam@example.com' })).status, 200);
    assert.strictEqual((await store.getJSON('subscriber:sam@example.com')).subscribedAt, sub.subscribedAt);
    assert.deepStrictEqual([onRequest().status, onRequest().headers.get('allow')], [405, 'POST']);
  } finally { up.restore(); }
});
test('kit signup is rate limited per IP', async () => {
  const { onRequestPost } = await mod('kit');
  const up = fakeUpstash();
  const post = (email, ip) => onRequestPost({ request: new Request('https://x.test/api/kit', {
    method: 'POST', body: JSON.stringify({ email }), headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip } }), env });
  try {
    for (let i = 0; i < 10; i++) assert.strictEqual((await post(`u${i}@example.com`, '192.0.2.1')).status, 200);
    assert.strictEqual((await post('u10@example.com', '192.0.2.1')).status, 429);
    assert.strictEqual((await post('u10@example.com', '192.0.2.2')).status, 200);
  } finally { up.restore(); }
});

test('intake saves getting-started details for a real order and emails the shop', async () => {
  const { onRequestPost } = await mod('intake');
  const mails = [];
  const up = fakeUpstash((url, init) => {
    assert.match(url, /api\.resend\.com\/emails$/);
    mails.push(JSON.parse(init.body));
    return json({ id: 'em_1' });
  });
  const post = (body) => ({ env, request: new Request('https://x.test/api/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  try {
    await store.setJSON('order:cs_test_intake000000001', { productId: 'social-media-1', email: 'pat@example.com' });
    assert.strictEqual((await onRequestPost(post({ session_id: 'nope', business: 'B', name: 'N' }))).status, 400);
    assert.strictEqual((await onRequestPost(post({ session_id: 'cs_test_intake000000001', name: 'N' }))).status, 400); // business required
    assert.strictEqual((await onRequestPost(post({ session_id: 'cs_test_unknown00000001', business: 'B', name: 'N' }))).status, 404);
    const ok = await onRequestPost(post({ session_id: 'cs_test_intake000000001', business: 'Pat Bakery', name: 'Pat', social: 'instagram.com/patbakery', extra: 'ignored' }));
    assert.strictEqual(ok.status, 200);
    const saved = await store.getJSON('intake:cs_test_intake000000001');
    assert.deepStrictEqual([saved.business, saved.social, saved.email, saved.extra], ['Pat Bakery', 'instagram.com/patbakery', 'pat@example.com', undefined]);
    assert.strictEqual(mails.length, 1);
    assert.deepStrictEqual(mails[0].to, ['info@snowseasonstech.net']);
    assert.strictEqual(mails[0].subject, 'Getting started: Pat Bakery (Social Media — 1 Account)');
    assert.match(mails[0].text, /Social media accounts:\ninstagram\.com\/patbakery/);
  } finally { up.restore(); }
});
