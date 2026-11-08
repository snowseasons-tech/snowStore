const CATALOG = require('./_lib/catalog');
const prices = require('./_lib/prices');
const gift = require('./_lib/gift');
const { stripeClient, launchDiscount } = require('./_lib/stripe');
const { send, allow, readRaw } = require('./_lib/http');

module.exports = async (req, res) => {
  if (!allow(req, res, 'POST')) return;
  try {
    let body = {};
    try { body = JSON.parse((await readRaw(req)).toString() || '{}'); } catch { return send(res, 400, { error: 'Bad JSON' }); }
    const product = Object.prototype.hasOwnProperty.call(CATALOG, body.productId) ? CATALOG[body.productId] : null;
    if (!product || product.retired) return send(res, 400, { error: 'Unknown product' });
    if (product.draft || product.hidden) return send(res, 503, { error: 'Product not available' });
    // period: '1w', '3m', '6m' or '12m' picks another billing period; default '1m' is the monthly (or one-time) price.
    const period = body.period || '1m';
    if (!prices.PERIODS.includes(period)) return send(res, 400, { error: 'Unknown billing period' });
    // A gift: a one-time purchase of this product for someone else, who redeems a code (api/_lib/gift.js).
    let giftMeta = null;
    if (body.gift !== undefined) {
      if (!gift.giftable(product) || product.kind === 'subscription' || period !== '1m') return send(res, 400, { error: 'This product cannot be given as a gift' });
      try { giftMeta = gift.giftMetadata(body.productId, body.gift); } catch (e) {
        if (e instanceof gift.GiftError) return send(res, 400, { error: e.message });
        throw e;
      }
    }
    const site = process.env.SITE_URL;
    if (!site || !product.stripeProduct) return send(res, 503, { error: 'Checkout not configured' });

    const stripe = stripeClient();
    const available = await prices.activePricesFor(stripe, product.stripeProduct);
    const chosen = available[period];
    if (!chosen) return send(res, period === '1m' ? 503 : 400, { error: period === '1m' ? 'Checkout not configured' : 'That billing period is not available' });
    if (body.productId === 'founders-membership' && (period !== '1m' || chosen.unit_amount !== 2175 || chosen.currency !== 'usd' || chosen.recurring?.interval !== 'month' || (chosen.recurring.interval_count || 1) !== 1)) {
      return send(res, 503, { error: 'Membership price does not match published terms' });
    }
    const price = chosen.id;
    const isSub = !!chosen.recurring; // checkout mode follows the price itself
    if (giftMeta && isSub) return send(res, 400, { error: 'This product cannot be given as a gift' });
    let lineItems = [{ price, quantity: 1 }];
    if (body.productId === 'snowsocial') {
      const setup = available.once;
      if (!isSub || !setup || setup.id !== 'price_1UXgMuPM6gpd3uZBxtEuoJNE' || setup.unit_amount !== 9900 || setup.currency !== 'usd') {
        return send(res, 503, { error: 'SnowSocial setup price is unavailable or does not match the published $99 USD fee' });
      }
      lineItems.push({ price: setup.id, quantity: 1 });
    }
    const launch = await launchDiscount(stripe);
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: lineItems,
      metadata: giftMeta || { product_id: body.productId, ...(period !== '1m' ? { period } : {}) },
      success_url: giftMeta ? `${site}/gift.html?purchased=1` : `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/cancel`,
      ...(body.productId === 'founders-membership' ? {
        consent_collection: { terms_of_service: 'required' },
        custom_text: { terms_of_service_acceptance: { message: `I agree to the [Founders membership terms](${site}/terms#founders): $21.75 USD/month plus tax, renewing until canceled.` } },
      } : {}),
      // Stripe Tax needs a location it recognizes. Checkout asks only for country and postal code by default, which
      // can fail with customer_tax_location_invalid, so collect the full billing address (also saved for renewals).
      ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' } : {}),
      // Stripe rejects discounts together with allow_promotion_codes, so the launch coupon replaces code entry.
      ...(launch ? { discounts: [{ coupon: launch.id }] } : { allow_promotion_codes: true }),
      ...(isSub ? { subscription_data: { metadata: { product_id: body.productId, user_id: body.userId || 'pending' } } } : {}),
    });
    send(res, 200, { url: session.url });
  } catch (e) {
    console.error('checkout', e.message);
    send(res, 500, { error: 'Could not start checkout' });
  }
};
