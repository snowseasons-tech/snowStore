import gift from '../../api/_lib/gift.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

// Redeems a gift code once: POST {code, email}. Returns the product and the download links to fetch.
export const onRequest = methodNotAllowed('POST');

export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return send(415, { error: 'Expected JSON' });
  let body = {};
  try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
  if (!storeConfigured(env)) return send(503, { error: 'Persistent store not configured' });
  const code = gift.normalize(body.code);
  try {
    const { gift: rec, downloads } = await gift.redeemGift(body.code, body.email);
    return send(200, {
      productName: rec.productName,
      code,
      files: downloads.map((d) => ({ id: d.id, name: d.name })),
    });
  } catch (e) {
    if (e instanceof gift.GiftError) return send(400, { error: e.message });
    console.error('gift-redeem', e.message);
    return send(500, { error: 'Could not redeem this code. Try again or contact support.' });
  }
}
