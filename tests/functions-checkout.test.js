const test = require('node:test');
const assert = require('node:assert');

const post = (body) => new Request('https://x.test/api/checkout', { method: 'POST', body });
const load = () => import('../functions/api/checkout.js');
const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Live Stripe product IDs from api/_lib/catalog.js.
const INTEGRATION_BASIC = 'prod_VWa43u70jMDMbP';
const MAINTENANCE_BASIC = 'prod_VWacOc9NLNnEkY';
const price = (id, product, recurring = null, created = 1) => ({ id, object: 'price', product, unit_amount: 4900, currency: 'usd', recurring, created, active: true });
const PRICES = [
  price('price_123', INTEGRATION_BASIC),
  price('price_month', MAINTENANCE_BASIC, { interval: 'month', interval_count: 1 }),
  price('price_six', MAINTENANCE_BASIC, { interval: 'month', interval_count: 6 }),
  price('price_week', MAINTENANCE_BASIC, { interval: 'week', interval_count: 1 }),
];

// Fake Stripe: lists active prices filtered by ?product=, answers coupons from `coupons`, and records the session body.
function fakeStripe({ coupons = {} } = {}) {
  const realFetch = globalThis.fetch;
  const calls = { session: null };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname === '/v1/prices') {
      const product = u.searchParams.get('product');
      return json({ object: 'list', data: PRICES.filter((p) => !product || p.product === product), has_more: false, url: '/v1/prices' });
    }
    const coupon = u.pathname.match(/^\/v1\/coupons\/(.+)$/);
    if (coupon) return json(coupons[coupon[1]] || { error: { message: 'No such coupon' } });
    calls.session = String(init.body);
    return json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1' });
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const ENV = { STRIPE_SECRET_KEY: 'sk_test_123', SITE_URL: 'https://site.test' };

test('checkout function rejects non-POST', async () => {
  const { onRequest } = await load();
  const res = onRequest({ request: new Request('https://x.test/api/checkout') });
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('Allow'), 'POST');
});
test('checkout function validates the request', async () => {
  const { onRequestPost } = await load();
  assert.strictEqual((await onRequestPost({ request: post('{nope'), env: {} })).status, 400);
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"__proto__"}'), env: {} })).status, 400);
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env: {} })).status, 503);
  // Retired products stay in the catalog for past buyers but can no longer be bought.
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"bookscan"}'), env: ENV })).status, 400);
});
test('checkout function creates a session through Stripe', async () => {
  const { onRequestPost } = await load();
  const s = fakeStripe();
  try {
    const res = await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env: ENV });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { url: 'https://checkout.stripe.test/c/1' });
    assert.match(s.calls.session, /line_items\[0\]\[price\]=price_123/);
    assert.match(s.calls.session, /mode=payment/);
  } finally { s.restore(); }
});
test('checkout function uses the chosen billing period', async () => {
  const { onRequestPost } = await load();
  const s = fakeStripe();
  try {
    const ok = await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"6m"}'), env: ENV });
    assert.strictEqual(ok.status, 200);
    assert.match(s.calls.session, /price_six/);
    assert.match(s.calls.session, /mode=subscription/);
    assert.match(s.calls.session, /metadata\[period\]=6m/);
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"1w"}'), env: ENV })).status, 200);
    assert.match(s.calls.session, /price_week/);
    // A period the product has no active price for, and an unknown period, are both refused.
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"12m"}'), env: ENV })).status, 400);
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"2m"}'), env: ENV })).status, 400);
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic","period":"6m"}'), env: ENV })).status, 400);
  } finally { s.restore(); }
});
test('checkout function refuses a live key without ALLOW_LIVE', async () => {
  const { onRequestPost } = await load();
  const env = { ...ENV, STRIPE_SECRET_KEY: 'sk_live_123' };
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env })).status, 500);
});
test('checkout function applies a valid launch coupon instead of promo-code entry', async () => {
  const { onRequestPost } = await load();
  const s = fakeStripe({ coupons: { LAUNCH30: { id: 'LAUNCH30', valid: true, percent_off: 30 } } });
  try {
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env: { ...ENV, LAUNCH_COUPON: 'LAUNCH30' } })).status, 200);
    assert.match(s.calls.session, /discounts\[0\]\[coupon\]=LAUNCH30/);
    assert.doesNotMatch(s.calls.session, /allow_promotion_codes/);
  } finally { s.restore(); }
});
test('checkout function falls back to promo codes when the launch coupon is expired', async () => {
  const { onRequestPost } = await load();
  const s = fakeStripe({ coupons: { LAUNCH30: { id: 'LAUNCH30', valid: false, percent_off: 30 } } });
  try {
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env: { ...ENV, LAUNCH_COUPON: 'LAUNCH30' } })).status, 200);
    assert.doesNotMatch(s.calls.session, /discounts/);
    assert.match(s.calls.session, /allow_promotion_codes=true/);
  } finally { s.restore(); }
});
