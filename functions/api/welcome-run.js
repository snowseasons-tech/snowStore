import { timingSafeEqual } from 'node:crypto';
import store from '../../api/_lib/store.js';
import mail from '../../api/_lib/mail.js';
import welcome from '../../api/_lib/welcome.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

// Sends the welcome-series emails that are due. Call it on a schedule (every 30 minutes is enough):
//   POST /api/welcome-run   with header  Authorization: Bearer <WELCOME_RUN_SECRET>
// Pages has no built-in cron, so the schedule lives outside the site. See marketing/christmas-2026/welcome-series.md.
export const onRequest = methodNotAllowed('POST');

const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function onRequestPost({ request, env }) {
  useEnv(env);
  const secret = String(env.WELCOME_RUN_SECRET || '');
  if (secret.length < 32) return send(503, { error: 'WELCOME_RUN_SECRET is not set to a strong value' });
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!same(given, secret)) return send(401, { error: 'Unauthorized' });
  if (!storeConfigured(env)) return send(503, { error: 'Persistent store not configured' });
  try {
    const counts = await welcome.runDue({ now: Date.now(), db: store, mailer: mail, env });
    return send(200, counts);
  } catch (e) {
    console.error('welcome-run', e.message);
    return send(500, { error: 'Welcome run failed' });
  }
}
