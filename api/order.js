const CATALOG = require('./_lib/catalog');
const store = require('./_lib/store');
const { downloadsFor, isMembership } = require('./_lib/entitlements');
const { send, allow } = require('./_lib/http');

// Success page polls this. "ready" comes only from the webhook-written order, not the redirect.
module.exports = async (req, res) => {
  if (!allow(req, res, 'GET')) return;
  const id = new URL(req.url, 'http://x').searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return send(res, 400, { error: 'Bad session' });
  try {
    const order = await store.getJSON(`order:${id}`);
    if (!order) return send(res, 200, { ready: false });
    const p = Object.prototype.hasOwnProperty.call(CATALOG, order.productId) ? CATALOG[order.productId] : null;
    if (!p) return send(res, 410, { error: 'This product is no longer available. Contact support.' });
    // downloads lists what the page offers: one item for a downloadable product, one per included product for a membership.
    const downloads = downloadsFor(order.productId, CATALOG).map(({ id: product, name }) => ({ product, name }));
    send(res, 200, { ready: true, product: p.name, download: downloads.length > 0, downloads, membership: isMembership(p), appUrl: p.appUrl || null, manage: !!order.customer && !!order.subscriptionId });
  } catch (e) {
    console.error('order', e.message);
    send(res, 500, { error: 'Lookup failed' });
  }
};
