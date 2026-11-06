const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const CATALOG = { plan3: { socialAccounts: 3 }, plan5: { socialAccounts: 5 }, other: {} };
const sync = () => import('../hosted/sync.mjs');
const sub = (id, status, product = 'plan3') => ({ id, status, metadata: { product_id: product }, customer: { email: 'a@example.com' } });

test('new paying subscribers get a server and other plans do not', async () => {
  const { decide, subscriberId } = await sync();
  assert.deepStrictEqual(decide([sub('sub_1', 'active'), sub('sub_2', 'active', 'other'), sub('sub_3', 'incomplete'), sub('sub_4', 'canceled')], {}, CATALOG, 0),
    [{ type: 'create', id: subscriberId('sub_1'), limit: 3, email: 'a@example.com', subscription: 'sub_1' }]);
});

test('draft bundles cannot create, restart or resize servers but still stop canceled subscriptions', async () => {
  const { decide, subscriberId } = await sync();
  const catalog = { bundle: { draft: true, socialAccounts: 3, mailhubSends: 10000 } };
  const active = sub('sub_1', 'active', 'bundle');
  assert.deepStrictEqual(decide([active], {}, catalog, 0), []);
  const social = subscriberId('sub_1'), mail = subscriberId('sub_1', 'm');
  const stopped = { [social]: { running: false, limit: 1 }, [mail]: { running: false, limit: 1 } };
  assert.deepStrictEqual(decide([active], stopped, catalog, 0), []);
  const running = { [social]: { running: true, limit: 1 }, [mail]: { running: true, limit: 1 } };
  assert.deepStrictEqual(decide([active], running, catalog, 0), []);
  assert.deepStrictEqual(decide([sub('sub_1', 'canceled', 'bundle')], running, catalog, 0),
    [{ type: 'stop', id: social }, { type: 'stop', id: mail }]);
});

test('a bundle gets one server per product from one subscription', async () => {
  const { decide, apply, sendWelcomes, subscriberId } = await sync();
  const catalog = { bundle: { socialAccounts: 3, mailhubSends: 10000 } };
  const actions = decide([sub('sub_1', 'active', 'bundle')], {}, catalog, 0);
  const social = subscriberId('sub_1'), mail = subscriberId('sub_1', 'm');
  assert.deepStrictEqual(actions.map((a) => [a.id, a.limit, a.product]), [[social, 3, undefined], [mail, 10000, 'mailhub']]);
  const state = {}, calls = [];
  for (const a of actions) apply(a, state, 0, (...args) => { calls.push(args); return 'SETUP_LINK=https://x/\n'; });
  assert.deepStrictEqual(calls[1], ['create', mail, '10000', 'mailhub']);
  assert.strictEqual(calls[0].length, 3);
  assert.deepStrictEqual(decide([sub('sub_1', 'canceled', 'bundle')], state, catalog, 0), [{ type: 'stop', id: social }, { type: 'stop', id: mail }]);
  const subjects = [];
  await sendWelcomes(state, async (to, subject) => subjects.push(subject));
  assert.deepStrictEqual(subjects, ['Your Social Studio is ready', 'Your MailHub is ready']);
});

test('a canceled subscription stops the server, and a past due one does not', async () => {
  const { decide, subscriberId } = await sync();
  const id = subscriberId('sub_1'), state = { [id]: { running: true, limit: 3 } };
  assert.deepStrictEqual(decide([sub('sub_1', 'canceled')], state, CATALOG, 0), [{ type: 'stop', id }]);
  assert.deepStrictEqual(decide([sub('sub_1', 'past_due')], state, CATALOG, 0), []);
});

test('plan changes update the limit and a new subscription restarts the server', async () => {
  const { decide, subscriberId } = await sync();
  const id = subscriberId('sub_1');
  assert.deepStrictEqual(decide([sub('sub_1', 'active', 'plan5')], { [id]: { running: true, limit: 3 } }, CATALOG, 0), [{ type: 'limit', id, limit: 5 }]);
  assert.deepStrictEqual(decide([sub('sub_1', 'active')], { [id]: { running: false, limit: 3 } }, CATALOG, 0), [{ type: 'start', id }]);
});

