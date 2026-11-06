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

`/storefront/lead-workspace` is a separate Cloudflare Pages entry page. It uses the existing customer portal sign-in and HttpOnly session cookie; the local Python startup token is never accepted. `/api/lead-workspace/session` checks the server-side session and returns only account email, expiry time and `workspaceEnabled: false`. A valid account does not yet grant hosted lead storage or paid subscription access.

The new session reader uses request-scoped store bindings, rejects expired sessions and fails closed when storage is missing or unavailable. Logout and password changes invalidate access through the existing portal mechanisms. The page clears the password after login attempts and returns to sign-in when its session expires.

Deployment uses the existing Pages build (`npm run build:pages`) and existing production store bindings. Do not run the Python development server on the public internet. Hosted customer records, isolation and subscription checks belong to later phases. Local Cloudflare browser validation uses the run-snowstore fake store and fictional accounts; it does not require creating production customers.

## Isolated hosted pilot (phase 3)

The hosted editor at `/storefront/lead-workspace-app` uses `/api/lead-workspace/leads` for all persisted lead operations. Its public HTML contains no customer records. The API resolves the portal session on every request and derives the Redis workspace key from the verified account email. Browser-supplied account identifiers cannot select a different customer's data. Account email changes currently create a different workspace; do not rename pilot accounts without a migration plan.

Pilot access is off by default. To invite existing accounts in a test or production environment, set the Pages binding `LEAD_WORKSPACE_PILOT_EMAILS` to a comma-separated list of their normalized email addresses. Keep this server-side. Use the existing Upstash store bindings and portal accounts. Removing an address stops API access without deleting its data. This pilot allowlist is temporary access control; paid subscription enforcement is still phase 4. No production pilot accounts were enabled during development.

Each pilot workspace supports up to 200 leads and a 1 MB stored document. Browser CSV files are limited to 250 KB; encoded API writes are bounded to 256 KB, so large quoted/unicode imports may need smaller batches. Imports validate all rows before writing, skip duplicates by trimmed name/email ignoring case, and preserve existing edits. CSV mapping occurs in the browser; the server independently validates every resulting lead. Export fetches the authenticated workspace again and writes only the visible records, escaping spreadsheet formula prefixes.

Writes require a matching workspace revision and an atomic Redis compare-and-set. A stale editor gets HTTP 409 and retains unsaved text. Copy any edits you want to keep, reload the queue, reopen the lead and reapply them to the latest record. This conservative pilot model rejects simultaneous edits even to different leads rather than silently overwriting data. An additional workspace header binds an open form to the account from which it loaded; changing the signed-in account cannot save the old form into the new account.

The editor clears loaded data on navigation and session expiry, and revalidates when returning to a tab. Requests with missing sessions, uninvited accounts, cross-origin writes, malformed fields, stale revisions or oversized imports are rejected. No hosted deletion or automatic local SQLite migration is included; use reviewed CSV import to move sample records into a pilot.

Verification: `npm run test:lead-workspace` covers local storage/CLI/HTTP tests plus hosted authentication, two-account isolation, CAS conflicts, import atomicity, request bounds and CSV exchange. Additional browser/API checks ran in Cloudflare's local runtime against a disposable real Redis 7 instance: simultaneous saves produced one HTTP 200 and one HTTP 409, foreign-record updates returned 404, and separate customer imports and exports remained isolated. Desktop/mobile layouts and stale-edit recovery were also checked. Production storage and authenticated pilot journeys still require validation with explicitly invited accounts before customer rollout.
