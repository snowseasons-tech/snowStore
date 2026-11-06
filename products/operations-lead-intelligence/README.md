# Operations & Lead Intelligence

## Local lead workspace

### Browser interface

Start the local interface from this directory:

```sh
python3 server.py --db workspace.sqlite3
```

Open the full URL printed in the terminal, including its `#token=…` fragment. It opens a private local session with CSV import, optional column mapping, stage and minimum-score filters, editable contact details and signals, notes, and CSV export of the current view. Saved changes survive browser reloads. Unsaved edits prompt before switching leads or leaving the page.

The server listens only on `127.0.0.1`; it is not a hosted customer service. Keep the startup URL private. Restarting changes the access token; reopen the new URL after a restart. Use `--port 8766` if the default port is busy. Stop with Ctrl+C before backing up the database. Do not expose this development server through a public proxy.

The browser and CLI below use the same database when given the same path. Browser imports are limited to files smaller than 1 MB. The CSV export uses spreadsheet-safe cell escaping and requires manual mapping and import in your CRM.

### Command-line interface

Search matches organization, email, phone, website and notes without regard to case. Set **Next follow-up** on a lead, then use **Follow-ups due by** to show open leads scheduled on or before a date. Won, Lost and unscheduled records are excluded from this view. Clear the date filter to show them again. Export applies search, stage, score and due-date filters together.

Existing databases automatically gain the optional `follow_up` column when opened; existing records and notes are preserved. CSV import/export supports this field as a `YYYY-MM-DD` date or an empty value. These dates are calendar dates, with no timezone conversion or automatic notifications.

The CLI supports the same filters: `python3 leads.py --db workspace.sqlite3 list --search example --due-by 2026-11-06`. Use `update 1 --follow_up 2026-11-10` to set a date or `update 1 --follow_up ""` to clear it. The `export` command accepts `--search` and `--due-by` too.

In the browser, **Add lead** opens a blank record without requiring a CSV. Enter an organization name and optional contact details, signals and notes, then save. New records default to stage New and zero signals. Duplicate names and emails are rejected without overwriting the existing lead.

`leads.py` is a working local workspace using Python 3.11+ and SQLite, with no additional packages. It saves records between runs, imports CSV files, tracks stages and notes, ranks leads, and exports a CSV for manual CRM import. It does not run enrichment, send outreach, authenticate users or connect directly to a CRM.

Run from this directory after extracting or checking out the files:

```sh
python3 leads.py --db workspace.sqlite3 import sample-leads.csv
python3 leads.py --db workspace.sqlite3 list --minimum 75
python3 leads.py --db workspace.sqlite3 update 1 --stage Contacted --notes "Discovery call requested"
python3 leads.py --db workspace.sqlite3 export crm-review.csv --stage Contacted
```

Use `python` instead of `python3` if that is your Python 3.11+ command. All commands accept `--help`. Put the global `--db` option before the command. Store your database in a private folder and back it up while the workspace is closed; this local tool has no encryption or multi-user access controls.

CSV fields are `name,email,website,phone,stage,fit,intent,budget,notes`. Only name is required; missing signals default to zero and stage defaults to New. Supported stages: New, Qualified, Contacted, Won, Lost. Signals must be integers from 0 to 100. Scores use 40% fit, 35% intent and 25% budget, rounded to the nearest whole number; they are a prioritization rubric, not a prediction.

To import different headers, create a JSON mapping such as `{"name":"company_name","email":"contact_email"}` and run `import your-leads.csv --mapping mapping.json`. Map other fields the same way. Unmapped fields use their standard header names. Map both lead pipeline files separately if their columns differ; records are not automatically joined or enriched.

Imports validate all rows before saving. A case-insensitive match on trimmed name and email skips a duplicate and preserves existing edits. Blank-email duplicates use name alone. Different email addresses remain separate records even for the same organization. Review imports before using this rule with real data. Fix an invalid CSV and rerun; the import prints added and duplicate counts.

Exports include the internal record ID, lead fields, score and modification time. Review the destination CRM's import mapping and duplicate settings before importing. CSV cells beginning with spreadsheet formula characters are prefixed with an apostrophe; database values remain unchanged. Export refuses to overwrite an existing file, so choose a new filename for each attempt. This is a manual exchange workflow, not a synchronized CRM integration with remote retries or delivery status.

