const defaultCatalog = require('./catalog');
const { downloadsFor } = require('./entitlements');
const store = require('./store');
const mail = require('./mail');
const { linkCheckout } = require('./lead-billing');
const welcome = require('./welcome');

const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const SUB_EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']);
const INVOICE_EVENTS = new Set(['invoice.paid', 'invoice.payment_failed']);
const DAY = 60 * 60 * 24;
// A claim starts as a short lease and becomes a 90-day "done" marker only after the work succeeds. If the
// function is killed or the release fails, the lease simply expires and a later Stripe retry does the work.
const LEASE_SEC = 10 * 60;
const DONE = 'done';

// Takes the key: 'claimed', 'done' (already finished), or throws while another attempt holds the lease
// (a 500 makes Stripe retry later instead of treating the event as handled).
async function claimOnce(s, key) {
  if (await s.claim(key, LEASE_SEC)) return 'claimed';
  if ((await s.getJSON(key)) === DONE) return DONE;
  throw new Error(`${key} is being processed`);
}
const markDone = (s, key) => s.setJSON(key, DONE, 90 * DAY);

// Idempotent: each Stripe event id is processed once; failures release the claim so Stripe retries.
async function handleEvent(event, deps = {}) {
  const s = deps.store || store;
  const catalog = deps.catalog || defaultCatalog;
  const mailer = deps.mail || mail;
  if (!CHECKOUT_EVENTS.has(event.type) && !SUB_EVENTS.has(event.type) && !INVOICE_EVENTS.has(event.type)) return 'ignored';

  const claimKey = `evt:${event.id}`;
  if ((await claimOnce(s, claimKey)) === DONE) return 'duplicate';
  try {
    const result = await processEvent(event, s, catalog, mailer);
    await markDone(s, claimKey);
    return result;
  } catch (e) {
    await s.release(claimKey).catch(() => {}); // if this fails too, the lease expires on its own
    throw e;
  }
}

async function processEvent(event, s, catalog, mailer) {
  if (SUB_EVENTS.has(event.type)) return applySubscription(event, s);
  if (INVOICE_EVENTS.has(event.type)) {
    const invoice = event.data.object;
    await s.setJSON(`billing-notice:${event.id}`, { invoice: invoice.id, type: event.type, created: event.created }, 90 * DAY);
    return 'invoice-recorded'; // Access is checked against current Stripe state, never this event snapshot.
  }

  const session = event.data.object;
  // 'no_payment_required' covers free trials on subscriptions; async methods wait for async_payment_succeeded.
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return 'unpaid';
  const productId = session.metadata && session.metadata.product_id;
  const product = Object.prototype.hasOwnProperty.call(catalog, productId) ? catalog[productId] : null;
  if (!product) throw new Error(`unknown product ${productId}`);

  const email = (session.customer_details && session.customer_details.email) || null;
  await s.setJSON(`order:${session.id}`, {
    productId, email, paidAt: Date.now(),
    customer: session.customer || null,
    subscriptionId: session.subscription || null,
  });
  if (session.subscription) {
    const existing = await s.getJSON(`sub:${session.subscription}`);
    await s.setJSON(`sub:${session.subscription}`, { status: 'active', productId, email, customer: session.customer || null, ...(existing || {}) });
  }

  const leadLink = await linkCheckout(session, productId, s);
  const leadPortal = leadLink && !leadLink.pilot && !product.draft && !product.hidden && !product.retired
    && leadLink.email.includes('@') && leadLink.email.length <= 254;
  if (leadPortal) await s.setJSONIfAbsent(`user:${leadLink.email}`, { hash: null, products: [] });

  // Email the order page link (it mints a fresh 5-minute download URL each visit). Sent once per order.
  let mailed = 'no-email';
  const mailKey = `mail:${session.id}`;
  if (email && (await claimOnce(s, mailKey)) === 'claimed') {
    try {
      mailed = await mailer.sendMail({
        to: leadPortal ? leadLink.email : email,
        subject: `Your ${product.name} purchase`,
        // Downloadable products and memberships get the order page; services get the getting-started form.
        text: downloadsFor(productId, catalog).length
          ? `Thanks for your purchase of ${product.name}.\n\nGet your download${Array.isArray(product.includes) ? 's' : ''} or manage your order here:\n${process.env.SITE_URL}/success?session_id=${session.id}\n\nKeep this email: the link always gives you a fresh download.`
            + (leadPortal ? `\n\nOpen the customer portal at ${process.env.SITE_URL}/storefront/portal. Sign in with the email you used at Checkout. If you need to set a password, select Forgot password? and request a link at that email. After signing in, select Open lead workspace.` : '')
            + '\n\nSnow Seasons Tech'
          : `Thanks for your purchase of ${product.name}.\n\nView or manage your order here:\n${process.env.SITE_URL}/success?session_id=${session.id}\n\nTo get started, tell us about your business here:\n${process.env.SITE_URL}/start?session_id=${session.id}\n\nWe'll be in touch shortly.\n\nSnow Seasons Tech`,
      });
    } catch (e) {
      await s.release(mailKey).catch(() => {});
      throw e;
    }
    await markDone(s, mailKey);
  }

  // Record the welcome series (emails 2 and 3, sent later by welcome-run). A problem here must not fail the purchase.
  try {
    await welcome.schedule(s, session.id, {
      email: leadPortal ? leadLink.email : email, productId, productName: product.name, product, catalog,
      siteUrl: process.env.SITE_URL, now: Date.now(),
    });
  } catch (e) {
    console.error('welcome schedule', session.id, e.message);
  }

  // Tell the shop about the new order (see mail.notifyAddress). Sent once per order.
  const notifyKey = `notify:${session.id}`;
  if ((await claimOnce(s, notifyKey)) === 'claimed') {
    try {
      await mailer.sendMail({
        to: mail.notifyAddress(),
        subject: `New order: ${product.name}`,
        text: orderSummary(session, product, email),
      });
    } catch (e) {
      await s.release(notifyKey).catch(() => {});
      throw e;
    }
    await markDone(s, notifyKey);
  }
  return `fulfilled:${mailed}`;
}

