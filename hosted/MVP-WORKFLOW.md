# Subscription bundle MVP workflow

Updated: 2026-11-06. This is the implementation and release checklist, not a claim that the bundles are ready to sell.

## Target outcome

Finish Lead Generation Pro first, building on the persistent lead workspace already implemented. A customer with an active subscription can open their private workspace, import leads, prioritize them, record follow-ups and send reviewed records to one supported CRM. Subscription changes control access, and the operator can restore customer data from backup.

Marketing Automation follows as a separate release. Website management, hosted databases, AI reporting and Complete Business Suite remain later milestones. Shipping the first bundle does not mark the other five complete. This focus supersedes the earlier suggestion in BUNDLE-GAPS.md to validate Marketing Automation first.

## Current checkpoint

- [x] Draft plans blocked from checkout and new hosted provisioning.
- [x] Unfinished bundles blocked from direct Stripe product creation.
- [x] Persistent SQLite lead records, mapped CSV import and duplicate handling.
- [x] Local browser interface: create/edit, stages, signals and notes.
- [x] Manual CRM CSV export with spreadsheet-safe escaping.
- [x] Search, follow-up dates and due-date export filters implemented locally.
- [x] Twelve storage/HTTP tests pass; browser checks cover creation, persistence, search and date boundaries.
- [x] Phase 1 local validation complete; search/follow-up changes included in this release commit.
- [x] Hosted sign-in boundary implemented and HTTPS route verified.
- [ ] Hosted customer records, subscription enforcement and direct CRM delivery.

## Work queue

Follow these phases in order. Finish and record the exit checks before moving to the next phase. Keep each implementation change reviewable and commit after its checks pass.

| Phase | Deliverable | Exit checks | Depends on |
| --- | --- | --- | --- |
| 1. Local foundation | Finish the local workspace release and add a repeatable test command | All workspace tests pass; a clean checkout can launch using README instructions; imports, edits, follow-ups and exports survive restart; latest changes committed | Current code |
| 2. Hosted application boundary | Production application server and authenticated customer access | Server-side sessions, logout and expiry work; HTTPS deployment runs without exposing the local development server; no startup token grants hosted access | Phase 1 |
| 3. Customer isolation | Separate customer workspaces and access checks on every data operation | Two test customers cannot read, edit, import or export each other's leads; workspace identifiers come from verified identity; concurrent updates cannot silently overwrite newer edits | Phase 2 |
| 4. Subscription lifecycle | Entitlement checks and customer portal launch link | Active/trial access works; past-due policy is documented; canceled/unpaid access follows that policy; webhook duplicates and delayed events do not corrupt state; reactivation preserves data | Phase 3 |
| 5. One CRM connector | Reviewed delivery to one chosen CRM | Field mapping, remote IDs, duplicate behavior, per-record results, retry and credential handling work against a test account; no duplicate remote records after repeated delivery | Phase 3; CRM selection |
| 6. Operations and recovery | Deployment runbook, backups, restore and error visibility | Restore a backup into a fresh environment; prove customer isolation after restore; alerts identify failed imports/deliveries without exposing lead contents or tokens; rollback is exercised | Phases 4–5 |
| 7. End-to-end pilot | One complete test subscription journey | Checkout → portal → workspace → import → follow-up → CRM delivery → cancellation → reactivation succeeds; a pilot user completes the core workflow from written instructions | Phase 6 |
| 8. Release | Accurate listing and enabled Lead Generation Pro bundle | Product scope, recurring price and support policy approved; pending claims have evidence; catalog and checks pass; fulfillment verified after deployment | Phase 7 |

## Phase 1 completed: local foundation

1. Added `npm run test:lead-workspace`: Python storage, CLI and HTTP suites plus JavaScript parsing; all 13 tests passed. HTTP tests need loopback networking.
2. CLI subprocess coverage verifies search, follow-up updates, filtered exports, process-to-process persistence, invalid dates, clearing dates and refusing export overwrite.
3. Launched the README command from a clean temporary copy with both fresh and legacy databases. Browser checks verified lead creation, notes, follow-up dates, search, date boundaries and reload persistence. Data remained after server shutdown; migration retained existing notes.
4. Release evidence is recorded in this file and included with the phase 1 commit. Next: phase 2, hosted application boundary. No hosted release is claimed.

## Hosted design boundaries

- The current `server.py` is a loopback development tool. Keep it useful locally; build a hosted entry point with production serving, authentication and authorization rather than exposing its token URL to the internet.
- Reuse the existing storefront identity and subscription mechanisms where their verified identity can be securely passed to the application. Do not trust a customer ID or subscription ID supplied by the browser.
- Choose one tenant storage model and test every route against it. Avoid adding team roles, shared workspaces or multiple CRM providers to this MVP.
- Keep the downloadable lead pipeline as an existing entitlement. Validate and map its actual CSV output into the workspace; do not claim that manual imports are automatic enrichment.
- CRM delivery is an explicit reviewed action. No automatic outreach, email sending or background prospect contact is required for this release.

## Decisions needed before dependent work

