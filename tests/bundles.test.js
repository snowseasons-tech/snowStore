const test = require('node:test');
const assert = require('node:assert');
const CATALOG = require('../api/_lib/catalog');
const { downloadsFor } = require('../api/_lib/entitlements');
const { validateCatalog } = require('../scripts/validate-store-items');
const { drafts, blocked, createBundle } = require('../scripts/create-bundles');

const fakeStripe = (existing = []) => {
  const calls = { products: [], prices: [] };
  const list = (items) => ({ autoPagingToArray: async () => items });
  return {
    calls,
    products: { list: () => list(existing), create: async (body) => { calls.products.push(body); return { id: 'prod_new', ...body }; } },
    prices: { list: () => list(existing.prices || []), create: async (body) => { calls.prices.push(body); return body; } },
  };
};

test('the six draft bundles are valid and not on sale', () => {
  const bundles = drafts(CATALOG);
  assert.strictEqual(bundles.length, 6);
  assert.deepStrictEqual(validateCatalog(CATALOG), []);
  for (const b of bundles) assert.strictEqual(b.stripeProduct, undefined, `${b.id} must wait for Stripe`);
});

test('checkout refuses a draft bundle', async () => {
  const { onRequestPost } = await import('../functions/api/checkout.js');
  const request = new Request('https://x.test/api/checkout', { method: 'POST', body: JSON.stringify({ productId: 'business-launch' }) });
  const res = await onRequestPost({ request, env: { SITE_URL: 'https://x.test', STRIPE_SECRET_KEY: 'sk_test_x' } });
  assert.strictEqual(res.status, 503);
});

test('a bundle unlocks only software that exists', () => {
  assert.deepStrictEqual(downloadsFor('business-launch', CATALOG).map((d) => d.id), ['booking-app', 'invoice-generator']);
  assert.deepStrictEqual(downloadsFor('ai-business-intelligence', CATALOG), []);
  for (const b of drafts(CATALOG)) {
    for (const id of b.includes || []) assert.ok(CATALOG[id].fileKey && !CATALOG[id].retired, `${b.id} includes ${id}`);
  }
});

test('every bundle stays blocked until its software exists', () => {
  assert.strictEqual(drafts(CATALOG).filter(blocked).length, 6);
});

test('the validator rejects bad bundles', () => {
  const errors = validateCatalog({
    d: { name: 'D', kind: 'subscription', draft: true, proposedMonthly: 100, socialAccounts: 0 },
    a: { name: 'A', kind: 'subscription', draft: true },
    b: { name: 'B', kind: 'subscription', draft: true, proposedMonthly: 100, stripeProduct: 'prod_b' },
    c: { name: 'C', draft: true, proposedMonthly: 100, pending: [] },
  });
  assert.ok(errors.includes('a.proposedMonthly: must be a price in cents'));
  assert.ok(errors.includes('b.draft: remove draft once the bundle has a stripeProduct'));
  assert.ok(errors.includes("c.kind: must be 'subscription' for a draft bundle"));
  assert.ok(errors.includes('c.pending: must be a non-empty list of names'));
  assert.ok(errors.includes('d.socialAccounts: must be a positive whole number'));
});

test('createBundle makes one product with a monthly price', async () => {
  const stripe = fakeStripe();
  const bundle = { id: 'b', name: 'B', blurb: 'Blurb', proposedMonthly: 14900 };
  assert.strictEqual(await createBundle(stripe, bundle), 'prod_new');
  assert.strictEqual(stripe.calls.products[0].metadata.bundle_id, 'b');
  assert.deepStrictEqual(stripe.calls.prices[0], { product: 'prod_new', unit_amount: 14900, currency: 'usd', recurring: { interval: 'month' } });
});

test('createBundle reuses a product and refuses a different price', async () => {
  const existing = [{ id: 'prod_old', metadata: { bundle_id: 'b' } }];
  existing.prices = [{ product: 'prod_old', unit_amount: 9900, currency: 'usd', created: 1, recurring: { interval: 'month', interval_count: 1 } }];
  const stripe = fakeStripe(existing);
  await assert.rejects(createBundle(stripe, { id: 'b', name: 'B', proposedMonthly: 14900 }), /different monthly price/);
  assert.strictEqual(await createBundle(stripe, { id: 'b', name: 'B', proposedMonthly: 9900 }), 'prod_old');
  assert.strictEqual(stripe.calls.products.length + stripe.calls.prices.length, 0);
});
