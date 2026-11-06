const test = require('node:test');
const assert = require('node:assert/strict');

test('CRM credentials are encrypted with tenant-bound authenticated encryption', async () => {
  const { encryptCredential, decryptCredential } = await import('../functions/_lib/lead-crm-secrets.js');
  const env = { LEAD_CRM_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64') };
  const first = encryptCredential('one@example.com', 'fixture-secret', env);
  const second = encryptCredential('one@example.com', 'fixture-secret', env);
  assert.notEqual(first.iv, second.iv);
  assert.ok(!JSON.stringify(first).includes('fixture-secret'));
  assert.equal(decryptCredential('one@example.com', first, env), 'fixture-secret');
  assert.throws(() => decryptCredential('two@example.com', first, env), /could not be opened/);
  assert.throws(() => decryptCredential('one@example.com', { ...first, ciphertext: second.ciphertext }, env), /could not be opened/);
  assert.throws(() => decryptCredential('one@example.com', first, { LEAD_CRM_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64') }), /could not be opened/);
  assert.throws(() => encryptCredential('one@example.com', 'fixture-secret', {}), /not configured/);
  assert.throws(() => encryptCredential('one@example.com', '', env), /valid CRM credential/);
});

test('CRM review uses current owned records, validates mappings and fingerprints exact delivery values', async () => {
  const { prepareReview } = await import('../functions/_lib/lead-crm-review.js');
  const workspace = { revision: 3, leads: [{ id: 'lead-a', name: 'Example Co', email: 'hello@example.com', phone: '' }, { id: 'lead-b', name: 'Sample Co', email: '' }] };
  const adapter = { provider: 'fixture', connectionId: 'connection-1', properties: ['email', 'company', 'phone'], requiredProperties: ['email'] };
  const body = { revision: 3, selectedIds: ['lead-a'], mapping: { name: 'company', email: 'email', phone: 'phone' } };
  const review = prepareReview(workspace, body, adapter);
  assert.equal(review.valid, true);
  assert.deepEqual(review.rows[0].properties, { email: 'hello@example.com', company: 'Example Co' });
  assert.equal(review.reviewId, prepareReview(workspace, body, adapter).reviewId);
  assert.notEqual(review.reviewId, prepareReview(workspace, body, { ...adapter, connectionId: 'connection-2' }).reviewId);
  assert.notEqual(review.reviewId, prepareReview({ ...workspace, leads: [{ ...workspace.leads[0], name: 'Changed' }] }, body, adapter).reviewId);
  assert.equal(prepareReview(workspace, { ...body, selectedIds: ['lead-b'] }, adapter).valid, false);
  assert.throws(() => prepareReview(workspace, { ...body, revision: 2 }, adapter), /Workspace changed/);
  assert.throws(() => prepareReview(workspace, { ...body, selectedIds: ['foreign-lead'] }, adapter), /not in your workspace/);
  assert.throws(() => prepareReview(workspace, { ...body, selectedIds: ['lead-a', 'lead-a'] }, adapter), /distinct leads/);
  assert.throws(() => prepareReview(workspace, { ...body, mapping: { name: 'unsupported' } }, adapter), /unsupported/);
  assert.throws(() => prepareReview(workspace, { ...body, mapping: { name: 'company' } }, adapter), /required/);
  assert.throws(() => prepareReview(workspace, { ...body, mapping: { name: 'email', email: 'email' } }, adapter), /duplicate/);
});

const fakeUpstash = require('./fake-upstash');
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', LEAD_CRM_ENABLED: '1', LEAD_WORKSPACE_PILOT_EMAILS: 'one@example.com,two@example.com', LEAD_CRM_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64') };
const mapping = { email: 'email', name: 'company' };
async function seed(up) {
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const workspace = { revision: 1, leads: [{ id: 'lead-a', name: 'Example Co', email: 'a@example.com' }, { id: 'lead-b', name: 'Sample Co', email: 'b@example.com' }] };
  up.data.set(workspaceKey('one@example.com'), JSON.stringify(workspace));
  return workspace;
}

test('HubSpot adapter preserves unmapped fields and reconciles lost create responses by email', async () => {
  const { deliverHubSpot, HubSpotError } = await import('../functions/_lib/lead-hubspot.js');
  const saved = global.fetch; const contacts = new Map(); let creates = 0, loseResponse = true;
  global.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://api.hubapi.com/crm/v3/objects/contacts'));
    assert.equal(init.headers.Authorization, 'Bearer fixture-key');
    const properties = init.body ? JSON.parse(init.body).properties : null;
    if (init.method === 'POST') {
      creates++; contacts.set(properties.email, { id: '101', properties: { ...properties, phone: 'Keep this' } });
      if (loseResponse) { loseResponse = false; throw new Error('lost after commit'); }
    }
    const contact = contacts.get('a@example.com');
    if (!contact) return new Response('{}', { status: 404 });
    if (init.method === 'PATCH') { assert.ok(!Object.hasOwn(properties, 'email')); Object.assign(contact.properties, properties); }
    return new Response(JSON.stringify(contact));
  };
  try {
    await assert.rejects(deliverHubSpot('fixture-key', { email: 'a@example.com', company: 'Example Co' }), error => error instanceof HubSpotError && error.retryable);
    const result = await deliverHubSpot('fixture-key', { email: 'a@example.com', company: 'Updated Co' });
    assert.equal(result.remoteId, '101'); assert.equal(creates, 1);
    assert.equal(contacts.get('a@example.com').properties.phone, 'Keep this');
    assert.equal(contacts.get('a@example.com').properties.company, 'Updated Co');
  } finally { global.fetch = saved; }
});

test('HubSpot adapter reconciles concurrent creates and redacts provider errors', async () => {
  const { deliverHubSpot } = await import('../functions/_lib/lead-hubspot.js');
  const saved = global.fetch; let calls = 0;
  try {
    global.fetch = async () => { calls++; return calls === 1 ? new Response('{}', { status: 404 }) : calls === 2 ? new Response('{}', { status: 409 }) : new Response('{"id":"102"}'); };
    assert.equal((await deliverHubSpot('fixture-key', { email: 'a@example.com' })).remoteId, '102');
    global.fetch = async () => new Response('{"secret":"fixture-key"}', { status: 429, headers: { 'Retry-After': '120' } });
    await assert.rejects(deliverHubSpot('fixture-key', { email: 'a@example.com' }), error => error.retryable && error.retryAfter === 120 && !error.message.includes('fixture-key'));
    global.fetch = async () => new Response('{"secret":"fixture-key"}', { status: 403 });
    await assert.rejects(deliverHubSpot('fixture-key', { email: 'a@example.com' }), error => !error.retryable && !error.message.includes('fixture-key'));
  } finally { global.fetch = saved; }
});

test('reviewed delivery persists results, skips successes and isolates credentials and reviews', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const up = fakeUpstash();
  try {
    await seed(up);
    await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    assert.ok(!up.data.get(crm.crmKey('one@example.com')).includes('fixture-key'));
    const review = await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a'], mapping });
    assert.equal((await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a'], mapping })).reviewId, review.reviewId);
    let writes = 0;
    const adapter = { deliver: async (token, properties) => { assert.equal(token, 'fixture-key'); assert.equal(properties.email, 'a@example.com'); writes++; return { remoteId: '103' }; } };
    const result = await crm.sendCRM('one@example.com', env, review.reviewId, adapter);
    assert.equal(result.rows[0].status, 'succeeded'); assert.equal(result.rows[0].remoteId, '103');
    await crm.sendCRM('one@example.com', env, review.reviewId, adapter); assert.equal(writes, 1);
    const status = await crm.crmStatus('one@example.com', env);
    assert.ok(!JSON.stringify(status).includes('ciphertext')); assert.ok(!JSON.stringify(status).includes('fixture-key'));
    assert.deepEqual((await crm.crmStatus('two@example.com', env)).reviews, []);
    await assert.rejects(crm.sendCRM('two@example.com', env, review.reviewId, adapter), /Connection or review changed/);
    await crm.disconnectCRM('one@example.com', env);
    assert.equal(JSON.parse(up.data.get(crm.crmKey('one@example.com'))).connection, null);
    await assert.rejects(crm.sendCRM('one@example.com', env, review.reviewId, adapter), /Connection or review changed/);
  } finally { up.restore(); }
});

test('delivery locks prevent simultaneous sends and preserve the durable attempt before remote work', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const up = fakeUpstash();
  try {
    await seed(up); await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    const review = await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a'], mapping });
    let release, started; const entered = new Promise(resolve => { started = resolve; });
    const pending = crm.sendCRM('one@example.com', env, review.reviewId, { deliver: async () => {
      const stored = JSON.parse(up.data.get(crm.crmKey('one@example.com')));
      assert.equal(stored.reviews[0].rows[0].attempts, 1); assert.equal(stored.reviews[0].rows[0].status, 'inflight');
      started(); await new Promise(resolve => { release = resolve; }); return { remoteId: '104' };
    } });
    await entered;
    await assert.rejects(crm.sendCRM('one@example.com', env, review.reviewId), /still running/);
    await assert.rejects(crm.disconnectCRM('one@example.com', env), /still running/);
    release(); await pending;
  } finally { up.restore(); }
});

test('rate-limit waits persist and successful rows are skipped on manual retry', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const { HubSpotError } = await import('../functions/_lib/lead-hubspot.js');
  const up = fakeUpstash();
  try {
    await seed(up); await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    const review = await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a', 'lead-b'], mapping });
    let writes = 0;
    const partial = await crm.sendCRM('one@example.com', env, review.reviewId, { deliver: async () => { writes++; if (writes === 2) throw new HubSpotError('Rate limited', true, 120); return { remoteId: '105' }; } });
    assert.deepEqual(partial.rows.map(row => row.status), ['succeeded', 'retryable']);
    await assert.rejects(crm.sendCRM('one@example.com', env, review.reviewId), /retry is paused/);
    const state = JSON.parse(up.data.get(crm.crmKey('one@example.com')));
    state.connection.blockedUntil = 0; state.reviews[0].rows[1].retryAt = 0;
    up.data.set(crm.crmKey('one@example.com'), JSON.stringify(state));
    const recovered = await crm.sendCRM('one@example.com', env, review.reviewId, { deliver: async () => { writes++; return { remoteId: '106' }; } });
    assert.deepEqual(recovered.rows.map(row => row.status), ['succeeded', 'succeeded']); assert.equal(writes, 3);
  } finally { up.restore(); }
});

