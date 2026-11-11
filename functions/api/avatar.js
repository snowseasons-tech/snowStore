import CATALOG from '../../api/_lib/catalog.js';
import store from '../../api/_lib/store.js';
import avatar from '../../api/_lib/avatar.js';
import { send, methodNotAllowed, clientIp } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const MAX_PER_IP_HOUR = 30;
const OPENAI_URL = 'https://api.openai.com/v1/images/edits';
const TIMEOUT_MS = 100000;

export const onRequest = methodNotAllowed('GET, POST');

// A paid order for a product with avatarCredits. Returns { order, credits } or a Response to send back.
async function paidOrder(id, env) {
  if (!SESSION_RE.test(id)) return send(400, { error: 'Bad session' });
  if (!storeConfigured(env)) throw new Error('Persistent store not configured');
  const order = await store.getJSON(`order:${id}`);
  if (!order) return send(403, { error: 'No verified purchase for this session' });
  const p = avatar.has(CATALOG, order.productId) ? CATALOG[order.productId] : null;
  if (!p || !p.avatarCredits) return send(403, { error: 'This purchase does not include avatars' });
  return { credits: p.avatarCredits };
}

// Net credits used = successful runs claimed minus the ones given back when a run failed (the store has no DECR).
async function remaining(id, credits) {
  return credits - (await store.count(`avatar:used:${id}`)) + (await store.count(`avatar:back:${id}`));
}

// GET ?session_id= -> { styles, remaining, total }
export async function onRequestGet({ request, env }) {
  useEnv(env);
  try {
    const id = new URL(request.url).searchParams.get('session_id') || '';
    const found = await paidOrder(id, env);
    if (found instanceof Response) return found;
    return send(200, { styles: avatar.styleList(), remaining: Math.max(0, await remaining(id, found.credits)), total: found.credits });
  } catch (e) {
    console.error('avatar', e.message);
    return send(500, { error: 'Avatars are unavailable right now' });
  }
}

// POST multipart: session_id, style, photo -> { image: data URL, remaining }. The photo is held in memory for this
// request only; nothing is written to storage.
export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('multipart/form-data')) return send(415, { error: 'Expected a form upload' });
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > avatar.MAX_PHOTO_BYTES + 64 * 1024) return send(413, { error: 'Photo is too large (max 4 MB)' });
  let id = '';
  let reserved = false;
  try {
    if (!env.OPENAI_API_KEY) return send(503, { error: 'Avatar generation is not configured yet' });
    const form = await request.formData();
    id = String(form.get('session_id') || '');
    const found = await paidOrder(id, env);
    if (found instanceof Response) return found;
    const styleId = String(form.get('style') || '');
    if (!avatar.has(avatar.STYLES, styleId)) return send(400, { error: 'Choose one of the listed styles' });
    const file = form.get('photo');
    if (!file || typeof file === 'string' || !file.size) return send(400, { error: 'Attach a photo' });
    if (file.size > avatar.MAX_PHOTO_BYTES) return send(413, { error: 'Photo is too large (max 4 MB)' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = avatar.detectImage(bytes);
    if (!mime) return send(415, { error: 'Use a JPEG, PNG or WebP photo' });

    if ((await store.incr(`rl:avatar:ip:${clientIp(request)}`, 60 * 60)) > MAX_PER_IP_HOUR) return send(429, { error: 'Too many requests. Try again later.' });
    // Reserve a credit before the paid call; give it back below if the run fails.
    await store.incr(`avatar:used:${id}`);
    reserved = true;
    if ((await remaining(id, found.credits)) < 0) {
      await store.incr(`avatar:back:${id}`);
      reserved = false;
      return send(429, { error: 'You have used all the avatars in this pack' });
    }

    const out = new FormData();
    out.append('model', env.AVATAR_MODEL || 'gpt-image-1');
    out.append('prompt', avatar.STYLES[styleId].prompt);
    out.append('size', '1024x1024');
    out.append('n', '1');
    if (env.AVATAR_INPUT_FIDELITY) out.append('input_fidelity', env.AVATAR_INPUT_FIDELITY);
    out.append('image', new Blob([bytes], { type: mime }), `photo.${mime.split('/')[1]}`);
    const res = await fetch(OPENAI_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: out, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('avatar upstream', res.status, detail.slice(0, 300));
      await store.incr(`avatar:back:${id}`);
      reserved = false;
      // 400 from the image API is usually its content policy; say so without echoing its text back.
      if (res.status === 400) return send(422, { error: 'That photo could not be turned into an avatar. Try a clearer photo of one person. Your credit was not used.' });
      return send(502, { error: 'The avatar service is busy. Your credit was not used. Please try again.' });
    }
    const data = await res.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) throw new Error('no image in response');
    reserved = false;
    return send(200, { image: `data:image/png;base64,${b64}`, remaining: Math.max(0, await remaining(id, found.credits)) });
  } catch (e) {
    console.error('avatar', e.message);
    if (reserved) { try { await store.incr(`avatar:back:${id}`); } catch { /* best effort */ } }
    return send(500, { error: 'Could not make your avatar. Your credit was not used. Please try again.' });
  }
}
