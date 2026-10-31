// Monthly app usage counters in the store, plus each account's last downloaded version.
const crypto = require('node:crypto');
const store = require('./store');

const KEEP_SEC = 400 * 24 * 60 * 60;
const key = (month, app, action) => `access:${month}:${app}:${action}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

// Analytics must never cost a customer their download, so a store failure is only logged.
async function logAccess(app, action = 'download') {
  try {
    await store.incr(key(thisMonth(), app, action), KEEP_SEC);
  } catch (e) {
    console.error('access-log', e.message);
  }
}
// Which version each account last downloaded, so updates can be offered later. The key holds a hash, not the email.
const versionKey = (email, app) => `app-version:${crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')}:${app}`;
async function logVersion(email, app, version) {
  try {
    const seen = await store.getJSON(versionKey(email, app));
    const now = new Date().toISOString();
    const updatedAt = !seen || seen.version !== version ? now : seen.updatedAt;
    await store.setJSON(versionKey(email, app), { version: version || null, firstAt: seen?.firstAt || now, updatedAt, lastAt: now });
  } catch (e) {
    console.error('access-log', e.message);
  }
}
const lastVersion = (email, app) => store.getJSON(versionKey(email, app));
const accessCount = (app, action = 'download', month = thisMonth()) => store.count(key(month, app, action));

module.exports = { logAccess, accessCount, logVersion, lastVersion };