test('stale leads, expired previews and credential replacements require fresh review', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const up = fakeUpstash();
  try {
    const workspace = await seed(up); await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    const body = { revision: 1, selectedIds: ['lead-a'], mapping };
    const review = await crm.reviewCRM('one@example.com', env, body);
    up.data.set(workspaceKey('one@example.com'), JSON.stringify({ ...workspace, revision: 2 }));
    await assert.rejects(crm.sendCRM('one@example.com', env, review.reviewId), /Leads changed/);
    up.data.set(workspaceKey('one@example.com'), JSON.stringify(workspace));
    const state = JSON.parse(up.data.get(crm.crmKey('one@example.com'))); state.reviews[0].createdAt -= 16 * 60000;
    up.data.set(crm.crmKey('one@example.com'), JSON.stringify(state));
    await assert.rejects(crm.sendCRM('one@example.com', env, review.reviewId), /expired/);
    const next = await crm.reviewCRM('one@example.com', env, body); assert.notEqual(next.reviewId, review.reviewId);
    await crm.connectCRM('one@example.com', env, 'new-fixture-key', { verify: async () => {} });
    await assert.rejects(crm.sendCRM('one@example.com', env, next.reviewId), /Connection or review changed/);
  } finally { up.restore(); }
});

test('CRM API reuses subscription, tenant, origin and request size guards and never returns credentials', async () => {
  const { onRequestGet: get, onRequestPost: post } = await import('../functions/api/lead-workspace/crm.js');
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const auth = require('../api/_lib/auth');
  const up = fakeUpstash(async () => new Response('{"results":[]}'));
  try {
    await seed(up);
    const user = { hash: 'fixture-hash', products: [] };
    up.data.set('user:one@example.com', JSON.stringify(user));
    const token = await auth.createSession('one@example.com', user, { setJSON: async (key, value) => up.data.set(key, JSON.stringify(value)) });
    const req = (body, origin = 'https://x.test', cookie = 'ss_session=' + token) => new Request('https://x.test/api/lead-workspace/crm', { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Lead-Workspace': workspaceKey('one@example.com') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await get({ request: req(undefined, undefined, ''), env })).status, 401);
    assert.equal((await get({ request: req(), env: { ...env, LEAD_CRM_ENABLED: '' } })).status, 403);
    assert.equal((await post({ request: req({ action: 'connect', token: 'fixture-key' }, 'https://evil.test'), env })).status, 403);
    assert.equal((await post({ request: req({ action: 'connect', token: 'fixture-key' }), env })).status, 200);
    const status = await (await get({ request: req(), env })).json();
    assert.equal(status.connected, true); assert.ok(!JSON.stringify(status).includes('fixture-key'));
    assert.equal((await post({ request: req({ action: 'review', revision: 1, selectedIds: ['foreign'], mapping }), env })).status, 404);
    assert.equal((await post({ request: req({ action: 'send', reviewId: 'foreign', email: 'two@example.com' }), env })).status, 400);
    assert.equal((await post({ request: req({ action: 'connect', token: 'x'.repeat(17000) }), env })).status, 413);
    const swapped = req({ action: 'disconnect' }); swapped.headers.set('X-Lead-Workspace', workspaceKey('two@example.com'));
    assert.equal((await post({ request: swapped, env })).status, 409);
  } finally { up.restore(); }
});

test('expired delivery leases recover inflight rows and the per-review retry limit stops further calls', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const up = fakeUpstash();
  try {
    await seed(up); await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    const review = await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a'], mapping });
    const key = crm.crmKey('one@example.com');
    let state = JSON.parse(up.data.get(key));
    state.reviews[0].runningUntil = Date.now() - 1; state.reviews[0].rows[0].status = 'inflight'; state.reviews[0].rows[0].attempts = 1;
    up.data.set(key, JSON.stringify(state));
    let calls = 0;
    const recovered = await crm.sendCRM('one@example.com', env, review.reviewId, { deliver: async () => { calls++; return { remoteId: 'existing-remote-contact' }; } });
    assert.equal(recovered.rows[0].attempts, 2); assert.equal(recovered.rows[0].remoteId, 'existing-remote-contact');
    state = JSON.parse(up.data.get(key)); state.reviews[0].rows[0].status = 'retryable'; state.reviews[0].rows[0].attempts = 3;
    up.data.set(key, JSON.stringify(state));
    const stopped = await crm.sendCRM('one@example.com', env, review.reviewId, { deliver: async () => { calls++; } });
    assert.equal(stopped.rows[0].status, 'failed'); assert.equal(calls, 1);
  } finally { up.restore(); }
});

test('invalid and duplicate contact emails cannot produce a sendable preview', async () => {
  const crm = await import('../functions/_lib/lead-crm.js');
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const up = fakeUpstash();
  try {
    const workspace = await seed(up); await crm.connectCRM('one@example.com', env, 'fixture-key', { verify: async () => {} });
    workspace.leads[1].email = 'A@EXAMPLE.COM';
    up.data.set(workspaceKey('one@example.com'), JSON.stringify(workspace));
    const review = await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a', 'lead-b'], mapping });
    assert.equal(review.valid, false); assert.equal((await crm.crmStatus('one@example.com', env)).reviews.length, 0);
    workspace.leads[0].email = 'not-an-email';
    up.data.set(workspaceKey('one@example.com'), JSON.stringify(workspace));
    assert.equal((await crm.reviewCRM('one@example.com', env, { revision: 1, selectedIds: ['lead-a'], mapping })).valid, false);
  } finally { up.restore(); }
});
