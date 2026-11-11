// Prints the sellable catalog as JSON for the hook-body-cta-copywriter skill: node scripts/export-catalog-for-posts.js
// Prices are left out on purpose: they live in Stripe (see api/products.js), so copy must not quote one unless the user supplies it.
const CATALOG = require('../api/_lib/catalog');

const products = Object.entries(CATALOG)
  .filter(([, p]) => !p.retired && !p.draft && !p.hidden)
  .map(([id, p]) => ({ id, name: p.name, category: p.category || null, kind: p.kind || 'one_time', blurb: p.blurb || null, includes: p.includes || null }));

process.stdout.write(JSON.stringify(products, null, 2) + '\n');
