const CATALOG = require('./_lib/catalog');
const { stripeClient } = require('./_lib/stripe');
const { send, allow } = require('./_lib/http');

// Display prices come from Stripe, never from frontend code.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  try {
    const stripe = stripeClient();
    // Fetch all prices in parallel; products without a configured price are left out.
    const listed = Object.entries(CATALOG).filter(([, p]) => process.env[p.priceEnv]);
    const products = await Promise.all(listed.map(async ([id, p]) => {
      const price = await stripe.prices.retrieve(process.env[p.priceEnv]);
      return { id, name: p.name, blurb: p.blurb || null, amount: price.unit_amount, currency: price.currency, interval: price.recurring ? price.recurring.interval : null };
    }));
    send(res, 200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    send(res, 500, { error: 'Could not load prices' });
  }
};
