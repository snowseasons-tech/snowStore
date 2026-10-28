const CATALOG = require('./_lib/catalog');
const { stripeClient, launchDiscount } = require('./_lib/stripe');
const { send, allow } = require('./_lib/http');

// amount stays the list price; discount (when a launch coupon is live) carries the percent and the price after it.
// duration/months mirror the coupon: on a subscription, 'once' discounts only the first invoice.
const discounted = (amount, launch) => (launch ? { discount: { percent: launch.percent, amount: Math.round(amount * (100 - launch.percent) / 100), duration: launch.duration, months: launch.months } } : {});

// Display prices come from Stripe, never from frontend code.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  try {
    const stripe = stripeClient();
    const launch = await launchDiscount(stripe);
    // Fetch all prices in parallel; products without a configured price are left out.
    const listed = Object.entries(CATALOG).filter(([, p]) => !p.retired && process.env[p.priceEnv]);
    const products = await Promise.all(listed.map(async ([id, p]) => {
      const price = await stripe.prices.retrieve(process.env[p.priceEnv]);
      // Other billing periods (weekly, 3, 6 or 12 months) that have a Price ID configured.
      const extra = Object.entries(p.periodEnvs || {}).filter(([, name]) => process.env[name]);
      const periods = await Promise.all(extra.map(async ([period, name]) => {
        const pr = await stripe.prices.retrieve(process.env[name]);
        return { period, amount: pr.unit_amount, interval: pr.recurring ? pr.recurring.interval : null, intervalCount: pr.recurring ? pr.recurring.interval_count : null, ...discounted(pr.unit_amount, launch) };
      }));
      return { id, name: p.name, blurb: p.blurb || null, amount: price.unit_amount, currency: price.currency, interval: price.recurring ? price.recurring.interval : null, ...discounted(price.unit_amount, launch), ...(periods.length ? { periods } : {}) };
    }));
    send(res, 200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    send(res, 500, { error: 'Could not load prices' });
  }
};
