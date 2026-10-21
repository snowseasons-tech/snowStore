# SaaS Projection Engine (Stripe App)

A Stripe Dashboard drawer that projects MRR and ARR from the account's live subscriptions. It is the Stripe App version of the SaaS Financial Projection Engine workbook in `products/saas-financial-engine/`.

It opens on every Dashboard page (Stripe's default drawer viewport), and has its own views for the Billing overview, Subscriptions list and Dashboard home pages. The Billing overview view only applies at `/billing`; accounts where the Dashboard redirects that to `/billing/collections` get the default view there instead. It shows:
- Current MRR, ARR, active subscriptions and average revenue per account
- New MRR per month and monthly MRR churn, both from the last 90 days
- Lifetime value (revenue per account over churn)
- A 12 to 60 month MRR projection with Base, Upside and Downside lines. Upside and Downside use the workbook's multipliers: 25% more or less new MRR, 25% less or more churn.

Inputs: horizon, monthly growth of new MRR, and an optional churn override.

## What it reads
Read-only permissions: `subscription_read` and `plan_read`. It never writes to the account.

Not counted: trials (until they convert), discounts, taxes, metered or tiered prices, and subscriptions in other currencies than the main one. The drawer says when any of these were left out.

## Run it
Requires the Stripe CLI with the `apps` and `generate` plugins, Node 22+ and pnpm 10.

```bash
stripe login
stripe plugin install apps
pnpm install
stripe apps start
```

Then open the Billing or Subscriptions page in the Dashboard (use a sandbox first) and click **Continue** to preview the app.

Checks: `pnpm typecheck`, `pnpm test`, `pnpm lint`.

## Ship it
```bash
stripe apps upload
```
`distribution_type` is `private`, so only this account can install it. To list it on the Stripe App Marketplace, change it to `public` and submit for review in the Dashboard.