const PERIOD_NAMES = { '1w': 'weekly', '3m': 'every 3 months', '6m': 'every 6 months', '12m': 'yearly' };
function orderSummary(session, product, email) {
  const money = session.amount_total == null ? 'see Stripe'
    : `${(session.amount_total / 100).toFixed(2)} ${String(session.currency || '').toUpperCase()}`;
  const period = session.metadata && session.metadata.period;
  const billing = session.subscription ? `subscription, billed ${PERIOD_NAMES[period] || 'monthly'}` : 'one-time';
  const name = (session.customer_details && session.customer_details.name) || '-';
  return `New order on ${process.env.SITE_URL || 'the store'}\n\n`
    + `Product: ${product.name}\nBilling: ${billing}\nPaid today: ${money}\n`
    + `Customer: ${name} <${email || 'no email'}>\n\n`
    + `Stripe checkout session: ${session.id}\n${session.subscription ? `Subscription: ${session.subscription}\n` : ''}`
    + `\nOrder page: ${process.env.SITE_URL}/success?session_id=${session.id}\n`
    + (product.fileKey ? '' : `The customer has been asked to fill in the getting-started form; you'll get a separate email when they do.\n`);
}

// Keeps subscription status current; ignores events older than the last one applied.
// Canceled is terminal in Stripe, so a late or same-second update can never bring a subscription back.
async function applySubscription(event, s) {
  const sub = event.data.object;
  const existing = await s.getJSON(`sub:${sub.id}`);
  if (existing && existing.lastEventAt && existing.lastEventAt > event.created) return 'stale';
  if (existing && existing.status === 'canceled' && event.type !== 'customer.subscription.deleted') return 'stale';
  const item = sub.items && sub.items.data && sub.items.data[0];
  await s.setJSON(`sub:${sub.id}`, {
    ...(existing || {}),
    productId: (existing && existing.productId) || (sub.metadata && sub.metadata.product_id) || null,
    customer: sub.customer,
    status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    currentPeriodEnd: (item && item.current_period_end) || sub.current_period_end || null,
    lastEventAt: event.created,
  });
  return 'subscription-updated';
}
module.exports = { handleEvent };
