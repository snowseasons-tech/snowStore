# Price change plan: match the rate card at 100%

Source of truth: `SnowSeasonsTech_Standard_Pricing.md` (v1.0, effective Oct 28, 2026).
Live prices checked against `https://snowseasonstech.store/api/products` on 2026-11-13.
Status: **PLAN ONLY. Nothing in Stripe or the repo has been changed.**

## How the change works

- Stripe prices can't be edited. For each row: **create a new price** on the same Stripe product, then **archive the old one** (`active=false`).
- The site (`api/_lib/prices.js`) offers each product's active prices by billing period, and the newest price wins. Creating before archiving means no gap, where a product would briefly be "not on sale".
- `/api/products` is cached for 60 seconds, so changes show within about a minute.
- **Existing subscribers are not affected.** Archiving a price does not change running subscriptions; they stay on the price they signed up at. Moving them is a separate, deliberate step (see "Existing subscribers").
- No prices are hardcoded in the HTML, JS or docs (checked with grep), so there are no repo edits for pricing, only Stripe.

## A. Change to rate-card prices (card gives the number)

Amounts in USD. "Old" is the current active monthly price.

| Catalog id | Stripe product | Old /mo | **New /mo** |
|---|---|---:|---:|
| `operations-lead-intelligence` | `prod_VWZn5NCFzs4bXV` | 10.00 | **350.00** |
| `mailhub-intelligence` | `prod_VWZoFAvBr0LCEz` | 10.00 | **300.00** |
| `inspections-intelligence` | `prod_VWZrK0O24fEuqG` | 10.00 | **300.00** |
| `managed-database` | `prod_VWZsLP0vMFVyQ5` | 150.00 | **200.00** |
| `website-management-primary` | `prod_VWZtjjJBW0yfxP` | 187.50 | **250.00** |
| `website-management-secondary` | `prod_VWZuzetnqiyHtr` | 112.50 | **150.00** |
| `managed-package` | `prod_VWazGQhLiTNtSu` | 2,287.50 | **3,050.00** |

Check: the card's technology and websites subtotal is $1,550 = 350 + 300 + 300 + 200 + 250 + 150. Adding the five-account social package ($1,500) gives the $3,050 package price.

### Multi-month options

The card defines no prepay discounts, so the default below only repairs the broken ones (straight multiples, no invented discounts). Say if you want a discount instead.

| Product | Period | Old | **New (default)** |
|---|---|---:|---:|
| `website-management-primary` | 3m | 562.50 | **750.00** (3 × 250) |
| `website-management-secondary` | 3m | 337.50 | **450.00** (3 × 150) |
| `inspections-intelligence` | 6m | 1,154.25 | **1,800.00** (6 × 300) |
| `inspections-intelligence` | 12m | 2,187.00 | **3,600.00** (12 × 300) |
| `inspections-intelligence` | 1w | 41.25 | **archive**; no card basis, odd for a $300/mo service |

Operations, MailHub, Managed Database and the Managed Package stay monthly-only. The audit suggests adding 3, 6 and 12-month options, but that's a product decision, not a card matter.

## A2. API products: restore to round list prices (confirmed)

These sat at 75% of round numbers, so you chose to restore them to the full list prices. The card has no row for them.

| Catalog id | Stripe product | Billing | Old | **New** |
|---|---|---|---:|---:|
| `api-integration-basic` | `prod_VWa43u70jMDMbP` | one-time | 374.25 | **499.00** |
| `api-integration-standard` | `prod_VWa5pmeCO0fAE2` | one-time | 749.25 | **999.00** |
| `api-integration-advanced` | `prod_VWa7qWYhDuWbD3` | one-time | 1,499.25 | **1,999.00** |
| `api-integration-enterprise` | `prod_VWaA1TBa5s7DEu` | one-time | 2,999.25 | **3,999.00** |
| `api-maintenance-basic` | `prod_VWacOc9NLNnEkY` | monthly | 36.75 | **49.00** |
| `api-maintenance-standard` | `prod_VWaePY7P8UDw09` | monthly | 74.25 | **99.00** |
| `api-management-advanced` | `prod_VWagGWgDnwGSMs` | monthly | 149.25 | **199.00** |

The maintenance and management plans also have 3-month options, which are currently exact 3 × monthly. Default is to keep that (no saving, no invented discount):

