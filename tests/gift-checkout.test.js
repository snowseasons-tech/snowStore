const test = require('node:test');
const assert = require('node:assert');

const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const price = (id, product, recurring = null) => ({ id, object: 'price', product, unit_amount: 4900, currency: 'usd', recurring, created: 1, active: true });
const PRICES = [
  price('price_booking', 'prod_VWvr03UiKKKzOV'),
  price('price_founders', 'prod_VWva1qZT0oarCt', { interval: 'month', interval_count: 1 }),
];
const ENV = { STRIPE_SECRET_KEY: 'sk_test_123', SITE_URL: 'https://site.test' };
const load = () => import('../functions/api/checkout.js');

// Stands in for Stripe: serves prices and records the last checkout session form body.
function fakeStripe() {
  const realFetch = globalThis.fetch;
  const calls = { session: null };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname === '/v1/prices') {
      const product = u.searchParams.get('product');
      return json({ object: 'list', data: PRICES.filter((p) => !product || p.product === product), has_more: false, url: '/v1/prices' });
    }
    calls.session = String(init.body);
    return json({ id: 'cs_test_gift', url: 'https://checkout.stripe.test/c/gift' });
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const checkout = (body) => new Request('https://x.test/api/checkout', { method: 'POST', body: JSON.stringify(body) });
const gift = { buyerName: 'Ada Buyer', recipientEmail: 'sam@example.com', message: 'Happy holidays' };

test('a gift checkout records the gift details in the session metadata', async () => {
  const s = fakeStripe();
  try {
    const { onRequestPost } = await load();
    const res = await onRequestPost({ request: checkout({ productId: 'booking-app', gift }), env: ENV });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).url, 'https://checkout.stripe.test/c/gift');
    assert.match(s.calls.session, /metadata\[gift\]=true/);
    assert.match(s.calls.session, /metadata\[gift_recipient_email\]=sam%40example\.com/);
    assert.match(s.calls.session, /metadata\[product_id\]=booking-app/);
    assert.match(s.calls.session, /mode=payment/);
    assert.match(s.calls.session, /success_url=https%3A%2F%2Fsite\.test%2Fgift\.html%3Fpurchased%3D1/);
  } finally { s.restore(); }
});

test('an ordinary checkout is unchanged', async () => {
  const s = fakeStripe();
  try {
    const { onRequestPost } = await load();
    assert.strictEqual((await onRequestPost({ request: checkout({ productId: 'booking-app' }), env: ENV })).status, 200);
    assert.doesNotMatch(s.calls.session, /metadata\[gift\]/);
    assert.match(s.calls.session, /success_url=https%3A%2F%2Fsite\.test%2Fsuccess/);
  } finally { s.restore(); }
});

test('subscriptions cannot be given as gifts', async () => {
  const s = fakeStripe();
  try {
    const { onRequestPost } = await load();
    const res = await onRequestPost({ request: checkout({ productId: 'founders-membership', gift }), env: ENV });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(s.calls.session, null, 'no Stripe session is created');
  } finally { s.restore(); }
});

test('a gift with a bad recipient is refused before any Stripe session is made', async () => {
  const s = fakeStripe();
  try {
    const { onRequestPost } = await load();
    const res = await onRequestPost({ request: checkout({ productId: 'booking-app', gift: { ...gift, recipientEmail: 'nope' } }), env: ENV });
    assert.strictEqual(res.status, 400);
    assert.match((await res.json()).error, /Recipient email/);
    assert.strictEqual(s.calls.session, null);
  } finally { s.restore(); }
});
