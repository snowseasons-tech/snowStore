import { leadSession } from '../../_lib/lead-session.js';
import { pilotEnabled, readWorkspace, mutateWorkspace, score, workspaceKey, LeadError } from '../../_lib/lead-data.js';
import { send, methodNotAllowed } from '../../_lib/http.js';

export const onRequest = methodNotAllowed('GET, POST');
async function userFor(request, env) {
  const session = await leadSession(request, env);
  if (!session) throw new LeadError(401, 'Please sign in again.');
  if (!pilotEnabled(session.email, env)) throw new LeadError(403, 'Hosted lead access is limited to invited pilot accounts.');
  return session;
}
export async function onRequestGet({ request, env }) {
  try {
    const user = await userFor(request, env);
    const { data } = await readWorkspace(user.email, env);
    return send(200, { workspaceId: workspaceKey(user.email), expiresAt: user.expiresAt, revision: data.revision, leads: data.leads.map(lead => ({ ...lead, score: score(lead) })).sort((a, b) => b.score - a.score) });
  } catch (error) { return send(error.status || 503, { error: error.status ? error.message : 'Workspace unavailable. Please retry.' }); }
}
export async function onRequestPost({ request, env }) {
  try {
    const user = await userFor(request, env);
    if (request.headers.get('X-Lead-Workspace') !== workspaceKey(user.email)) throw new LeadError(409, 'Your signed-in account changed. Reload this workspace before saving.');
    if (request.headers.get('Origin') !== new URL(request.url).origin) throw new LeadError(403, 'Use the workspace on this site.');
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new LeadError(415, 'Expected JSON.');
    const reader = request.body?.getReader();
    if (!reader) throw new LeadError(400, 'Request body required.');
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 256000) { await reader.cancel(); throw new LeadError(413, 'Import is too large. Split it into smaller batches.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new LeadError(400, 'Invalid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LeadError(400, 'Expected an action object.');
    const allowed = { create: ['action', 'revision', 'lead'], update: ['action', 'revision', 'id', 'changes'], import: ['action', 'revision', 'leads'] };
    if (!Object.hasOwn(allowed, body.action) || Object.keys(body).some(key => !allowed[body.action].includes(key))) throw new LeadError(400, 'Unsupported action fields.');
    if (body.action === 'update' && (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes))) throw new LeadError(400, 'Changes must be an object.');
    return send(200, await mutateWorkspace(user.email, env, body));
  } catch (error) { return send(error.status || 503, { error: error.status ? error.message : 'Save unavailable. Please retry.' }); }
}
