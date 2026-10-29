import CATALOG from '../../api/_lib/catalog.js';
import store from '../../api/_lib/store.js';
import mail from '../../api/_lib/mail.js';
import { send, methodNotAllowed } from '../_lib/http.js';
import { useEnv, storeConfigured } from '../_lib/env.js';

// Getting-started form (start.html): a paying customer tells us what we need to begin their service.
// Only works for a real, webhook-recorded order; the details are saved and emailed to the shop.
const FIELDS = {
  business: { label: 'Business name', max: 200, required: true },
  name: { label: 'Contact name', max: 200, required: true },
  phone: { label: 'Phone', max: 50 },
  contactTime: { label: 'Best time to reach them', max: 200 },
  website: { label: 'Website', max: 500 },
  social: { label: 'Social media accounts', max: 2000 },
  goals: { label: 'What they want to achieve', max: 4000 },
  brand: { label: 'Brand notes (colors, tone, logo link)', max: 4000 },
  access: { label: 'Systems we will need access to', max: 2000 },
  notes: { label: 'Anything else', max: 4000 },
};
const MAX_PER_ORDER_HOUR = 5;

export const onRequest = methodNotAllowed('POST');

export async function onRequestPost({ request, env }) {
  useEnv(env);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return send(415, { error: 'Expected JSON' });
  try {
    let body = {};
    try { body = JSON.parse((await request.text()) || '{}'); } catch { return send(400, { error: 'Bad JSON' }); }
    const id = String(body.session_id || '');
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return send(400, { error: 'Missing order reference' });

    const answers = {};
    for (const [key, f] of Object.entries(FIELDS)) {
      const v = typeof body[key] === 'string' ? body[key].trim() : '';
      if (f.required && !v) return send(400, { error: `${f.label} is required` });
      if (v.length > f.max) return send(400, { error: `${f.label} is too long` });
      if (v) answers[key] = v;
    }

    if (!storeConfigured(env)) throw new Error('Persistent store not configured');
    const order = await store.getJSON(`order:${id}`);
    if (!order) return send(404, { error: 'We could not find that order. Use the link from your order email.' });
    if ((await store.incr(`rl:intake:${id}`, 60 * 60)) > MAX_PER_ORDER_HOUR) return send(429, { error: 'Too many submissions. Try again later.' });

    const product = Object.prototype.hasOwnProperty.call(CATALOG, order.productId) ? CATALOG[order.productId].name : order.productId;
    await store.setJSON(`intake:${id}`, { ...answers, productId: order.productId, email: order.email || null, submittedAt: Date.now() });
    await mail.sendMail({
      to: mail.notifyAddress(),
      subject: `Getting started: ${answers.business} (${product})`,
      text: `${answers.name} filled in the getting-started form.\n\nProduct: ${product}\nCustomer email: ${order.email || 'not on the order'}\n\n`
        + Object.entries(FIELDS).filter(([k]) => answers[k]).map(([k, f]) => `${f.label}:\n${answers[k]}`).join('\n\n')
        + `\n\nStripe checkout session: ${id}\n`,
    });
    return send(200, { ok: true });
  } catch (e) {
    console.error('intake', e.message);
    return send(500, { error: 'Could not send your details. Please try again or email info@snowseasonstech.net.' });
  }
}
