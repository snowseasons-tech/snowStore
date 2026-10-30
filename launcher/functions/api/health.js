// GET /api/health  ->  { up: {id: true|false} } for the apps we run ourselves. Any answer below 500 counts as up,
// because sign-in pages redirect or refuse. Third-party accounts aren't checked.
import { APPS } from '../../src/apps.js';

const OWN = /(^|\.)(snowseasonstech\.(store|net)|americantreeserviceco\.com)$/;

async function isUp(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function onRequestGet() {
  const apps = APPS.filter((app) => app.url && OWN.test(new URL(app.url).hostname));
  const results = await Promise.all(apps.map((app) => isUp(app.url)));
  const up = Object.fromEntries(apps.map((app, i) => [app.id, results[i]]));
  return new Response(JSON.stringify({ up }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' } });
}
