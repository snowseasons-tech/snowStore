# Christmas & New Year 2026–2027 campaign

Source playbook: `/root/.claude/uploads/24692c34-48cc-5528-babd-c04154c4fc66/f3102521-christmas_campaign_playbook.md` (not in the repo; its content is carried into these files).

This folder is the campaign workspace. It holds planning and draft copy only. Nothing here changes the live site, Stripe prices, or the catalog.

## Files

| File | What it covers | Status |
|---|---|---|
| [campaign-plan.md](campaign-plan.md) | Reconciled 3-phase calendar, and the conflicts with existing marketing | Draft, needs owner decisions |
| [bundle-readiness.md](bundle-readiness.md) | Playbook bundles A/B/C mapped to the catalog, with blockers | Draft, blocked on decisions |
| [email-sequence.md](email-sequence.md) | Four campaign emails (Nov 25, Dec 6, Dec 26, Dec 30) | Draft copy, prices held as placeholders |
| [reel-scripts.md](reel-scripts.md) | Two short-form video scripts | Draft, no footage yet |

## Stages

| Stage | Scope | State |
|---|---|---|
| 1. Plan & content | Calendar, bundle mapping, copy and scripts (this folder) | Done in this branch |
| 2. Homepage banner | Campaign announcement bar on `index.html`, behind a single config switch, no prices | Done, switched off (`CAMPAIGN.active`) |
| 3. Interactive tools | "Find your fit" quiz and admin-time calculator on the homepage | Done |
| 4. Offers & checkout | One-time bundles B and C in the catalog, hidden with no Stripe product | Code done. Stripe products still to create; Bundle A blocked (see `bundle-readiness.md`) |
| 5. Gift certificates | Gift checkout, paid webhook that creates and emails the code, redeem page and signed downloads | Built end to end, not on sale. Still needs a "Give as a gift" button on product pages (see `gift-certificates.md`) |
| 6. Post-purchase emails | Welcome series: email 1 is the existing purchase email; emails 2 (+24h) and 3 (+72h) are scheduled at purchase and sent by a runner | Built. Not sending until the runner is scheduled and `WELCOME_RUN_SECRET` is set (see `welcome-series.md`) |

## Stage 4: to finish before the bundles go on sale

1. Create a Stripe product and a one-time price for each bundle, at the amounts in `api/_lib/catalog.js` (`proposedPrice`): Solopreneur $249, Small Team $399.
2. Set `stripeProduct` on each entry and remove `hidden: true`. Check that `npm run validate:store-items` passes.
3. Confirm `LAUNCH_COUPON` is unset, so the storewide discount doesn't stack.
4. Test checkout and the download in Stripe test mode before going live.

## Open decisions

1. **Bundle A** (Outgrown Spreadsheets): its hero, the Store Inventory Tracker, is retired. Do you want it back on sale, or a bundle from the invoice generator alone?
2. **Bundle C** is the Auto Scheduler alone. The 50% off setup and training is a service that isn't in the catalog, so it has to be sold separately.
3. Does the Nov 28–30 Small Business Weekend sale run as planned, and does it stack with the playbook's Dec 12–23 flash deals?
