import { pilotEnabled } from './lead-data.js';
export const testStripeKey = env => /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '') && env.ALLOW_LIVE !== '1';
export function pilotCheckoutEnabled(email, env) {
  return env.LEAD_WORKSPACE_SANDBOX_CHECKOUT === '1' && env.LEAD_WORKSPACE_BILLING_ENABLED === '1' &&
    env.LEAD_WORKSPACE_MAINTENANCE !== '1' && testStripeKey(env) && pilotEnabled(email, env) &&
    /^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET || '') &&
    /^price_[A-Za-z0-9]+$/.test(env.LEAD_WORKSPACE_SANDBOX_PRICE || '') &&
    /^prod_[A-Za-z0-9]+$/.test(env.LEAD_WORKSPACE_SANDBOX_PRODUCT || '');
}
export function billingProduct(env, fallback) {
  if (env.LEAD_WORKSPACE_SANDBOX_CHECKOUT !== '1') return fallback;
  if (!testStripeKey(env) || !/^prod_[A-Za-z0-9]+$/.test(env.LEAD_WORKSPACE_SANDBOX_PRODUCT || '')) throw Error('Invalid sandbox billing configuration');
  return env.LEAD_WORKSPACE_SANDBOX_PRODUCT;
}
