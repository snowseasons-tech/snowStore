import auth from '../../api/_lib/auth.js';
import store from '../../api/_lib/store.js';
import { presignFromEnv } from '../../api/_lib/sigv4.js';
import { send, methodNotAllowed, clientIp } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

// The free Landing Page Kit lives in the private bucket (upload products/free-landing-page/index.html to fileKey).
const KIT = { fileKey: 'landing-page-kit/landing-page.html', filename: 'landing-page.html' };
const URL_TTL_SEC = 300;
// Caps junk signups from one source; each one also mints a download URL.
const MAX_PER_IP_HOUR = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequest = methodNotAllowed('POST');

// Email signup for the free kit: POST {email} records subscriber:<email> and returns a 5-minute signed URL.
export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return send(415, { error: 'Expected JSON' });
  try {
    let body = {};
    try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
    const email = auth.normEmail(body.email);
    if (email.length > 254 || !EMAIL_RE.test(email)) return send(400, { error: 'Enter a valid email address' });
    if (!storeConfigured(env)) throw new Error('Persistent store not configured');
    if ((await store.incr(`rl:kit:ip:${clientIp(request)}`, 60 * 60)) > MAX_PER_IP_HOUR) return send(429, { error: 'Too many requests. Try again later.' });
    const url = presignFromEnv(KIT.fileKey, KIT.filename, env, URL_TTL_SEC);
    if (!(await store.getJSON(`subscriber:${email}`))) await store.setJSON(`subscriber:${email}`, { email, source: 'landing-page-kit', subscribedAt: Date.now() });
    return send(200, { url });
  } catch (e) {
    console.error('kit', e.message);
    return send(500, { error: 'Download unavailable. Please try again.' });
  }
}
