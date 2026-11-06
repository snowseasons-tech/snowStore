# Draft subscription bundle readiness

Reviewed 2026-11-06 against the catalog, product source and hosted provisioning code. Source code is evidence of implementation, not proof of a working production service. All six bundles remain drafts; proposed prices are unchanged.

| Bundle | Existing components | Remaining work |
| --- | --- | --- |
| Business Launch | Booking and invoice downloads | Build website management software with customer access, editable site data, publishing and recovery. Page Builder exports HTML but does not fulfill ongoing website management. |
| Marketing Automation | Auto Blogger download; Social Studio and MailHub applications; hosted provisioning for both | Verify a three-account Social Studio deployment, OAuth callbacks, scheduling and cancellation. Verify MailHub sending, webhooks and unsubscribe links. Choose a monthly email allowance and configure `mailhubSends`; no allowance is currently assigned. |
| Lead Generation Pro | Lead Generation Pipeline download; local SQLite lead workspace with mapped CSV import, duplicate handling, stage and notes updates, scoring and CSV export; browser demo | Add hosted customer access and a direct CRM integration with field mapping, duplicate handling, error reporting and retry. The local workspace provides manual CRM file exchange; the browser demo still resets on reload. Neither establishes a hosted CRM integration. |
| Business Operations | Booking and invoice downloads | Implement hosted database provisioning, private customer credentials, isolation, backups, tested restore, limits and subscription lifecycle handling. Current hosted provisioning supports Social Studio and MailHub only. |
| AI Business Intelligence | Lead workflow and MailHub demos; MailHub campaign statistics | Implement persistent operations data, marketing data ingestion and AI reporting with attributable inputs and error handling. Campaign statistics alone do not fulfill MailHub Intelligence or AI reporting. |
| Complete Business Suite | Invoice download; Social Studio and MailHub application source | Complete website management, lead intelligence and database work above; validate five-account Social Studio; choose an email allowance; verify provisioning and customer access across every included service. |

## Implementation order

Local development progress: the lead workspace now has a loopback-only browser interface for persistent lead editing, mapped CSV import, filtering and manual CRM export. Storage and HTTP regression tests pass, and desktop/mobile browser checks verified saved edits across reloads. Hosted authentication, tenant isolation and a direct CRM connector remain open.

1. Close launch-control gaps: prevent draft provisioning and direct Stripe creation for unfinished bundles, and reject invalid bundle entitlements. Regression tests cover these controls.
2. Validate Marketing Automation first because both hosted applications already have code. Use isolated test accounts and provider sandbox data, verify account and send limits, setup email delivery, restart and cancellation, and backup restoration. Record actual results before removing pending entries.
3. Build persistent lead management and a CRM adapter to unblock Lead Generation Pro, then use that data foundation for intelligence reporting.
4. Build website management and database provisioning as separate services. Complete Business Suite depends on these shared services and should follow their individual validation.

## Release evidence required per bundle

- Every promised component has a customer access path and an exercised core workflow.
- Each downloadable entitlement resolves to an available catalog product. Hosted components have explicit limits and lifecycle support.
- Provisioning, cancellation, restoration and tenant isolation are verified in a test deployment.
- Support scope and recurring price are approved; the catalog's pending list is cleared only after the corresponding functionality is verified.
- Run `npm run validate:store-items`, bundle and hosted tests, then verify checkout, portal access and fulfillment with test subscriptions before enabling sales.

Keep `pending` entries until implementation and deployment validation are complete. Existing Stripe links do not establish readiness. The provisioning sync deliberately preserves existing running servers for draft plans and can stop canceled subscriptions, but does not create, restart or resize draft servers.
