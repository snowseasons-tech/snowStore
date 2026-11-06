import { leadAccess } from '../../_lib/lead-access.js';
import { leadSession } from '../../_lib/lead-session.js';
import { send, methodNotAllowed } from '../../_lib/http.js';

export const onRequest = methodNotAllowed('GET');

export async function onRequestGet({ request, env }) {
  try {
    const session = await leadSession(request, env);
    if (!session) return send(401, { error: 'Sign in to your customer account.' });
    // Identity only. Subscription access and tenant data are separate phases.
    const access = await leadAccess(session, env);
    return send(200, { ...session, workspaceEnabled: access.allowed, billingEnabled: env.LEAD_WORKSPACE_BILLING_ENABLED === '1', access });
  } catch {
    return send(503, { error: 'Sign-in verification is temporarily unavailable. Please retry.' });
  }
}
