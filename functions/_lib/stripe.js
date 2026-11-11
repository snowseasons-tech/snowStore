import Stripe from 'stripe';
import { testStripeKey } from './lead-pilot.js';

// Same guards as api/_lib/stripe.js. Workers have no Node http stack, so Stripe is pointed at fetch.
export function stripeClient(env) {
  const key = env.STRIPE_SECRET_KEY || '';
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (env.LEAD_WORKSPACE_SANDBOX_CHECKOUT === '1' && !testStripeKey(env)) {
    throw new Error('Lead pilot requires a Stripe test key and ALLOW_LIVE disabled');
  }
  if (key.startsWith('sk_live_') && env.ALLOW_LIVE !== '1') {
    throw new Error('Live Stripe key refused: set ALLOW_LIVE=1 only for the production deployment');
  }
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

// Same as launchDiscount in api/_lib/stripe.js.
export async function launchDiscount(stripe, env) {
  if (!env.LAUNCH_COUPON) return null;
  try {
    const c = await stripe.coupons.retrieve(env.LAUNCH_COUPON);
    return c.valid && c.percent_off ? { id: c.id, percent: c.percent_off, duration: c.duration, months: c.duration_in_months || null } : null;
  } catch (e) {
    console.error('launch coupon', e.message);
    return null;
  }
}
