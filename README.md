# micro-saas-site

Storefront for [Snow Seasons Technologies](https://snowseasonstech.store): a static site plus Cloudflare Pages Functions that sell digital products through Stripe Checkout, deliver files from a private S3/R2 bucket, and run a small customer portal.

## How it works

1. A buyer picks a product on the site. `/api/checkout` creates a Stripe Checkout session using a price ID held in server env (never from the browser).
2. Stripe calls `/api/webhook`. The signature is verified and the order is recorded in Upstash Redis. Each event is handled once. The buyer is emailed a link to their order page.
3. The order page (`/success`) polls `/api/order` and offers a download. `/api/download` checks the order and redirects to a 5-minute signed URL in the private bucket (10 downloads per order).
4. Subscribers manage billing from the order page: `/api/portal` emails them a 30-minute link to the Stripe billing portal.
5. Customers with an account (created by an admin) can sign in at the portal and download the apps they're entitled to.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `privacy.html`, `terms.html`, `refund.html`, `success.html`, `cancel.html`, `page.css` | Public site pages |
| `storefront/` | Customer portal (`portal.html`, `portal.js`, `styles.css`) at `/storefront/portal.html` |
| `functions/` | Cloudflare Pages Functions that serve `/api/*` in production (one file per endpoint) |
| `api/` | Original Vercel-style handlers; kept because `functions/` reuses `api/_lib/` |
| `api/_lib/` | Shared helpers: catalog, Stripe, store (Upstash/in-memory), auth, mail (Resend), fulfilment, SigV4 presigning |
| `pages/_headers` | Security headers for static files (copied into `dist/` by the build) |
| `scripts/` | Admin scripts: `upload.js` (put a deliverable in the bucket), `add-user.js` (create or update a portal account), `bloat-scan.js` (repo bloat report) |
| `tests/` | `node:test` suite |
| `products/` | Source for the products being sold. Not deployed (`scripts/build-pages.js` publishes only an allowlist); deliverables go to the private bucket |

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/products` | GET | Product names and prices (from Stripe) |
| `/api/checkout` | POST | Create a Checkout session for `{ productId }` |
| `/api/webhook` | POST | Stripe webhook (raw body, signature verified) |
| `/api/order` | GET | `?session_id=` order status for the success page |
| `/api/download` | GET | `?session_id=` signed download URL for a verified order |
| `/api/portal` | POST / GET | POST `{ session_id }` emails a billing portal link; GET `?t=` opens it |
| `/api/login`, `/api/logout`, `/api/me` | POST / POST / GET | Customer portal sign-in (JSON only, `HttpOnly; SameSite=Strict` cookie) |
| `/api/password-reset`, `/api/password-set` | POST / POST | Forgotten password: emails a 1-hour set-password link; redeeming it saves the password and signs in |
| `/api/app-download` | GET | `?product=` signed download for a signed-in, entitled account |
| `/api/kit` | POST | `{ email }` records the subscriber and returns a signed download URL for the free Landing Page Kit |

## Setup

Requires Node 20+.

```sh
npm install
npm test        # runs without any services: the store falls back to memory
npm run lint
npm run validate:store-items
```

### Environment variables

Set these in Cloudflare Pages (Settings → Variables and Secrets; use test-mode values for Preview and live ones only for Production). Add them as **Secret** (encrypted): because `wrangler.toml` exists, it is the source of truth for plain-text variables, so plain-text ones set only in the dashboard are not applied.

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public base URL, e.g. `https://snowseasonstech.store` (used for redirects and email links) |
| `STRIPE_SECRET_KEY` | Stripe secret key. Live keys (`sk_live_`) are refused unless `ALLOW_LIVE=1` |
| `ALLOW_LIVE` | Set to `1` only on the production deployment |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint |
| `STRIPE_AUTOMATIC_TAX` | Optional: `true` enables Stripe Tax on Checkout |
| `LAUNCH_COUPON` | Optional: ID of a Stripe coupon with `percent_off` (e.g. 30). While valid, every product shows list price struck through with the discounted price, and Checkout applies the coupon (promo-code entry is hidden meanwhile, since Stripe can't combine them). Unset it or let the coupon expire to end the sale |
| `PRICE_BOOKSCAN`, … | Stripe Price IDs, one per product (`priceEnv` in `api/_lib/catalog.js`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Order, session and rate-limit store. Required in production |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Private bucket for deliverables (S3 or Cloudflare R2; region defaults to `auto`) |
| `RESEND_API_KEY`, `MAIL_FROM` | Order and billing portal emails. Without them, emails are skipped and the billing portal link can't be sent |

### Stripe

- Create a webhook endpoint at `<SITE_URL>/api/webhook` for these events:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Configure the customer (billing) portal in the Stripe dashboard before offering subscriptions.
- Do everything in test mode first.

## Adding a product

The **Validate store items** GitHub Actions workflow runs when the catalog, product files, or validation code changes. It checks catalog metadata and runs the test suite without requiring Stripe or bucket credentials. Run the same catalog check locally with `npm run validate:store-items`. This is separate from checking that production bucket objects match the catalog hashes; that remains `scripts/verify-uploads.js` and requires private-bucket credentials.

1. Create the product and Price in Stripe, and set its Price ID in a new `PRICE_*` env var.
2. Add an entry to `api/_lib/catalog.js` (`name`, `priceEnv`, `kind`, and `fileKey`/`filename` for downloads).
3. Upload the file to the bucket under that `fileKey`:
   ```sh
   S3_ENDPOINT=… S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
     node scripts/upload.js path/to/file.html <fileKey>
   ```
   Any deliverable type works (`.html`, `.zip`, `.xlsx`, `.pdf`, …); an extension missing from `TYPES` in `upload.js` is refused rather than uploaded as a generic binary.
   Paste the printed `sha256` into the catalog entry, then confirm every download works:
   ```sh
   S3_ENDPOINT=… S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… node scripts/verify-uploads.js
   ```
   Paste the printed sha256 into the catalog entry.

## Email signups (free Landing Page Kit)

The Website Kit form on the home page posts to `/api/kit`, which saves `subscriber:<email>` in Upstash as `{ email, source, subscribedAt }` and returns a 5-minute signed URL, so the download starts straight away. Addresses are not verified. Signups are limited to 10 per IP per hour.

The kit is served from the private bucket. After changing `products/free-landing-page/index.html`, upload it again:

```sh
scripts/upload.sh products/free-landing-page/index.html landing-page-kit/landing-page.html
```

To see subscribers, search for `subscriber:*` in the Upstash data browser. Any newsletter you send them must include an unsubscribe link.

## Portal accounts

```sh
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… node scripts/add-user.js customer@example.com bookscan
```

The password is read from stdin. Running it again for the same email updates the password and products, and signs out that account's existing sessions. The product list replaces the old one, so pass every product the customer owns.

To let the customer choose their own password instead, add `--invite` (and `SITE_URL`, `RESEND_API_KEY`, `MAIL_FROM`):

```sh
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… SITE_URL=https://snowseasonstech.store RESEND_API_KEY=… MAIL_FROM=… \
  node scripts/add-user.js --invite customer@example.com bookscan
```

The customer gets a 7-day link to `/storefront/portal#set-password=…`. Without the email settings the script prints the link for you to send. A new account can't sign in until the link is used; an existing account keeps its password until then.

Customers who forget their password use **Forgot password?** on the portal, which emails a 1-hour link (same reply whether or not the account exists, at most one email a minute per address). Using a link signs out the account's other sessions and invalidates any other outstanding links. Both need `RESEND_API_KEY` and `MAIL_FROM`; without them the portal says reset is unavailable.

## Bloat monitor

Keeps an eye on what the repo is carrying. It is report-only: nothing in it edits, deletes or commits.

```sh
npm run bloat        # same as: node scripts/bloat-scan.js
```

`scripts/bloat-scan.js` looks at tracked files and reports oversized images and files, committed junk (`__pycache__`, build output, logs) and the `.gitignore` rules missing for it, byte-identical duplicates, dependencies nothing mentions, assets and modules nothing references, and growth since the previous run. It prints a Markdown report and writes `.bloat/latest.md`, `.bloat/latest.json` and a one-line-per-run `.bloat/history.jsonl` (all gitignored). Thresholds and exclusions live in `bloat.config.json`; add `--no-write` for a dry run or `--json` for machine-readable output.

Dependencies and unreferenced files are found by searching for names, so treat them as candidates: a path built at run time, a tool wired up by a preset (such as `ts-jest` through a Jest preset) or a file used outside the repo (the images in `_assets/` are not deployed) can look unused.

`.claude/agents/repo-bloat-monitor.md` is a read-only Claude Code subagent that runs the scanner and triages the findings into a short report with suggested fixes. A scheduled task runs it weekly while the Claude desktop app is open. Run it yourself with "use the repo-bloat-monitor agent".

## Deployment

Deployed on Cloudflare Pages, connected to this repo's `main` branch.

| Setting | Value |
|---|---|
| Build command | `npm run build:pages` |
| Build output directory | `dist` (also set by `pages_build_output_dir` in `wrangler.toml`) |
| Functions | `functions/` at the repo root (picked up automatically) |
| Compatibility flags | `nodejs_compat`, set in `wrangler.toml` (required: `api/_lib/` uses Node's `crypto`) |

`scripts/build-pages.js` copies only an allowlist into `dist/` (site pages, `page.css`, `storefront/`, `_headers`), so `products/`, `api/`, `scripts/`, `tests/` and Markdown are never published. Point the production domain (`snowseasonstech.store`) at this Pages project (Custom domains), not at GitHub Pages.
