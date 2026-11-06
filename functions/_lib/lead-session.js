import auth from '../../api/_lib/auth.js';
import { nodeReq, storeConfigured } from './env.js';

// Request-scoped reads: never copy credentials into process.env or use a memory fallback.
export async function leadSession(request, env) {
  if (!storeConfigured(env)) throw new Error('Session store unavailable');
  let expiresAt;
  const store = {
    async getJSON(key) {
      const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', key]),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Session store unavailable');
      const payload = await response.json();
      if (payload.error) throw new Error('Session store unavailable');
      const value = payload.result ? JSON.parse(payload.result) : null;
      if (key.startsWith('sess:') && value) {
        if (!Number.isFinite(value.createdAt)) return null;
        expiresAt = value.createdAt + auth.SESSION_TTL_SEC * 1000;
        if (expiresAt <= Date.now() || value.createdAt > Date.now()) return null;
      }
      return value;
    },
  };
  const user = await auth.getSession(nodeReq(request), store);
  return user ? { email: user.email, expiresAt } : null;
}
