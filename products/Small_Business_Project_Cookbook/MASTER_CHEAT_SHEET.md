# Cookbook Master Cheat Sheet
Run commands from the cookbook root unless a line explicitly changes directory. Replace path placeholders. Windows Python users substitute py -3 for python3; Bash users on Windows use WSL.

| Task | Command or code pattern |
| --- | --- |
| Summarize expenses | `python3 projects/01_expense_summary/report.py` |
| List follow-ups at a fixed date | `python3 projects/02_followup_queue/followups.py --as-of 2026-10-29` |
| Inventory sample files | `bash projects/03_folder_inventory/inventory.sh "projects/03_folder_inventory/sample files"` |
| Create practice archive | `bash projects/04_records_archive/archive.sh` |
| Open SQL practice file | `sqlite3 -bail cookbook_jobs_01.db` |
| Run SQL file inside SQLite | `.read projects/05_customer_job_reports/setup.sql` |
| Display SQL headings | `.headers on` |
| Display aligned columns | `.mode column` |
| Enable related-table rules | `PRAGMA foreign_keys = ON;` before beginning a transaction |
| Preview matching records | `SELECT * FROM jobs WHERE job_id = 102;` |
| Total completed job values | `SELECT SUM(amount_cents) FROM jobs WHERE status = 'completed';` |
| Start/undo practice edits | `BEGIN TRANSACTION;` then edits, then `ROLLBACK;` |
| Show SQLite tables | `.tables` |
| Exit SQLite | `.quit` |
| Serve saved checklist locally | `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08_saved_checklist` |
| Build stock snapshot | `python3 projects/12_stock_dashboard/build_dashboard.py` |

## Bash archive restore
Only use the fictional archive you created. Set workspace to its printed path:
```bash
workspace="PASTE_PRINTED_WORKSPACE_PATH"
if restored=$(mktemp -d "$workspace/restore.XXXXXX"); then
    if tar -xzf "$workspace/backup/business-records.tar.gz" -C "$restored"; then
        printf 'Restored to %s\n' "$restored"
        cat "$restored/Invoices/sample.txt"
    else
        printf 'Restore failed. Inspect the error.\n' >&2
    fi
else
    printf 'Could not create a restore folder.\n' >&2
fi
```
Quote variable paths. A successful archive listing is an initial check; inspect restored content too. No rm command is required for these recipes.

## HTML CSS and JavaScript patterns
| Pattern | Meaning |
| --- | --- |
| `<label><input type="checkbox">Task</label>` | Named checkbox with native keyboard behavior. |
| `<details><summary>Question</summary><p>Answer</p></details>` | Disclosure without JavaScript. |
| `.card { padding: 1.5rem; }` | Class-based styling. |
| `@media (min-width: 48rem) { ... }` | Wider-screen condition. |
| `grid grid-cols-1 gap-4 md:grid-cols-3` | Tailwind responsive grid utilities. |
| `document.querySelector("#hours")` | Find an element by id; may return null. |
| `input.valueAsNumber` | Numeric value or NaN for unusable input. |
| `element.textContent = message` | Write plain text, not parsed HTML. |
| `form.addEventListener("submit", handler)` | Respond to form submission, including keyboard use. |
| `JSON.stringify(value)` | Serialize data as text. |
| `JSON.parse(text)` | Parse JSON; handle errors and validate shape. |
| `localStorage.setItem(key, text)` | Save origin-local text; handle blocked or full storage. |

Browser storage is not a shared database or a backup. File-URL behavior varies; use a loopback origin for the saved checklist. Stop development servers with Ctrl+C. A server started at 127.0.0.1 is for local development.

## Tailwind and Jekyll setup commands
For recipe 10 first change into projects/10_responsive_service_cards. Run npm install, then npm run build:css. Keep package-lock.json after resolving and testing dependencies. npm ci requires a matching lockfile.

For recipe 11 first change into projects/11_service_website. Run bundle config set --local path vendor/bundle, bundle install, bundle exec jekyll build --trace and bundle exec jekyll serve --host 127.0.0.1. Keep Gemfile.lock once resolved. Edit source, not _site. The optional Tailwind page needs npm install and npm run build:css before Jekyll builds it.

Jekyll `{{ content }}` inserts a page in a layout. `{{ '/quote/' | relative_url }}` adds baseurl. `{% include header.html %}` reuses navigation. `site.data.services` reads the YAML service list. Liquid runs while building; JavaScript runs in the browser afterward.

## Before adapting code
Use fictional data while learning. Preview SQL row selection before changes. Keep money in defined units and validate cents before arithmetic. Use bound SQL parameters and HTML escaping rather than concatenating untrusted input. Test failure paths and retain a separate reference copy. Never assume a successful build proves correct browser behavior.
