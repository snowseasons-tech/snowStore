import { workspaceKey } from '../../_lib/lead-data.js';
import { pilotCheckoutEnabled } from '../../_lib/lead-pilot.js';
import { leadAccess } from '../../_lib/lead-access.js';
import { leadSession } from '../../_lib/lead-session.js';
import { send, methodNotAllowed } from '../../_lib/http.js';

export const onRequest = methodNotAllowed('GET');

export async function onRequestGet({ request, env }) {
  try {
    const session = await leadSession(request, env);
    if (!session) return send(401, { error: 'Sign in to your customer account.' });
    // Availability is checked here; data and CRM routes independently enforce access.
    const access = await leadAccess(session, env);
    return send(200, { ...session, workspaceId: workspaceKey(session.email), sandboxCheckoutAvailable: pilotCheckoutEnabled(session.email, env), workspaceEnabled: access.allowed, billingEnabled: env.LEAD_WORKSPACE_BILLING_ENABLED === '1', access });
  } catch {
    return send(503, { error: 'Sign-in verification is temporarily unavailable. Please retry.' });
  }
}
