const { createHash } = require('node:crypto');
const indexKey = email => 'lead-billing:v1:' + createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

// Catalog products whose subscriptions unlock the hosted lead workspace.
const WORKSPACE_PRODUCTS = ['lead-generation-pro', 'operations-lead-intelligence'];

// Called only after signature verification and paid/no-payment-required checkout validation.
// A set preserves concurrent/repeated purchases without overwriting an older subscription link.
async function linkCheckout(session, productId, store) {
  if (!WORKSPACE_PRODUCTS.includes(productId) || !session.subscription || !session.customer) return;
  const email = String(session.customer_details?.email || '').trim().toLowerCase();
  const pilotHash = session.livemode === false && session.metadata?.lead_workspace_pilot === '1' && /^[a-f0-9]{64}$/.test(session.metadata?.lead_account_hash || '') ? session.metadata.lead_account_hash : null;
  if ((!email && !pilotHash) || !/^sub_[A-Za-z0-9]+$/.test(session.subscription) || !/^cus_[A-Za-z0-9]+$/.test(session.customer)) return;
  await store.addMember(pilotHash ? 'lead-billing:v1:' + pilotHash : indexKey(email), JSON.stringify({ subscription: session.subscription, customer: session.customer }));
  return { email, pilot: Boolean(pilotHash) };
}
module.exports = { indexKey, linkCheckout, WORKSPACE_PRODUCTS };
