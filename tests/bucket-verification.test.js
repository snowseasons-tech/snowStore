const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyUploads } = require('../scripts/verify-uploads');

const env = {
  S3_ENDPOINT: 'https://r2.example.com',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

test('bucket verification accepts matching content and reports missing hashes', async () => {
  const body = Buffer.from('verified deliverable');
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const catalog = {
    valid: { fileKey: 'valid/file.zip', filename: 'file.zip', sha256: sha },
    missingHash: { fileKey: 'missing/file.zip', filename: 'file.zip' },
  };
  const result = await verifyUploads(catalog, env, async (url) => {
    assert.match(url, /\/bucket\/valid\/file\.zip\?/);
    return new Response(body);
  });
  assert.equal(result.bad, 1);
  assert.deepEqual(result.failures, ['FAIL missingHash: missing or invalid catalog sha256']);
});

test('bucket verification reports HTTP and SHA mismatches', async () => {
  const catalog = {
    missing: { fileKey: 'missing/file.zip', filename: 'file.zip', sha256: 'a'.repeat(64) },
    changed: { fileKey: 'changed/file.zip', filename: 'file.zip', sha256: 'b'.repeat(64) },
  };
  const result = await verifyUploads(catalog, env, async (url) => {
    if (url.includes('/missing/')) return new Response('', { status: 404 });
    return new Response('new contents');
  });
  assert.equal(result.bad, 2);
  assert.ok(result.failures.some((failure) => failure.includes('HTTP 404')));
  assert.ok(result.failures.some((failure) => failure.includes('sha256') && failure.includes('!= catalog')));
});
