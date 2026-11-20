const test = require('node:test');
const assert = require('node:assert');
const Stripe = require('stripe');
const fakeUpstash = require('./fake-upstash');

const SECRET = 'whsec_test';
const env = { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: SECRET, UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', SITE_URL: 'https://site.test' };
const event = (id, paid = 'paid') => JSON.stringify({ id, type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_fn1234567890', payment_status: paid, metadata: { product_id: 'bookscan' } } } });
const hook = (payload, sig) => new Request('https://x.test/api/webhook', {
  method: 'POST', body: payload,
  headers: { 'stripe-signature': sig === undefined ? new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: SECRET }) : sig },
});
const load = () => import('../functions/api/webhook.js');

test('webhook function rejects non-POST', async () => {
  const { onRequest } = await load();
  assert.strictEqual(onRequest({ request: new Request('https://x.test/api/webhook') }).status, 405);
});
test('webhook function rejects bad or missing signatures', async () => {
  const { onRequestPost } = await load();
  const payload = event('evt_f0');
  assert.strictEqual((await onRequestPost({ request: hook(payload, 't=1,v1=bad'), env })).status, 400);
  assert.strictEqual((await onRequestPost({ request: hook(payload + ' ', new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: SECRET })), env })).status, 400);
  assert.strictEqual((await onRequestPost({ request: new Request('https://x.test/api/webhook', { method: 'POST', body: payload }), env })).status, 400);
});
test('webhook function fulfils once and is idempotent', async () => {
  const { onRequestPost } = await load();
  const up = fakeUpstash();
  try {
    const first = await onRequestPost({ request: hook(event('evt_f1')), env });
    assert.strictEqual(first.status, 200);
    assert.deepStrictEqual(await first.json(), { received: true, result: 'fulfilled:no-email' });
    assert.ok(up.data.has('order:cs_test_fn1234567890'));
    const again = await onRequestPost({ request: hook(event('evt_f1')), env });
    assert.deepStrictEqual(await again.json(), { received: true, result: 'duplicate' });
  } finally { up.restore(); }
});
test('webhook function returns 503 so Stripe retries when the store is missing', async () => {
  const { onRequestPost } = await load();
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...noStore } = env;
  assert.strictEqual((await onRequestPost({ request: hook(event('evt_f2')), env: noStore })).status, 503);
});

test('purchase flow reaches a ready order and signed download', async () => {
  const { onRequestPost: webhook } = await load();
  const { onRequestGet: order } = await import('../functions/api/order.js');
  const { onRequestGet: download } = await import('../functions/api/download.js');
  const up = fakeUpstash();
  const flowEnv = {
    ...env,
    S3_ENDPOINT: 'https://r2.example.com',
    S3_BUCKET: 'bucket',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  };
  const sessionId = 'cs_test_e2e00000000001';
  const payload = JSON.stringify({
    id: 'evt_e2e_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        metadata: { product_id: 'bookscan' },
        customer_details: { email: 'buyer@example.com', name: 'Buyer' },
      },
    },
  });
  try {
    const fulfilled = await webhook({ request: hook(payload), env: flowEnv });
    assert.strictEqual(fulfilled.status, 200);
    assert.strictEqual((await fulfilled.json()).result, 'fulfilled:skipped');

    const ready = await order({
      request: new Request(`https://x.test/api/order?session_id=${sessionId}`),
      env: flowEnv,
    });
    assert.strictEqual(ready.status, 200);
    assert.deepStrictEqual(await ready.json(), {
      ready: true,
      product: 'BookScan Live',
      download: true,
      downloads: [{ product: 'bookscan', name: 'BookScan Live' }],
      membership: false,
      appUrl: null,
      avatars: false,
      manage: false,
    });

    const signed = await download({
      request: new Request(`https://x.test/api/download?session_id=${sessionId}`),
      env: flowEnv,
    });
    assert.strictEqual(signed.status, 302);
    assert.match(signed.headers.get('location'), /X-Amz-Expires=300/);
  } finally {
    up.restore();
  }
});
