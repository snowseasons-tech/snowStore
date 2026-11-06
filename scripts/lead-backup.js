#!/usr/bin/env node
// Scoped, encrypted lead/CRM backups. Never includes portal passwords or sessions.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { indexKey } = require('../api/_lib/lead-billing');
const SNAPSHOT = "return {redis.call('GET',KEYS[1]) or '',redis.call('GET',KEYS[2]) or '',redis.call('SMEMBERS',KEYS[3])}";
const RESTORE = "if redis.call('EXISTS',KEYS[1],KEYS[2],KEYS[3]) > 0 then return 0 end if ARGV[1] ~= '' then redis.call('SET',KEYS[1],ARGV[1]) end if ARGV[2] ~= '' then redis.call('SET',KEYS[2],ARGV[2]) end for i=3,#ARGV do redis.call('SADD',KEYS[3],ARGV[i]) end return 1";
function keys(email) {
  const workspace = 'lead-workspace:v1:' + crypto.createHash('sha256').update(email).digest('hex');
  return [workspace, 'lead-crm:v1:' + workspace, indexKey(email)];
}
function backupKey(env) {
  const text = env.LEAD_BACKUP_KEY || '';
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32 || key.toString('base64') !== text) throw Error('Configure a canonical base64 32-byte LEAD_BACKUP_KEY.');
  return key;
}
function seal(document, env) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', backupKey(env), iv);
  cipher.setAAD(Buffer.from('snowstore-lead-backup-v1'));
  const data = Buffer.concat([cipher.update(JSON.stringify(document)), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function open(envelope, env) {
  const parsed = JSON.parse(envelope);
  if (parsed.version !== 1) throw Error('Unsupported backup.');
  const cipher = crypto.createDecipheriv('aes-256-gcm', backupKey(env), Buffer.from(parsed.iv, 'base64'));
  cipher.setAAD(Buffer.from('snowstore-lead-backup-v1')); cipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(parsed.data, 'base64')), cipher.final()]).toString());
}
function validate(document) {
  if (document?.version !== 1 || !Array.isArray(document.accounts) || !document.accounts.length || document.accounts.length > 1000) throw Error('Invalid backup accounts.');
  const seen = new Set();
  for (const account of document.accounts) {
    if (typeof account.email !== 'string' || account.email !== account.email.trim().toLowerCase() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) || seen.has(account.email)) throw Error('Invalid backup identity.');
    seen.add(account.email);
    if (!Array.isArray(account.values) || account.values.length !== 3 || !account.values.slice(0, 2).every(value => typeof value === 'string') || !Array.isArray(account.values[2])) throw Error('Invalid snapshot.');
    if (account.values[0]) { const data = JSON.parse(account.values[0]); if (!Number.isSafeInteger(data.revision) || !Array.isArray(data.leads) || data.leads.length > 200) throw Error('Invalid lead snapshot.'); }
    if (account.values[1]) { const data = JSON.parse(account.values[1]); if (!Array.isArray(data.reviews)) throw Error('Invalid CRM snapshot.'); }
    for (const value of account.values[2]) { const link = JSON.parse(value); if (!/^sub_[A-Za-z0-9]+$/.test(link.subscription) || !/^cus_[A-Za-z0-9]+$/.test(link.customer)) throw Error('Invalid billing snapshot.'); }
  }
  return document;
}
async function redis(env, args) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw Error('Configure the target Redis store.');
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Redis request failed.');
  const body = await response.json(); if (body.error) throw Error('Redis command failed.'); return body.result;
}
async function snapshot(emails, command) {
  const accounts = []; let bytes = 0;
  for (const email of emails) {
    const account = { email, values: await command(['EVAL', SNAPSHOT, '3', ...keys(email)]) };
    bytes += Buffer.byteLength(JSON.stringify(account));
    if (bytes > 60000000) throw Error('Split the account list into smaller backup batches.');
    accounts.push(account);
  }
  const result = validate({ version: 1, createdAt: new Date().toISOString(), accounts });
  if (result.accounts.some(account => account.values[1] && JSON.parse(account.values[1]).reviews.some(review => review.runningUntil > Date.now()))) throw Error('A delivery is running. Stop writes and retry the backup.');
  return result;
}
async function restore(document, command, apply = false) {
  validate(document);
  // Preflight every tenant before any writes. Atomic per-tenant restore also handles races.
  for (const account of document.accounts) if (await command(['EXISTS', ...keys(account.email)])) throw Error('Target contains data. Restore into an empty isolated store.');
  if (!apply) return { accounts: document.accounts.length, applied: false };
  for (const account of document.accounts) {
    const values = [...account.values];
    if (values[1]) {
      const crm = JSON.parse(values[1]);
      // Reconnect deliberately; old credentials/reviews must not resume remote delivery.
      crm.connection = null;
      for (const review of crm.reviews) { review.runningUntil = 0; review.createdAt = 0; for (const row of review.rows || []) if (row.status === 'inflight') { row.status = 'failed'; row.message = 'Restored interrupted delivery. Reconcile in HubSpot before preparing a new review.'; } }
      values[1] = JSON.stringify(crm);
    }
    if (await command(['EVAL', RESTORE, '3', ...keys(account.email), values[0], values[1], ...values[2]]) !== 1) throw Error('Restore stopped on a target conflict. Some earlier accounts may already be restored; inspect before retrying.');
  }
  return { accounts: document.accounts.length, applied: true };
}
async function main(args = process.argv.slice(2), env = process.env) {
  const [mode, ...options] = args;
  const option = name => options[options.indexOf(name) + 1];
  if (mode === 'backup') {
    if (!options.includes('--accounts') || !options.includes('--out')) throw Error('Usage: backup --accounts private-account-list.txt --out /private/path/backup.enc');
    const emails = fs.readFileSync(option('--accounts'), 'utf8').split(/\r?\n/).map(value => value.trim().toLowerCase()).filter(Boolean);
    backupKey(env); // Fail before reading any customer data.
    const document = await snapshot(emails, args => redis(env, args));
    fs.writeFileSync(option('--out'), seal(document, env), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ backedUp: document.accounts.length }));
  } else if (mode === 'restore') {
    if (!options.includes('--in')) throw Error('Usage: restore --in /private/path/backup.enc [--apply]');
    const file = option('--in'); if (fs.statSync(file).size > 100000000) throw Error('Backup is too large.');
    const document = validate(open(fs.readFileSync(file, 'utf8'), env));
    console.log(JSON.stringify(await restore(document, args => redis(env, args), options.includes('--apply'))));
  } else throw Error('Use backup or restore. Restore is a dry run unless --apply is supplied.');
}
if (require.main === module) main().catch(() => { console.error('Backup/restore failed. Check configuration, authenticated backup integrity, account list and target conflicts. No record contents or credentials are logged.'); process.exitCode = 1; });
module.exports = { keys, seal, open, validate, snapshot, restore, SNAPSHOT, RESTORE };