| Decision | Needed before | Working assumption until decided |
| --- | --- | --- |
| First supported CRM and test account | Phase 5 completion | HubSpot selected by user; real test-account access still pending |
| Hosting target, domain and operating budget | Phase 2 deployment | Develop and test locally; use the existing hosting conventions where suitable |
| Cancellation, past-due and data retention policy | Phase 4 completion | Preserve customer records; do not add automatic deletion |
| Approved price and support scope | Phase 8 | Keep current proposed price and draft status |

These decisions do not block phase 1. Ask for each when it becomes necessary; continue independent implementation in the meantime.

## Verification and evidence

Current checks:

```sh
npm run test:lead-workspace
node --test tests/bundles.test.js tests/hosted.test.js tests/validate-store-items.test.js
npm run validate:store-items
git diff --check
```

Workspace HTTP tests require a local socket. Hosted Compose checks require Docker. Passing unit checks does not establish hosted deployment or provider integration readiness.

For every completed phase record: commit, environment, exact checks, observed result and remaining limitations. Use test data and keep credentials and customer records out of evidence files. Mark a phase complete only when its exit checks have passed.

| Phase | Commit / environment | Evidence | Status |
| --- | --- | --- | --- |
| Foundation controls and local workspace | `03e2473`, `512adaf`; local | Bundle/hosted checks passed (26); workspace checks passed (9); browser create/reload verified | Implemented |
| Phase 1: search, follow-ups and validation | Commit containing this workflow update; local clean-copy environments | `npm run test:lead-workspace`: 13 tests plus JS parsing passed; fresh/legacy browser workflows and shutdown persistence passed | Complete |
| Phase 2: hosted authentication boundary | `94323c9`; local Cloudflare runtime and production HTTPS | Auth and browser checks passed; production entry HTTP 200 and signed-out session HTTP 401 | Complete; production customer login not exercised |
| Phase 3: customer isolation | `f42a9fa`; Cloudflare local runtime + disposable Redis 7 | Two-account isolation, 200/409 simultaneous saves, 404 foreign edits, browser import/export and stale-edit recovery passed | Implemented and verified locally; production pilots disabled |
| Phase 4: subscription lifecycle | `4c23cd7`; local fixtures | Signed/replayed webhooks, grace boundaries, provider failures, billing ownership and browser recovery passed | Implemented; real Stripe sandbox journey deferred to phase 7 |
| Phase 5: HubSpot connector | `32a675d`; fixture tests and Cloudflare runtime | Encryption, review, delivery IDs, duplicate/lost-response recovery, backoff, ownership and browser flow verified | Implemented; real HubSpot test-account check still required |

## Remaining bundle sequence

1. Lead Generation Pro: finish phases 1–8 above.
2. Marketing Automation: validate existing Social Studio and MailHub hosting, choose email allowance, test provider connections, quotas, lifecycle and recovery.
3. Business Launch: implement website management, then integrate booking and invoicing access.
4. Business Operations: implement isolated database provisioning and tested restore, then integrate existing tools.
5. AI Business Intelligence: add verified data ingestion and attributable reports after the operational data services exist.
6. Complete Business Suite: integrate only the completed services, then test one subscription across all of them.

Keep each bundle hidden until its own promised workflows are implemented and verified. See BUNDLE-GAPS.md for the component-level inventory.

## Phase 2 implementation evidence

Implemented a separate hosted entry page at `/storefront/lead-workspace` and a protected identity endpoint at `/api/lead-workspace/session` using the existing portal identity system. The endpoint returns no lead records and reports `workspaceEnabled: false`; this is an authentication boundary, not a completed hosted lead service.

- Authentication suites pass for portal login, invalid credentials, expiry, logout, password changes, missing bindings and store failure. Local startup tokens are rejected.
- Local Cloudflare runtime browser checks pass for sign-in, wrong-password feedback, reload persistence and logout. Desktop/mobile screenshots were inspected; mobile has no horizontal overflow and no browser errors were reported.
- The Pages allowlist build and lint pass. The entry page is published as a static shell; identity is fetched only from the authenticated, non-cacheable API endpoint.
- Production HTTPS verified after deployment of `94323c9`: `/storefront/lead-workspace` returns HTTP 200 with the new page; `/api/lead-workspace/session` returns HTTP 401 when signed out. No production account was created and authenticated production login was not exercised. Tenant storage remains phase 3 and subscription enforcement remains phase 4.

## Phase 3 implementation evidence

Customer isolation is implemented for an explicitly invited pilot, using the existing Redis service and request-scoped portal sessions. Production pilot access is disabled unless `LEAD_WORKSPACE_PILOT_EMAILS` is configured. No subscription access is claimed.

