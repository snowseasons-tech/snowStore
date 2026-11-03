import CATALOG from '../../api/_lib/catalog.js';
import prices from '../../api/_lib/prices.js';
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
    // One list call for every active price in the account; products with no active base price are left out.
    const byProduct = await prices.activePricesByProduct(stripe);
    const card = (pr, period) => ({ period, amount: pr.unit_amount, interval: pr.recurring ? pr.recurring.interval : null, intervalCount: pr.recurring ? pr.recurring.interval_count : null, ...discounted(pr.unit_amount, launch) });
    const products = Object.entries(CATALOG).filter(([, p]) => !p.retired && !p.draft && !p.hidden && p.stripeProduct && byProduct[p.stripeProduct] && byProduct[p.stripeProduct]['1m']).map(([id, p]) => {
      const found = byProduct[p.stripeProduct], base = found['1m'];
      // Other billing periods (weekly, 3, 6 or 12 months) offered alongside the monthly price.
      const periods = prices.PERIODS.filter((k) => k !== '1m' && found[k]).map((k) => card(found[k], k));
      return { id, name: p.name, blurb: p.blurb || null, amount: base.unit_amount, currency: base.currency, interval: base.recurring ? base.recurring.interval : null, ...discounted(base.unit_amount, launch), ...(periods.length ? { periods } : {}) };
    });
    return send(200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    return send(500, { error: 'Could not load prices' });
  }
}
