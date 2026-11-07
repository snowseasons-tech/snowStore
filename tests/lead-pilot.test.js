const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Stripe = require('stripe');
const auth = require('../api/_lib/auth');
const billing = require('../api/_lib/lead-billing');
const CATALOG = require('../api/_lib/catalog');
const fakeUpstash = require('./fake-upstash');
const csv = require('../storefront/lead-csv');
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture', LEAD_WORKSPACE_PILOT_EMAILS: 'buyer@example.com,other@example.com', LEAD_WORKSPACE_BILLING_ENABLED: '1', LEAD_WORKSPACE_SANDBOX_CHECKOUT: '1', LEAD_WORKSPACE_SANDBOX_PRODUCT: 'prod_pilot', LEAD_WORKSPACE_SANDBOX_PRICE: 'price_pilot', LEAD_CRM_ENABLED: '1', LEAD_CRM_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'), RESEND_API_KEY: '', MAIL_FROM: '', ALLOW_LIVE: '0' };
const origin = 'https://pilot.test';
async function routes() {
  const result = {};
  for (const route of ['login', 'logout', 'me', 'checkout', 'webhook', 'lead-workspace/session', 'lead-workspace/leads', 'lead-workspace/crm', 'lead-workspace/pilot-checkout', 'lead-workspace/billing-portal']) result[route] = await import('../functions/api/' + route + '.js');
  return result;
}
function req(path, cookie, body, workspaceId, override = {}) {
  return new Request(origin + '/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie || '', Origin: origin, 'Content-Type': 'application/json', ...(workspaceId && { 'X-Lead-Workspace': workspaceId }), ...override }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function seed(up, email) {
  up.data.set('user:' + email, JSON.stringify({ hash: await auth.hashPassword('pilot-password-123'), products: [] }));
}

test('pilot journey: sandbox checkout -> signed webhook -> portal -> import/follow-up -> reviewed CRM -> cancellation/reactivation', async () => {
  globalThis.crypto ||= crypto.webcrypto;
  const r = await routes();
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  const { crmKey } = await import('../functions/_lib/lead-crm.js');
  const subscriptions = new Map(), checkouts = [], contacts = new Map(); let creates = 0, loseCreateResponse = true;
  const up = fakeUpstash(async (url, init) => {
    if (url.includes('/v1/prices/price_pilot')) return Response.json({ id: 'price_pilot', livemode: false, active: true, currency: 'usd', unit_amount: 24900, recurring: { interval: 'month', interval_count: 1 }, product: { id: 'prod_pilot', livemode: false, active: true } });
    if (url.endsWith('/v1/checkout/sessions')) {
      const params = new URLSearchParams(init.body); const number = checkouts.length + 1;
      assert.equal(params.get('customer_email'), number === 3 ? 'other@example.com' : 'buyer@example.com');
      assert.equal(params.get('line_items[0][price]'), 'price_pilot');
      assert.match(params.get('integration_identifier'), /^lead-workspace-pilot-[a-z]{8}$/);
      assert.ok(new Headers(init.headers).get('Idempotency-Key'));
      const metadata = Object.fromEntries(['product_id', 'lead_workspace_pilot', 'lead_account_hash'].map(key => [key, params.get('metadata[' + key + ']')]));
      const subId = 'sub_pilot' + number, customer = 'cus_pilot' + number;
      subscriptions.set(subId, { id: subId, customer, livemode: false, status: 'active', metadata, items: { data: [{ price: { product: 'prod_pilot' }, current_period_end: Math.floor(Date.now()/1000) + 86400 }] }, latest_invoice: { status: 'paid', amount_due: 24900 } });
      checkouts.push({ id: 'cs_test_pilot' + number, payment_status: 'paid', livemode: false, customer, subscription: subId, metadata, customer_details: { email: number === 3 ? 'other@example.com' : 'edited-at-checkout@example.com' } });
      return Response.json({ id: checkouts.at(-1).id, url: 'https://checkout.stripe.com/c/pay/fixture' });
    }
    if (url.includes('/v1/subscriptions/')) return Response.json(subscriptions.get(new URL(url).pathname.split('/').pop()));
    if (url.endsWith('/v1/billing_portal/sessions')) { assert.equal(new URLSearchParams(init.body).get('customer'), 'cus_pilot2'); return Response.json({ url: 'https://billing.stripe.com/p/session/fixture' }); }
    if (url.startsWith('https://api.hubapi.com/')) {
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fixture-hubspot-key');
      if (url.includes('?limit=1')) return Response.json({ results: [] });
      const properties = init.body ? JSON.parse(init.body).properties : null;
      if (init.method === 'POST') {
        assert.ok(!Object.hasOwn(properties, 'notes')); creates++; contacts.set(properties.email, { id: '501', properties });
        if (loseCreateResponse) { loseCreateResponse = false; throw Error('Lost after commit'); }
      }
      if (init.method === 'PATCH') { const contact = [...contacts.values()].find(value => value.id === new URL(url).pathname.split('/').pop()); Object.assign(contact.properties, properties); return Response.json(contact); }
      const contact = contacts.get(decodeURIComponent(new URL(url).pathname.split('/').pop()));
      return contact ? Response.json(contact) : new Response('{}', { status: 404 });
    }
    throw Error('Unexpected external call');
  });
  const call = (route, cookie, body, workspaceId, bindings = env) => r[route][body === undefined ? 'onRequestGet' : 'onRequestPost']({ request: req(route, cookie, body, workspaceId), env: bindings });
  async function login(email) { const result = await call('login', '', { email, password: 'pilot-password-123' }); assert.equal(result.status, 200); return result.headers.get('set-cookie').split(';')[0]; }
  async function event(event, { bindings = env, status = 200 } = {}) {
    const raw = JSON.stringify({ livemode: false, ...event }), stripe = new Stripe('sk_test_fixture');
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET });
    const response = await r.webhook.onRequestPost({ request: new Request(origin + '/api/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: raw }), env: bindings });
    assert.equal(response.status, status);
    if (status === 200) return response.json();
  }
  async function checkout(cookie, workspaceId) {
    const response = await call('lead-workspace/pilot-checkout', cookie, { requestId: crypto.randomUUID() }, workspaceId);
    assert.equal(response.status, 200); assert.match((await response.json()).url, /^https:\/\/checkout.stripe.com/);
    assert.equal((await (await call('lead-workspace/session', cookie)).json()).workspaceEnabled, false); // Redirect/session creation never grants access.
    const payload = { id: 'evt_pilot' + checkouts.length, type: 'checkout.session.completed', created: Math.floor(Date.now()/1000), data: { object: checkouts.at(-1) } };
    await event({ ...payload, livemode: true }, { status: 400 });
    assert.equal((await event(payload, { bindings: { ...env, LEAD_WORKSPACE_SANDBOX_CHECKOUT: '0' } })).result, 'ignored');
    const session = payload.data.object;
    assert.equal((await event({ ...payload, id: payload.id + 'malformed', data: { object: { ...session, metadata: { ...session.metadata, lead_account_hash: '' } } } })).result, 'ignored');
    assert.ok(!up.data.has(billing.indexKey(session.customer_details.email)));
    assert.equal((await event(payload)).result, 'pilot-linked');
    assert.equal((await event(payload)).result, 'duplicate');
    assert.ok(!up.data.has('order:' + session.id));
  }
  try {
    await seed(up, 'buyer@example.com'); await seed(up, 'other@example.com');
    const cookie = await login('buyer@example.com');
    const portal = await call('me', cookie); assert.equal((await portal.json()).email, 'buyer@example.com');
    assert.equal((await call('checkout', cookie, { productId: 'lead-generation-pro' })).status, 503); // Public draft remains closed.
    let status = await (await call('lead-workspace/session', cookie)).json();
    assert.equal(status.workspaceEnabled, false); assert.equal(status.sandboxCheckoutAvailable, true);
    const misconfigured = await (await call('lead-workspace/session', cookie, undefined, undefined, { ...env, LEAD_WORKSPACE_BILLING_ENABLED: '0' })).json();
    assert.equal(misconfigured.workspaceEnabled, false);
    const missingWebhook = await (await call('lead-workspace/session', cookie, undefined, undefined, { ...env, STRIPE_WEBHOOK_SECRET: '' })).json();
    assert.equal(missingWebhook.sandboxCheckoutAvailable, false);
    await checkout(cookie, status.workspaceId);
    assert.ok(up.data.has(billing.indexKey('buyer@example.com'))); assert.ok(!up.data.has(billing.indexKey('edited-at-checkout@example.com')));
    status = await (await call('lead-workspace/session', cookie)).json(); assert.equal(status.workspaceEnabled, true);
    let data = await (await call('lead-workspace/leads', cookie)).json(); assert.equal(data.leads.length, 0);
    const imported = await call('lead-workspace/leads', cookie, { action: 'import', revision: data.revision, leads: csv.parse('name,email,notes\nExample Pilot Co,hello@example.com,Local note\n') }, data.workspaceId); assert.equal(imported.status, 200);
    data = await (await call('lead-workspace/leads', cookie)).json();
    assert.equal((await call('lead-workspace/leads', cookie, { action: 'update', revision: data.revision, id: data.leads[0].id, changes: { stage: 'Contacted', follow_up: '2026-11-10' } }, data.workspaceId)).status, 200);
    data = await (await call('lead-workspace/leads', cookie)).json(); assert.ok(csv.stringify(data.leads).includes('2026-11-10'));
    const connected = await call('lead-workspace/crm', cookie, { action: 'connect', token: 'fixture-hubspot-key' }, data.workspaceId);
    assert.equal(connected.status, 200);
    assert.deepEqual(await connected.json(), { connected: true });
    assert.ok(!up.data.get(crmKey('buyer@example.com')).includes('fixture-hubspot-key'));
    const reviewed = await (await call('lead-workspace/crm', cookie, { action: 'review', revision: data.revision, selectedIds: [data.leads[0].id], mapping: { name: 'company', email: 'email' } }, data.workspaceId)).json(); assert.equal(reviewed.valid, true);
    let sent = await (await call('lead-workspace/crm', cookie, { action: 'send', reviewId: reviewed.reviewId }, data.workspaceId)).json(); assert.equal(sent.rows[0].status, 'retryable');
    const crmState = JSON.parse(up.data.get(crmKey('buyer@example.com'))); crmState.connection.blockedUntil = 0; crmState.reviews[0].rows[0].retryAt = 0; up.data.set(crmKey('buyer@example.com'), JSON.stringify(crmState));
    sent = await (await call('lead-workspace/crm', cookie, { action: 'send', reviewId: reviewed.reviewId }, data.workspaceId)).json(); assert.equal(sent.rows[0].status, 'succeeded'); assert.equal(sent.rows[0].remoteId, '501');
    await call('lead-workspace/crm', cookie, { action: 'send', reviewId: reviewed.reviewId }, data.workspaceId); assert.equal(creates, 1); assert.equal(contacts.size, 1);
    const retained = up.data.get(workspaceKey('buyer@example.com'));
    const subscription = subscriptions.get('sub_pilot1'); subscription.cancel_at_period_end = true;
    assert.equal((await call('lead-workspace/leads', cookie)).status, 200);
    subscription.status = 'canceled';
    assert.equal((await call('lead-workspace/leads', cookie)).status, 403); assert.equal((await call('lead-workspace/crm', cookie)).status, 403);
    await event({ id: 'evt_old_active', created: 1, type: 'customer.subscription.updated', data: { object: { ...subscription, status: 'active' } } });
    assert.equal((await call('lead-workspace/leads', cookie)).status, 403); assert.equal(up.data.get(workspaceKey('buyer@example.com')), retained);
    await checkout(cookie, data.workspaceId);
    assert.equal((await call('lead-workspace/leads', cookie)).status, 200); assert.equal(up.data.get(workspaceKey('buyer@example.com')), retained);
    assert.equal((await call('lead-workspace/billing-portal', cookie, {})).status, 200);
    const otherCookie = await login('other@example.com'), otherKey = workspaceKey('other@example.com'); await checkout(otherCookie, otherKey);
    assert.equal((await (await call('lead-workspace/leads', otherCookie)).json()).leads.length, 0);
    assert.equal((await (await call('lead-workspace/crm', otherCookie)).json()).connected, false);
    await call('logout', cookie, {}); assert.equal((await call('lead-workspace/leads', cookie)).status, 401);
    assert.equal(CATALOG['lead-generation-pro'].draft, true);
  } finally { up.restore(); }
});

test('sandbox checkout refuses live keys, uninvited accounts, wrong prices, forged identity and non-JSON origins', async () => {
  const r = await routes(); let stripeCalls = 0;
  const up = fakeUpstash(async () => { stripeCalls++; return Response.json({ id: 'price_pilot', livemode: true, active: true }); });
  try {
    await seed(up, 'buyer@example.com');
    const user = JSON.parse(up.data.get('user:buyer@example.com'));
    const token = await auth.createSession('buyer@example.com', user, { setJSON: async (key, value) => up.data.set(key, JSON.stringify(value)) });
    const cookie = 'ss_session=' + token;
    const key = 'lead-workspace:v1:' + crypto.createHash('sha256').update('buyer@example.com').digest('hex');
    const call = bindings => r['lead-workspace/pilot-checkout'].onRequestPost({ request: req('lead-workspace/pilot-checkout', cookie, { requestId: crypto.randomUUID() }, key), env: bindings });
    assert.equal((await call({ ...env, STRIPE_SECRET_KEY: 'sk_live_fixture', ALLOW_LIVE: '1' })).status, 403);
    assert.equal((await call({ ...env, LEAD_WORKSPACE_PILOT_EMAILS: '' })).status, 403);
    assert.equal((await call({ ...env, LEAD_WORKSPACE_SANDBOX_CHECKOUT: '0' })).status, 403); assert.equal(stripeCalls, 0);
    assert.equal((await call(env)).status, 503); assert.equal(stripeCalls, 1);
    assert.equal((await r['lead-workspace/pilot-checkout'].onRequestPost({ request: req('lead-workspace/pilot-checkout', cookie, { requestId: crypto.randomUUID(), email: 'other@example.com' }, key), env })).status, 400);
    assert.equal((await r['lead-workspace/pilot-checkout'].onRequestPost({ request: req('lead-workspace/pilot-checkout', cookie, { requestId: crypto.randomUUID() }, key, { Origin: 'https://evil.test' }), env })).status, 403);
  } finally { up.restore(); }
});

test('retrying one sandbox checkout intent preserves Stripe parameters and idempotency key', async () => {
  const r = await routes(), calls = [];
  const up = fakeUpstash(async (url, init) => {
    if (url.includes('/v1/prices/price_pilot')) return Response.json({ id: 'price_pilot', active: true, livemode: false, unit_amount: 24900, currency: 'usd', recurring: { interval: 'month' }, product: { id: 'prod_pilot', active: true, livemode: false } });
    calls.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: String(init.body) });
    return Response.json({ url: 'https://checkout.stripe.com/c/pay/fixture' });
  });
  try {
    await seed(up, 'buyer@example.com');
    const token = await auth.createSession('buyer@example.com', JSON.parse(up.data.get('user:buyer@example.com')), { setJSON: async (key, value) => up.data.set(key, JSON.stringify(value)) });
    const key = 'lead-workspace:v1:' + crypto.createHash('sha256').update('buyer@example.com').digest('hex'), body = { requestId: crypto.randomUUID() };
    for (let i = 0; i < 2; i++) assert.equal((await r['lead-workspace/pilot-checkout'].onRequestPost({ request: req('lead-workspace/pilot-checkout', 'ss_session=' + token, body, key), env })).status, 200);
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  } finally { up.restore(); }
});
