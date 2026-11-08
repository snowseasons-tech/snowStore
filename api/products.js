const CATALOG = require('./_lib/catalog');
const prices = require('./_lib/prices');
const { stripeClient, launchDiscount } = require('./_lib/stripe');
const { send, allow } = require('./_lib/http');
const { giftable } = require('./_lib/gift');

// amount stays the list price; discount (when a launch coupon is live) carries the percent and the price after it.
// duration/months mirror the coupon: on a subscription, 'once' discounts only the first invoice.
const discounted = (amount, launch) => (launch ? { discount: { percent: launch.percent, amount: Math.round(amount * (100 - launch.percent) / 100), duration: launch.duration, months: launch.months } } : {});

// Display prices come from Stripe, never from frontend code.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  try {
    const stripe = stripeClient();
    const launch = await launchDiscount(stripe);
    // One list call for every active price in the account; products with no active base price are left out.
    const byProduct = await prices.activePricesByProduct(stripe);
    const card = (pr, period) => ({ period, amount: pr.unit_amount, interval: pr.recurring ? pr.recurring.interval : null, intervalCount: pr.recurring ? pr.recurring.interval_count : null, ...discounted(pr.unit_amount, launch) });
    const products = Object.entries(CATALOG).filter(([, p]) => !p.retired && !p.draft && !p.hidden && p.stripeProduct && byProduct[p.stripeProduct] && (byProduct[p.stripeProduct]['1m'] || byProduct[p.stripeProduct].once)).map(([id, p]) => {
      const found = byProduct[p.stripeProduct], base = found['1m'] || found.once;
      // Other billing periods (weekly, 3, 6 or 12 months) offered alongside the monthly price.
      const periods = prices.PERIODS.filter((k) => k !== '1m' && found[k]).map((k) => card(found[k], k));
      return { id, name: p.name, blurb: p.blurb || null, amount: base.unit_amount, currency: base.currency, interval: base.recurring ? base.recurring.interval : null, ...(id === 'snowsocial' && found.once ? { setupAmount: found.once.unit_amount, setupCurrency: found.once.currency } : {}), ...discounted(base.unit_amount, launch), ...(periods.length ? { periods } : {}), ...(giftable(p) && !base.recurring && !periods.length ? { gift: true } : {}) };
    });
    send(res, 200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    send(res, 500, { error: 'Could not load prices' });
  }
};
