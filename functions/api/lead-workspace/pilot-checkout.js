import { createHash } from 'node:crypto';
import CATALOG from '../../../api/_lib/catalog.js';
import { leadSession } from '../../_lib/lead-session.js';
import { workspaceWrite, boundedJSON } from '../../_lib/lead-request.js';
import { pilotCheckoutEnabled } from '../../_lib/lead-pilot.js';
import { stripeClient } from '../../_lib/stripe.js';
import { send, methodNotAllowed } from '../../_lib/http.js';
import { leadFailure } from '../../_lib/lead-observability.js';
import { LeadError } from '../../_lib/lead-data.js';
export const onRequest = methodNotAllowed('POST');
export async function onRequestPost({ request, env }) {
  try {
    const user = await leadSession(request, env);
    if (!user) throw new LeadError(401, 'Please sign in again.');
    if (!pilotCheckoutEnabled(user.email, env) || env.LEAD_WORKSPACE_MAINTENANCE === '1') throw new LeadError(403, 'Sandbox checkout is not available for this account.');
    workspaceWrite(request, user.email);
    const body = await boundedJSON(request, 1000);
    if (Object.keys(body).length !== 1 || typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.requestId || '')) throw new LeadError(400, 'A new test-checkout request ID is required.');
    const stripe = stripeClient(env);
    const price = await stripe.prices.retrieve(env.LEAD_WORKSPACE_SANDBOX_PRICE, { expand: ['product'] }, { timeout: 5000, maxNetworkRetries: 0 });
    if (price.livemode !== false || !price.active || price.product?.id !== env.LEAD_WORKSPACE_SANDBOX_PRODUCT || price.product?.livemode !== false || !price.product?.active || price.unit_amount !== CATALOG['lead-generation-pro'].proposedMonthly || price.currency !== 'usd' || price.recurring?.interval !== 'month' || (price.recurring.interval_count || 1) !== 1) throw new LeadError(503, 'The sandbox price does not match the pilot plan.');
    const hash = createHash('sha256').update(user.email).digest('hex');
    const metadata = { product_id: 'lead-generation-pro', lead_workspace_pilot: '1', lead_account_hash: hash };
    const suffix = [...createHash('sha256').update(hash + body.requestId).digest().subarray(0, 8)].map(value => String.fromCharCode(97 + value % 26)).join('');
    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer_email: user.email, line_items: [{ price: price.id, quantity: 1 }], metadata, subscription_data: { metadata }, integration_identifier: 'lead-workspace-pilot-' + suffix, success_url: origin + '/storefront/lead-workspace?pilot=returned', cancel_url: origin + '/storefront/lead-workspace?pilot=canceled' }, { idempotencyKey: 'lead-pilot-' + hash + '-' + body.requestId, timeout: 5000, maxNetworkRetries: 0 });
    return send(200, { url: session.url });
  } catch (error) { return leadFailure('pilot_checkout', error, 'Sandbox checkout is unavailable. No workspace access was granted.'); }
}
