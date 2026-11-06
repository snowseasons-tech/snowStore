import CATALOG from '../../api/_lib/catalog.js';
import billing from '../../api/_lib/lead-billing.js';
import { stripeClient } from './stripe.js';
import { pilotEnabled } from './lead-data.js';

const WEEK = 7 * 86400;
const denied = reason => ({ allowed: false, mode: 'subscription', reason });
const idOf = value => typeof value === 'string' ? value : value?.id;

// Explicit access policy; invoice timestamps never move forward on another payment retry.
export function subscriptionAccess(sub, product, customer, now = Date.now() / 1000) {
  if (idOf(sub.customer) !== customer || sub.metadata?.product_id !== 'lead-generation-pro') return denied('Subscription does not match this account and product.');
  const items = sub.items?.data || [];
  const matching = items.filter(item => idOf(item.price?.product) === product);
  if (matching.length !== 1 || sub.pause_collection) return denied('Subscription is paused or does not include this workspace.');
  const item = matching[0];
  const end = item.current_period_end || sub.current_period_end;
  const cancelEnd = sub.cancel_at_period_end ? end : Infinity;
  const scheduledEnd = sub.cancel_at || Infinity;
  const hardEnd = Math.min(cancelEnd, scheduledEnd);
  if (hardEnd <= now || !Number.isFinite(end) || end <= now && sub.status !== 'past_due') return denied('The subscription access period has ended.');
  if (sub.status === 'trialing' && Number.isFinite(sub.trial_end) && sub.trial_end > now) return { allowed: true, mode: 'subscription', status: 'trialing', validUntil: Math.min(sub.trial_end, hardEnd) * 1000 };
  const invoice = sub.latest_invoice;
  if (sub.status === 'active' && invoice && typeof invoice === 'object' && (invoice.status === 'paid' || invoice.paid === true || invoice.amount_due === 0)) {
    return { allowed: true, mode: 'subscription', status: 'active', validUntil: Math.min(end, hardEnd) * 1000 };
  }
  if (sub.status === 'past_due' && invoice && typeof invoice === 'object' && invoice.status === 'open') {
    const start = invoice.due_date || invoice.status_transitions?.finalized_at;
    if (Number.isFinite(start) && start <= now && now < start + WEEK) return { allowed: true, mode: 'subscription', status: 'past_due', graceEndsAt: (start + WEEK) * 1000, validUntil: Math.min(start + WEEK, hardEnd) * 1000 };
  }
  return denied(sub.status === 'past_due' ? 'The seven-day payment grace period has ended or could not be verified.' : 'An active paid or trial subscription is required.');
}

export async function leadAccess(session, env, deps = {}) {
  const pilot = pilotEnabled(session.email, env);
  const mode = env.LEAD_WORKSPACE_BILLING_ENABLED || '0';
  if (!['0', '1'].includes(mode)) throw new Error('Invalid billing mode');
  if (mode !== '1') return pilot ? { allowed: true, mode: 'pilot' } : { allowed: false, mode: 'pilot', reason: 'Hosted lead access is limited to invited pilot accounts.' };
  // A draft can only be exercised by explicitly invited pilots. No draft is put on sale here.
  if (CATALOG['lead-generation-pro'].draft && !pilot) return denied('This bundle is not available for general access yet.');
  const links = await billingLinks(session, env);
  if (!links.length) return denied('No completed subscription checkout is linked to this account.');
  const stripe = deps.stripe || stripeClient(env);
  let fallback = denied('An active paid or trial subscription is required.');
  for (const link of links) {
    if (!/^sub_[A-Za-z0-9]+$/.test(link.subscription) || !/^cus_[A-Za-z0-9]+$/.test(link.customer)) throw new Error('Invalid billing link');
    let subscription;
    try { subscription = await stripe.subscriptions.retrieve(link.subscription, { expand: ['latest_invoice'] }, { timeout: 5000, maxNetworkRetries: 0 }); }
    catch (error) { if (error.code === 'resource_missing') continue; throw error; }
    if (subscription.id !== link.subscription) throw new Error('Subscription lookup mismatch');
    const access = subscriptionAccess(subscription, CATALOG['lead-generation-pro'].stripeProduct, link.customer);
    if (access.allowed) return { ...access, customer: link.customer };
    fallback = { ...access, customer: link.customer };
  }
  return fallback;
}

export async function billingLinks(session, env) {
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SMEMBERS', billing.indexKey(session.email)]), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Billing links unavailable');
  const payload = await response.json();
  if (payload.error || !Array.isArray(payload.result)) throw new Error('Billing links unavailable');
  if (payload.result.length > 20) throw new Error('Billing links require operator review');
  return payload.result.map(entry => {
    const link = JSON.parse(entry);
    if (!/^sub_[A-Za-z0-9]+$/.test(link.subscription) || !/^cus_[A-Za-z0-9]+$/.test(link.customer)) throw new Error('Invalid billing link');
    return link;
  });
}
