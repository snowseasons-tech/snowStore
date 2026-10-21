import CATALOG from '../../api/_lib/catalog.js';
import { stripeClient } from '../_lib/stripe.js';
import { send, methodNotAllowed } from '../_lib/http.js';

export const onRequest = methodNotAllowed('GET');

// Display prices come from Stripe, never from frontend code.
export async function onRequestGet({ env }) {
  try {
    const stripe = stripeClient(env);
    // Fetch all prices in parallel; products without a configured price are left out.
    const listed = Object.entries(CATALOG).filter(([, p]) => env[p.priceEnv]);
    const products = await Promise.all(listed.map(async ([id, p]) => {
      const price = await stripe.prices.retrieve(env[p.priceEnv]);
      return { id, name: p.name, blurb: p.blurb || null, amount: price.unit_amount, currency: price.currency, interval: price.recurring ? price.recurring.interval : null };
    }));
    return send(200, { products }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('products', e.message);
    return send(500, { error: 'Could not load prices' });
  }
}
