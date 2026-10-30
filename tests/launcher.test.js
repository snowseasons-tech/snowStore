const test = require('node:test');
const assert = require('node:assert');

const load = async () => ({ ...(await import('../launcher/src/apps.js')), ...(await import('../launcher/src/search.js')) });

test('every app has a known group and status, and only unfinished apps lack a link', async () => {
  const { APPS, GROUPS, STATUS } = await load();
  assert.strictEqual(new Set(APPS.map((a) => a.id)).size, APPS.length);
  for (const app of APPS) {
    assert.ok(GROUPS.includes(app.group), app.id);
    assert.ok(STATUS[app.status], app.id);
    assert.strictEqual(!app.url, app.status === 'building', app.id);
    if (app.url) assert.strictEqual(new URL(app.url).protocol, 'https:', app.id);
  }
});

test('search matches every word, and pinned apps come first', async () => {
  const { findApps, firstOpenable } = await load();
  const apps = [
    { id: 'a', name: 'Store', note: 'Shop', group: 'X' },
    { id: 'b', name: 'Mail Hub', note: 'Postcards', group: 'Y', keys: 'campaign' },
    { id: 'c', name: 'Mail Plan', note: 'Unfinished', group: 'Y' },
  ];
  assert.deepStrictEqual(findApps(apps, 'mail post', '').map((a) => a.id), ['b']);
  assert.deepStrictEqual(findApps(apps, 'CAMPAIGN', 'Y').map((a) => a.id), ['b']);
  assert.deepStrictEqual(findApps(apps, 'store', 'Y'), []);
  assert.deepStrictEqual(findApps(apps, '', '', ['c']).map((a) => a.id), ['c', 'a', 'b']);
  assert.strictEqual(firstOpenable([{ id: 'x' }, { id: 'y', url: 'https://y' }]).id, 'y');
});

test('recent apps stay unique and short', async () => {
  const { remember } = await load();
  assert.deepStrictEqual(remember(['a', 'b'], 'b'), ['b', 'a']);
  assert.deepStrictEqual(remember(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
});
