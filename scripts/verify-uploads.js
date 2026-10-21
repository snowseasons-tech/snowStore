#!/usr/bin/env node
// Check that every catalog deliverable is in the private bucket and matches its catalog sha256.
//   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... node scripts/verify-uploads.js
// Exits 1 if any fileKey is missing or its contents differ, so a product can't be sold with a broken download.
const crypto = require('crypto');
const CATALOG = require('../api/_lib/catalog');
const { presignFromEnv } = require('../api/_lib/sigv4');

async function main() {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Set ${missing.join(', ')}`);
  let bad = 0;
  for (const [id, p] of Object.entries(CATALOG)) {
    if (!p.fileKey) continue;
    const r = await fetch(presignFromEnv(p.fileKey, p.filename, process.env, 60));
    if (!r.ok) { bad++; console.log(`FAIL ${id}: ${p.fileKey} -> HTTP ${r.status}`); continue; }
    const sha = crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
    if (p.sha256 && sha !== p.sha256) { bad++; console.log(`FAIL ${id}: sha256 ${sha} != catalog ${p.sha256}`); continue; }
    console.log(`ok   ${id}: ${p.fileKey}`);
  }
  if (bad) throw new Error(`${bad} deliverable(s) missing or out of date`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
