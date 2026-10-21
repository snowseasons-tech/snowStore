// Stripe needs a distinct component per viewport; this reuses the Billing view on every other Dashboard page,
// including Billing overview when the Dashboard lands on /billing/collections instead of /billing.
export {default} from './Projection';
