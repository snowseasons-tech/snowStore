import { randomUUID } from 'node:crypto';
import { CAS, command, readWorkspace, workspaceKey, LeadError } from './lead-data.js';
import { encryptCredential, decryptCredential } from './lead-crm-secrets.js';
import { prepareReview } from './lead-crm-review.js';
import { HUBSPOT_PROPERTIES, verifyHubSpot, deliverHubSpot, HubSpotError } from './lead-hubspot.js';

export const crmKey = email => 'lead-crm:v1:' + workspaceKey(email);
async function read(email, env) {
  const raw = await command(env, ['GET', crmKey(email)]);
  return { raw: raw || '', data: raw ? JSON.parse(raw) : { connection: null, reviews: [] } };
}
async function save(email, env, state) {
  const raw = JSON.stringify(state.data);
  if (await command(env, ['EVAL', CAS, '1', crmKey(email), state.raw, raw]) !== 1) throw new LeadError(409, 'CRM state changed. Refresh before retrying.');
  state.raw = raw;
}
function idle(state) {
  if (state.data.reviews.some(review => review.runningUntil > Date.now())) throw new LeadError(409, 'A delivery is still running. Refresh after it finishes.');
}
export async function crmStatus(email, env) {
  const state = await read(email, env);
  return { connected: !!state.data.connection, provider: 'hubspot', properties: HUBSPOT_PROPERTIES, reviews: state.data.reviews.map(({ runningUntil, ...review }) => ({ ...review, running: runningUntil > Date.now() })) };
}
export async function connectCRM(email, env, token, adapter = {}) {
  const encrypted = encryptCredential(email, token, env);
  await (adapter.verify || verifyHubSpot)(token.trim());
  const state = await read(email, env); idle(state);
  state.data.connection = { id: randomUUID(), encrypted, createdAt: new Date().toISOString() };
  await save(email, env, state);
  return { connected: true };
}
export async function disconnectCRM(email, env) {
  const state = await read(email, env); idle(state);
  state.data.connection = null;
  await save(email, env, state);
  return { connected: false };
}
export async function reviewCRM(email, env, body) {
  const state = await read(email, env); idle(state);
  if (!state.data.connection) throw new LeadError(400, 'Connect HubSpot before preparing delivery.');
  const { data } = await readWorkspace(email, env);
  const review = prepareReview(data, body, { provider: 'hubspot', connectionId: state.data.connection.id, properties: HUBSPOT_PROPERTIES, requiredProperties: ['email'] });
  const emails = new Set();
  for (const row of review.rows) {
    const email = row.properties.email?.toLowerCase();
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.has(email))) { row.valid = false; row.error = 'Each selected lead needs a valid, distinct email.'; }
    if (email) emails.add(email);
  }
  review.valid = review.rows.every(row => row.valid);
  if (!review.valid) return review;
  const existing = state.data.reviews.find(item => (item.contentId || item.reviewId) === review.reviewId);
  if (existing && Date.now() - existing.createdAt <= 15 * 60000) return existing;
  review.contentId = review.reviewId; review.reviewId = randomUUID();
  review.createdAt = Date.now();
  review.rows = review.rows.map(row => ({ ...row, status: 'pending', attempts: 0 }));
  state.data.reviews = [review, ...state.data.reviews].slice(0, 20);
  await save(email, env, state);
  return review;
}
export async function sendCRM(email, env, reviewId, adapter = {}) {
  const state = await read(email, env); idle(state);
  const review = state.data.reviews.find(item => item.reviewId === reviewId);
  if (!review || !state.data.connection || review.connectionId !== state.data.connection.id) throw new LeadError(409, 'Connection or review changed. Prepare a new delivery preview.');
  if (state.data.connection.blockedUntil > Date.now()) throw new LeadError(429, 'HubSpot retry is paused until ' + new Date(state.data.connection.blockedUntil).toISOString() + '.');
  const { data } = await readWorkspace(email, env);
  if (review.revision !== data.revision) throw new LeadError(409, 'Leads changed after review. Prepare a new delivery preview.');
  if (Date.now() - review.createdAt > 15 * 60000) throw new LeadError(409, 'Delivery review expired. Prepare a new preview.');
  const token = decryptCredential(email, state.data.connection.encrypted, env);
  review.runningUntil = Date.now() + 60000;
  await save(email, env, state); // Durable claim before any external write.
  for (const row of review.rows) {
    if (['succeeded', 'failed'].includes(row.status) || row.retryAt > Date.now()) continue;
    if (row.attempts >= 3) { row.status = 'failed'; row.message = 'Retry limit reached. Review the contact in HubSpot before preparing another delivery.'; continue; }
    row.attempts++; row.status = 'inflight'; review.runningUntil = Date.now() + 60000;
    await save(email, env, state); // Preserve an attempt even if the process dies after HubSpot accepts it.
    try {
      const result = await (adapter.deliver || deliverHubSpot)(token, row.properties);
      row.status = 'succeeded'; row.remoteId = result.remoteId; row.message = 'Contact confirmed in HubSpot.'; row.retryAt = null;
    } catch (error) {
      row.status = error.retryable ? 'retryable' : 'failed';
      row.message = error instanceof HubSpotError ? error.message : 'Delivery could not be confirmed. Review the contact before retrying.';
      row.retryAt = error.retryable ? Date.now() + Math.max(1, error.retryAfter || 30) * 1000 : null;
      if (row.retryAt) state.data.connection.blockedUntil = Math.max(state.data.connection.blockedUntil || 0, row.retryAt);
    }
    await save(email, env, state);
    if (row.status === 'retryable') break;
  }
  review.runningUntil = 0;
  await save(email, env, state);
  return review;
}
