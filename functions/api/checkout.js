import CATALOG from '../../api/_lib/catalog.js';
import { stripeClient, launchDiscount } from '../_lib/stripe.js';
import { send, methodNotAllowed } from '../_lib/http.js';

export const onRequest = methodNotAllowed('POST');

export async function onRequestPost({ request, env }) {
  try {
    let body = {};
    try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
    const product = Object.prototype.hasOwnProperty.call(CATALOG, body.productId) ? CATALOG[body.productId] : null;
    if (!product || product.retired) return send(400, { error: 'Unknown product' });
    // period: '3m', '6m' or '12m' picks a longer billing period; anything else is the monthly (default) price.
    const periodEnv = body.period && body.period !== '1m'
      ? (product.periodEnvs && Object.prototype.hasOwnProperty.call(product.periodEnvs, body.period) ? product.periodEnvs[body.period] : null)
      : product.priceEnv;
    if (!periodEnv) return send(400, { error: 'Unknown billing period' });
    const price = env[periodEnv];
    const site = env.SITE_URL;
    if (!price || !site) return send(503, { error: 'Checkout not configured' });

    const isSub = product.kind === 'subscription';
    const stripe = stripeClient(env);
    const launch = await launchDiscount(stripe, env);
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: [{ price, quantity: 1 }],
      metadata: { product_id: body.productId, ...(periodEnv !== product.priceEnv ? { period: body.period } : {}) },
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cancel`,
      ...(env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true } } : {}),
      // Stripe rejects discounts together with allow_promotion_codes, so the launch coupon replaces code entry.
      ...(launch ? { discounts: [{ coupon: launch.id }] } : { allow_promotion_codes: true }),
      ...(isSub ? { subscription_data: { metadata: { product_id: body.productId } } } : {}),
    });
    return send(200, { url: session.url });
  } catch (e) {
    console.error('checkout', e.message);
    return send(500, { error: 'Could not start checkout' });
  }
}
