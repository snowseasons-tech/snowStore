const test = require('node:test');
const assert = require('node:assert');
const CATALOG = require('../api/_lib/catalog');
const { downloadsFor, isMembership } = require('../api/_lib/entitlements');
const { validateCatalog } = require('../scripts/validate-store-items');

// Bundle A (Outgrown Spreadsheets) is not in the catalog: its hero, the Store Inventory Tracker, is retired.
const BUNDLES = {
  'christmas-solopreneur': { price: 24900, files: ['lead-generator', 'blog-gen'] },
  'christmas-small-team': { price: 39900, files: ['booking-app'] },
};

test('the Christmas bundles are one-time, hidden and have no Stripe product yet', () => {
  for (const [id, { price, files }] of Object.entries(BUNDLES)) {
    const b = CATALOG[id];
    assert.ok(b, `${id} is in the catalog`);
    assert.strictEqual(b.kind, 'one_time');
    assert.strictEqual(b.hidden, true, `${id} must stay hidden until Stripe is set up`);
    assert.strictEqual(b.stripeProduct, undefined);
    assert.strictEqual(b.proposedPrice, price);
    assert.deepStrictEqual(b.includes, files);
  }
});

test('the full catalog validates with the Christmas bundles in it', () => {
  assert.deepStrictEqual(validateCatalog(CATALOG), []);
});

test('a one-time bundle unlocks its files and is not a membership', () => {
  for (const [id, { files }] of Object.entries(BUNDLES)) {
    assert.strictEqual(isMembership(CATALOG[id]), false, `${id} is not a subscription`);
    assert.deepStrictEqual(downloadsFor(id, CATALOG).map((d) => d.id), files);
  }
});

test('checkout refuses the hidden Christmas bundles', async () => {
  Object.assign(process.env, { SITE_URL: 'https://x.test', STRIPE_SECRET_KEY: 'sk_test_x' });
  const { onRequestPost } = await import('../functions/api/checkout.js');
  for (const id of Object.keys(BUNDLES)) {
    const request = new Request('https://x.test/api/checkout', { method: 'POST', body: JSON.stringify({ productId: id }) });
    const res = await onRequestPost({ request, env: { SITE_URL: 'https://x.test', STRIPE_SECRET_KEY: 'sk_test_x' } });
    assert.strictEqual(res.status, 503, `${id} must not be sold yet`);
  }
});

test('the validator accepts a one-time bundle and rejects an unclear one', () => {
  const base = {
    a: { name: 'A', stripeProduct: 'prod_a', fileKey: 'a/a.zip', filename: 'a.zip', sha256: 'a'.repeat(64) },
  };
  assert.deepStrictEqual(validateCatalog({
    ...base,
    b: { name: 'B', stripeProduct: 'prod_b', kind: 'one_time', includes: ['a'] },
  }), []);
  const errors = validateCatalog({
    ...base,
    noKind: { name: 'No kind', stripeProduct: 'prod_nk', includes: ['a'] },
    noPrice: { name: 'No price', kind: 'one_time', hidden: true, includes: ['a'] },
    badPrice: { name: 'Bad price', kind: 'one_time', hidden: true, proposedPrice: 9.5, includes: ['a'] },
    hasFile: { name: 'Has file', kind: 'one_time', stripeProduct: 'prod_hf', fileKey: 'x/x.zip', filename: 'x.zip', sha256: 'b'.repeat(64), includes: ['a'] },
  });
  assert.ok(errors.includes("noKind.kind: must be 'subscription' (membership) or 'one_time' (bundle)"));
  assert.ok(errors.includes('noPrice.proposedPrice: must be a price in cents for a hidden one-time bundle'));
  assert.ok(errors.includes('badPrice.proposedPrice: must be a price in cents for a hidden one-time bundle'));
  assert.ok(errors.includes('hasFile.fileKey: a bundle has no file of its own'));
});

test('a hidden product may omit its Stripe product, but a visible one may not', () => {
  const errors = validateCatalog({
    'hidden-no-stripe': { name: 'Hidden', hidden: true, fileKey: 'h/h.zip', filename: 'h.zip', sha256: 'c'.repeat(64) },
    'visible-no-stripe': { name: 'Visible', fileKey: 'v/v.zip', filename: 'v.zip', sha256: 'd'.repeat(64) },
  });
  assert.deepStrictEqual(errors, ['visible-no-stripe.stripeProduct: is required unless the product is retired, a draft or hidden']);
});
