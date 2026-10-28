const Stripe = require('stripe');
function stripeClient(env = process.env) {
  const key = env.STRIPE_SECRET_KEY || '';
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (key.startsWith('sk_live_') && env.ALLOW_LIVE !== '1') {
    throw new Error('Live Stripe key refused: set ALLOW_LIVE=1 only for the production deployment');
  }
  return new Stripe(key);
}

// Temporary storewide launch discount: LAUNCH_COUPON holds the ID of a Stripe coupon with percent_off.
// Returns { id, percent } while the coupon is valid, otherwise null (unset, expired, or lookup failed),
// so checkout and the displayed prices fall back to list price instead of breaking.
async function launchDiscount(stripe, env = process.env) {
  if (!env.LAUNCH_COUPON) return null;
  try {
    const c = await stripe.coupons.retrieve(env.LAUNCH_COUPON);
    return c.valid && c.percent_off ? { id: c.id, percent: c.percent_off, duration: c.duration, months: c.duration_in_months || null } : null;
  } catch (e) {
    console.error('launch coupon', e.message);
    return null;
  }
}
module.exports = { stripeClient, launchDiscount };
