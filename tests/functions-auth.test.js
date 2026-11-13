const test = require('node:test');
const assert = require('node:assert');
const fakeUpstash = require('./fake-upstash');

const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't' };
const req = (path, { method = 'GET', body, cookie, type = 'application/json', ip = '203.0.113.9' } = {}) => new Request(`https://x.test${path}`, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { ...(type ? { 'Content-Type': type } : {}), ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': ip },
});
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

test('login -> me -> logout through Pages Functions', async () => {
  const [{ onRequestPost: login }, { onRequestGet: me }, { onRequestPost: logout }] = await Promise.all([
    import('../functions/api/login.js'), import('../functions/api/me.js'), import('../functions/api/logout.js')]);
  const auth = require('../api/_lib/auth');
  const store = require('../api/_lib/store');
  const up = fakeUpstash();
  Object.assign(process.env, env);
  try {
    await store.setJSON('user:pat@example.com', { hash: await auth.hashPassword('s3cret-password'), products: ['bookscan'] });

    assert.strictEqual((await me({ request: req('/api/me'), env })).status, 401);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'Pat@Example.com', password: 'nope' } }), env })).status, 401);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: {}, type: 'text/plain' }), env })).status, 415);

    const ok = await login({ request: req('/api/login', { method: 'POST', body: { email: 'Pat@Example.com', password: 's3cret-password' } }), env });
    assert.strictEqual(ok.status, 200);
    assert.match(ok.headers.get('set-cookie'), /Path=\/api; HttpOnly; Secure; SameSite=Strict/);
    const cookie = cookieOf(ok);

    const ws = await (await me({ request: req('/api/me', { cookie }), env })).json();
    assert.strictEqual(ws.email, 'pat@example.com');
    assert.deepStrictEqual(ws.apps.map((a) => a.id), ['bookscan']);
    assert.strictEqual(ws.coin, false);

    const out = await logout({ request: req('/api/logout', { method: 'POST', cookie }), env });
    assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
    assert.strictEqual((await me({ request: req('/api/me', { cookie }), env })).status, 401);
  } finally { up.restore(); }
});
test('login is rate limited per ip and email after repeated failures', async () => {
  const { onRequestPost: login } = await import('../functions/api/login.js');
  const up = fakeUpstash();
  try {
    const attempt = () => login({ request: req('/api/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'x' }, ip: '198.51.100.7' }), env });
    for (let i = 0; i < 8; i++) assert.strictEqual((await attempt()).status, 401);
    assert.strictEqual((await attempt()).status, 429);
  } finally { up.restore(); }
});
test('me and login fail closed (500) without a persistent store', async () => {
  const { onRequestGet: me } = await import('../functions/api/me.js');
  const { onRequestPost: login } = await import('../functions/api/login.js');
  assert.strictEqual((await me({ request: req('/api/me'), env: {} })).status, 500);
  assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } }), env: {} })).status, 500);
});

