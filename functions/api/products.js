import CATALOG from '../../api/_lib/catalog.js';
import { stripeClient, launchDiscount } from '../_lib/stripe.js';
import { send, methodNotAllowed } from '../_lib/http.js';

// amount stays the list price; discount (when a launch coupon is live) carries the percent and the price after it.
// duration/months mirror the coupon: on a subscription, 'once' discounts only the first invoice.
const discounted = (amount, launch) => (launch ? { discount: { percent: launch.percent, amount: Math.round(amount * (100 - launch.percent) / 100), duration: launch.duration, months: launch.months } } : {});

export const onRequest = methodNotAllowed('GET');

// Display prices come from Stripe, never from frontend code.
export async function onRequestGet({ env }) {
  try {
    const stripe = stripeClient(env);
    const launch = await launchDiscount(stripe, env);
    // Fetch all prices in parallel; products without a configured price are left out.
    const listed = Object.entries(CATALOG).filter(([, p]) => !p.retired && env[p.priceEnv]);
    const products = await Promise.all(listed.map(async ([id, p]) => {
      const price = await stripe.prices.retrieve(env[p.priceEnv]);
      // Longer billing periods (6 or 12 months) that have a Price ID configured.
      const extra = Object.entries(p.periodEnvs || {}).filter(([, name]) => env[name]);
      const periods = await Promise.all(extra.map(async ([period, name]) => {
        const pr = await stripe.prices.retrieve(env[name]);
        return { period, amount: pr.unit_amount, interval: pr.recurring ? pr.recurring.interval : null, intervalCount: pr.recurring ? pr.recurring.interval_count : null, ...discounted(pr.unit_amount, launch) };
      }));
      return { id, name: p.name, blurb: p.blurb || null, amount: price.unit_amount, currency: price.currency, interval: price.recurring ? price.recurring.interval : null, ...discounted(price.unit_amount, launch), ...(periods.length ? { periods } : {}) };
    }));
    return send(200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    return send(500, { error: 'Could not load prices' });
  }
}
