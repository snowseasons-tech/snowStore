const CATALOG = require('./_lib/catalog');
const store = require('./_lib/store');
const { downloadsFor, isMembership } = require('./_lib/entitlements');
const { presignFromEnv } = require('./_lib/sigv4');
const { send, allow } = require('./_lib/http');

const MAX_DOWNLOADS = 10;
const URL_TTL_SEC = 300;

// Verified purchase -> 5-minute signed URL to the private bucket. Files are never in the web root.
// ?product= picks one of a membership's included downloads; a single-file purchase doesn't need it.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  const params = new URL(req.url, 'http://x').searchParams;
  const id = params.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return send(res, 400, { error: 'Bad session' });
  try {
    const order = await store.getJSON(`order:${id}`);
    if (!order) return send(res, 403, { error: 'No verified purchase for this session' });
    const p = Object.prototype.hasOwnProperty.call(CATALOG, order.productId) ? CATALOG[order.productId] : null;
    if (!p) return send(res, 410, { error: 'This product is no longer available. Contact support.' });
    const downloads = downloadsFor(order.productId, CATALOG);
    const wanted = params.get('product');
    const file = wanted ? downloads.find((d) => d.id === wanted) : downloads.length === 1 ? downloads[0] : null;
    if (!downloads.length) return send(res, 404, { error: 'Nothing to download for this product' });
    if (!file) return send(res, wanted ? 404 : 400, { error: wanted ? 'That download is not part of this purchase' : 'Choose which download you want' });
    const membership = isMembership(p);
    if (membership && !order.subscriptionId) return send(res, 403, { error: 'Membership is not active' });
    if (order.subscriptionId) {
      const sub = await store.getJSON(`sub:${order.subscriptionId}`);
      if (!sub || !['active', 'trialing'].includes(sub.status)) return send(res, 403, { error: membership ? 'Membership is not active' : 'Subscription is not active' });
    }
    // Build the URL first and count last, so failed checks or bad config don't use up the allowance.
    // A membership counts each included download separately.
    const location = presignFromEnv(file.fileKey, file.filename, process.env, URL_TTL_SEC);
    if ((await store.incr(membership ? `dl:${id}:${file.id}` : `dl:${id}`)) > MAX_DOWNLOADS) return send(res, 429, { error: 'Download limit reached. Contact support.' });
    send(res, 302, '', { Location: location });
  } catch (e) {
    console.error('download', e.message);
    send(res, 500, { error: 'Download unavailable' });
  }
};