| Product | Period | Old | **New (default)** |
|---|---|---:|---:|
| `api-maintenance-basic` | 3m | 110.25 | **147.00** |
| `api-maintenance-standard` | 3m | 222.75 | **297.00** |
| `api-management-advanced` | 3m | 447.75 | **597.00** |

The one-time integration products are not subscriptions, so the existing-subscriber note doesn't apply to them. Only the three maintenance and management plans have subscribers to check in step C1.

## A3. Founder's Early Access Membership (confirmed)

| Catalog id | Stripe product | Billing | Old | **New** |
|---|---|---|---:|---:|
| `founders-membership` | `prod_VWva1qZT0oarCt` | monthly | 21.75 | **29.00** |

It has subscribers to check in step C1, since it is a recurring membership that unlocks downloads. Check whether the page copy quotes a price (grep found none in the repo).

## B. Social media plans (`social-media-1` to `-5`)

Correction to my earlier note: these are `hidden: true` in `api/_lib/catalog.js`, so they are off-sale on purpose, not just missing prices. They also have no active Stripe price.

| Plan | Stripe product | **Card /mo** |
|---|---|---:|
| `social-media-1` | `prod_VWZuuW4EyvXNdn` | **500** |
| `social-media-2` | `prod_VWhiN8cWgM4Q5w` | **800** |
| `social-media-3` | `prod_VWhjp9cocJb1Rx` | **1,050** |
| `social-media-4` | `prod_VWhlDsckzsMZ86` | **1,300** |
| `social-media-5` | `prod_VWaXDK9wEVrxXq` | **1,500** |

Plan: create the five monthly prices now. They're invisible while the products are hidden, so this is harmless. **Unhiding is a separate decision** (a catalog edit); see D3. The card says each additional account beyond 7 is +$200/mo; that isn't a catalog product today.

## C. Rollout order

1. **Read-only first:** for each product in A, list active subscriptions (`stripe subscriptions list --price ...`) so we know who is on the old price.
2. Create all new prices (A, B, multi-month).
3. Wait about 60 seconds, then run `node scripts/pricing-audit.js --no-agents --no-write` and confirm the A rows show the new amounts.
4. Archive the old prices (A, multi-month, and `inspections` 1w).
5. Re-run the audit. Expected result: the `no-period-saving` findings for Website Management and dotTracker clear. The `period-gap` and `monthly-only` notes remain; they're informational.

Rollback: archive the new price and re-activate the old one (`active=true`). Old prices stay in Stripe, so this takes seconds and loses nothing.

## D. Decisions I need from you (not in A or B)

These aren't on the rate card, so I won't guess. Evidence is included.

1. **$1 and $10 placeholders on software products.** Live: `local-seo-platform` $1, `lead-generator` $1, and `bookscan`, `page-builder`, `blog-gen`, `invoice-generator`, `saas-financial-engine`, `gbp-analytics-dashboard` $10. `booking-app` is $39. Are these real or leftover test prices? If real, what are the list prices?
2. ~~`founders-membership`~~: settled, restore to $29/mo (see A3).
3. **Unhide the social media plans?** Currently hidden. Also `snowsocial` has a catalog/Stripe mismatch (subscription in the catalog, one-time $500 main price, 6m $5,700, 12m $10,800), which needs a rebuild once its pricing is decided.
4. **The nine $0.00 cookbook and tutorial products:** free lead magnets, or should they be priced?
5. **`photo-avatar-pack`:** has no Stripe product, so it can't be sold.
6. **Basic vs Standard API Maintenance copy:** the two plans have identical descriptions on `/products` and the homepage.

## C1 result: subscriber check (2026-11-13, live account, read-only)

Four active subscriptions in total; none trialing or past due.

| Product | Subscriber price | Effect of this plan |
|---|---|---|
| `inspections-intelligence` | $10/mo (x1) | None: stays at $10 until moved. Card says $300, so decide about amending (section E). |
| `founders-membership` | $29/mo (x1) | None. This subscriber already pays $29, so the A3 change brings the list price up to what they pay. |
| `snowsocial` | $500/mo (x1) | None. Out of scope (see D3). |
| `social-media-1` | $1,500 per 3 months (x1), i.e. $500/mo | None. Matches the card's $500/mo; new B prices don't touch it. |

No subscribers on API Maintenance or Management, Website Management, Managed Database, Operations, MailHub, or the Managed Package, so archiving those old prices affects nobody.

