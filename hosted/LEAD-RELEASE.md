# Lead Generation Pro release review

Release decision on 2026-11-07 **Hold public sales.** The hosted provider journey and the customer account setup flow need verification before the first sale.

## Listing for approval

**Lead Generation Pro** · **Proposed $249 USD/month**, plus applicable tax

Organize sales leads in a private online workspace. Import a CSV, track each lead’s stage, add notes, and set follow-up dates. Filter and export your queue, or review contact details before sending them to your connected HubSpot account. Includes the downloadable Lead Generation Pipeline.

The bundle is self-serve and includes one workspace per portal account. HubSpot delivery requires a compatible HubSpot account and a contact service key. You choose which contacts to send and confirm their mapped fields. The bundle does not include managed prospecting, automatic outreach, or HubSpot setup.

Monthly billing renews until canceled. Scheduled cancellation ends workspace access at the end of the paid period. Past-due subscriptions receive a seven-day grace period under the billing policy. Workspace records are preserved when access ends and can be used again after reactivation.

**Proposed support** · Email info@snowseasonstech.net for access, billing and product issues. Support is best effort. Custom integrations, managed services and guaranteed response times are outside the proposed scope. Confirm the applicable refund terms, how customers can request export or deletion after cancellation, and the privacy disclosure for hosted lead records, backups and HubSpot delivery before publishing.

## Release gates

| Gate | Evidence required |
| --- | --- |
| Phase 7 hosted pilot | Complete the signed Stripe test Checkout and direct HubSpot delivery in the hosted app. Record the pilot user's walkthrough and subscription cleanup in [pilot results](LEAD-PILOT-RESULTS.md). |
| Customer account setup | Fulfillment for a released bundle creates a portal account for the Checkout email only if that account is absent. The receipt directs buyers to sign in or request a password link at that address. The local fixture verifies setup, rejection of an unrelated email, event replay and preservation of existing credentials and downloads. The hosted pilot uses seeded accounts and an account-bound Checkout route. Verify first-time and returning customer fulfillment in a separate hosted test release candidate, including receipt and password email delivery, before enabling sales. |
| Commercial approval | Approve the listing, recurring price and currency, support scope, refunds, data policy and disclosures. Confirm the intended Stripe product has the approved active monthly price and that Checkout shows the approved total, tax, renewal and cancellation terms. Review any launch discounts against that approval. |
| Operator readiness | Record the owner and cadence for encrypted offsite backups, restore verification and alert routing. Confirm receipt of a fictional failure and retain a known-good deployment for rollback. See [operations and recovery](LEAD-OPERATIONS.md). |
| Release candidate | Run the workspace, pilot and recovery suites, repository tests, lint, catalog validation and Pages build. Verify the candidate storefront copy against the catalog and Checkout. Confirm billing and CRM bindings are ready before switching on sales. |
| Deployment and fulfillment | Record the deployment commit and verify listing, approved price, receipt, portal access, Lead Generation Pipeline download, workspace access and subscription management. Capture evidence with test data and keep identifiers private. Pause new sales if fulfillment or access fails and follow the operations runbook to protect active customers. |

Leave the catalog draft and pending claims in place until the pre-release gates pass. Keep sandbox checkout scoped to the isolated test environment.