test('nothing is stopped when a subscription is missing, and old servers are only flagged', async () => {
  const { decide, subscriberId } = await sync();
  const id = subscriberId('sub_1'), day = 86400000;
  assert.deepStrictEqual(decide([], { [id]: { running: true, limit: 3 } }, CATALOG, 0), [{ type: 'missing', id }]);
  const stopped = { [id]: { running: false, limit: 3, stoppedAt: 1 } };
  assert.deepStrictEqual(decide([sub('sub_1', 'canceled')], stopped, CATALOG, 29 * day), []);
  assert.deepStrictEqual(decide([sub('sub_1', 'canceled')], stopped, CATALOG, 31 * day), [{ type: 'overdue', id }]);
});

test('apply records each step and a welcome is retried until it sends', async () => {
  const { apply, sendWelcomes } = await sync();
  const state = {}, calls = [];
  const run = (...args) => { calls.push(args); return 'noise\nSETUP_LINK=https://x/?setup=code\n'; };
  apply({ type: 'create', id: 'sabc123', limit: 3, email: 'a@example.com', subscription: 'sub_1' }, state, 5, run);
  await assert.rejects(sendWelcomes(state, async () => { throw new Error('down'); }));
  assert.strictEqual(state.sabc123.setupLink, 'https://x/?setup=code');
  let sent = '';
  await sendWelcomes(state, async (to, subject, text) => { sent = text; });
  assert.ok(sent.includes('https://x/?setup=code'));
  assert.strictEqual(state.sabc123.setupLink, undefined);
  apply({ type: 'stop', id: 'sabc123' }, state, 9, run);
  assert.deepStrictEqual([state.sabc123.running, state.sabc123.stoppedAt], [false, 9]);
  apply({ type: 'start', id: 'sabc123' }, state, 10, run);
  assert.deepStrictEqual(calls.map((c) => c[0]), ['create', 'stop', 'start']);
  assert.strictEqual(state.sabc123.stoppedAt, undefined);
});

test('the relay only sends a sign-in back to a subscriber server', async () => {
  const { relayTarget } = await import('../hosted/oauth-relay.mjs');
  assert.strictEqual(relayTarget('/api/oauth/meta/callback?state=sabc123~tok&code=c%26d', 'social.example.com'),
    'https://sabc123.social.example.com/api/oauth/meta/callback?state=sabc123%7Etok&code=c%26d');
  assert.strictEqual(relayTarget('/api/oauth/meta/callback?state=evil.com%2F~x&code=c', 'social.example.com'), null);
  assert.strictEqual(relayTarget('/api/oauth/meta/callback?state=notilde&code=c', 'd').startsWith('https://notilde.d/'), true);
  assert.strictEqual(relayTarget('/admin?state=sabc123~x', 'd'), null);
});

