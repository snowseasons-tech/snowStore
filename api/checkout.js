const CATALOG = require('./_lib/catalog');
const prices = require('./_lib/prices');
const { stripeClient, launchDiscount } = require('./_lib/stripe');
const { send, allow, readRaw } = require('./_lib/http');

module.exports = async (req, res) => {
  if (!allow(req, res, 'POST')) return;
  try {
    let body = {};
    try { body = JSON.parse((await readRaw(req)).toString() || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const product = Object.prototype.hasOwnProperty.call(CATALOG, body.productId) ? CATALOG[body.productId] : null;
    if (!product || product.retired) return send(res, 400, { error: 'Unknown product' });
    // period: '1w', '3m', '6m' or '12m' picks another billing period; default '1m' is the monthly (or one-time) price.
    const period = body.period || '1m';
    if (!prices.PERIODS.includes(period)) return send(res, 400, { error: 'Unknown billing period' });
    const site = process.env.SITE_URL;
    if (!site || !product.stripeProduct) return send(res, 503, { error: 'Checkout not configured' });

    const stripe = stripeClient();
    const chosen = (await prices.activePricesFor(stripe, product.stripeProduct))[period];
    if (!chosen) return send(res, period === '1m' ? 503 : 400, { error: period === '1m' ? 'Checkout not configured' : 'That billing period is not available' });
    const price = chosen.id;
    const isSub = !!chosen.recurring; // checkout mode follows the price itself
    const launch = await launchDiscount(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: [{ price, quantity: 1 }],
      metadata: { product_id: body.productId, ...(period !== '1m' ? { period } : {}) },
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cancel`,
      // Stripe Tax needs a location it recognizes. Checkout asks only for country and postal code by default, which
      // can fail with customer_tax_location_invalid, so collect the full billing address (also saved for renewals).
      ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' } : {}),
      // Stripe rejects discounts together with allow_promotion_codes, so the launch coupon replaces code entry.
      ...(launch ? { discounts: [{ coupon: launch.id }] } : { allow_promotion_codes: true }),
      ...(isSub ? { subscription_data: { metadata: { product_id: body.productId } } } : {}),
    });
    send(res, 200, { url: session.url });
  } catch (e) {
    console.error('checkout', e.message);
    send(res, 500, { error: 'Could not start checkout' });
  }
};
