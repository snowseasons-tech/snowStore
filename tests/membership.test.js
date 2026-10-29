const test = require('node:test');
const assert = require('node:assert');
const fakeUpstash = require('./fake-upstash');
const store = require('../api/_lib/store');
const CATALOG = require('../api/_lib/catalog');
const { downloadsFor, isMembership } = require('../api/_lib/entitlements');
const { validateCatalog } = require('../scripts/validate-store-items');
const { handleEvent } = require('../api/_lib/fulfil');

const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', SITE_URL: 'https://site.test',
  S3_ENDPOINT: 'https://r2.example.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
};
Object.assign(process.env, env);
const get = (path) => ({ request: new Request(`https://x.test${path}`), env });
const mod = (n) => import(`../functions/api/${n}.js`);

// A membership added to the real catalog for these tests only (each test file runs in its own process).
const MEMBERSHIP = { name: 'Test Membership', kind: 'subscription', stripeProduct: 'prod_testmember1', includes: ['lead-generator', 'bookscan'] };
test.before(() => { CATALOG['test-membership'] = MEMBERSHIP; });
test.after(() => { delete CATALOG['test-membership']; });

test('a membership unlocks the files of the products it includes', () => {
  const catalog = {
    m: { name: 'M', includes: ['a', 'nofile', 'ghost'] },
    a: { name: 'A', fileKey: 'a/a.zip', filename: 'a.zip' },
    nofile: { name: 'Service' },
  };
  assert.deepStrictEqual(downloadsFor('m', catalog), [{ id: 'a', name: 'A', fileKey: 'a/a.zip', filename: 'a.zip' }]);
  assert.deepStrictEqual(downloadsFor('a', catalog).map((d) => d.id), ['a']);
  assert.deepStrictEqual(downloadsFor('nofile', catalog), []);
  assert.deepStrictEqual(downloadsFor('__proto__', catalog), []);
  assert.ok(isMembership(catalog.m) && !isMembership(catalog.a) && !isMembership(null));
});

test('the validator checks memberships', () => {
  const base = {
    a: { name: 'A', stripeProduct: 'prod_a', fileKey: 'a/a.zip', filename: 'a.zip', sha256: 'a'.repeat(64) },
    s: { name: 'Service', stripeProduct: 'prod_s' },
  };
  assert.deepStrictEqual(validateCatalog({ ...base, m: { name: 'M', kind: 'subscription', stripeProduct: 'prod_m', includes: ['a'] } }), []);
  const errors = validateCatalog({
    ...base,
    m1: { name: 'M1', stripeProduct: 'prod_m1', includes: ['a'] },
    m2: { name: 'M2', kind: 'subscription', stripeProduct: 'prod_m2', includes: ['s', 'ghost'] },
    m3: { name: 'M3', kind: 'subscription', stripeProduct: 'prod_m3', includes: [] },
    m4: { name: 'M4', kind: 'subscription', stripeProduct: 'prod_m4', includes: ['m2'] },
  });
  assert.ok(errors.includes("m1.kind: must be 'subscription' for a membership"));
  assert.ok(errors.includes('m2.includes: s has no download'));
  assert.ok(errors.includes('m2.includes: ghost is not in the catalog'));
  assert.ok(errors.includes('m3.includes: must be a non-empty list of product ids'));
  assert.ok(errors.includes('m4.includes: m2 has no download'), 'a membership has no file, so it cannot be included');
});

test('the order lists one download per included product for a membership', async () => {
  const { onRequestGet } = await mod('order');
  const up = fakeUpstash();
  try {
    await store.setJSON('order:cs_test_mem0000000001', { productId: 'test-membership', customer: 'cus_1', subscriptionId: 'sub_m1' });
    const res = await (await onRequestGet(get('/api/order?session_id=cs_test_mem0000000001'))).json();
    assert.strictEqual(res.membership, true);
    assert.strictEqual(res.download, true);
    assert.deepStrictEqual(res.downloads, [{ product: 'lead-generator', name: 'Lead Generation Pipeline' }, { product: 'bookscan', name: 'BookScan Live' }]);
    await store.setJSON('order:cs_test_mem0000000002', { productId: 'bookscan' });
    const single = await (await onRequestGet(get('/api/order?session_id=cs_test_mem0000000002'))).json();
    assert.strictEqual(single.membership, false);
    assert.deepStrictEqual(single.downloads, [{ product: 'bookscan', name: 'BookScan Live' }]);
  } finally { up.restore(); }
});

test('membership downloads need a chosen product and an active membership, and count per product', async () => {
  const { onRequestGet } = await mod('download');
  const up = fakeUpstash();
  const url = (q) => `/api/download?session_id=cs_test_mem0000000003${q}`;
  try {
    await store.setJSON('order:cs_test_mem0000000003', { productId: 'test-membership', subscriptionId: 'sub_m3' });
    assert.strictEqual((await onRequestGet(get(url('')))).status, 400);
    assert.strictEqual((await onRequestGet(get(url('&product=invoice-generator')))).status, 404);
    assert.strictEqual((await onRequestGet(get(url('&product=lead-generator')))).status, 403);
    await store.setJSON('sub:sub_m3', { status: 'active' });
    const ok = await onRequestGet(get(url('&product=lead-generator')));
    assert.strictEqual(ok.status, 302);
    assert.match(ok.headers.get('location'), /\/b\/lead-generator\/lead-generator\.zip\?/);
    for (let i = 1; i < 10; i++) assert.strictEqual((await onRequestGet(get(url('&product=lead-generator')))).status, 302);
    assert.strictEqual((await onRequestGet(get(url('&product=lead-generator')))).status, 429);
    assert.strictEqual((await onRequestGet(get(url('&product=bookscan')))).status, 302, 'each product has its own allowance');
    await store.setJSON('sub:sub_m3', { status: 'canceled' });
    assert.strictEqual((await onRequestGet(get(url('&product=bookscan')))).status, 403);
    await store.setJSON('order:cs_test_mem0000000004', { productId: 'test-membership' });
    assert.strictEqual((await onRequestGet(get('/api/download?session_id=cs_test_mem0000000004&product=bookscan'))).status, 403, 'a membership without a subscription unlocks nothing');
  } finally { up.restore(); }
});

test('a membership purchase email points to the downloads, not the getting-started form', async () => {
  const up = fakeUpstash();
  const sent = [];
  try {
    const result = await handleEvent({
      id: 'evt_mem1', type: 'checkout.session.completed', created: 1,
      data: { object: { id: 'cs_test_mem0000000005', payment_status: 'paid', metadata: { product_id: 'test-membership' }, customer_details: { email: 'pat@example.com' }, customer: 'cus_5', subscription: 'sub_m5' } },
    }, { mail: { sendMail: async (m) => (sent.push(m), 'sent') } });
    assert.strictEqual(result, 'fulfilled:sent');
    assert.match(sent[0].text, /Get your downloads or manage your order here:\nhttps:\/\/site\.test\/success\?session_id=cs_test_mem0000000005/);
    assert.doesNotMatch(sent[0].text, /\/start\?/);
  } finally { up.restore(); }
});
