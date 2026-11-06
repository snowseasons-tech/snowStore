const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fakeUpstash = require('./fake-upstash');
const { handleEvent } = require('../api/_lib/fulfil');
const billing = require('../api/_lib/lead-billing');
const CATALOG = require('../api/_lib/catalog');
const store = require('../api/_lib/store');
const product = CATALOG['lead-generation-pro'].stripeProduct;
const env = { UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 't', STRIPE_SECRET_KEY: 'sk_test_fixture', LEAD_WORKSPACE_PILOT_EMAILS: 'buyer@example.com', LEAD_WORKSPACE_BILLING_ENABLED: '1' };
const now = 1800000000;
const sub = (changes = {}) => ({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { product_id: 'lead-generation-pro' }, items: { data: [{ price: { product }, current_period_end: now + 30 * 86400 }] }, latest_invoice: { id: 'in_1', status: 'paid', amount_due: 24900 }, ...changes });

test('access policy covers paid, trial, grace boundaries, cancellation and invalid ownership', async () => {
  const { subscriptionAccess: access } = await import('../functions/_lib/lead-access.js');
  assert.equal(access(sub(), product, 'cus_1', now).allowed, true);
  assert.equal(access(sub({ status: 'trialing', trial_end: now + 100 }), product, 'cus_1', now).allowed, true);
  const due = sub({ status: 'past_due', latest_invoice: { id: 'in_2', status: 'open', due_date: now - 6 * 86400 } });
  assert.equal(access(due, product, 'cus_1', now).allowed, true);
  assert.equal(access(due, product, 'cus_1', now + 86400).allowed, false);
  const retry = { ...due, latest_invoice: { ...due.latest_invoice, attempt_count: 10, next_payment_attempt: now + 10000 } };
  assert.equal(access(retry, product, 'cus_1', now).graceEndsAt, access(due, product, 'cus_1', now).graceEndsAt);
  assert.equal(access(sub({ cancel_at_period_end: true }), product, 'cus_1', now).allowed, true);
  assert.equal(access(sub({ cancel_at: now }), product, 'cus_1', now).allowed, false);
  for (const status of ['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']) assert.equal(access(sub({ status }), product, 'cus_1', now).allowed, false);
  assert.equal(access(sub({ pause_collection: { behavior: 'void' } }), product, 'cus_1', now).allowed, false);
  assert.equal(access(sub(), product, 'cus_other', now).allowed, false);
  assert.equal(access(sub(), 'prod_wrong', 'cus_1', now).allowed, false);
  assert.equal(access(sub({ latest_invoice: { status: 'open', amount_due: 24900 } }), product, 'cus_1', now).allowed, false);
  assert.equal(access(sub({ status: 'past_due', latest_invoice: { status: 'open' } }), product, 'cus_1', now).allowed, false);
  assert.equal(access(sub({ status: 'past_due', latest_invoice: { status: 'open', status_transitions: { finalized_at: now - 1 } } }), product, 'cus_1', now).allowed, true);
});

function checkout(id, subscription = 'sub_1', email = 'buyer@example.com') {
  return { id, created: now, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, payment_status: 'paid', metadata: { product_id: 'lead-generation-pro' }, customer_details: { email }, customer: 'cus_1', subscription } } };
}
const deps = { mail: { sendMail: async () => 'skipped' } };

test('signed checkout processing links subscriptions idempotently; invoice/lifecycle events do not grant access', async () => {
  const up = fakeUpstash(); Object.assign(process.env, env);
  try {
    const event = checkout('evt_link1');
    await handleEvent(event, deps);
    assert.equal(await handleEvent(event, deps), 'duplicate');
    await handleEvent(checkout('evt_link2', 'sub_2'), deps);
    const links = JSON.parse(up.data.get(billing.indexKey('buyer@example.com')));
    assert.equal(links.length, 2);
    await handleEvent({ id: 'evt_paid', created: now, type: 'invoice.paid', data: { object: { id: 'in_1' } } }, deps);
    await handleEvent({ id: 'evt_fail', created: now - 100, type: 'invoice.payment_failed', data: { object: { id: 'in_1' } } }, deps);
    assert.equal(JSON.parse(up.data.get(billing.indexKey('buyer@example.com'))).length, 2);
    assert.equal(await handleEvent({ id: 'evt_paid', created: now, type: 'invoice.paid', data: { object: { id: 'in_1' } } }, deps), 'duplicate');
    const unpaid = checkout('evt_unpaid', 'sub_no', 'other@example.com'); unpaid.data.object.payment_status = 'unpaid';
    await handleEvent(unpaid, deps);
    assert.equal(up.data.has(billing.indexKey('other@example.com')), false);
  } finally { up.restore(); }
});

