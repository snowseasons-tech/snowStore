import { workspaceUser, workspaceWrite, boundedJSON } from '../../_lib/lead-request.js';
import { readWorkspace, mutateWorkspace, score, workspaceKey, LeadError } from '../../_lib/lead-data.js';
import { send, methodNotAllowed } from '../../_lib/http.js';

export const onRequest = methodNotAllowed('GET, POST');
export async function onRequestGet({ request, env }) {
  try {
    const user = await workspaceUser(request, env);
    const { data } = await readWorkspace(user.email, env);
    return send(200, { workspaceId: workspaceKey(user.email), expiresAt: Math.min(user.expiresAt, user.access.validUntil || Infinity), access: user.access, revision: data.revision, leads: data.leads.map(lead => ({ ...lead, score: score(lead) })).sort((a, b) => b.score - a.score) });
  } catch (error) { return send(error.status || 503, { error: error.status ? error.message : 'Workspace unavailable. Please retry.' }); }
}
export async function onRequestPost({ request, env }) {
  try {
    const user = await workspaceUser(request, env);
    workspaceWrite(request, user.email);
    const body = await boundedJSON(request);
    const allowed = { create: ['action', 'revision', 'lead'], update: ['action', 'revision', 'id', 'changes'], import: ['action', 'revision', 'leads'] };
    if (!Object.hasOwn(allowed, body.action) || Object.keys(body).some(key => !allowed[body.action].includes(key))) throw new LeadError(400, 'Unsupported action fields.');
    if (body.action === 'update' && (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))) throw new LeadError(400, 'Changes must be an object.');
    return send(200, await mutateWorkspace(user.email, env, body));
  } catch (error) { return send(error.status || 503, { error: error.status ? error.message : 'Save unavailable. Please retry.' }); }
}