test('subscriber.sh creates, limits and deletes a server', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-'));
  try {
    const bin = path.join(dir, 'bin'), log = path.join(dir, 'docker.log'), data = path.join(dir, 'data'), ops = path.join(dir, 'ops.env');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh\necho "$@" >> ${log}\n`, { mode: 0o755 });
    fs.writeFileSync(ops, 'HOSTED_DOMAIN=social.example.com\nIMAGE=studio:1\nMETA_APP_ID=meta-id\n');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOSTED_DATA: data, HOSTED_OPS: ops, CADDY_RELOAD: 'true' };
    const run = (...args) => spawnSync('hosted/subscriber.sh', args, { env, encoding: 'utf8' });

    const created = run('create', 'sabc123', '3');
    assert.strictEqual(created.status, 0, created.stderr);
    const second = run('create', 'sdef456', '5');
    const envFile = fs.readFileSync(path.join(data, 'sabc123/.env'), 'utf8');
    const code = /^SETUP_CODE=(.+)$/m.exec(envFile)[1];
    assert.ok(created.stdout.includes(`SETUP_LINK=https://sabc123.social.example.com/?setup=${code}`));
    assert.match(envFile, /^MAX_ACCOUNTS=3$/m);
    assert.match(envFile, /^PORT=18001$/m);
    assert.match(envFile, /^META_APP_ID=meta-id$/m);
    assert.match(envFile, /^OAUTH_REDIRECT_URL=https:\/\/oauth\.social\.example\.com$/m);
    assert.match(fs.readFileSync(path.join(data, 'sdef456/.env'), 'utf8'), /^PORT=18002$/m);
    assert.strictEqual(fs.statSync(path.join(data, 'sabc123/.env')).mode & 0o077, 0, second.stderr);
    const fernet = /^FERNET_KEY=(.+)$/m.exec(envFile)[1];
    assert.strictEqual(Buffer.from(fernet, 'base64url').length, 32);

    assert.strictEqual(run('limit', 'sabc123', '5').status, 0);
    assert.match(fs.readFileSync(path.join(data, 'sabc123/.env'), 'utf8'), /^MAX_ACCOUNTS=5$/m);
    assert.notStrictEqual(run('delete', 'sabc123').status, 0);
    assert.ok(fs.existsSync(path.join(data, 'sabc123')));
    assert.strictEqual(run('delete', 'sabc123', '--yes').status, 0);
    assert.ok(!fs.existsSync(path.join(data, 'sabc123')));
    assert.ok(fs.readFileSync(log, 'utf8').includes('-p ss-sabc123'));
    assert.notStrictEqual(run('create', '../bad', '3').status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('subscriber.sh runs MailHub with its own image, domain and limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-'));
  try {
    const bin = path.join(dir, 'bin'), log = path.join(dir, 'docker.log'), data = path.join(dir, 'data'), ops = path.join(dir, 'ops.env');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh\necho "$@" >> ${log}\n`, { mode: 0o755 });
    fs.writeFileSync(ops, 'HOSTED_DOMAIN=social.example.com\nIMAGE=studio:1\nRESEND_API_KEY=ops-key\nMETA_APP_SECRET=meta\n');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOSTED_DATA: data, HOSTED_OPS: ops, CADDY_RELOAD: 'true' };
    const run = (...args) => spawnSync('hosted/subscriber.sh', args, { env, encoding: 'utf8' });
    assert.notStrictEqual(run('create', 'mabc123', '500', 'mailhub').status, 0);
    assert.ok(!fs.existsSync(path.join(data, 'mabc123')));
    fs.appendFileSync(ops, 'MAILHUB_DOMAIN=mail.example.com\nMAILHUB_IMAGE=mailhub:1\n');
    const created = run('create', 'mabc123', '500', 'mailhub');
    assert.strictEqual(created.status, 0, created.stderr);
    const file = path.join(data, 'mabc123/.env'), envFile = fs.readFileSync(file, 'utf8');
    assert.ok(created.stdout.includes('SETUP_LINK=https://mabc123.mail.example.com/?setup='));
    assert.match(envFile, /^IMAGE=mailhub:1$/m);
    assert.match(envFile, /^MAX_MONTHLY_SENDS=500$/m);
    assert.match(envFile, /^RESEND_API_KEY=$/m);
    assert.doesNotMatch(envFile, /meta|ops-key|MAX_ACCOUNTS/);
    assert.match(fs.readFileSync(path.join(data, 'mabc123/Caddyfile'), 'utf8'), /^mabc123\.mail\.example\.com/);
    assert.strictEqual(run('limit', 'mabc123', '900').status, 0);
    assert.match(fs.readFileSync(file, 'utf8'), /^MAX_MONTHLY_SENDS=900$/m);
    assert.strictEqual(run('stop', 'mabc123').status, 0);
    assert.match(fs.readFileSync(file, 'utf8'), /^SUSPENDED=1$/m);
    assert.strictEqual(run('start', 'mabc123').status, 0);
    assert.match(fs.readFileSync(file, 'utf8'), /^SUSPENDED=0$/m);
    const calls = fs.readFileSync(log, 'utf8');
    assert.ok(calls.includes('-p mh-mabc123') && calls.includes('mailhub-compose.yml'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the compose file is valid', { skip: spawnSync('docker', ['compose', 'version']).status !== 0 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-'));
  try {
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'IMAGE=studio:1\nPORT=18001\nMYSQL_PASSWORD=a\nMYSQL_ROOT_PASSWORD=b\n');
    const out = execFileSync('docker', ['compose', '-p', 'ss-test', '--env-file', envFile, '-f', 'hosted/compose.yml', 'config'], { env: { ...process.env, SUBSCRIBER_ENV: envFile }, encoding: 'utf8' });
    assert.match(out, /127\.0\.0\.1/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
