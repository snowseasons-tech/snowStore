const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../scripts/lead-backup');
const env = { LEAD_BACKUP_KEY: Buffer.alloc(32, 23).toString('base64') };
function fakeStore() {
  const values = new Map();
  const command = async ([op, ...args]) => {
    if (op === 'EXISTS') return args.filter(key => values.has(key)).length;
    if (op === 'EVAL' && args[0] === backup.SNAPSHOT) {
      const [, , lead, crm, billing] = args;
      return [values.get(lead) || '', values.get(crm) || '', values.get(billing) || []];
    }
    if (op === 'EVAL' && args[0] === backup.RESTORE) {
      const [, , lead, crm, billing, leadValue, crmValue, ...links] = args;
      if ([lead, crm, billing].some(key => values.has(key))) return 0;
      if (leadValue) values.set(lead, leadValue); if (crmValue) values.set(crm, crmValue); if (links.length) values.set(billing, links); return 1;
    }
    throw Error('Unexpected test command');
  };
  return { values, command };
}
function seed(store, email, name) {
  const [lead, crm, billing] = backup.keys(email);
  store.values.set(lead, JSON.stringify({ revision: 2, leads: [{ id: 'lead-1', name, notes: 'Private sample' }] }));
  store.values.set(crm, JSON.stringify({ connection: { encrypted: { ciphertext: 'fixture' } }, reviews: [{ createdAt: 100, runningUntil: 0, rows: [{ status: 'inflight', attempts: 1 }] }] }));
  store.values.set(billing, [JSON.stringify({ subscription: 'sub_fixture', customer: 'cus_fixture' })]);
}

test('backup authenticates and encrypts all tenant contents; wrong keys and tampering fail', async () => {
  const source = fakeStore(); seed(source, 'a@example.com', 'Example A');
  const document = await backup.snapshot(['a@example.com'], source.command);
  const sealed = backup.seal(document, env);
  assert.ok(!sealed.includes('Example A')); assert.ok(!sealed.includes('a@example.com'));
  assert.deepEqual(backup.open(sealed, env), document);
  assert.throws(() => backup.open(sealed, { LEAD_BACKUP_KEY: Buffer.alloc(32, 24).toString('base64') }));
  const corrupt = JSON.parse(sealed); corrupt.tag = Buffer.alloc(16).toString('base64');
  assert.throws(() => backup.open(JSON.stringify(corrupt), env));
});

test('restore preserves two tenants, defaults to dry run, refuses overwrite and disarms CRM', async () => {
  const source = fakeStore(), target = fakeStore();
  seed(source, 'a@example.com', 'Example A'); seed(source, 'b@example.com', 'Example B');
  const document = backup.open(backup.seal(await backup.snapshot(['a@example.com', 'b@example.com'], source.command), env), env);
  assert.deepEqual(await backup.restore(document, target.command), { accounts: 2, applied: false }); assert.equal(target.values.size, 0);
  assert.deepEqual(await backup.restore(document, target.command, true), { accounts: 2, applied: true });
  for (const [email, name] of [['a@example.com', 'Example A'], ['b@example.com', 'Example B']]) {
    const [leadKey, crmKey] = backup.keys(email);
    assert.equal(JSON.parse(target.values.get(leadKey)).leads[0].name, name);
    const crm = JSON.parse(target.values.get(crmKey)); assert.equal(crm.connection, null); assert.equal(crm.reviews[0].createdAt, 0); assert.equal(crm.reviews[0].rows[0].status, 'failed');
  }
  await assert.rejects(backup.restore(document, target.command, true), /Target contains data/);
});

test('invalid identities and active deliveries block backup/restore before writes', async () => {
  const source = fakeStore(); seed(source, 'a@example.com', 'Example');
  await assert.rejects(backup.snapshot(['a@example.com', 'a@example.com'], source.command), /identity/);
  const [, crmKey] = backup.keys('a@example.com');
  const crm = JSON.parse(source.values.get(crmKey)); crm.reviews[0].runningUntil = Date.now() + 60000; source.values.set(crmKey, JSON.stringify(crm));
  await assert.rejects(backup.snapshot(['a@example.com'], source.command), /delivery is running/);
});

