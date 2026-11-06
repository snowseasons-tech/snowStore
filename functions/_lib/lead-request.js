import { leadAccess } from './lead-access.js';
import { leadSession } from './lead-session.js';
import { workspaceKey, LeadError } from './lead-data.js';

export async function workspaceUser(request, env) {
  const session = await leadSession(request, env);
  if (!session) throw new LeadError(401, 'Please sign in again.');
  const access = await leadAccess(session, env);
  if (!access.allowed) throw new LeadError(403, access.reason);
  return { ...session, access };
}
export function workspaceWrite(request, email) {
  if (request.headers.get('X-Lead-Workspace') !== workspaceKey(email)) throw new LeadError(409, 'Your signed-in account changed. Reload this workspace before saving.');
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new LeadError(403, 'Use the workspace on this site.');
}
export async function boundedJSON(request, limit = 256000) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new LeadError(415, 'Expected JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new LeadError(400, 'Request body required.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new LeadError(413, 'Request is too large. Use a smaller batch.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new LeadError(400, 'Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LeadError(400, 'Expected an action object.');
  return body;
}
