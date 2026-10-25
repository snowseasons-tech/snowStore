import { createHash } from 'node:crypto';
import auth from '../../api/_lib/auth.js';
import store from '../../api/_lib/store.js';
import mail from '../../api/_lib/mail.js';
import { send, methodNotAllowed, clientIp } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

const MAX_PER_IP_HOUR = 10;
const RESEND_GAP_SEC = 60;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const DONE = { sent: true, message: 'If that email has an account, a link to set a new password is on its way.' };

export const onRequest = methodNotAllowed('POST');

// Forgotten password: POST {email} emails a 1-hour set-password link. The reply is the same whether or not the
// account exists, so this can't be used to find out who has one.
export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return send(415, { error: 'Expected JSON' });
  try {
    let body = {};
    try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
    const email = auth.normEmail(body.email);
    if (!email || email.length > 254 || !email.includes('@')) return send(400, { error: 'Enter your email address' });
    if (!storeConfigured(env)) throw new Error('Persistent store not configured');
    if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.SITE_URL) return send(503, { error: 'Password reset is unavailable. Contact support.' });
    if ((await store.incr(`rl:pwreset:ip:${clientIp(request)}`, 60 * 60)) > MAX_PER_IP_HOUR) return send(429, { error: 'Too many requests. Try again later.' });
    // One email per address per minute; repeats inside the gap get the same reply without sending.
    if (!(await store.claim(`pwresetmail:${sha256(email)}`, RESEND_GAP_SEC))) return send(200, DONE);

    const user = await store.getJSON(`user:${email}`);
    if (user) {
      const token = await auth.createPasswordLink(email, user, auth.RESET_TTL_SEC);
      await mail.sendMail(auth.passwordLinkMail(email, token, {}, env), env);
    }
    return send(200, DONE);
  } catch (e) {
    console.error('password-reset', e.message);
    return send(500, { error: 'Could not send the reset email. Please try again.' });
  }
}
