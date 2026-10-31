const test = require('node:test');
const assert = require('node:assert');
const store = require('../api/_lib/store');
const { logAccess, accessCount } = require('../api/_lib/access-log');

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
