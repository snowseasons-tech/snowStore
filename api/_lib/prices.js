// Prices are read from Stripe by product ID (catalog stripeProduct), so no Price IDs live in env vars.
// Each active price is filed under a billing period: '1w', '1m', '3m', '6m' or '12m'. A one-time price files as '1m'.
const PERIODS = ['1w', '1m', '3m', '6m', '12m'];

function periodOf(price) {
  const r = price.recurring;
  if (!r) return '1m';
  const n = r.interval_count || 1;
  if (r.interval === 'week' && n === 1) return '1w';
  if (r.interval === 'month' && [1, 3, 6, 12].includes(n)) return n === 12 ? '12m' : `${n}m`;
  if (r.interval === 'year' && n === 1) return '12m';
  return null; // any other schedule (daily, every 2 weeks...) is not offered on the site
}

// { [productId]: { [period]: price } } from a list of Stripe prices. When two active prices share a period, the newest wins.
function groupByProduct(prices) {
  const out = {};
  for (const p of prices) {
    const period = periodOf(p);
    const product = typeof p.product === 'string' ? p.product : p.product && p.product.id;
    if (!period || !product || p.unit_amount == null) continue;
    const slot = (out[product] = out[product] || {});
    if (!slot[period] || p.created > slot[period].created || (p.created === slot[period].created && p.recurring && !slot[period].recurring)) slot[period] = p;
  }
  return out;
}

// All active prices in the account, grouped by product (one paginated list call).
async function activePricesByProduct(stripe) {
  return groupByProduct(await stripe.prices.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 10000 }));
}

// Active prices of one product, by period.
async function activePricesFor(stripe, productId) {
  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
  return groupByProduct(list)[productId] || {};
}

module.exports = { PERIODS, periodOf, groupByProduct, activePricesByProduct, activePricesFor };
