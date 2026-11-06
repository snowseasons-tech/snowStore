# Lead workspace operations and recovery

This runbook covers the hosted lead workspace, its reviewed HubSpot deliveries and subscription links. It does not replace a full provider-level Redis backup or a Stripe/HubSpot account recovery plan. Production customer rollout remains gated on the provider pilot checks in MVP-WORKFLOW.md.

## Deploy and check

1. Run `npm run test:lead-workspace`, `npm run test:lead-recovery`, `npm test`, `npm run lint`, `npm run validate:store-items` and `npm run build:pages` from the repository root. The recovery drill requires Docker and runs an isolated Redis 7 container; it never uses production Redis bindings.
2. Commit the verified code and push to main to trigger the existing Cloudflare Pages pipeline. Record the exact commit and deployment in the workflow evidence.
3. Check the HTTPS account page and editor. Signed-out session, data, CRM and billing management requests must return 401; checking a public HTML shell alone does not prove data access works.
4. In an isolated environment, verify both an invited user and a denied user. Verify billing and CRM flags deliberately; these settings are not enabled by a code deployment.
5. Review structured failure logs before increasing pilot access. Do not enable a draft bundle as part of routine deployment.

## Failure visibility

Functions emit JSON events without request bodies, customer emails, lead fields, credentials or raw exception messages:

- `lead_operation_failed`: operation, HTTP status and random request ID. The API returns that ID in `X-Request-ID` and its JSON body for support correlation.
- `lead_crm_delivery_failed`: random review ID, retryable/failed state and attempt count. The customer can see the corresponding delivery result inside their authenticated workspace.

Export structured Pages Function logs and process them with:

```sh
node scripts/lead-alerts.js < /private/path/function-logs.ndjson
```

The command emits only sanitized failed-import, provider-delivery and unavailable-operation events. It exits 1 when failures or malformed log lines are found, and 0 when none are found. It accepts direct events or Cloudflare export objects with `logs[].message`. Failed imports include rejected rows/mappings; inspect the customer's request ID and ask them to correct their own input instead of copying lead contents into logs.

Treat new 5xx failures as requiring investigation; retryable CRM failures should recover only after their provider backoff. Never clear a delivery lease or repeat an uncertain external write blindly. A 401 from a signed-out probe is expected and is not an alert. Planned maintenance failures are tagged and excluded by the signal filter.

External alert delivery is **not configured by these scripts**. Route this sanitized output/nonzero exit status through the operator's existing monitoring system and verify receipt with a fictional failure before rollout. No email, Slack message or other notification is sent automatically. Exported logs may contain unrelated application messages; malformed input is reported without echoing it.

## Backup scope and keys

Use three independent secrets in their intended roles:

| Secret | Purpose | Recovery behavior |
| --- | --- | --- |
| Redis REST token | Read source or write isolated target | Use the selected environment's token; never include it in argv or logs |
| `LEAD_BACKUP_KEY` | AES-256-GCM encryption/authentication of the backup file | Required to read the backup; store separately from the encrypted file |
| `LEAD_CRM_ENCRYPTION_KEY` | Encryption of account HubSpot credentials | Back up separately; restore deliberately disconnects CRM so customers must reconnect |

Both encryption keys are independent cryptographically random 32-byte values encoded as canonical base64. Do not reuse them or put them in git, chat, shell history or the backup file. Use your secret manager to provide environment variables. This implementation has no automatic key rotation: retain the matching backup key for every retained snapshot and reconnect CRM accounts after changing the CRM key. Losing the backup key makes its snapshots unrecoverable.

Each snapshot contains only the selected accounts' lead documents, encrypted CRM configuration/delivery history and trusted subscription/customer link sets. Portal passwords, sessions, reset links, webhook event claims, complete order history and provider credentials are not included. Protect and back up the rest of the service separately. Maintain a private, complete account manifest; an omitted account is not silently discovered or backed up.

## Quiesce and take a backup