- Each account gets a separate server-derived workspace key; create, import, list and edit all recheck identity. Export operates on the authenticated list, filtered in the browser.
- Writes use revision checks and atomic Redis compare-and-set. The editor keeps its original revision even when the queue is reloaded, so a stale form cannot silently overwrite newer edits. A workspace header rejects forms from a different signed-in account.
- Automated checks: 13 Python tests and 6 hosted session/data/CSV tests passed, plus JavaScript syntax checks. Two-account tests cover read/edit/import isolation, forged ownership, stale revisions, simultaneous writes, malformed rows and bounded requests.
- Real Redis 7 plus the Cloudflare local runtime: simultaneous saves returned 200/409, foreign lead edits returned 404, and imported records stayed with their owner. Browser checks verified customer switching, stale-edit preservation/recovery and filtered CSV export without other customers' records. Desktop/mobile screenshots were inspected.
- Limits: 200 leads per workspace, 1 MB stored document, 256 KB API write body. Shared/team access and account-email migration are outside this pilot. Production authenticated storage and backup/restore remain unverified; recovery is phase 6.

Phase 3 implementation and test-environment exit checks are complete. Next: phase 4 subscription lifecycle enforcement. Keep all bundles as drafts and production pilot access off until its intended accounts and operating policy are chosen.

Production HTTPS verification after `f42a9fa`: `/storefront/lead-workspace-app` returned HTTP 200 with the hosted pilot editor; `/api/lead-workspace/leads` returned HTTP 401 when signed out. No production pilot allowlist was configured and no customer data was written during verification. Temporary Redis and local Pages test services were stopped.

## Phase 4 implementation evidence

Policy chosen by the user: seven days of past-due grace. Cancellation preserves records and ends access at the scheduled period end (or immediately when the subscription is actually canceled). There is no automatic record deletion.

- Implemented `LEAD_WORKSPACE_BILLING_ENABLED=1` mode. Active/trial access, fixed invoice-based grace timing, cancellation, pause/unpaid denial and reactivation are checked on every hosted operation against current Stripe state. Draft plans still require an explicit pilot invitation.
- Successful signature-verified checkout events build an atomic subscription/customer index for the account email. Event replay cannot duplicate links; invoice snapshots and delayed lifecycle updates cannot override the current-state access decision.
- Added authenticated billing-portal launch using server-verified customer links, and a lead-workspace launch link in the signed-in customer portal. The browser shows grace/denial state and preserves server records when access stops.
- Workspace suite: 13 Python tests and 11 Node tests passed, including billing policy, raw webhook signatures, event replay, ownership, provider errors and cancellation/reactivation with unchanged records. Browser fixture checks passed for active → grace → expired → recovered → canceled access; desktop/mobile screenshots inspected.
- Provider boundary: Stripe responses and events were fixtures. No real subscription or charge was created; account settings were not changed. The real Stripe sandbox checkout, customer portal configuration, event delivery and recovery journey remain required in phase 7 before rollout.
- Production pilot and billing enablement remain off. Code deployment does not enable sales or alter proposed prices. Stripe Tax remains unchanged for release review.

Phase 4 implementation and fixture validation are complete. Next: phase 5, one CRM connector. Choose the provider and a test account before provider-specific integration; independent connector design can proceed first.

Phase 4 deployment verification: `4c23cd7` pushed to main; production serves the updated account script (HTTP 200) and rejects signed-out billing-portal POSTs (HTTP 401). All 156 repository tests passed, plus the 24-test workspace suite, lint, catalog validation and Pages build. Billing enablement and pilot settings were not changed. The temporary billing-fixture server was stopped.

## Phase 5 implementation evidence

HubSpot selected by the user. Implemented a service-key connection, reviewed contact field mapping, explicit send, tenant-scoped encrypted credentials, durable delivery results, remote IDs and manual retry. Every CRM route reuses session/subscription, workspace identity, origin and bounded-body checks. Production CRM enablement remains off.

- Eleven CRM tests cover encryption/tampering, mapping/ownership, duplicate emails, lost create responses, concurrent contact creation, durable attempts, delivery locks, rate limits, stale/expired previews, reconnect/disconnect and API boundaries.
- Cloudflare runtime browser checks verify the actual encryption functions and UI with mocked HubSpot/Redis: connect → select → map → preview → send → lost-response recovery. The fixture reported exactly one contact and one create, with the confirmed remote ID persisted on retry. A second customer saw neither connection nor delivery history. Desktop/mobile screenshots were inspected.
- Updated UI uses field selectors and readable contact values; changing a mapping invalidates the confirmation preview. No service key is returned to the browser or stored in plaintext in the CRM document.
- The connector uses documented v3 contact lookup, create and update endpoints and current service-key authentication. It preserves unmapped fields and uses email uniqueness for recovery; it does not create company objects or send outreach.
- Required exit check still pending: real HubSpot test-account connection, create/update, replay and verification of one contact with the same remote ID. No real provider credential or CRM record was used in the fixture checks. Phase 5 is not yet marked complete.

Operator setup and the exact real-account verification steps are in the product README. Preserve the catalog's draft/pending flags until the provider and operational checks pass. Phase 6 recovery work may proceed independently while test-account access is arranged.

Phase 5 deployment evidence: `32a675d` pushed to main. Production serves `/storefront/lead-workspace-crm` (HTTP 200) and rejects signed-out `/api/lead-workspace/crm` requests (HTTP 401). All 167 repository tests and the 35-test workspace suite passed, along with lint, catalog validation and Pages packaging. Production CRM, encryption and pilot settings were not changed. Local fixture runtime stopped. Real HubSpot test-account verification remains pending.