test('operation and delivery logs omit credentials, email, lead contents and raw exceptions', async () => {
  const { leadFailure, deliveryResult } = await import('../functions/_lib/lead-observability.js');
  const saved = [console.error, console.warn], logs = [];
  console.error = console.warn = message => logs.push(message);
  try {
    const response = leadFailure('crm_write', new Error('private-token buyer@example.com secret lead'), 'Unavailable');
    const body = await response.json(); assert.equal(response.status, 503); assert.ok(body.requestId); assert.equal(response.headers.get('X-Request-ID'), body.requestId);
    deliveryResult('review-fixture', { status: 'retryable', attempts: 1, message: 'private-token', properties: { email: 'buyer@example.com' } });
    assert.ok(logs.every(line => !/private-token|buyer@example|secret lead/.test(line)));
    assert.equal(JSON.parse(logs[1]).event, 'lead_crm_delivery_failed');
  } finally { [console.error, console.warn] = saved; }
});

test('alert extraction identifies failed imports/delivery and strips all extra log fields', () => {
  const { signal } = require('../scripts/lead-alerts');
  const result = signal({ event: 'lead_operation_failed', operation: 'lead_import', status: 400, token: 'secret', email: 'buyer@example.com', body: 'Private lead' });
  assert.deepEqual(result, { event: 'lead_operation_failed', operation: 'lead_import', status: 400 });
  assert.equal(signal({ event: 'lead_operation_failed', operation: 'lead_read', status: 401 }), null);
  assert.deepEqual(signal({ event: 'lead_crm_delivery_failed', status: 'retryable', attempts: 2, properties: { email: 'buyer@example.com' } }), { event: 'lead_crm_delivery_failed', status: 'retryable', attempts: 2 });
});

test('maintenance rejects authenticated reads and writes without touching customer records', async () => {
  const fake = require('./fake-upstash');
  const auth = require('../api/_lib/auth');
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const { onRequestGet: get, onRequestPost: post } = await import('../functions/api/lead-workspace/leads.js');
  const { signal } = require('../scripts/lead-alerts');
  const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', LEAD_WORKSPACE_PILOT_EMAILS: 'one@example.com', LEAD_WORKSPACE_MAINTENANCE: '1' };
  const up = fake(), saved = console.error, logs = []; console.error = line => logs.push(JSON.parse(line));
  try {
    const user = { hash: 'fixture', products: [] }; up.data.set('user:one@example.com', JSON.stringify(user));
    const token = await auth.createSession('one@example.com', user, { setJSON: async (key, value) => up.data.set(key, JSON.stringify(value)) });
    const request = body => new Request('https://fixture.test/api/lead-workspace/leads', { method: body ? 'POST' : 'GET', headers: { Cookie: 'ss_session=' + token, Origin: 'https://fixture.test', 'Content-Type': 'application/json', 'X-Lead-Workspace': workspaceKey('one@example.com') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await get({ request: request(), env })).status, 503);
    assert.equal((await post({ request: request({ action: 'create', revision: 0, lead: { name: 'Do not write' } }), env })).status, 503);
    assert.equal(up.data.has(workspaceKey('one@example.com')), false);
    assert.equal(logs[0].maintenance, true); assert.equal(signal(logs[0]), null);
  } finally { console.error = saved; up.restore(); }
});

test('alert CLI handles Cloudflare log exports without echoing private or malformed content', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const line = JSON.stringify({ logs: [{ message: [JSON.stringify({ event: 'lead_operation_failed', operation: 'lead_import', status: 400, email: 'private@example.com', token: 'do-not-print' })] }] });
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/lead-alerts.js')], { input: line + '\nnot-json-private\n', encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(!/private|do-not-print/.test(result.stdout));
  assert.ok(result.stdout.includes('"failures":1,"malformed":1'));
});