test('forgotten password: reset email -> set password -> signed in, link used up', async () => {
  const [{ onRequestPost: resetPw }, { onRequestPost: setPw }, { onRequestPost: login }, { onRequestGet: me }] = await Promise.all([
    import('../functions/api/password-reset.js'), import('../functions/api/password-set.js'),
    import('../functions/api/login.js'), import('../functions/api/me.js')]);
  const auth = require('../api/_lib/auth');
  const store = require('../api/_lib/store');
  const mails = [];
  const up = fakeUpstash(async (url, init) => { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); });
  const mailEnv = { ...env, RESEND_API_KEY: 're_test', MAIL_FROM: 'shop@example.com', SITE_URL: 'https://shop.example' };
  Object.assign(process.env, env);
  try {
    await store.setJSON('user:pat@example.com', { hash: await auth.hashPassword('old-password-123'), products: ['bookscan'] });
    const oldSession = cookieOf(await login({ request: req('/api/login', { method: 'POST', body: { email: 'pat@example.com', password: 'old-password-123' } }), env }));

    // Same reply for unknown and known accounts; only the known one gets an email.
    const unknown = await resetPw({ request: req('/api/password-reset', { method: 'POST', body: { email: 'nobody@example.com' } }), env: mailEnv });
    const known = await resetPw({ request: req('/api/password-reset', { method: 'POST', body: { email: 'Pat@Example.com' } }), env: mailEnv });
    assert.deepStrictEqual(await unknown.json(), await known.json());
    assert.strictEqual(mails.length, 1);
    assert.deepStrictEqual(mails[0].to, ['pat@example.com']);
    const token = mails[0].text.match(/#set-password=([A-Za-z0-9_-]+)/)[1];

    // A second request inside the resend gap doesn't send another email.
    await resetPw({ request: req('/api/password-reset', { method: 'POST', body: { email: 'pat@example.com' } }), env: mailEnv });
    assert.strictEqual(mails.length, 1);

    const short = await setPw({ request: req('/api/password-set', { method: 'POST', body: { token, password: 'short' } }), env });
    assert.strictEqual(short.status, 400);
    const ok = await setPw({ request: req('/api/password-set', { method: 'POST', body: { token, password: 'new-password-456' } }), env });
    assert.strictEqual(ok.status, 200);
    const ws = await (await me({ request: req('/api/me', { cookie: cookieOf(ok) }), env })).json();
    assert.deepStrictEqual(ws.apps.map((a) => a.id), ['bookscan']);

    assert.strictEqual((await me({ request: req('/api/me', { cookie: oldSession }), env })).status, 401);
    assert.strictEqual((await setPw({ request: req('/api/password-set', { method: 'POST', body: { token, password: 'another-password-789' } }), env })).status, 410);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'pat@example.com', password: 'old-password-123' } }), env })).status, 401);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'pat@example.com', password: 'new-password-456' } }), env })).status, 200);
  } finally { up.restore(); }
});
test('invited account without a password cannot sign in until the link is used', async () => {
  const { onRequestPost: setPw } = await import('../functions/api/password-set.js');
  const { onRequestPost: login } = await import('../functions/api/login.js');
  const auth = require('../api/_lib/auth');
  const store = require('../api/_lib/store');
  const up = fakeUpstash();
  Object.assign(process.env, env);
  try {
    const user = { hash: null, products: ['bi-dashboard'] };
    await store.setJSON('user:new@example.com', user);
    const token = await auth.createPasswordLink('new@example.com', user, auth.INVITE_TTL_SEC);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'new@example.com', password: '' } }), env })).status, 400);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'new@example.com', password: 'anything-at-all' } }), env })).status, 401);
    assert.strictEqual((await setPw({ request: req('/api/password-set', { method: 'POST', body: { token: 'x'.repeat(43), password: 'chosen-password-1' } }), env })).status, 410);
    assert.strictEqual((await setPw({ request: req('/api/password-set', { method: 'POST', body: { token, password: 'chosen-password-1' } }), env })).status, 200);
    assert.strictEqual((await login({ request: req('/api/login', { method: 'POST', body: { email: 'new@example.com', password: 'chosen-password-1' } }), env })).status, 200);
  } finally { up.restore(); }
});
test('password reset is unavailable (503) without email settings', async () => {
  const { onRequestPost: resetPw } = await import('../functions/api/password-reset.js');
  const up = fakeUpstash();
  try {
    assert.strictEqual((await resetPw({ request: req('/api/password-reset', { method: 'POST', body: { email: 'pat@example.com' } }), env })).status, 503);
  } finally { up.restore(); }
});

test('/api/me shows the coin only to accounts with the Founder\'s membership', async () => {
  const [{ onRequestPost: login }, { onRequestGet: me }] = await Promise.all([
    import('../functions/api/login.js'), import('../functions/api/me.js')]);
  const auth = require('../api/_lib/auth');
  const store = require('../api/_lib/store');
  const { hasCoin } = require('../api/_lib/entitlements');
  assert.ok(hasCoin(['bookscan', 'founders-membership']));
  assert.ok(!hasCoin(['bookscan']) && !hasCoin([]) && !hasCoin(undefined));
  const up = fakeUpstash();
  Object.assign(process.env, env);
  try {
    const hash = await auth.hashPassword('s3cret-password');
    await store.setJSON('user:member@example.com', { hash, products: ['founders-membership'] });
    await store.setJSON('user:lapsed@example.com', { hash, products: [] });
    const coinFor = async (email) => {
      const ok = await login({ request: req('/api/login', { method: 'POST', body: { email, password: 's3cret-password' } }), env });
      return (await (await me({ request: req('/api/me', { cookie: cookieOf(ok) }), env })).json()).coin;
    };
    assert.strictEqual(await coinFor('member@example.com'), true);
    assert.strictEqual(await coinFor('lapsed@example.com'), false);
  } finally { up.restore(); }
});
