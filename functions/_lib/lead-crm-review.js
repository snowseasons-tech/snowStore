import { createHash } from 'node:crypto';
import { FIELDS, LeadError } from './lead-data.js';

// Provider capabilities and connection identity are supplied by the server-side adapter.
// The browser selects existing lead IDs and maps source fields; it cannot submit remote payloads.
export function prepareReview(workspace, { revision, selectedIds, mapping }, adapter) {
  if (revision !== workspace.revision) throw new LeadError(409, 'Workspace changed. Reload before preparing CRM delivery.');
  if (!Array.isArray(selectedIds) || selectedIds.length < 1 || selectedIds.length > 10 || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => typeof id !== 'string')) throw new LeadError(400, 'Select between 1 and 10 distinct leads.');
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !Object.keys(mapping).length) throw new LeadError(400, 'Choose a field mapping.');
  const entries = Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b));
  if (entries.some(([source, target]) => !FIELDS.includes(source) || typeof target !== 'string' || !adapter.properties.includes(target)) || new Set(entries.map(([, target]) => target)).size !== entries.length) throw new LeadError(400, 'Mapping contains unsupported or duplicate CRM properties.');
  if (adapter.requiredProperties.some(target => !entries.some(([, mapped]) => mapped === target))) throw new LeadError(400, 'Map every required CRM property before delivery.');
  const rows = selectedIds.map(id => {
    const lead = workspace.leads.find(row => row.id === id);
    if (!lead) throw new LeadError(404, 'A selected lead is not in your workspace.');
    const properties = Object.fromEntries(entries.map(([source, target]) => [target, String(lead[source] ?? '').trim()]).filter(([, value]) => value !== ''));
    const missing = adapter.requiredProperties.filter(target => !properties[target]);
    return { leadId: id, name: lead.name, properties, valid: missing.length === 0, error: missing.length ? 'Required CRM properties are empty: ' + missing.join(', ') : null };
  });
  const snapshot = { provider: adapter.provider, connectionId: adapter.connectionId, revision, rows };
  const reviewId = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { ...snapshot, reviewId, valid: rows.every(row => row.valid) };
}
