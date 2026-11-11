# Lead Generation Pro MVP pilot

Run the pilot in an isolated test environment. Catalog drafts remain closed. Use the results sheet in LEAD-PILOT-RESULTS.md to distinguish automated fixtures, provider smoke checks and the actual hosted customer journey.

## Operator preparation

1. Use a dedicated HubSpot test account and Stripe test-mode account/sandbox. Existing connected-account access does not expose application API credentials. Configure scoped credentials directly through your secret manager and the CRM connection form, never in chat or git.
2. Create a separate HTTPS Pages project with an empty test Redis store. In a dedicated pilot checkout of the repo, set the Wrangler project name to the pilot project and retain `pages_build_output_dir = "dist"` and `nodejs_compat`. Build with `npm run build:pages` and deploy the assets and `functions/` together to that project. Keep the pilot project separate from the storefront's production and preview environments. Restrict workspace access through the portal and pilot allowlist, and ensure Stripe can reach `/api/webhook` without an interactive login. Use two distinct fictional account emails and unique test passwords.
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

   Enter secret values as encrypted Pages secrets for the pilot deployment. Generate the CRM encryption key with `openssl rand -base64 32` in a private terminal and retain it securely for recovery. Keep mail, fulfillment bucket and live Stripe credentials out of the pilot project. If using a restricted Stripe key, grant the permissions needed to read the price and expanded product, create Checkout Sessions, retrieve subscriptions with expanded latest invoices, and create Billing Portal Sessions. Use the sandbox that owns the pilot product and price.

   When deploying with Wrangler, keep all plain-text pilot variables in the dedicated checkout's `[vars]`. A Wrangler deploy can replace plain-text dashboard variables with those in its config. Keep encrypted secrets in the Pages project and verify the binding names after deployment.

4. Load only the test Redis bindings into a local shell and verify the Redis hostname matches the dedicated test store before creating accounts. Run the commands below in a private terminal and enter a unique test password at each prompt. Put these same emails in the Pages allowlist. The product list is empty so the pilot must obtain access through Checkout. Each user gets a session by signing in through the hosted portal.

   ```sh
   node scripts/add-user.js lead-pilot-a@example.com
   node scripts/add-user.js lead-pilot-b@example.com
   ```

5. In the Stripe test account, set the webhook destination to `<SITE_URL>/api/webhook` and select events from that sandbox account. Select the [billing webhook events](../products/operations-lead-intelligence/README.md#subscription-lifecycle-phase-4) and save the destination's signing secret as `STRIPE_WEBHOOK_SECRET` in the test Pages project. Configure cancellation in the customer portal in the same Stripe test account. For each completed test Checkout, record the test event ID, delivery HTTP status, response result and time in private evidence. The first successful delivery should return `pilot-linked` and a replay should return `duplicate`. Confirm the signed-in account gained access.
6. In HubSpot's dedicated test account, open **Development → Keys → Service keys** as a super admin or a user with Developer tools access. Create a service key scoped to `crm.objects.contacts.read` and `crm.objects.contacts.write`. Enter it through **HubSpot delivery** while signed in as the pilot user. The application stores it encrypted for that workspace and checks read access on connect. Verify write access by sending the reviewed fictional contact. Confirm the selected account and its automations before connecting. The ChatGPT HubSpot connection is separate from the application's service-key connection.
7. Run `npm run test:lead-pilot`, `npm run test:lead-workspace`, `npm run test:lead-recovery`, `npm test`, lint, catalog validation and the Pages build. Confirm source/catalog drafts remain unchanged.

The sandbox checkout endpoint refuses live keys, `ALLOW_LIVE=1`, uninvited users, wrong-mode prices, wrong product/amount/interval, maintenance and cross-origin requests. It uses the signed-in identity and does not accept customer emails or price IDs from the browser. Retries of one intent keep identical Stripe parameters and an account-bound idempotency key. The normal public checkout continues rejecting the draft bundle.

Successful test checkout binds the billing index to the signed-in account hash stored by the server. The pilot webhook requires a signed test-mode event and valid pilot Checkout metadata. Pilot fulfillment only writes a billing link, so no storefront order or purchase email is created. On each workspace access check, the current test subscription must match the pilot product and account hash. Return-page query parameters and Checkout Session creation do not grant access.

## Pilot user workflow

Ask a pilot user to follow these instructions without developer coaching. Record unclear steps, completion time and support requests; do not record passwords, service keys or real lead data.

1. Open the customer portal and sign in as pilot A. Follow **Open lead workspace**. Confirm no lead data is available before the test subscription.
2. Choose **Start sandbox test subscription**. Verify Stripe displays test mode, the intended product and USD 249.00 monthly. Complete Checkout with Stripe's documented test payment method. Do not enter real card details. Return to the account page and choose **Check availability** after the webhook arrives.
3. Open the lead workspace. Import `sample-leads.csv` from the product directory, or a two-row CSV using only fictional `example.com` contacts. Repeat the import and verify duplicates are skipped.
   To check the nightly pipeline's company output, import its `leads.csv` with a mapping: Name from `company`, Website from `website`, Phone from `phone`, and Notes from `description`. Do not import `contacts.csv`; it creates one lead per person and drops names and titles. Pipeline output has no fit, intent or budget scores, so leads start unranked. Test this with fictional rows only.
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
