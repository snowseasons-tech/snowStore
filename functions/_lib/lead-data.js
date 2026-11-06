import { createHash, randomUUID } from 'node:crypto';

export const FIELDS = ['name', 'email', 'website', 'phone', 'stage', 'fit', 'intent', 'budget', 'notes', 'follow_up'];
const STAGES = ['New', 'Qualified', 'Contacted', 'Won', 'Lost'];
export const CAS = "local current = redis.call('GET', KEYS[1]) or '' if current ~= ARGV[1] then return 0 end redis.call('SET', KEYS[1], ARGV[2]) return 1";
export class LeadError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const pilotEnabled = (email, env) => String(env.LEAD_WORKSPACE_PILOT_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(email);
export const workspaceKey = email => 'lead-workspace:v1:' + createHash('sha256').update(email).digest('hex');
export async function command(env, args) {
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Workspace store unavailable');
  const body = await response.json();
  if (body.error) throw new Error('Workspace store unavailable');
  return body.result;
}
export async function readWorkspace(email, env) {
  const raw = await command(env, ['GET', workspaceKey(email)]);
  const data = raw ? JSON.parse(raw) : { revision: 0, leads: [] };
  if (!Number.isSafeInteger(data.revision) || !Array.isArray(data.leads)) throw new Error('Invalid workspace');
  return { raw: raw || '', data };
}
export function normalize(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !FIELDS.includes(key))) throw new LeadError(400, 'Unsupported lead fields.');
  const lead = {};
  for (const field of FIELDS) {
    const value = values[field] ?? '';
    if (!['string', 'number'].includes(typeof value)) throw new LeadError(400, 'Lead fields must be text or numbers.');
    lead[field] = String(value).trim();
    if (lead[field].length > (field === 'notes' ? 4000 : 500)) throw new LeadError(400, `${field} is too long.`);
  }
  if (!lead.name) throw new LeadError(400, 'Organization name is required.');
  lead.stage ||= 'New';
  if (!STAGES.includes(lead.stage)) throw new LeadError(400, 'Unknown pipeline stage.');
  for (const field of ['fit', 'intent', 'budget']) {
    lead[field] ||= '0';
    if (!/^\d{1,3}$/.test(lead[field]) || Number(lead[field]) > 100) throw new LeadError(400, 'Signals must be whole numbers from 0 to 100.');
    lead[field] = Number(lead[field]);
  }
  if (lead.follow_up && (!/^\d{4}-\d{2}-\d{2}$/.test(lead.follow_up) || !Number.isFinite(Date.parse(lead.follow_up)) || new Date(lead.follow_up).toISOString().slice(0, 10) !== lead.follow_up)) throw new LeadError(400, 'Follow-up must be a valid YYYY-MM-DD date.');
  return lead;
}
const identity = lead => JSON.stringify([lead.name.toLowerCase(), lead.email.toLowerCase()]);
const record = lead => ({ ...lead, id: randomUUID(), updated_at: new Date().toISOString() });
export const score = lead => Math.floor((lead.fit * 40 + lead.intent * 35 + lead.budget * 25 + 50) / 100);

export async function mutateWorkspace(email, env, body) {
  const snapshot = await readWorkspace(email, env);
  if (!Number.isSafeInteger(body.revision) || body.revision !== snapshot.data.revision) throw new LeadError(409, 'Workspace changed. Reload the queue before saving again; your edits have not been applied.');
  const leads = snapshot.data.leads;
  let result = {};
  if (body.action === 'create') {
    const lead = normalize(body.lead);
    if (leads.some(row => identity(row) === identity(lead))) throw new LeadError(409, 'A lead with that name and email already exists.');
    const item = record(lead); leads.push(item); result.id = item.id;
  } else if (body.action === 'update') {
    const index = leads.findIndex(lead => lead.id === body.id);
    if (index < 0) throw new LeadError(404, 'Lead not found in your workspace.');
    const changes = normalize({ ...Object.fromEntries(FIELDS.map(field => [field, leads[index][field]])), ...body.changes });
    if (leads.some((row, i) => i !== index && identity(row) === identity(changes))) throw new LeadError(409, 'A lead with that name and email already exists.');
    leads[index] = { ...changes, id: body.id, updated_at: new Date().toISOString() };
  } else if (body.action === 'import') {
    if (!Array.isArray(body.leads) || !body.leads.length || body.leads.length > 200) throw new LeadError(400, 'Import between 1 and 200 leads.');
    const incoming = body.leads.map(normalize); // Validate everything before applying any row.
    const seen = new Set(leads.map(identity));
    result = { added: 0, duplicates_skipped: 0 };
    for (const lead of incoming) {
      const key = identity(lead);
      if (seen.has(key)) { result.duplicates_skipped++; continue; }
      leads.push(record(lead)); seen.add(key); result.added++;
    }
  } else throw new LeadError(400, 'Unknown workspace action.');
  if (leads.length > 200) throw new LeadError(400, 'Pilot workspaces support up to 200 leads.');
  const data = { revision: snapshot.data.revision + 1, leads };
  const serialized = JSON.stringify(data);
  if (new TextEncoder().encode(serialized).length > 1000000) throw new LeadError(400, 'Workspace exceeds the pilot storage limit.');
  const saved = await command(env, ['EVAL', CAS, '1', workspaceKey(email), snapshot.raw, serialized]);
  if (saved !== 1) throw new LeadError(409, 'Another save completed first. Reload the queue and review your edits before retrying.');
  return { ...result, revision: data.revision };
}
