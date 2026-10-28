const CATALOG = require('./_lib/catalog');
const { stripeClient, launchDiscount } = require('./_lib/stripe');
const { send, allow, readRaw } = require('./_lib/http');

module.exports = async (req, res) => {
  if (!allow(req, res, 'POST')) return;
  try {
    let body = {};
    try { body = JSON.parse((await readRaw(req)).toString() || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const product = Object.prototype.hasOwnProperty.call(CATALOG, body.productId) ? CATALOG[body.productId] : null;
    if (!product || product.retired) return send(res, 400, { error: 'Unknown product' });
    const price = process.env[product.priceEnv];
    const site = process.env.SITE_URL;
    if (!price || !site) return send(res, 503, { error: 'Checkout not configured' });

    const isSub = product.kind === 'subscription';
    const stripe = stripeClient();
    const launch = await launchDiscount(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: [{ price, quantity: 1 }],
      metadata: { product_id: body.productId },
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cancel`,
      ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true } } : {}),
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
