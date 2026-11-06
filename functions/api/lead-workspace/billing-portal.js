import { leadSession } from '../../_lib/lead-session.js';
import { billingLinks, leadAccess } from '../../_lib/lead-access.js';
import { stripeClient } from '../../_lib/stripe.js';
import { send, methodNotAllowed } from '../../_lib/http.js';

export const onRequest = methodNotAllowed('POST');
export async function onRequestPost({ request, env }) {
  try {
    const session = await leadSession(request, env);
    if (!session) return send(401, { error: 'Please sign in again.' });
    if (env.LEAD_WORKSPACE_BILLING_ENABLED !== '1') return send(403, { error: 'Subscription billing access is not enabled.' });
    const origin = new URL(request.url).origin;
    if (request.headers.get('Origin') !== origin) return send(403, { error: 'Open billing from this site.' });
    const links = await billingLinks(session, env);
    if (!links.length) return send(403, { error: 'No subscription checkout is linked to this account.' });
    const access = await leadAccess(session, env);
    // Customer choice comes from verified checkout links, never a browser-supplied ID.
    const customer = access.customer || links[0].customer;
    const portal = await stripeClient(env).billingPortal.sessions.create({ customer, return_url: origin + '/storefront/lead-workspace' }, { timeout: 5000, maxNetworkRetries: 0 });
    return send(200, { url: portal.url });
  } catch {
    return send(503, { error: 'Billing management is unavailable. Please retry.' });
  }
}
