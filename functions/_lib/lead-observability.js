import { randomUUID } from 'node:crypto';
import { send } from './http.js';

// Deliberately never log exception messages, request bodies, lead fields or credentials.
export function leadFailure(operation, error, fallback) {
  const requestId = randomUUID();
  const expected = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599;
  const status = expected ? error.status : 503;
  const event = { event: 'lead_operation_failed', operation, status, requestId, ...(error?.code === 'maintenance' ? { maintenance: true } : {}) };
  if (status >= 500) console.error(JSON.stringify(event)); else console.warn(JSON.stringify(event));
  return send(status, { error: expected ? error.message : fallback, requestId }, { 'X-Request-ID': requestId });
}
export function deliveryResult(reviewId, row) {
  if (!['retryable', 'failed'].includes(row.status)) return;
  console.warn(JSON.stringify({ event: 'lead_crm_delivery_failed', reviewId, status: row.status, attempts: row.attempts }));
}
