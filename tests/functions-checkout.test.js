const test = require('node:test');
const assert = require('node:assert');

const post = (body) => new Request('https://x.test/api/checkout', { method: 'POST', body });
const load = () => import('../functions/api/checkout.js');

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
  const retired = { STRIPE_SECRET_KEY: 'sk_test_123', PRICE_BOOKSCAN: 'price_123', SITE_URL: 'https://site.test' };
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"bookscan"}'), env: retired })).status, 400);
});
test('checkout function creates a session through Stripe', async () => {
  const { onRequestPost } = await load();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), body: String(init.body) };
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { STRIPE_SECRET_KEY: 'sk_test_123', PRICE_API_INTEGRATION_BASIC: 'price_123', SITE_URL: 'https://site.test' };
    const res = await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { url: 'https://checkout.stripe.test/c/1' });
    assert.match(sent.url, /checkout\/sessions$/);
    assert.match(sent.body, /price_123/);
  } finally { globalThis.fetch = realFetch; }
});
test('checkout function uses the chosen billing period', async () => {
  const { onRequestPost } = await load();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = String(init.body);
    return new Response(JSON.stringify({ id: 'cs_test_2', url: 'https://checkout.stripe.test/c/2' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { STRIPE_SECRET_KEY: 'sk_test_123', PRICE_API_MAINTENANCE_BASIC: 'price_month', PRICE_API_MAINTENANCE_BASIC_6M: 'price_six', SITE_URL: 'https://site.test' };
    const ok = await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"6m"}'), env });
    assert.strictEqual(ok.status, 200);
    assert.match(sent, /price_six/);
    assert.match(sent, /mode=subscription/);
    assert.match(sent, /metadata\[period\]=6m/);
    // No 12-month price configured, and an unknown period, are both refused.
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"12m"}'), env })).status, 503);
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-maintenance-basic","period":"2m"}'), env })).status, 400);
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic","period":"6m"}'), env })).status, 400);
  } finally { globalThis.fetch = realFetch; }
});
test('checkout function refuses a live key without ALLOW_LIVE', async () => {
  const { onRequestPost } = await load();
  const env = { STRIPE_SECRET_KEY: 'sk_live_123', PRICE_API_INTEGRATION_BASIC: 'price_123', SITE_URL: 'https://site.test' };
  assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env })).status, 500);
});
test('checkout function applies a valid launch coupon instead of promo-code entry', async () => {
  const { onRequestPost } = await load();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/coupons/LAUNCH30')) return new Response(JSON.stringify({ id: 'LAUNCH30', valid: true, percent_off: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    sent = String(init.body);
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { STRIPE_SECRET_KEY: 'sk_test_123', PRICE_API_INTEGRATION_BASIC: 'price_123', SITE_URL: 'https://site.test', LAUNCH_COUPON: 'LAUNCH30' };
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env })).status, 200);
    assert.match(sent, /discounts\[0\]\[coupon\]=LAUNCH30/);
    assert.doesNotMatch(sent, /allow_promotion_codes/);
  } finally { globalThis.fetch = realFetch; }
});
test('checkout function falls back to promo codes when the launch coupon is expired', async () => {
  const { onRequestPost } = await load();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/coupons/LAUNCH30')) return new Response(JSON.stringify({ id: 'LAUNCH30', valid: false, percent_off: 30 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    sent = String(init.body);
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const env = { STRIPE_SECRET_KEY: 'sk_test_123', PRICE_API_INTEGRATION_BASIC: 'price_123', SITE_URL: 'https://site.test', LAUNCH_COUPON: 'LAUNCH30' };
    assert.strictEqual((await onRequestPost({ request: post('{"productId":"api-integration-basic"}'), env })).status, 200);
    assert.doesNotMatch(sent, /discounts/);
    assert.match(sent, /allow_promotion_codes=true/);
  } finally { globalThis.fetch = realFetch; }
});