1. Set `LEAD_WORKSPACE_MAINTENANCE=1` in the chosen Pages environment. The hosted lead and CRM routes then reject operations with 503. Leave provider webhooks running; snapshot billing links are point-in-time and later events may need replay after disaster recovery.
2. Wait for previously accepted requests to finish. Backups reject CRM delivery leases still marked active; do not force them past an uncertain remote write. Allow at least the lease interval and verify delivery status before continuing.
3. Prepare a private newline-separated list of normalized account emails outside the repo, or in the ignored `backups/` directory. Use file mode 600. Ensure the output directory is private and exists.
4. With source Redis bindings and `LEAD_BACKUP_KEY` supplied by your secret manager, run:

```sh
node scripts/lead-backup.js backup --accounts /private/path/accounts.txt --out /private/path/lead-backup.enc
```

The file is created exclusively with mode 600; existing files are never overwritten. The snapshot reads each account's three data keys atomically. It is not a cross-account transaction, so keeping application writes paused is required for a coordinated snapshot. Split large manifests into batches if the 60 MB plaintext limit is reached. CLI output contains counts only.

5. Copy the encrypted snapshot off the application host using your existing backup storage. Keep its encryption key separately. Verify recovery regularly using an isolated empty target. No backup schedule, offsite upload or automatic deletion/retention policy is installed here.
6. Clear maintenance mode and verify the authenticated workspace. Record the snapshot time, accounts count and restore-test result without recording customer contents.

## Restore to an isolated target

1. Keep the target unavailable to customers. Set maintenance on and CRM/billing pilot access off. Never point this drill at the production source.
2. Supply the **target** Redis URL/token and the matching `LEAD_BACKUP_KEY`. Read and authenticate the entire encrypted file before making changes. The restore CLI enforces a 100 MB encrypted-file limit.
3. Run a dry run first:

```sh
node scripts/lead-backup.js restore --in /private/path/lead-backup.enc
```

4. Verify the target environment and counts, then run:

```sh
node scripts/lead-backup.js restore --in /private/path/lead-backup.enc --apply
```

All target account keys must be absent. Restore preflights every account, then restores each account atomically with another empty-target check. It never overwrites existing data. A race/error can leave earlier accounts restored; keep that target isolated, inspect its counts and restart with a fresh empty target rather than repeatedly applying to a partially restored store.

5. CRM credentials are removed from the restored live configuration. Previous reviews are expired; interrupted rows become failed and require reconciliation in HubSpot. No provider write resumes automatically. Contact the customer through the normal support workflow to reconnect when appropriate; the restore itself sends no messages.
6. Reprovision or recover portal accounts separately, using their original normalized emails. Passwords and sessions are not restored. Reconcile successful checkout events missing after the snapshot through verified Stripe event replay into the target, and check current Stripe status before granting access. Test/live Stripe modes and account/customer IDs must match their environment; do not enable billing against copied fixture links.
7. Verify two customers independently: each must see only its own records, including when another account's ID/email is supplied in the URL. Check lead counts, notes, follow-up dates and revision behavior. Keep CRM disabled until provider contact IDs and uncertain prior writes are reconciled.
8. Re-run the end-to-end pilot before making the target public. A successful restore drill does not establish production credentials, alert routing or provider readiness.

## Roll back application code

1. Enable maintenance, retain the last encrypted snapshot, and record the failing deployment/commit. Do not delete customer data or replace Redis as part of a code rollback.
2. Use Cloudflare Pages' deployment rollback to select the last verified production deployment. Confirm compatibility flags and environment bindings still match it; code rollback does not restore data or secret values.
3. Keep CRM delivery off. Verify signed-out rejection and authenticated read/edit in an isolated environment before reopening production. If the old version cannot read the current schema, stop and recover to an isolated target instead of attempting an unreviewed reverse migration.
4. Clear maintenance only after the checks pass. Keep evidence of both rollback and subsequent roll-forward. A prior bundle that predates maintenance support requires an upstream access restriction while checks run.

The automated drill archives the previous committed bundle (`HEAD^` by default, or `npm run test:lead-recovery -- --rollback-ref <commit>`), restores a two-account fixture snapshot into empty real Redis, checks current account isolation, checks the archived bundle's read/edit, then checks the current bundle can read that edit. No production deployment is switched by the drill. Re-run it before a schema-changing release and keep the prior known-good commit available.

References: [Pages Function logs](https://developers.cloudflare.com/pages/functions/debugging-and-logging/), [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).
