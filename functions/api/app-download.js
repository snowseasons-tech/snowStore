import CATALOG from '../../api/_lib/catalog.js';
import auth from '../../api/_lib/auth.js';
import store from '../../api/_lib/store.js';
import entitlements from '../../api/_lib/entitlements.js';
import crypto from 'node:crypto';
import { presignFromEnv } from '../../api/_lib/sigv4.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, nodeReq, storeConfigured } from '../_lib/env.js';

const URL_TTL_SEC = 120;
const MAX_PORTAL_DOWNLOADS = 10;
const PORTAL_DOWNLOAD_WINDOW_SEC = 60 * 60;

export const onRequest = methodNotAllowed('GET');

// Portal download: signed-in account + entitlement -> 2-minute signed URL to the private bucket.
export async function onRequestGet({ request, env }) {
  useEnv(env);
  const id = new URL(request.url).searchParams.get('product') || '';
  if (!Object.prototype.hasOwnProperty.call(CATALOG, id)) return send(404, { error: 'Unknown application' });
  try {
    if (!storeConfigured(env)) throw new Error('Persistent store not configured');
    const nodeRequest = nodeReq(request);
    const user = await auth.getSession(nodeRequest);
    if (!user) {
      const headers = auth.readToken(nodeRequest) ? { 'Set-Cookie': auth.clearCookie() } : undefined;
      return send(401, { error: 'Not signed in' }, headers);
    }
    if (!entitlements.accountIncludesProduct(user.products, id, CATALOG)) return send(403, { error: 'Your account does not include this application' });
    const p = CATALOG[id];
    if (!p.fileKey) return send(404, { error: 'Nothing to download for this application' });
    const location = presignFromEnv(p.fileKey, p.filename, env, URL_TTL_SEC);
    const accountKey = crypto.createHash('sha256').update(user.email).digest('hex');
    if ((await store.incr(`portal-dl:${accountKey}:${id}`, PORTAL_DOWNLOAD_WINDOW_SEC)) > MAX_PORTAL_DOWNLOADS) {
      return send(429, { error: 'Download limit reached. Try again later.' }, { 'Retry-After': String(PORTAL_DOWNLOAD_WINDOW_SEC) });
    }
    return send(302, '', { Location: location });
  } catch (e) {
    console.error('app-download', e.message);
    return send(500, { error: 'Download unavailable' });
  }
}
