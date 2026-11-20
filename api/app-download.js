const CATALOG = require('./_lib/catalog');
const auth = require('./_lib/auth');
const store = require('./_lib/store');
const { accountIncludesProduct } = require('./_lib/entitlements');
const { logAccess, logVersion } = require('./_lib/access-log');
const { presignFromEnv } = require('./_lib/sigv4');
const { send, allow } = require('./_lib/http');

const URL_TTL_SEC = 120;
const MAX_PORTAL_DOWNLOADS = 10;
const PORTAL_DOWNLOAD_WINDOW_SEC = 60 * 60;

// Portal download: signed-in account + entitlement -> 2-minute signed URL to the private bucket.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  const id = new URL(req.url, 'http://x').searchParams.get('product') || '';
  if (!Object.prototype.hasOwnProperty.call(CATALOG, id)) return send(res, 404, { error: 'Unknown application' });
  try {
    const user = await auth.getSession(req);
    if (!user) {
      const headers = auth.readToken(req) ? { 'Set-Cookie': auth.clearCookie() } : undefined;
      return send(res, 401, { error: 'Not signed in' }, headers);
    }
    if (!accountIncludesProduct(user.products, id, CATALOG)) return send(res, 403, { error: 'Your account does not include this application' });
    const p = CATALOG[id];
    if (!p.fileKey) return send(res, 404, { error: 'Nothing to download for this application' });
    const location = presignFromEnv(p.fileKey, p.filename, process.env, URL_TTL_SEC);
    const accountKey = require('crypto').createHash('sha256').update(user.email).digest('hex');
    if ((await store.incr(`portal-dl:${accountKey}:${id}`, PORTAL_DOWNLOAD_WINDOW_SEC)) > MAX_PORTAL_DOWNLOADS) {
      return send(res, 429, { error: 'Download limit reached. Try again later.' }, { 'Retry-After': String(PORTAL_DOWNLOAD_WINDOW_SEC) });
    }
    await logAccess(id);
    await logVersion(user.email, id, p.version);
    send(res, 302, '', { Location: location });
  } catch (e) {
    console.error('app-download', e.message);
    send(res, 500, { error: 'Download unavailable' });
  }
};
