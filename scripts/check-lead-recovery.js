#!/usr/bin/env node
// Disposable recovery drill. Requires Docker; never reads production credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile: exec, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const execute = promisify(exec);
const backup = require('./lead-backup');
const root = path.resolve(__dirname, '..');

async function drill({ rollbackRef = 'HEAD^' } = {}) {
  if (!/^(?!-)[A-Za-z0-9._/\^~:-]+$/.test(rollbackRef)) throw Error('Invalid rollback reference');
  const rollbackCommit = execFileSync('git', ['rev-parse', '--verify', rollbackRef + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim();
  const container = 'lead-recovery-' + crypto.randomBytes(5).toString('hex');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-recovery-'));
  const key = crypto.randomBytes(32).toString('base64');
  let server;
  const redis = async (db, args) => JSON.parse((await execute('docker', ['exec', container, 'redis-cli', '-n', String(db), '--json', ...args.map(String)])).stdout);
  try {
    await execute('docker', ['run', '--rm', '-d', '--name', container, '--network', 'none', 'redis:7-alpine']);
    for (let attempt = 0; ; attempt++) {
      try { if (await redis(0, ['PING']) === 'PONG') break; } catch (error) { if (attempt >= 20) throw error; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (const [email, name] of [['a@example.com', 'Example A'], ['b@example.com', 'Example B']]) {
      const [lead, crm, billing] = backup.keys(email);
      const record = { id: 'lead-fixture', name, email: 'sample@example.com', website: '', phone: '', notes: 'Retain this note', stage: 'New', fit: 80, intent: 70, budget: 60, follow_up: '2026-11-10', updated_at: '2026-11-06' };
      await redis(0, ['SET', lead, JSON.stringify({ revision: 1, leads: [record] })]);
      await redis(0, ['SET', crm, JSON.stringify({ connection: { encrypted: { ciphertext: 'fixture' } }, reviews: [{ runningUntil: 0, createdAt: Date.now(), rows: [{ status: 'inflight', attempts: 1 }] }] })]);
      await redis(0, ['SADD', billing, JSON.stringify({ customer: 'cus_fixture', subscription: 'sub_fixture' })]);
    }
    server = http.createServer(async (request, response) => {
      try {
        let body = ''; for await (const chunk of request) body += chunk;
        const result = await redis(request.url === '/source' ? 0 : 1, JSON.parse(body));
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ result }));
      } catch { response.writeHead(503); response.end('{"error":"fixture store unavailable"}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const accounts = path.join(scratch, 'accounts.txt'), file = path.join(scratch, 'backup.enc');
    fs.writeFileSync(accounts, 'a@example.com\nb@example.com\n', { mode: 0o600 });
    const envFor = target => ({ ...process.env, LEAD_BACKUP_KEY: key, UPSTASH_REDIS_REST_URL: base + target, UPSTASH_REDIS_REST_TOKEN: 'fixture-only' });
    const cli = (args, target) => execute(process.execPath, [path.join(root, 'scripts/lead-backup.js'), ...args], { env: envFor(target) });
    await cli(['backup', '--accounts', accounts, '--out', file], '/source');
    if ((fs.statSync(file).mode & 0o777) !== 0o600 || fs.readFileSync(file, 'utf8').includes('Example A')) throw Error('Backup confidentiality check failed');
    await cli(['restore', '--in', file], '/target');
    if (await redis(1, ['DBSIZE']) !== 0) throw Error('Dry-run restore wrote records');
    await cli(['restore', '--in', file, '--apply'], '/target');
    const restoredA = JSON.parse(await redis(1, ['GET', backup.keys('a@example.com')[0]]));
    if (restoredA.leads[0].notes !== 'Retain this note') throw Error('Lost restored notes');
    const restoredCRM = JSON.parse(await redis(1, ['GET', backup.keys('a@example.com')[1]]));
    if (restoredCRM.connection !== null || restoredCRM.reviews[0].rows[0].status !== 'failed') throw Error('Restore left CRM active');
    let overwriteRejected = false;
    try { await cli(['restore', '--in', file, '--apply'], '/target'); } catch { overwriteRejected = true; }
    if (!overwriteRejected) throw Error('Nonempty restore was not rejected');
    // Fresh sessions are created separately: no passwords/sessions come from the backup.
    const auth = require('../api/_lib/auth');
    const cookies = {};
    for (const email of ['a@example.com', 'b@example.com']) {
      const user = { hash: 'fixture-' + email, products: [] };
      await redis(1, ['SET', 'user:' + email, JSON.stringify(user)]);
      const token = await auth.createSession(email, user, { setJSON: (key, value) => redis(1, ['SET', key, JSON.stringify(value)]) });
      cookies[email] = 'ss_session=' + token;
    }
    const env = { ...envFor('/target'), LEAD_WORKSPACE_PILOT_EMAILS: 'a@example.com,b@example.com', LEAD_WORKSPACE_BILLING_ENABLED: '0' };
    const request = email => new Request('https://fixture.test/api/lead-workspace/leads?email=b@example.com', { headers: { Cookie: cookies[email] } });
    const current = await import('../functions/api/lead-workspace/leads.js');
    for (const [email, name] of [['a@example.com', 'Example A'], ['b@example.com', 'Example B']]) {
      const response = await current.onRequestGet({ request: request(email), env });
      const data = await response.json(); if (response.status !== 200 || data.leads.length !== 1 || data.leads[0].name !== name) throw Error('Restored tenant isolation failed');
    }
    // Exercise the previous committed application bundle against the restored store.
    const rollbackRoot = path.join(scratch, 'rollback'); fs.mkdirSync(rollbackRoot);
    const archive = execFileSync('git', ['archive', rollbackCommit, 'api', 'functions', 'package.json'], { cwd: root, maxBuffer: 10000000 });
    execFileSync('tar', ['-x', '-C', rollbackRoot], { input: archive });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(rollbackRoot, 'node_modules'), 'dir');
    const prior = await import(pathToFileURL(path.join(rollbackRoot, 'functions/api/lead-workspace/leads.js')).href);
    const oldResponse = await prior.onRequestGet({ request: request('a@example.com'), env });
    if (oldResponse.status !== 200 || (await oldResponse.json()).leads[0].name !== 'Example A') throw Error('Rollback read failed');
    const update = new Request('https://fixture.test/api/lead-workspace/leads', { method: 'POST', headers: { Cookie: cookies['a@example.com'], Origin: 'https://fixture.test', 'Content-Type': 'application/json', 'X-Lead-Workspace': backup.keys('a@example.com')[0] }, body: JSON.stringify({ action: 'update', revision: 1, id: 'lead-fixture', changes: { notes: 'Rollback verified' } }) });
    if ((await prior.onRequestPost({ request: update, env })).status !== 200) throw Error('Rollback edit failed');
    const forward = await current.onRequestGet({ request: request('a@example.com'), env });
    if ((await forward.json()).leads[0].notes !== 'Rollback verified') throw Error('Roll-forward read failed');
    console.log(JSON.stringify({ encryptedBackup: true, dryRun: true, restoredAccounts: 2, crmDisarmed: true, isolation: true, overwriteRejected: true, rollbackReadWrite: true, rollForward: true, rollbackCommit }));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await execute('docker', ['stop', container]).catch(() => {});
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
if (require.main === module) drill({ rollbackRef: process.argv[2] === '--rollback-ref' ? process.argv[3] : 'HEAD^' }).catch(() => { console.error('Isolated recovery drill failed. No production store was accessed.'); process.exitCode = 1; });
module.exports = { drill };