## E. Existing subscribers

Everyone already subscribed stays on the old (75%) price until moved. The card says price changes require "agreed amendment or renewal terms", so don't bulk-migrate. Step C1 produces the list; I'd review renewals one by one.

## F. Unrelated finding

`stripe.sh` is tracked in git and contains a live Stripe restricted key (`rk_live_...`). Rotate that key in the Stripe dashboard, then remove it from the file. It is a security issue regardless of this price change.

## STATUS (2026-11-13)

**Created in live Stripe (17 prices, metadata `change=card-100pct-2026-11-13`, each with `replaces`):** managed-database 200, website-management-primary 250, -secondary 150, managed-package 3,050, api-maintenance-basic 49 (+3m 147), -standard 99, api-management-advanced 199, api-integration 499 / 999 / 1,999 / 3,999, and social-media-1..5 at 500 / 800 / 1,050 / 1,300 / 1,500 (hidden in the catalog, so not visible on the site).
Live site confirmed showing the new amounts for all of these except the items below.

**HELD: Operations, MailHub and dotTracker.** Their $10 prices are labeled "Public beta" in Stripe metadata (set on purpose), not placeholders as I first said. Moving them to 350 / 300 / 300 ends the public beta. Nothing created for these three. dotTracker's 6m/12m/1w options also stay as they are until this is decided.

**NOT YET DONE: archiving the old (75%) prices.** The archive call was blocked by the permission check and was not retried. Until these are archived:
- `founders-membership` still shows $21.75 (the 75% price). Archiving `price_1UZ8jZPM6gpd3uZBJyPbr8P3` lets the existing $29 price take over.
- 3-month options still show the 75% amounts for website-management-primary/-secondary, api-maintenance-standard and api-management-advanced. Archiving their 75% prices (below) lets the existing 750 / 450 / 297 / 597 prices take over.

Old prices to archive (`stripe prices update <id> -d active=false`):
`price_1UZ8jfPM6gpd3uZBuNCdMpeJ` (db 150), `price_1UZ8jePM6gpd3uZByPLbYGEE` (primary 187.5), `price_1UZ8jdPM6gpd3uZBOssdGGoj` (primary 3m 562.5), `price_1UZ8jePM6gpd3uZBoCZeBDRK` (secondary 112.5), `price_1UZ8jePM6gpd3uZBSPGP476p` (secondary 3m 337.5), `price_1UZ8jhPM6gpd3uZB68IlFoIU` (package 2287.5), `price_1UZ8jZPM6gpd3uZBX1IFlB3c`, `price_1UZ8jaPM6gpd3uZBqej97SR6`, `price_1UZ8jaPM6gpd3uZBGzvb2XRm`, `price_1UZ8jaPM6gpd3uZBpdrl8JhV` (API integration x4), `price_1UZ8jbPM6gpd3uZBR2Qh4dmT` (maint basic 36.75), `price_1UZ8jbPM6gpd3uZBUoumWoXW` (maint basic 3m 110.25), `price_1UZ8jcPM6gpd3uZBcGcDreTr` (maint standard 74.25), `price_1UZ8jcPM6gpd3uZBCeGdxetr` (maint standard 3m 222.75), `price_1UZ8jdPM6gpd3uZBmnZe9zQO` (mgmt 149.25), `price_1UZ8jcPM6gpd3uZB2RvQyMGj` (mgmt 3m 447.75), `price_1UZ8jZPM6gpd3uZBJyPbr8P3` (founders 21.75).
Rollback for any of them: set `active=true` again.

## STATUS UPDATE: archive done (2026-11-13)

All 17 old 75% prices archived and the live site checked. It now shows the plan amounts: managed-database 200, website-management 250 / 150 (3m 750 / 450), managed-package 3,050, API integration 499 / 999 / 1,999 / 3,999, API maintenance 49 / 99 (3m 147 / 297), API management 199 (3m 597), founders-membership 29.
**Beta kept for now:** Operations, MailHub and dotTracker remain at the $10 public-beta price, with dotTracker's 1w/6m/12m options unchanged. Open: decide when to end the beta (then create 350 / 300 / 300 and archive the beta prices).
Still open from section D: $1/$10 software prices, $0 products, SnowSocial rebuild, Photo Avatar Pack, Basic vs Standard maintenance copy, unhiding social-media plans.