test('every hosted operation uses current Stripe state, retains data after cancellation and restores access on new subscription', async () => {
  const { onRequestGet: get, onRequestPost: post } = await import('../functions/api/lead-workspace/leads.js');
  const { onRequestGet: session } = await import('../functions/api/lead-workspace/session.js');
  const { workspaceKey } = await import('../functions/_lib/lead-data.js');
  let current = sub({ items: { data: [{ price: { product }, current_period_end: Date.now() / 1000 + 86400 }] } });
  const up = fakeUpstash(async url => {
    assert.match(url, /api\.stripe\.com\/v1\/subscriptions\/sub_[12]/);
    const requested = new URL(url).pathname.split('/').pop();
    return new Response(JSON.stringify({ ...current, id: requested, status: requested === current.id ? current.status : 'canceled' }), { headers: { 'Content-Type': 'application/json' } });
  });
  Object.assign(process.env, env);
  try {
    up.data.set('user:buyer@example.com', JSON.stringify({ hash: 'credential', products: [] }));
    const token = 'test-session-token'.repeat(3);
    up.data.set('sess:' + crypto.createHash('sha256').update(token).digest('hex'), JSON.stringify({ email: 'buyer@example.com', cred: crypto.createHash('sha256').update('credential').digest('hex'), createdAt: Date.now() }));
    const req = body => new Request('https://x.test/api/lead-workspace/leads', { method: body ? 'POST' : 'GET', headers: { Cookie: 'ss_session=' + token, Origin: 'https://x.test', 'Content-Type': 'application/json', 'X-Lead-Workspace': workspaceKey('buyer@example.com') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await get({ request: req(), env })).status, 403);
    await handleEvent(checkout('evt_route_link'), deps);
    assert.equal((await session({ request: req(), env })).status, 200);
    assert.equal((await post({ request: req({ action: 'create', revision: 0, lead: { name: 'Retained lead' } }), env })).status, 200);
    const before = up.data.get(workspaceKey('buyer@example.com'));
    current = { ...current, status: 'canceled' };
    assert.equal((await get({ request: req(), env })).status, 403);
    assert.equal((await post({ request: req({ action: 'import', revision: 1, leads: [{ name: 'Blocked' }] }), env })).status, 403);
    assert.equal((await post({ request: req({ action: 'update', revision: 1, id: 'anything', changes: { notes: 'Blocked' } }), env })).status, 403);
    await handleEvent({ id: 'evt_delayed', created: now - 100, type: 'customer.subscription.updated', data: { object: sub() } }, deps);
    assert.equal((await get({ request: req(), env })).status, 403);
    assert.equal(up.data.get(workspaceKey('buyer@example.com')), before);
    current = { ...current, status: 'active', id: 'sub_2' };
    await handleEvent(checkout('evt_reactivate', 'sub_2'), deps);
    const restored = await get({ request: req(), env });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).leads[0].name, 'Retained lead');
    assert.equal((await get({ request: req(), env: { ...env, LEAD_WORKSPACE_PILOT_EMAILS: '' } })).status, 403);
  } finally { up.restore(); }
});

test('billing portal ignores supplied customer IDs and Stripe failures never fall back to pilot access', async () => {
  const { onRequestPost: portal } = await import('../functions/api/lead-workspace/billing-portal.js');
  const { onRequestGet: get } = await import('../functions/api/lead-workspace/leads.js');
  let stripeDown = false;
  const current = sub({ status: 'past_due', latest_invoice: { status: 'open', due_date: Date.now() / 1000 - 2 * 86400 } });
  const up = fakeUpstash(async (url, init) => {
    if (stripeDown) return new Response(JSON.stringify({ error: { message: 'unavailable', type: 'api_error' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/billing_portal/sessions')) {
      assert.equal(new URLSearchParams(init.body).get('customer'), 'cus_1');
      return new Response(JSON.stringify({ id: 'bps_fixture', url: 'https://billing.stripe.com/p/session/fixture' }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(current), { headers: { 'Content-Type': 'application/json' } });
  });
  Object.assign(process.env, env);
  try {
    const user = { hash: 'credential', products: [] };
    await store.setJSON('user:buyer@example.com', user);
    const token = await require('../api/_lib/auth').createSession('buyer@example.com', user);
    const request = (origin = 'https://x.test') => new Request('https://x.test/api/lead-workspace/billing-portal', { method: 'POST', headers: { Cookie: 'ss_session=' + token, Origin: origin }, body: JSON.stringify({ customer: 'cus_attacker' }) });
    await handleEvent(checkout('evt_portal'), deps);
    assert.equal((await portal({ request: request('https://evil.test'), env })).status, 403);
    const ok = await portal({ request: request(), env });
    assert.equal(ok.status, 200); assert.match((await ok.json()).url, /^https:\/\/billing.stripe.com/);
    stripeDown = true;
    const unavailable = await get({ request: new Request('https://x.test/api/lead-workspace/leads', { headers: { Cookie: 'ss_session=' + token } }), env });
    assert.equal(unavailable.status, 503);
    assert.equal((await get({ request: new Request('https://x.test/api/lead-workspace/leads', { headers: { Cookie: 'ss_session=' + token } }), env: { ...env, LEAD_WORKSPACE_BILLING_ENABLED: 'true' } })).status, 503);
  } finally { up.restore(); }
});

test('Pages webhook requires a valid signature before linking or recording billing events', async () => {
  const Stripe = require('stripe');
  globalThis.crypto ||= require('node:crypto').webcrypto;
  const { onRequestPost: webhook } = await import('../functions/api/webhook.js');
  const up = fakeUpstash();
  const webhookEnv = { ...env, STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
  try {
    const event = checkout('evt_signed');
    const raw = JSON.stringify(event);
    const stripe = new Stripe('sk_test_fixture');
    const header = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: webhookEnv.STRIPE_WEBHOOK_SECRET });
    const request = signature => new Request('https://x.test/api/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: raw });
    assert.equal((await webhook({ request: request('invalid'), env: webhookEnv })).status, 400);
    assert.equal(up.data.has(billing.indexKey('buyer@example.com')), false);
    assert.equal((await webhook({ request: request(header), env: webhookEnv })).status, 200);
    assert.equal(JSON.parse(up.data.get(billing.indexKey('buyer@example.com'))).length, 1);
    assert.equal((await webhook({ request: request(header), env: webhookEnv })).status, 200);
    assert.equal(JSON.parse(up.data.get(billing.indexKey('buyer@example.com'))).length, 1);
  } finally { up.restore(); }
});
