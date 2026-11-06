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
