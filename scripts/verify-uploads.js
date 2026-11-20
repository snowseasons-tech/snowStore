#!/usr/bin/env node
// Check that every catalog deliverable is in the private bucket and matches its catalog sha256.
//   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... node scripts/verify-uploads.js
// Exits 1 if any fileKey is missing or its contents differ, so a product can't be sold with a broken download.
const crypto = require('crypto');
const CATALOG = require('../api/_lib/catalog');
const { presignFromEnv } = require('../api/_lib/sigv4');

async function verifyUploads(catalog = CATALOG, env = process.env, fetchImpl = fetch) {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Set ${missing.join(', ')}`);
  let bad = 0;
  const failures = [];
  for (const [id, p] of Object.entries(catalog)) {
    if (!p.fileKey) continue;
    if (!/^[a-f0-9]{64}$/.test(p.sha256 || '')) {
      bad++; failures.push(`FAIL ${id}: missing or invalid catalog sha256`);
      continue;
    }
    const r = await fetchImpl(presignFromEnv(p.fileKey, p.filename, env, 60));
    if (!r.ok) { bad++; failures.push(`FAIL ${id}: ${p.fileKey} -> HTTP ${r.status}`); continue; }
    const sha = crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
    if (sha !== p.sha256) { bad++; failures.push(`FAIL ${id}: sha256 ${sha} != catalog ${p.sha256}`); continue; }
  }
  return { bad, failures };
}

async function main() {
  const result = await verifyUploads();
  for (const [id, p] of Object.entries(CATALOG)) {
    if (p.fileKey) console.log(result.failures.find((f) => f.startsWith(`FAIL ${id}:`)) || `ok   ${id}: ${p.fileKey}`);
  }
  if (result.bad) throw new Error(`${result.bad} deliverable(s) missing or out of date`);
}

module.exports = { verifyUploads };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
