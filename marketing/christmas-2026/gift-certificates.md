# Gift certificates (stage 5)

Status: **built end to end, with a buy button.** Products that can be given show a "Give as a gift" button on `products.html`, and on the homepage when a homepage product can be given. Today every homepage product is a service, so the button shows only on `products.html`, for Auto Scheduler and other one-time downloads. Gifts take real payments once the store is live, so check Stripe test mode first.

## How a gift works

1. **Buy.** Checkout (`api/checkout.js`, `functions/api/checkout.js`) accepts a `gift` object with `buyerName`, `recipientEmail` and an optional `message` (up to 500 characters). The buyer pays the product's own one-time price, so no separate Stripe product is needed. The gift details go into the Stripe session metadata. Subscriptions, non-`1m` periods and invalid details are refused before Stripe is called. Success returns to `/gift.html?purchased=1`.
2. **Certificate and emails.** The paid webhook (`fulfil.js` → `gift.fulfilGiftSession`) creates one certificate per session and emails the recipient the code and a link to `/gift.html?code=…`. The buyer gets a copy. The buyer gets **no order and no download**. Redeliveries of the same session reuse the same certificate and send nothing new. If mail isn't configured, the webhook fails so Stripe retries.
3. **Redeem.** `/gift.html` posts the code and an email to `functions/api/gift-redeem.js`. The code is marked used by an atomic marker, so two simultaneous redemptions can't both succeed. The page then shows a download link for each file.
4. **Download.** `functions/api/gift-download.js` serves signed links (5-minute expiry) for a redeemed code. The code can fetch files again until the 10-download limit is reached. Links are checked against a per-code access record, so an unredeemed code gets nothing.

## What is built

| Part | Where | Behaviour |
|---|---|---|
| Codes | `gift.js` `newCode` | `SNOW-2027-XXXX`, four characters from 31 (no 0/O, 1/I/L). `crypto.randomInt`. Up to five tries if a code is taken. |
| Gift details | `validateGiftInput`, `giftMetadata` | Shared by checkout and the certificate, so the rules match. |
| Creation | `createGift` | Products on sale with a download (or a bundle). Subscriptions, drafts, hidden and retired products are refused. No new certificates after Dec 31, 2027. |
| Expiry | `EXPIRES_AT` | End of Dec 31, 2027, UTC. |
| Redemption | `redeemGift` | Single use. Writes a marker, a redeemed record and an access record. |
| Webhook | `fulfilGiftSession` | One certificate per paid session. Two emails, each sent once. |
| Certificate page | `renderCertificate` | Printable HTML. User text is escaped. |
| Redeem page | `gift.html` | Prefills the code from the URL. Shows download links after redemption. |

## Tests

- `tests/gift-certificates.test.js`: codes, creation rules, single use, concurrent redemption, expiry, collision retries, certificate escaping.
- `tests/gift-flow.test.js`: webhook creates and emails once, redelivery is safe, a failed mail is retried, redemption and download limit, no-store refusal. Uses the fake Redis.
- `tests/gift-checkout.test.js`: checkout metadata, refusals for subscriptions and bad details.
- The redeem page was checked in a browser at 390px and 1280px with the API mocked.

## Known gaps

- **Legacy `api/checkout.js`** has the same gift code as the Pages Function, but no test covers it. Only the Pages Function is tested.
- **Orphan certificate on a race.** If two deliveries of one session both create a certificate at the same moment, the loser's code is never sent. It stays unused and harmless.
- **Access record.** `redeemGift` writes the access record after the marker. If that write fails, the code shows as used, but the download link fails until the access record is written. Repair by hand from the marker.
- **Refunds.** A refunded gift still works. Stripe refund events aren't handled.
- **PDF.** The certificate is an HTML page that prints to PDF from the browser. A real PDF needs a generator dependency.
- **Redemption email.** Redemption doesn't send a confirmation email.

## Decisions taken

These were open questions. The defaults are in place; change them if you disagree.

1. **Storage:** the existing Upstash store. Codes don't expire in storage; the Dec 31, 2027 limit is checked in code.
2. **Value:** one catalog product, not a dollar amount. A dollar value would need Stripe coupons or a credit balance.
3. **Sale:** through Stripe, using the product's own price. Not on sale until the buy button exists and you decide to open it.
4. **Format:** HTML that prints to PDF.
