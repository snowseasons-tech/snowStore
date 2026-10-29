// Transactional email via Resend's REST API (no dependency). Skips cleanly if not configured.
async function sendMail({ to, subject, text }, env = process.env, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return 'skipped';
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`mail ${r.status}`);
  return 'sent';
}
// Where shop notices (new orders, getting-started forms) go: ORDER_NOTIFY_EMAIL, else the public contact address.
const notifyAddress = (env = process.env) => env.ORDER_NOTIFY_EMAIL || 'info@snowseasonstech.net';
module.exports = { sendMail, notifyAddress };
