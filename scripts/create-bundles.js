#!/usr/bin/env node
// Creates the Stripe product and monthly price for each draft bundle in the catalog.
// Dry run by default. --apply writes to the Stripe account behind STRIPE_SECRET_KEY, so run it in test mode first.
// Bundles with pending parts are skipped. After applying, set each printed stripeProduct in the catalog and remove draft.
const CATALOG = require('../api/_lib/catalog');
const { activePricesFor } = require('../api/_lib/prices');

const drafts = (catalog) => Object.entries(catalog).filter(([, p]) => p.draft).map(([id, p]) => ({ id, ...p }));
const blocked = (bundle) => !!(bundle.pending && bundle.pending.length);

async function createBundle(stripe, bundle) {
  const found = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
  const product = found.find((p) => p.metadata && p.metadata.bundle_id === bundle.id)
    || await stripe.products.create({ name: bundle.name, description: bundle.blurb, metadata: { bundle_id: bundle.id } }, { idempotencyKey: `bundle-product-${bundle.id}` });
  const existing = (await activePricesFor(stripe, product.id))['1m'];
  if (existing && existing.unit_amount !== bundle.proposedMonthly) {
    throw new Error(`${bundle.id} already has a different monthly price in Stripe`);
  }
  if (!existing) {
    await stripe.prices.create({ product: product.id, unit_amount: bundle.proposedMonthly, currency: 'usd', recurring: { interval: 'month' } }, { idempotencyKey: `bundle-price-${bundle.id}-${bundle.proposedMonthly}` });
  }
  return product.id;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const stripe = apply ? require('../api/_lib/stripe').stripeClient() : null;
  for (const bundle of drafts(CATALOG)) {
    const price = `$${bundle.proposedMonthly / 100}/month`;
    if (blocked(bundle)) console.log(`skip    ${bundle.id}: waiting on ${bundle.pending.join(', ')}`);
    else if (!apply) console.log(`ready   ${bundle.id}: ${price}`);
    else console.log(`created ${bundle.id}: ${price}, stripeProduct ${await createBundle(stripe, bundle)}`);
  }
  if (!apply) console.log('Dry run. Nothing was sent to Stripe.');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });

module.exports = { drafts, blocked, createBundle };
