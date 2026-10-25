#!/usr/bin/env node
// Email a client their report for the period since the last report, via Resend.
//   node managed/report.mjs <client-id>          send the report
//   node managed/report.mjs <client-id> --dry    print it and save attachments to clients/<id>/report-preview/
//                                                (sends nothing, doesn't advance the period)
//   node managed/report.mjs --alert <client-id> "message"   alert OPS_EMAIL (run.sh uses this on failure)
// Lead clients get new contacts/leads as CSV; blog clients get the roundups written this period.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const M = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// ---------- small helpers ----------
function readEnv(file) { // KEY=value / KEY="value" lines; enough for client.env and ops.env
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    env[m[1]] = v;
  }
  return env;
}
function parseCsv(text) { // RFC 4180: quoted fields may contain commas, quotes and newlines
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [header = [], ...body] = rows.filter((r) => r.some((x) => x !== ''));
  return { header, rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
function readCsv(file) { return fs.existsSync(file) ? parseCsv(fs.readFileSync(file, 'utf8')) : { header: [], rows: [] }; }
function toCsv(header, rows) {
  // Scraped text could start with a spreadsheet formula; prefix those so Excel shows them as text.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=@\t\r]/.test(s) || /^[+-][^\d\s(]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows.map((r) => header.map((h) => r[h]))].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
const pad = (n) => String(n).padStart(2, '0');
// The lead pipeline writes local times like 2026-10-19T14:22:01, so compare in the same format.
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const day = (iso) => iso.slice(0, 10);

async function send(env, { to, bcc, subject, text, attachments = [] }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error('RESEND_API_KEY and MAIL_FROM must be set in managed/ops.env');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM, to, subject, text,
      ...(bcc?.length ? { bcc } : {}),
      ...(env.OPS_EMAIL ? { reply_to: env.OPS_EMAIL } : {}),
      attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

// ---------- alert mode ----------
const ops = readEnv(path.join(M, 'ops.env'));
if (args[0] === '--alert') {
  const [, id, msg = 'job failed'] = args;
  console.error(`[managed] ${id}: ${msg}`);
  if (ops.OPS_EMAIL && ops.RESEND_API_KEY) {
    await send(ops, { to: [ops.OPS_EMAIL], subject: `[managed] ${id}: job failed`, text: `${msg}\n\nServer time: ${new Date().toString()}` })
      .catch((e) => console.error('alert email failed:', e.message));
  }
  process.exit(0);
}

// ---------- report mode ----------
const id = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry');
const C = path.join(M, 'clients', id || '');
if (!id || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(id) || !fs.existsSync(path.join(C, 'client.env'))) {
  console.error(`usage: node managed/report.mjs <client-id> [--dry]   (no client '${id ?? ''}')`);
  process.exit(2);
}
const client = readEnv(path.join(C, 'client.env'));
const name = client.CLIENT_NAME || id;
const STATE = path.join(C, '.last_report');
const now = new Date();
const since = fs.existsSync(STATE) ? fs.readFileSync(STATE, 'utf8').trim() : localIso(new Date(now - 7 * 864e5));
const until = localIso(now);
const period = `${day(since)} to ${day(until)}`;
const stamp = day(until);

let subject, text, attachments = [];
if (client.SERVICE === 'lead') {
  const contacts = readCsv(path.join(C, 'data', 'contacts.csv'));
  const leads = readCsv(path.join(C, 'data', 'leads.csv'));
  const newContacts = contacts.rows.filter((r) => (r.scraped_at || '') > since);
  const newLeads = leads.rows.filter((r) => (r.created_at || '') > since && r.website);
  const queueFile = path.join(C, 'companies_queue.txt');
  const queued = fs.existsSync(queueFile) ? fs.readFileSync(queueFile, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length : 0;
  const withEmail = newContacts.filter((r) => r.email).length;
  const withPhone = newContacts.filter((r) => r.phone).length;

  if (newContacts.length) attachments.push({ filename: `new-contacts-${stamp}.csv`, content: toCsv(contacts.header, newContacts) });
  if (newLeads.length) attachments.push({ filename: `new-companies-${stamp}.csv`, content: toCsv(leads.header, newLeads) });
  if (contacts.rows.length) attachments.push({ filename: `all-contacts-${stamp}.csv`, content: toCsv(contacts.header, contacts.rows) });

  subject = `Lead report for ${name}: ${newContacts.length} new contact${newContacts.length === 1 ? '' : 's'}`;
  text = [
    'Hi,', '',
    `Here is your lead report for ${name}, covering ${period}.`, '',
    `New companies with a website found: ${newLeads.length}`,
    `New contacts: ${newContacts.length} (${withEmail} with an email, ${withPhone} with a phone number)`,
    `Companies still waiting to be searched: ${queued}`, '',
    attachments.length ? 'Attached:' : 'Nothing new was found this period, so there are no attachments.',
    ...attachments.map((a) => `- ${a.filename}`),
    '',
    queued ? 'The remaining companies will be searched over the next nightly runs.' : 'Your queue is empty. Reply with more company names and we will add them.',
    '',
    'Please follow the anti-spam and privacy rules that apply to you when contacting anyone in this report.',
    '', 'Snow Seasons Tech',
  ].join('\n');
} else if (client.SERVICE === 'blog') {
  const cfg = JSON.parse(fs.readFileSync(path.join(C, 'sources.json'), 'utf8'));
  const out = cfg.outDir || path.join(C, 'out');
  const sinceMs = new Date(since).getTime();
  const posts = fs.existsSync(out)
    ? fs.readdirSync(out).filter((f) => f.endsWith('.md') && fs.statSync(path.join(out, f)).mtimeMs > sinceMs).sort()
    : [];
  const titleOf = (md) => (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || md.match(/^#\s+(.+)$/m) || [, null])[1];
  const items = posts.map((f) => {
    const md = fs.readFileSync(path.join(out, f), 'utf8');
    attachments.push({ filename: f, content: md });
    const html = f.replace(/\.md$/, '.html');
    if (fs.existsSync(path.join(out, html))) attachments.push({ filename: html, content: fs.readFileSync(path.join(out, html)) });
    return `- ${titleOf(md) || f}`;
  });
  const publishing = /--publish\s+(\S+)/.exec(client.BLOG_ARGS || '');
  subject = `Blog roundup report for ${name}: ${posts.length} new post${posts.length === 1 ? '' : 's'}`;
  text = [
    'Hi,', '',
    `Here is your roundup report for ${name}, covering ${period}.`, '',
    posts.length ? `New roundups (${posts.length}):` : 'No new roundups were written this period.',
    ...items, '',
    posts.length && publishing ? `These were also posted to ${({ ghost: 'Ghost', wordpress: 'WordPress', hugo: 'Hugo' })[publishing[1]] || publishing[1]} as ${/--live/.test(client.BLOG_ARGS) ? 'published posts' : 'drafts for you to review'}.` : '',
    posts.length ? 'Each roundup is attached as Markdown and HTML.' : '',
    '', 'Snow Seasons Tech',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
} else {
  console.error(`${id}: SERVICE must be lead or blog`);
  process.exit(2);
}

const to = list(client.REPORT_TO);
if (DRY) {
  console.log(`To: ${to.join(', ') || '(REPORT_TO not set)'}${ops.OPS_EMAIL ? `\nBcc: ${ops.OPS_EMAIL}` : ''}\nSubject: ${subject}\n\n${text}\n`);
  const preview = path.join(C, 'report-preview');
  fs.rmSync(preview, { recursive: true, force: true });
  if (attachments.length) fs.mkdirSync(preview, { recursive: true });
  for (const a of attachments) {
    fs.writeFileSync(path.join(preview, a.filename), a.content);
    console.log(`[attachment] ${a.filename} (${Buffer.byteLength(a.content)} bytes)`);
  }
  if (attachments.length) console.log(`Attachments saved to ${preview} for checking. Nothing was sent.`);
  process.exit(0);
}
if (!to.length) { console.error(`${id}: set REPORT_TO in client.env`); process.exit(2); }
try {
  await send(ops, { to, bcc: list(ops.OPS_EMAIL), subject, text, attachments });
  fs.writeFileSync(STATE, until + '\n');
  console.log(`${id}: report sent to ${to.join(', ')} (${attachments.length} attachment(s))`);
} catch (e) {
  console.error(`${id}: report failed: ${e.message}`);
  process.exit(1);
}
