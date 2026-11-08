# Gift certificates (stage 5)

Status: **code only, not for sale.** `api/_lib/gift.js` holds the logic. Nothing calls it yet: there is no checkout product, no endpoint and no email.

## What is built

| Part | Where | Behaviour |
|---|---|---|
| Codes | `gift.js` `newCode` | `SNOW-2027-XXXX`, four characters from 31 (no 0/O, 1/I/L). Drawn with `crypto.randomInt`. Collisions are retried up to five times. |
| Creation | `createGift` | Gift one product that is on sale and has a download (or a bundle). Subscriptions, drafts, hidden and retired products are refused. No sales after Dec 31, 2027. |
| Expiry | `EXPIRES_AT` | Valid through the end of Dec 31, 2027, UTC. |
| Redemption | `redeemGift` | Single use. The first claim wins: a `setJSONIfAbsent` marker is atomic, so two simultaneous requests can't both succeed. Returns the product's downloads. |
| Certificate | `renderCertificate` | Printable HTML page. Buyer name and message are escaped. |

Tests: `tests/gift-certificates.test.js` (11 tests, including concurrent redemption and collision retries).

## Decisions to make

These were the questions in my last reply. Stage 5 doesn't answer them, so the choices below are defaults.

1. **Where codes are stored.** Default: the existing Upstash store, through `setJSONIfAbsent`. Codes have no expiry in the store, because the Dec 31, 2027 limit is checked in code.
2. **What a certificate is worth.** Default: one catalog product, not a dollar amount. A dollar value would need Stripe coupons or a credit balance, which is a bigger build.
3. **Whether certificates are sold through Stripe.** Not done. The purchase needs a hidden Stripe product for the gift, a webhook path that creates the certificate, and an email to the recipient. Recommended next step.
4. **PDF or HTML.** Default: HTML, which prints to PDF from the browser. A real PDF needs a generator dependency. The playbook says PDF.

## Not built yet

- Purchase flow: Stripe product, checkout, and creating the certificate from the paid session.
- Email: sending the certificate to the recipient (`mail.js` `sendMail` is available).
- Redeem endpoint: a Pages Function that calls `redeemGift`, then grants downloads. `api/_lib` is CommonJS; the Pages Functions in `functions/` are ESM, so the endpoint needs an ESM copy or a shared build step.
- Known gap: `redeemGift` writes the redemption marker first, then the record. If the record write fails, `checkGift` still reads the marker, so the code shows as used. The record can lag, but the marker is never lost. Records should be reconciled from markers if this ever matters.
