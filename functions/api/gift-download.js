import CATALOG from '../../api/_lib/catalog.js';
import store from '../../api/_lib/store.js';
import gift from '../../api/_lib/gift.js';
import entitlements from '../../api/_lib/entitlements.js';
import { presignFromEnv } from '../../api/_lib/sigv4.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

// Signed download for a redeemed gift code: GET ?code=SNOW-2027-XXXX[&product=<file id>].
// The link lasts 5 minutes, but the code can fetch files again until the download limit is used up.
const MAX_DOWNLOADS = 10;
const URL_TTL_SEC = 300;
const COUNTER_TTL_SEC = 400 * 24 * 60 * 60;

export const onRequest = methodNotAllowed('GET');

export async function onRequestGet({ request, env }) {
  useEnv(env);
  if (!storeConfigured(env)) return send(503, { error: 'Persistent store not configured' });
  const params = new URL(request.url).searchParams;
  const code = gift.normalize(params.get('code'));
  if (!code) return send(400, { error: 'Enter a valid code' });
  const access = await store.getJSON(`gift-access:${code}`);
  if (!access) return send(403, { error: 'This code has not been redeemed' });
  const downloads = entitlements.downloadsFor(access.productId, CATALOG);
  if (!downloads.length) return send(404, { error: 'Nothing to download for this gift' });
  const wanted = params.get('product');
  const file = wanted ? downloads.find((d) => d.id === wanted) : downloads.length === 1 ? downloads[0] : null;
  if (!file) return send(wanted ? 404 : 400, { error: wanted ? 'That download is not part of this gift' : 'Choose which download you want' });
  // Build the link first and count last, so a failed check doesn't use up the allowance.
  const location = presignFromEnv(file.fileKey, file.filename, process.env, URL_TTL_SEC);
  if ((await store.incr(`gdl:${code}:${file.id}`, COUNTER_TTL_SEC)) > MAX_DOWNLOADS) return send(429, { error: 'Download limit reached. Contact support.' });
  return send(302, '', { Location: location });
}
