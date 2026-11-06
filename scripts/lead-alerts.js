#!/usr/bin/env node
// Sanitize exported NDJSON logs into an operator signal. No mail or third-party calls.
const readline = require('node:readline');
const opaqueId = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
function signal(event) {
  if (event?.maintenance === true) return null;
  if (event?.event === 'lead_crm_delivery_failed' && ['retryable', 'failed'].includes(event.status)) return { event: event.event, status: event.status, attempts: Number.isInteger(event.attempts) ? Math.min(3, Math.max(0, event.attempts)) : 0, ...(opaqueId(event.reviewId) ? { reviewId: event.reviewId } : {}) };
  if (event?.event === 'lead_operation_failed' && Number.isInteger(event.status) && event.status >= 400 && event.status <= 599 && (event.status >= 500 || event.operation === 'lead_import')) {
    const operations = ['lead_read', 'lead_write', 'lead_create', 'lead_update', 'lead_import', 'crm_read', 'crm_write', 'pilot_checkout'];
    return { event: event.event, operation: operations.includes(event.operation) ? event.operation : 'unknown', status: event.status, ...(opaqueId(event.requestId) ? { requestId: event.requestId } : {}) };
  }
  return null;
}
async function main() {
  let failures = 0, malformed = 0;
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      // Accept direct JSON events or a Cloudflare exported log message wrapper.
      const messages = Array.isArray(item.logs) ? item.logs.flatMap(entry => entry.message || []) : [item];
      for (let message of messages) { if (typeof message === 'string') message = JSON.parse(message); const result = signal(message); if (result) { failures++; console.log(JSON.stringify(result)); } }
    } catch { malformed++; }
  }
  console.log(JSON.stringify({ failures, malformed }));
  process.exitCode = failures || malformed ? 1 : 0;
}
if (require.main === module) main().catch(() => { console.error('Log processing failed.'); process.exitCode = 1; });
module.exports = { signal };
