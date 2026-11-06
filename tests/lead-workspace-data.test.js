const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const workspaces = new Map();
const auth = require('../api/_lib/auth');
const fakeUpstash = require('./fake-upstash');
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', LEAD_WORKSPACE_PILOT_EMAILS: 'a@example.com,b@example.com' };
const req = (cookie, body, origin = 'https://x.test', query = '') => new Request('https://x.test/api/lead-workspace/leads' + query, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Lead-Workspace': workspaces.get(cookie) || '', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function setup(up, email) {
  const user = { hash: 'test-credential', products: [] };
  up.data.set('user:' + email, JSON.stringify(user));
  const store = { setJSON: async (key, value) => up.data.set(key, JSON.stringify(value)) };
  const cookie = 'ss_session=' + await auth.createSession(email, user, store);
  workspaces.set(cookie, 'lead-workspace:v1:' + crypto.createHash('sha256').update(email).digest('hex'));
  return cookie;
}

test('all data operations isolate two customer identities and reject client-supplied ownership', async () => {
  const { onRequestGet: get, onRequestPost: post } = await import('../functions/api/lead-workspace/leads.js');
  const up = fakeUpstash();
  try {
    const a = await setup(up, 'a@example.com'), b = await setup(up, 'b@example.com');
    const save = await post({ request: req(a, { action: 'create', revision: 0, lead: { name: 'Private A', notes: 'A only', fit: 90 } }), env });
    assert.equal(save.status, 200); const saved = await save.json();
    const read = await get({ request: req(b, undefined, undefined, '?email=a@example.com&workspace=other'), env });
    const empty = await read.json(); assert.equal(empty.revision, 0); assert.deepEqual(empty.leads, []);
    assert.equal((await post({ request: req(b, { action: 'update', revision: 0, id: saved.id, changes: { notes: 'hijack' } }), env })).status, 404);
    assert.equal((await post({ request: req(b, { action: 'create', revision: 0, email: 'a@example.com', lead: { name: 'Injected' } }), env })).status, 400);
    assert.equal((await post({ request: req(b, { action: 'import', revision: 0, leads: [{ name: 'B import' }] }), env })).status, 200);
    const aData = await (await get({ request: req(a), env })).json();
    const bData = await (await get({ request: req(b), env })).json();
    assert.equal(aData.leads.length, 1); assert.equal(aData.leads[0].notes, 'A only');
    assert.equal(bData.leads.length, 1); assert.equal(bData.leads[0].name, 'B import');
    const switched = req(b, { action: 'create', revision: 1, lead: { name: 'Stale account form' } });
    switched.headers.set('X-Lead-Workspace', workspaces.get(a));
    assert.equal((await post({ request: switched, env })).status, 409);
    assert.equal((await get({ request: req(''), env })).status, 401);
    assert.equal((await get({ request: req(a), env: { ...env, LEAD_WORKSPACE_PILOT_EMAILS: '' } })).status, 403);
    assert.equal((await post({ request: req(a, { action: 'create', revision: 1, lead: { name: 'Cross site' } }, 'https://evil.test'), env })).status, 403);
  } finally { up.restore(); }
});

test('concurrent saves have one winner and imports validate atomically', async () => {
  const { onRequestGet: get, onRequestPost: post } = await import('../functions/api/lead-workspace/leads.js');
  const up = fakeUpstash();
  try {
    const cookie = await setup(up, 'a@example.com');
    const save = name => post({ request: req(cookie, { action: 'create', revision: 0, lead: { name } }), env });
    const results = await Promise.all([save('One'), save('Two')]);
    assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
    assert.equal((await post({ request: req(cookie, { action: 'import', revision: 1, leads: [{ name: 'Good' }, { name: 'Bad', follow_up: '2026-02-30' }] }), env })).status, 400);
    let data = await (await get({ request: req(cookie), env })).json();
    assert.equal(data.revision, 1); assert.equal(data.leads.length, 1);
    const existing = data.leads[0];
    const imported = await post({ request: req(cookie, { action: 'import', revision: 1, leads: [{ name: existing.name.toUpperCase() }, { name: 'Third' }] }), env });
    assert.equal(imported.status, 200); assert.equal((await imported.json()).duplicates_skipped, 1);
    assert.equal((await post({ request: req(cookie, { action: 'update', revision: 1, id: existing.id, changes: { notes: 'stale' } }), env })).status, 409);
    data = await (await get({ request: req(cookie), env })).json();
    assert.equal(data.leads.length, 2); assert.equal(data.revision, 2);
  } finally { up.restore(); }
});

test('hosted pilot bounds requests and fails closed on unavailable storage', async () => {
  const { onRequestPost: post, onRequestGet: get } = await import('../functions/api/lead-workspace/leads.js');
  const up = fakeUpstash();
  try {
    const cookie = await setup(up, 'a@example.com');
    assert.equal((await post({ request: req(cookie, { action: 'create', revision: 0, lead: { name: 'Huge', notes: 'x'.repeat(260000) } }), env })).status, 413);
    assert.equal((await post({ request: req(cookie, { action: 'import', revision: 0, leads: Array.from({ length: 201 }, (_, i) => ({ name: 'Lead ' + i })) }), env })).status, 400);
    assert.equal((await get({ request: req(cookie), env: {} })).status, 503);
  } finally { up.restore(); }
});

test('CSV exchange preserves quoted fields and neutralizes spreadsheet formulas', () => {
  const csv = require('../storefront/lead-csv');
  const rows = csv.parse('Company,notes\r\n"Example, Co","Line 1\nLine ""2"""\r\n', { name: 'Company' });
  assert.equal(rows[0].name, 'Example, Co'); assert.equal(rows[0].notes, 'Line 1\nLine "2"');
  assert.throws(() => csv.parse('name,name\nA,B'));
  assert.throws(() => csv.parse('name\n"Unclosed'));
  assert.throws(() => csv.parse('name\n"A"bad'));
  assert.throws(() => csv.parse('name\nA', { notes: 'missing' }));
  assert.match(csv.stringify([{ name: '=SUM(1,2)' }]), /'=SUM\(1,2\)/);
});
