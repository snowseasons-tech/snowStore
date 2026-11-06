const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fakeUpstash = require('./fake-upstash');
const auth = require('../api/_lib/auth');
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't' };
const request = cookie => new Request('https://x.test/api/lead-workspace/session', { headers: cookie ? { Cookie: cookie } : {} });

test('lead workspace uses portal sessions and invalidates logout, expiry and password changes', async () => {
  const { onRequestGet: session, onRequest: other } = await import('../functions/api/lead-workspace/session.js');
  const { onRequestPost: login } = await import('../functions/api/login.js');
  const { onRequestPost: logout } = await import('../functions/api/logout.js');
  const up = fakeUpstash();
  try {
    const user = { hash: await auth.hashPassword('example-password-123'), products: [] };
    up.data.set('user:person@example.com', JSON.stringify(user));
    assert.equal((await session({ request: request(), env })).status, 401);
    assert.equal((await session({ request: new Request('https://x.test/api/lead-workspace/session#token=local-token', { headers: { 'X-Workspace-Token': 'local-token' } }), env })).status, 401);
    const loginResponse = await login({ request: new Request('https://x.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'person@example.com', password: 'example-password-123' }) }), env });
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const result = await session({ request: request(cookie), env });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = await result.json();
    assert.equal(body.email, 'person@example.com');
    assert.equal(body.workspaceEnabled, false);
    assert.ok(body.expiresAt > Date.now());
    assert.deepEqual(Object.keys(body).sort(), ['access', 'billingEnabled', 'email', 'expiresAt', 'workspaceEnabled']);
    const key = 'sess:' + crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex');
    const saved = up.data.get(key);
    up.data.set(key, JSON.stringify({ ...JSON.parse(saved), createdAt: Date.now() - auth.SESSION_TTL_SEC * 1000 - 1 }));
    assert.equal((await session({ request: request(cookie), env })).status, 401);
    up.data.set(key, saved);
    up.data.set('user:person@example.com', JSON.stringify({ ...user, hash: 'changed' }));
    assert.equal((await session({ request: request(cookie), env })).status, 401);
    up.data.set('user:person@example.com', JSON.stringify(user));
    await logout({ request: new Request('https://x.test/api/logout', { method: 'POST', headers: { Cookie: cookie } }), env });
    assert.equal((await session({ request: request(cookie), env })).status, 401);
    assert.equal(other().status, 405);
  } finally { up.restore(); }
});

test('lead workspace fails closed without request bindings or with a failed store', async () => {
  const { onRequestGet: session } = await import('../functions/api/lead-workspace/session.js');
  const saved = global.fetch;
  process.env.UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
  assert.equal((await session({ request: request(), env: {} })).status, 503);
  try {
    global.fetch = async () => new Response('{"error":"unavailable"}', { status: 500 });
    assert.equal((await session({ request: request('ss_session=' + 'a'.repeat(43)), env })).status, 503);
  } finally { global.fetch = saved; }
});
