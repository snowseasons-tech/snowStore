# MVP pilot results

Date: 2026-11-06. This sheet records evidence levels explicitly; it is not release approval. Private provider IDs and URLs are kept in ignored local `backups/phase7-*-evidence.json` files, not in product templates or this public run sheet.

| Check | Evidence | Result |
| --- | --- | --- |
| Application journey | `npm run test:lead-pilot`: real handlers and SDK serialization with mocked Redis/Stripe/HubSpot | Passed: test checkout, signed success/replay, portal/session, import, follow-up, CRM review, lost-response recovery, cancellation, reactivation, second-user isolation and logout |
| Public draft protection | Normal checkout invoked during the fixture journey | Passed: public draft checkout remained closed |
| Sandbox guards | Route tests | Passed: live keys, uninvited accounts, mismatched price, forged account fields and cross-origin calls rejected |
| Checkout retry intent | SDK parameter comparison and browser fixture | Passed: stable account-bound idempotency key and identical parameters; browser reuses failed intent and hides checkout after access becomes active |
| Real HubSpot account | User identified a dedicated test account and approved the exact fictional-contact changes | Passed: one contact created, company updated, same update repeated, exact email search returned one contact with the same ID |
| Real Stripe test account | Connected account explicitly exposed test mode | Passed: dedicated test product/price and fictional customer created; trial → scheduled cancellation → canceled → new trial verified |
| Test subscription cleanup | Stripe retrieval expanded latest invoice after cleanup | Passed: both test subscriptions canceled, both invoices zero due and zero paid |
| Application billing policy on real snapshots | Pure policy evaluated captured real Stripe subscription objects | Passed: trial/scheduled access allowed; canceled denied; new trial allowed; cleanup cancellation denied |
| Actual deployed application with provider credentials | Requires test application bindings and HubSpot service key | Pending |
| Real successful Checkout payment and webhook delivery to test app | Requires configured application test key/webhook and a completed test-mode Checkout page | Pending; provider smoke used no-card trials, not completed Checkout |
| Direct HubSpot service-key transport from the app | Requires scoped test key entered through CRM connection UI | Pending; connected HubSpot CRUD smoke is a separate path |
| Pilot user follows written instructions | LEAD-PILOT.md | Pending |
| Production operating setup | Offsite backups, scheduling and actual alert receipt | Pending |

No live Stripe mode was changed. No real payment was collected. No CRM outreach was sent. Fictional HubSpot contact remains in the dedicated test account for inspection. Stripe test product/price/customer remain available for the reproducible app pilot; both test subscriptions were canceled.

Phase 7 remains open until the pending real-application and user checks pass. Do not remove draft/pending catalog flags based on fixture or separate-provider results alone.