From the repository root, run `npm run test:lead-workspace` for all Python storage, CLI and HTTP checks plus JavaScript parsing. Requires Python 3.11+, Node.js and permission to open a loopback socket. No Python packages need installing.

Or run the Python regression checks from this product directory with:

```sh
python3 -B -m unittest discover -s . -p 'test_*.py' -v
```

## Browser demo

Open [demo.html](demo.html) or [try it on the store](https://snowseasonstech.store/demos/operations-lead-intelligence.html).

Filter fictional prospects by stage and minimum score, review their signals, and adjust fit, intent, and budget readiness. The demo's explicit scoring rubric is 40% fit + 35% intent + 25% budget. Changing a stage updates the queue.

This is an offline workflow preview. It does not enrich leads, contact prospects, predict conversion, or sync to a CRM. All changes reset on reload.

## Hosted sign-in boundary (phase 2)

`/storefront/lead-workspace` is a separate Cloudflare Pages entry page. It uses the existing customer portal sign-in and HttpOnly session cookie; the local Python startup token is never accepted. `/api/lead-workspace/session` checks the server-side session and returns verified identity, session expiry and current workspace/billing availability. A portal account alone does not grant hosted lead access; pilot and subscription checks are enforced separately.

The new session reader uses request-scoped store bindings, rejects expired sessions and fails closed when storage is missing or unavailable. Logout and password changes invalidate access through the existing portal mechanisms. The page clears the password after login attempts and returns to sign-in when its session expires.

Deployment uses the existing Pages build (`npm run build:pages`) and existing production store bindings. Do not run the Python development server on the public internet. Hosted customer records, isolation and subscription checks belong to later phases. Local Cloudflare browser validation uses the run-snowstore fake store and fictional accounts; it does not require creating production customers.

## Isolated hosted pilot (phase 3)

The hosted editor at `/storefront/lead-workspace-app` uses `/api/lead-workspace/leads` for all persisted lead operations. Its public HTML contains no customer records. The API resolves the portal session on every request and derives the Redis workspace key from the verified account email. Browser-supplied account identifiers cannot select a different customer's data. Account email changes currently create a different workspace; do not rename pilot accounts without a migration plan.

Pilot access is off by default. To invite existing accounts in a test or production environment, set the Pages binding `LEAD_WORKSPACE_PILOT_EMAILS` to a comma-separated list of their normalized email addresses. Keep this server-side. Use the existing Upstash store bindings and portal accounts. Removing an address stops API access without deleting its data. This pilot allowlist is temporary access control; paid subscription enforcement is still phase 4. No production pilot accounts were enabled during development.

Each pilot workspace supports up to 200 leads and a 1 MB stored document. Browser CSV files are limited to 250 KB; encoded API writes are bounded to 256 KB, so large quoted/unicode imports may need smaller batches. Imports validate all rows before writing, skip duplicates by trimmed name/email ignoring case, and preserve existing edits. CSV mapping occurs in the browser; the server independently validates every resulting lead. Export fetches the authenticated workspace again and writes only the visible records, escaping spreadsheet formula prefixes.

Writes require a matching workspace revision and an atomic Redis compare-and-set. A stale editor gets HTTP 409 and retains unsaved text. Copy any edits you want to keep, reload the queue, reopen the lead and reapply them to the latest record. This conservative pilot model rejects simultaneous edits even to different leads rather than silently overwriting data. An additional workspace header binds an open form to the account from which it loaded; changing the signed-in account cannot save the old form into the new account.

The editor clears loaded data on navigation and session expiry, and revalidates when returning to a tab. Requests with missing sessions, uninvited accounts, cross-origin writes, malformed fields, stale revisions or oversized imports are rejected. No hosted deletion or automatic local SQLite migration is included; use reviewed CSV import to move sample records into a pilot.

Verification: `npm run test:lead-workspace` covers local storage/CLI/HTTP tests plus hosted authentication, two-account isolation, CAS conflicts, import atomicity, request bounds and CSV exchange. Additional browser/API checks ran in Cloudflare's local runtime against a disposable real Redis 7 instance: simultaneous saves produced one HTTP 200 and one HTTP 409, foreign-record updates returned 404, and separate customer imports and exports remained isolated. Desktop/mobile layouts and stale-edit recovery were also checked. Production storage and authenticated pilot journeys still require validation with explicitly invited accounts before customer rollout.

## Subscription lifecycle (phase 4)

Billing enforcement is opt-in with `LEAD_WORKSPACE_BILLING_ENABLED=1`. Leave it unset or `0` for the existing explicitly invited free pilot. Other values fail closed on workspace access. No production billing or pilot setting was enabled during development. While the catalog entry remains a draft, even a valid subscription also requires the pilot allowlist; release review must happen before enabling general access.

In billing mode, every hosted read/write and session availability check retrieves current subscription state from Stripe. A verified successful Checkout webhook links the normalized checkout email to its subscription/customer using an atomic Redis set. The portal account must use that email. Requests cannot select a different owner or substitute their own Stripe customer. Existing subscriptions without a received successful checkout event need verified linking before they can access this workspace; merely assigning a product to a portal account does not grant subscription access.

Access policy:

- Active subscriptions require the matching Lead Generation Pro Stripe product, customer, unexpired billing period and a paid or zero-amount latest invoice. Trials require an unexpired trial.
- Past-due subscriptions receive the user-approved seven-day grace period. It starts at the invoice due date, or invoice finalization time for automatic collection. Payment retries do not extend it. Missing timing evidence denies grace rather than guessing.
- Cancel-at-period-end access lasts until the scheduled end; immediate cancellation, unpaid, paused, incomplete and expired states deny access. Paused payment collection also denies access.
- Denial leaves all lead records intact. Payment recovery or a newly completed subscription checkout can restore access to the same account workspace. No automatic deletion or retention deadline is introduced.
- Stripe/store errors return an unavailable response and never bypass billing checks. Lookup timeout is five seconds per subscription; no automatic Stripe retry occurs in a workspace request. Accounts with more than 20 linked subscriptions require operator review.

The account page shows current availability, grace timing and **Manage billing**, which opens Stripe's configured customer portal using only trusted checkout-linked customer IDs. The signed-in customer portal also links to the lead workspace. Stripe customer portal settings must be configured in the test/live account before using this action; development did not change those settings.

Webhook delivery must include `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. Raw-body signature verification remains required. Invoice events are recorded idempotently for diagnostics; their snapshots never grant access. Subscription event snapshots remain available to existing download flows, while hosted lead access checks current Stripe state so delayed or same-second events cannot resurrect canceled access.

Verification includes signed/unsigned webhook fixtures, duplicate/reordered events, trials, seven-day boundaries, cross-account/product mismatches, cancellation, recovery with preserved records, billing portal ownership, and provider failure. Browser tests use real application handlers with mocked Stripe responses for active → grace → expired → recovered → canceled transitions. No real charges, real subscriptions or Stripe account settings were changed. A full isolated Stripe sandbox checkout/portal lifecycle is still required during the end-to-end pilot before customer rollout. Tax configuration remains unchanged and belongs to release review.

Reference: [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

## HubSpot connector (phase 5)

Open `/storefront/lead-workspace-crm` from the hosted editor. HubSpot was selected as the first CRM. The connector handles contact records; it does not synchronize HubSpot company objects, deals, notes, pipeline stages, follow-up tasks or marketing subscriptions.

### Enable an isolated test

1. Use an existing HubSpot developer test account. Create a **service key** with `crm.objects.contacts.read` and `crm.objects.contacts.write` scopes using HubSpot's Development → Keys → Service keys screen. New legacy private apps can no longer be created; service keys are the current simple-integration path.
2. Configure the Pages secret `LEAD_CRM_ENCRYPTION_KEY` with a cryptographically random 32-byte key encoded as canonical base64. Keep it out of git and chat. Back up this key separately: changing or losing it makes stored CRM credentials unreadable until accounts reconnect. Key rotation and recovery belong to phase 6.
3. Set `LEAD_CRM_ENABLED=1` only in the intended test environment, with the existing pilot/session/billing bindings. Production CRM access remains off unless explicitly enabled. Billing checks apply to every CRM request whenever billing mode is enabled.
4. Sign in as the invited pilot account and enter the HubSpot service key in the connection form. It is verified with a read-only contact request, encrypted using AES-256-GCM with account-specific authenticated data, and never returned by the API or saved in browser storage. Write permissions are exercised during delivery. The destination is the HubSpot account owning that key; no account name or ID is inferred from a supplied label.
5. Select up to ten leads, choose mappings and prepare a preview. Every selected lead needs a valid, distinct email. Review the exact values and explicitly confirm delivery.

### Delivery behavior

Supported HubSpot properties are email, company, phone and website. Defaults map local email → email, organization name → company, phone → phone and website → website. Empty and unmapped fields are omitted. Existing contacts are looked up by email, then updated by record ID without changing their primary email. Missing contacts are created; a concurrent create conflict is reconciled by another email lookup. If a create response is lost, retry looks up that email before creating again. Changing a local contact email changes the matching identity and may create a new HubSpot contact.

Each preview snapshots the selected records, mapping, workspace revision and connection version. Changed records, expired reviews or replaced credentials require a new preview. Reviews expire after 15 minutes; at most twenty reviews are retained per account. A fresh preview of the same unchanged data reuses a still-valid review and its delivery results.

A durable sixty-second delivery lease prevents overlapping sends for an account. Attempts are saved before remote writes; successful rows store the HubSpot contact ID and are skipped on retry. If a process dies after a remote write, an expired lease permits reconciliation by the same email. Retryable timeouts, 429 and 5xx responses preserve results and wait before another attempt. Provider `Retry-After` applies to the connection, including newly prepared reviews. Each row gets at most three attempts per review; permanent errors require correcting fields or credentials and preparing a new preview. Confirmed results are retained separately from lead data.

Disconnect removes the stored encrypted credential and invalidates existing reviews. It does not revoke the HubSpot service key, delete remote contacts or erase delivery history; revoke the key in HubSpot when appropriate. The app sends no outreach, but existing automations in the chosen HubSpot account can still run on contact changes.

### Verification status

Automated tests cover encryption and tamper rejection, customer isolation, stale/invalid previews, duplicate emails, create conflicts, lost responses, delivery locks, interrupted attempts, retry limits and backoff, secret redaction, disconnect and reconnect. Cloudflare runtime browser checks verified AES encryption, field selectors, readable preview, preview invalidation, explicit delivery, recovery from a lost create response with one remote contact, per-record IDs, separate customer history and desktop/mobile layouts. HubSpot and Redis were fixtures for that browser run.

A **real HubSpot test-account delivery is still required to complete phase 5**: connect a scoped test key, create one fictional contact, update it through a second reviewed delivery, retry the same review, and confirm the same HubSpot ID and a single contact. Record those results before rollout. No real HubSpot key or account was available during implementation, and no remote CRM records were created by these checks.

Official references: [service keys](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/account-service-keys), [Contacts API](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide). Legacy v3 contact endpoints remain documented and are used by this MVP; the documented email batch-upsert limitation is avoided by individual lookup/update/create operations.

## Operations and recovery (phase 6)

See [the operations runbook](../../hosted/LEAD-OPERATIONS.md) for environment setup, encrypted backup/restore, maintenance, sanitized failure signals and code rollback. From the repository root, `npm run test:lead-recovery` runs an isolated real-Redis recovery drill with two fictional accounts and a previous application bundle; Docker is required. It does not read production credentials or switch production deployments.

Backups use a separate `LEAD_BACKUP_KEY` and an explicit private account manifest. Restore defaults to a dry run and rejects any populated account target. Lead records and trusted billing links are recovered, while CRM connections are removed and prior delivery previews are expired. Passwords, sessions, complete order history and webhook claims must be recovered or reprovisioned separately. Provider event replay and a new pilot are required before restored data is exposed to customers.

`LEAD_WORKSPACE_MAINTENANCE=1` stops authenticated lead and CRM operations while a snapshot or recovery is prepared. Structured failures include support request IDs without lead contents or credential values. `node scripts/lead-alerts.js` consumes exported NDJSON logs and returns a sanitized operator signal; external alert routing, offsite backup storage, scheduling and retention are not installed automatically.
