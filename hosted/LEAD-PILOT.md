# Lead Generation Pro MVP pilot

Run the pilot in an isolated test environment. Catalog drafts remain closed. Use the results sheet in LEAD-PILOT-RESULTS.md to distinguish automated fixtures, provider smoke checks and the actual hosted customer journey.

## Operator preparation

1. Use a dedicated HubSpot test account and Stripe test-mode account/sandbox. Existing connected-account access does not expose application API credentials. Configure scoped credentials directly through your secret manager and the CRM connection form, never in chat or git.
2. Deploy the current code to a private test environment with its own empty Redis store, two portal accounts, and matching portal sessions. Use two distinct account emails. Do not copy production passwords or customer records into it.
3. Set these test bindings:

| Binding | Test requirement |
| --- | --- |
| `SITE_URL` | HTTPS test site origin |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Isolated test store |
| `STRIPE_SECRET_KEY` | Scoped `sk_test_` or `rk_test_` key for the selected Stripe test account |
| `ALLOW_LIVE` | Unset or `0`; never `1` for this pilot |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this environment's real test webhook endpoint |
| `LEAD_WORKSPACE_PILOT_EMAILS` | The two invited portal account emails |
| `LEAD_WORKSPACE_BILLING_ENABLED` | `1` |
| `LEAD_WORKSPACE_SANDBOX_CHECKOUT` | `1` |
| `LEAD_WORKSPACE_SANDBOX_PRODUCT` | Test product ID from the private pilot evidence |
| `LEAD_WORKSPACE_SANDBOX_PRICE` | Matching active USD 249.00/month test price; no actual money is charged in Stripe test mode |
| `LEAD_CRM_ENABLED` | `1` |
| `LEAD_CRM_ENCRYPTION_KEY` | Separate random 32-byte key encoded as base64 |
| `LEAD_WORKSPACE_MAINTENANCE` | Unset or `0` |

4. Configure the real Stripe test webhook for the event types listed in the product README. Verify raw-body signatures. Use Stripe's customer portal in the same test account. Do not enable or change live-mode webhook, tax or portal settings for this pilot.
5. In HubSpot's intended test account, create a service key with contact read/write scopes. The ChatGPT HubSpot connection is separate from the application's service-key connection. Check any test-account automations before using fictional contacts.
6. Run `npm run test:lead-pilot`, `npm run test:lead-workspace`, `npm run test:lead-recovery`, `npm test`, lint, catalog validation and the Pages build. Confirm source/catalog drafts remain unchanged.

The sandbox checkout endpoint refuses live keys, `ALLOW_LIVE=1`, uninvited users, wrong-mode prices, wrong product/amount/interval, maintenance and cross-origin requests. It uses the signed-in identity and does not accept customer emails or price IDs from the browser. Retries of one intent keep identical Stripe parameters and an account-bound idempotency key. The normal public checkout continues rejecting the draft bundle.

Successful test checkout binds the billing index to the signed-in account hash stored by the server, not an editable checkout email. Only signature-verified successful events create links. Return-page query parameters and Checkout Session creation do not grant access.

## Pilot user workflow

Ask a pilot user to follow these instructions without developer coaching. Record unclear steps, completion time and support requests; do not record passwords, service keys or real lead data.

1. Open the customer portal and sign in as pilot A. Follow **Open lead workspace**. Confirm no lead data is available before the test subscription.
2. Choose **Start sandbox test subscription**. Verify Stripe displays test mode, the intended product and USD 249.00 monthly. Complete Checkout with Stripe's documented test payment method. Do not enter real card details. Return to the account page and choose **Check availability** after the webhook arrives.
3. Open the lead workspace. Import `sample-leads.csv` from the product directory, or a two-row CSV using only fictional `example.com` contacts. Repeat the import and verify duplicates are skipped.
4. Review a lead. Change its stage to Contacted, add a fictional note and set a follow-up date. Save, reload, search for the lead and filter by its due date. Confirm data persisted. Export the filtered queue and verify it contains only the visible records.
5. Open **HubSpot delivery**. Connect the test service key, select one lead, map email and company, and prepare a preview. Confirm exact values before sending. Verify the HubSpot ID and contact values in the test CRM.
6. Repeat delivery of the same review. Verify one remote contact and the same ID. Edit the local company/name, create a new review, send, and verify the existing contact updates while unmapped fields remain unchanged. Do not inject network errors into the live provider; fault/retry paths are covered separately by fixtures.
7. Sign in as pilot B. Before subscribing, verify denied access. After a separate test checkout, verify B's empty workspace and no access to A's records, CRM key or delivery history. Manipulating query parameters must not reveal A's data.
8. As A, use **Manage billing**. Schedule cancellation and verify access remains until the scheduled end. Cancel immediately in the test account when testing immediate termination. Verify read, write, export and CRM delivery are denied while records remain stored.
9. Start a new test subscription for A after cancellation. Verify the same lead IDs, notes and follow-up dates return. Verify no failed or completed CRM delivery is automatically resent.
10. Sign out, verify access denial and session expiry, then cancel all pilot test subscriptions. Record their final states and invoice amounts. Keep the clearly named fictional HubSpot contact for review unless its removal is separately agreed.

## Operator resilience checks

- Replay the successful signed checkout event: one billing link and no duplicate fulfillment.
- Deliver an older active subscription event after cancellation: access must still follow current Stripe state.
- Confirm retryable CRM failures and failed imports produce sanitized signals with no lead contents or tokens. Route a fictional failure to the actual operator alert destination and verify receipt.
- Run the phase 6 restore/rollback drill and then verify the chosen test environment's backup destination and secrets recovery.
- Keep a rollback deployment and maintenance procedure ready. Pause rollout on any tenant leak, unconfirmed billing state or duplicate remote record.

## Completion criteria

Phase 7 is complete only when the actual hosted journey passes with real Stripe test and HubSpot test credentials, a pilot user completes the instructions, real webhook delivery is verified, test subscriptions are cleaned up, and results/limitations are recorded. The automated fixture journey and separate connected-provider smoke checks do not replace that evidence.

Production billing, CRM and public draft sales stay disabled until the remaining phase 8 release review. Tax configuration and support terms are reviewed there; this pilot does not modify live financial settings.

References: [Stripe sandbox testing](https://docs.stripe.com/testing), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [HubSpot service keys](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys).
