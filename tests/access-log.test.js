const test = require('node:test');
const assert = require('node:assert');
const store = require('../api/_lib/store');
const { logAccess, accessCount, logVersion, lastVersion } = require('../api/_lib/access-log');

test('app access is counted per app and action', async () => {
  await logAccess('app-a');
  await logAccess('app-a');
  await logAccess('app-a', 'view');
  assert.strictEqual(await accessCount('app-a'), 2);
  assert.strictEqual(await accessCount('app-a', 'view'), 1);
  assert.strictEqual(await accessCount('app-b'), 0);
});

test('a store failure never reaches the download', async (t) => {
  t.mock.method(store, 'incr', async () => { throw new Error('down'); });
  t.mock.method(console, 'error', () => {});
  await assert.doesNotReject(logAccess('app-a'));
});

test('the last version is kept per account and app, and updatedAt moves only on a new version', async () => {
  await logVersion('A@example.com', 'app-v', '1.0.0');
  const first = await lastVersion('a@example.com', 'app-v');
  assert.strictEqual(first.version, '1.0.0');
  await logVersion('a@example.com', 'app-v', '1.0.0');
  assert.strictEqual((await lastVersion('a@example.com', 'app-v')).updatedAt, first.updatedAt);
  await new Promise((r) => setTimeout(r, 5));
  await logVersion('a@example.com', 'app-v', '1.1.0');
  const next = await lastVersion('a@example.com', 'app-v');
  assert.strictEqual(next.version, '1.1.0');
  assert.notStrictEqual(next.updatedAt, first.updatedAt);
  assert.strictEqual(next.firstAt, first.firstAt);
  assert.strictEqual(await lastVersion('b@example.com', 'app-v'), null);
});
