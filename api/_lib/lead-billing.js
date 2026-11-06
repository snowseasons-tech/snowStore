const { createHash } = require('node:crypto');
const indexKey = email => 'lead-billing:v1:' + createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

// Called only after signature verification and paid/no-payment-required checkout validation.
// A set preserves concurrent/repeated purchases without overwriting an older subscription link.
async function linkCheckout(session, productId, store) {
  if (productId !== 'lead-generation-pro' || !session.subscription || !session.customer) return;
  const email = String(session.customer_details?.email || '').trim().toLowerCase();
  if (!email || !/^sub_[A-Za-z0-9]+$/.test(session.subscription) || !/^cus_[A-Za-z0-9]+$/.test(session.customer)) return;
  await store.addMember(indexKey(email), JSON.stringify({ subscription: session.subscription, customer: session.customer }));
}
module.exports = { indexKey, linkCheckout };
