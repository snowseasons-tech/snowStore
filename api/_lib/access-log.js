// Monthly app usage counters in the store. Counts only: no member ids or emails.
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
const accessCount = (app, action = 'download', month = thisMonth()) => store.count(key(month, app, action));

module.exports = { logAccess, accessCount };
