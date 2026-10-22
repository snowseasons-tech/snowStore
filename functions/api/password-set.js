import auth from '../../api/_lib/auth.js';
import store from '../../api/_lib/store.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

export const onRequest = methodNotAllowed('POST');

// Redeems a set-password link: POST {token, password} saves the new password, ends the account's other sessions
// (they are tied to the old hash) and signs this browser in.
export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return send(415, { error: 'Expected JSON' });
  try {
    let body = {};
    try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < auth.PASSWORD_MIN || password.length > 256) return send(400, { error: `Use at least ${auth.PASSWORD_MIN} characters` });
    if (!storeConfigured(env)) throw new Error('Persistent store not configured');
    const email = await auth.setPasswordFromLink(body.token, password);
    if (!email) return send(410, { error: 'This link has expired or was already used. Request a new one.' });
    const token = await auth.createSession(email, await store.getJSON(`user:${email}`));
    return send(200, { email }, { 'Set-Cookie': auth.sessionCookie(token) });
  } catch (e) {
    console.error('password-set', e.message);
    return send(500, { error: 'Could not set the password. Please try again.' });
  }
}
