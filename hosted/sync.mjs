#!/usr/bin/env node
// Matches hosted Social Studio servers to Stripe: creates them for new subscribers, changes limits when plans change,
// and stops them when a subscription ends. Run from cron with --apply. Without it, this prints what it would do.
// It never deletes anything: it emails OPS_EMAIL when a stopped server passes the 30 days the Terms allow.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const H = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const RUNNING = new Set(['active', 'trialing', 'past_due']);
const STOPPED = new Set(['canceled', 'unpaid', 'paused', 'incomplete_expired']);
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export const subscriberId = (subscriptionId) => 's' + createHash('sha256').update(subscriptionId).digest('hex').slice(0, 16);

export function decide(subscriptions, state, catalog, nowMs) {
  const actions = [], seen = new Set();
  for (const sub of subscriptions) {
    const limit = catalog[sub.metadata && sub.metadata.product_id]?.socialAccounts;
    if (!limit) continue;
    const id = subscriberId(sub.id), current = state[id];
    seen.add(id);
    const email = sub.customer && sub.customer.email;
    if (!current) {
      if (RUNNING.has(sub.status)) actions.push({ type: 'create', id, limit, email, subscription: sub.id });
      continue;
    }
    if (current.running && STOPPED.has(sub.status)) actions.push({ type: 'stop', id });
    else if (!current.running && RUNNING.has(sub.status)) actions.push({ type: 'start', id });
    if (RUNNING.has(sub.status) && current.limit !== limit) actions.push({ type: 'limit', id, limit });
  }
  for (const [id, current] of Object.entries(state)) {
    if (!seen.has(id)) actions.push({ type: 'missing', id });
    else if (!current.running && current.stoppedAt && nowMs - current.stoppedAt > KEEP_MS) actions.push({ type: 'overdue', id });
  }
  return actions;
}

// Runs one action and updates state. Saved after each step, so a failed run picks up where it stopped.
export function apply(action, state, nowMs, run) {
  const { type, id } = action;
  if (type === 'create') {
    const link = run('create', id, String(action.limit)).match(/^SETUP_LINK=(.+)$/m)?.[1];
    if (!link) throw new Error(`${id}: create gave no setup link`);
    state[id] = { subscription: action.subscription, email: action.email, limit: action.limit, running: true, setupLink: link };
  } else if (type === 'stop') {
    run('stop', id);
    Object.assign(state[id], { running: false, stoppedAt: nowMs });
  } else if (type === 'start') {
    run('start', id);
    state[id].running = true;
    delete state[id].stoppedAt;
  } else if (type === 'limit') {
    run('limit', id, String(action.limit));
    state[id].limit = action.limit;
  }
}

const welcome = (link) => `Your Social Studio is ready.\n\nCreate your account with this link. It only works once, so keep it private:\n${link}\n\nReply to this email if you need help.`;

export async function sendWelcomes(state, send) {
  for (const entry of Object.values(state)) {
    if (!entry.setupLink || !entry.email) continue;
    await send(entry.email, 'Your Social Studio is ready', welcome(entry.setupLink));
    delete entry.setupLink;
  }
}

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}

async function main() {
  const live = process.argv.includes('--apply');
  const ops = readEnv(process.env.HOSTED_OPS || path.join(H, 'ops.env'));
  const data = process.env.HOSTED_DATA || path.join(H, 'subscribers');
  const stateFile = path.join(data, 'state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const save = () => { fs.mkdirSync(data, { recursive: true, mode: 0o700 }); fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); };
  const send = async (to, subject, text) => {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${ops.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: ops.MAIL_FROM, to, subject, text }) });
    if (!r.ok) throw new Error(`Resend returned ${r.status}`);
  };
  const Stripe = require('stripe');
  const stripe = new Stripe(ops.STRIPE_READ_KEY);
  const subscriptions = await stripe.subscriptions.list({ status: 'all', expand: ['data.customer'], limit: 100 }).autoPagingToArray({ limit: 10000 });
  const actions = decide(subscriptions, state, require('../api/_lib/catalog'), Date.now());
  const problems = [];
  for (const action of actions) {
    if (action.type === 'missing') { problems.push(`${action.id}: its subscription isn't in Stripe, so it was left running`); continue; }
    if (action.type === 'overdue') { problems.push(`${action.id}: stopped over 30 days ago; delete it with hosted/subscriber.sh delete ${action.id} --yes`); continue; }
    console.log(live ? 'doing' : 'would do', action.type, action.id);
    if (!live) continue;
    try {
      apply(action, state, Date.now(), (...args) => execFileSync(path.join(H, 'subscriber.sh'), args, { encoding: 'utf8' }));
      save();
    } catch (e) { problems.push(`${action.id}: ${action.type} failed: ${e.message}`); }
  }
  if (live) {
    try { await sendWelcomes(state, send); } catch (e) { problems.push(`welcome email failed: ${e.message}`); }
    save();
    if (problems.length) await send(ops.OPS_EMAIL, 'Hosted Social Studio needs attention', problems.join('\n'));
  }
  for (const p of problems) console.log('attention', p);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
