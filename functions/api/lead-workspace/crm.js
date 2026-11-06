import { leadFailure } from '../../_lib/lead-observability.js';
import { workspaceUser, workspaceWrite, boundedJSON } from '../../_lib/lead-request.js';
import { crmStatus, connectCRM, disconnectCRM, reviewCRM, sendCRM } from '../../_lib/lead-crm.js';
import { send, methodNotAllowed } from '../../_lib/http.js';
import { LeadError } from '../../_lib/lead-data.js';

export const onRequest = methodNotAllowed('GET, POST');
async function userFor(request, env) {
  const user = await workspaceUser(request, env);
  if (env.LEAD_CRM_ENABLED !== '1') throw new LeadError(403, 'HubSpot delivery has not been enabled for this environment.');
  return user;
}
export async function onRequestGet({ request, env }) {
  try { const user = await userFor(request, env); return send(200, await crmStatus(user.email, env)); }
  catch (error) { return leadFailure('crm_read', error, 'CRM status unavailable.'); }
}
export async function onRequestPost({ request, env }) {
  try {
    const user = await userFor(request, env); workspaceWrite(request, user.email);
    const body = await boundedJSON(request, 16000);
    const allowed = { connect: ['action', 'token'], disconnect: ['action'], review: ['action', 'revision', 'selectedIds', 'mapping'], send: ['action', 'reviewId'] };
    if (!Object.hasOwn(allowed, body.action) || Object.keys(body).some(key => !allowed[body.action].includes(key))) throw new LeadError(400, 'Unsupported CRM action fields.');
    if (body.action === 'connect') return send(200, await connectCRM(user.email, env, body.token));
    if (body.action === 'disconnect') return send(200, await disconnectCRM(user.email, env));
    if (body.action === 'review') return send(200, await reviewCRM(user.email, env, { revision: body.revision, selectedIds: body.selectedIds, mapping: body.mapping }));
    if (typeof body.reviewId !== 'string') throw new LeadError(400, 'Choose a reviewed delivery.');
    return send(200, await sendCRM(user.email, env, body.reviewId));
  } catch (error) { return leadFailure('crm_write', error, 'CRM request could not be completed. Refresh the delivery status before retrying.'); }
}
