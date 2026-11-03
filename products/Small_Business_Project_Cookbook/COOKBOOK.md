# Small Business Project Cookbook

Snow Seasons Tech • Volume 1 • Version 1.0

Twelve practical recipes for adults who own small businesses and are learning to code. Use Python for reports, Bash for file tasks, SQL for related data, HTML for structure, CSS and Tailwind for presentation, JavaScript for browser interaction, and Jekyll to assemble reusable pages.

This cookbook includes complete commented source, fictional sample data, expected outcomes and modification challenges. Seven recipes introduce new examples; five adapt projects from the companion lesson bundles. The adapted recipes are 4, 5, 9, 10 and 11. You do not need those older downloads because their required source is included here.

## How to use this book

1. Choose one recipe and read its ingredients before installing anything.
2. Run the supplied sample unchanged and compare with the expected result.
3. Read the source comments, make one modification and predict its effect.
4. Try a bad input or failure case, then explain the recovery behavior.
5. Keep your edited learning copy separate from the reference solution.

Open COOKBOOK.html for the styled, printable edition or COOKBOOK.md for the plain text source. All recipes have a local README.md beside their code. The book links directly to each recipe folder. Browser code is provided for learning; a complete security, accessibility and operational review is still needed before adapting it to actual customers.

## Choose a project

| Recipe | Useful result | Languages | Approximate time |
| --- | --- | --- | --- |
| 01 | [Expense summary](projects/01_expense_summary/README.md) | Python | 45–60 minutes |
| 02 | [Customer follow-up queue](projects/02_followup_queue/README.md) | Python | 45–60 minutes |
| 03 | [Read-only folder inventory](projects/03_folder_inventory/README.md) | Bash | 30–45 minutes |
| 04 | [Local records archive](projects/04_records_archive/README.md) | Bash | 45–75 minutes |
| 05 | [Customer and job reports](projects/05_customer_job_reports/README.md) | SQL with SQLite | 60–90 minutes |
| 06 | [Overdue invoice balances](projects/06_receivables/README.md) | SQL with SQLite | 45–75 minutes |
| 07 | [Office opening checklist](projects/07_opening_checklist/README.md) | HTML and CSS | 30–45 minutes |
| 08 | [Saved daily checklist](projects/08_saved_checklist/README.md) | HTML, CSS and JavaScript | 60–90 minutes |
| 09 | [Interactive service quote](projects/09_service_quote/README.md) | HTML, CSS and JavaScript | 60–90 minutes |
| 10 | [Responsive service cards](projects/10_responsive_service_cards/README.md) | HTML, CSS and Tailwind | 90–150 minutes plus setup |
| 11 | [Data-driven service website](projects/11_service_website/README.md) | Jekyll, HTML, JavaScript and CSS | 2–3 hours plus setup |
| 12 | [Searchable stock dashboard](projects/12_stock_dashboard/README.md) | Python, SQL, HTML, CSS and JavaScript | 2–3 hours |

## Setup conventions

Start terminal commands from the extracted Small_Business_Project_Cookbook root unless a recipe explicitly tells you to change directory. Replace ALL_CAPS path placeholders with actual paths. Keep paths in quotes. Python commands use python3 on Linux/macOS; on Windows substitute py -3. Bash recipes use WSL on Windows. HTML pages open locally unless a recipe specifies a loopback server. SQLite dot commands run inside sqlite3, not in your operating system shell.

Python recipes use the standard library and require no pip packages. SQLite shell, Node/npm, Ruby and Bundler are only needed for the recipes that name them. Tailwind setup follows v4, and Jekyll follows the supplied Gemfile. Follow current official operating system instructions rather than running everything with administrator rights.

## What has been verified

See TESTING.md for the exact checks. Python, Bash and SQLite data behavior are tested locally. JavaScript checks use a Node runtime and mocked DOM/storage objects. Browser rendering, cross-browser accessibility, Tailwind dependency compilation and Jekyll builds are not claimed as complete. The cookbook is ready for your review and beginner pilot testing, with those release gates visible.

## Recipe 01 Expense summary

**Outcome:** Read a CSV of expenses and total each category without editing the source.

**Languages:** Python. **Time:** 45–60 minutes.

**Files:** [projects/01_expense_summary](projects/01_expense_summary/).

### Ingredients

Python 3.11 or later. The standard library supplies csv, decimal and argparse; no pip installation is needed. Files: report.py and expenses.csv.

### Method

1. Inspect expenses.csv. It has date, category and amount headings with four fictional records.
2. From the cookbook root run `python3 projects/01_expense_summary/report.py`. On Windows use `py -3` instead of `python3` in all Python commands.
3. Read the inline comments, then find summarize and money. Note where text becomes a Decimal and then whole cents.
4. To use a separate practice file, run `python3 projects/01_expense_summary/report.py "PATH_TO_CSV"`, replacing the placeholder with your file path. Quotes preserve spaces.

### Expected result

Software: $29.00; Supplies: $60.00; Travel: $18.25; Total: $107.25. Category lines are sorted alphabetically.

### Make it your own

Add a $10.00 Travel record using a valid date. Predict the new category and overall totals, then run. Answer: Travel $28.25 and total $117.25. In a copy, try amount hello or 1.001 and confirm a readable failure with no partial report.

### Error handling and limits

Requires exact, unique CSV headings. Missing files, malformed rows, invalid dates, nonfinite amounts and fractional cents are rejected. Negative amounts are deliberately unsupported; refunds require a separate policy. Category matching is case-sensitive. This is a summary tool, not a tax or accounting ledger.

## Recipe 02 Customer follow-up queue

**Outcome:** List open follow-ups due on or before a chosen date, without sending messages.

**Languages:** Python. **Time:** 45–60 minutes.

**Files:** [projects/02_followup_queue](projects/02_followup_queue/).

### Ingredients

Python 3.11 or later. Files: followups.py and customers.csv. The fixed comparison date below makes results repeatable.

### Method

1. Read the four sample rows in customers.csv. open and closed are the only allowed statuses.
2. Run `python3 projects/02_followup_queue/followups.py --as-of 2026-10-29`.
3. Trace date.fromisoformat, the open-status check and the final sort in the commented source.
4. Run again with `--as-of 2026-11-05` and compare the queue. Omit --as-of to use your computer's local current date.

### Expected result

For 2026-10-29, Aspen Cleaning and Cedar Repairs appear in date order; Due follow-ups: 2. Pine Office is excluded because it is closed.

### Make it your own

Move Frost Studio's follow-up to 2026-10-28 in a copy. Answer: three due tasks at the fixed date, sorted Aspen, Frost, Cedar. Set a status to pending and confirm the script rejects it instead of guessing its meaning.

### Error handling and limits

Dates and statuses are checked before a report prints. This is a date-only workflow and does not schedule reminders, interpret time zones or contact customers. Use the result as a manual work queue.

## Recipe 03 Read-only folder inventory

**Outcome:** List regular files in one folder, including hidden files, without moving or changing them.

**Languages:** Bash. **Time:** 30–45 minutes.

**Files:** [projects/03_folder_inventory](projects/03_folder_inventory/).

### Ingredients

Bash 3.2 or later. On Windows use WSL. Files: inventory.sh and the fictional sample files directory. No sudo or chmod is needed when invoking bash.

### Method

1. From the cookbook root run `bash projects/03_folder_inventory/inventory.sh "projects/03_folder_inventory/sample files"`.
2. Read the comments about nullglob, dotglob and symbolic links.
3. Compare the printed escaped filenames with the directory contents.
4. Run against an empty practice directory and then a nonexistent directory to compare success and failure.

### Expected result

Three file entries and Regular files: 3. A filename containing a space may be displayed with a backslash because printf %q uses shell-escaped output.

### Make it your own

Add a fourth plain-text sample file and a subfolder. Answer: regular file count becomes four, not five. A symlink is skipped even if it points to a regular file. Try a path with spaces to check quoting.

### Error handling and limits

Only one directory level is inspected. Symlinks and subdirectories are excluded. The tool checks access to the directory but does not read or validate the contents of each file. Output is printed to the terminal; redirecting it with > is a separate action that can replace an existing destination.

## Recipe 04 Local records archive

**Outcome:** Create fictional business records, archive them after confirmation and practice restoring them.

**Languages:** Bash. **Time:** 45–75 minutes.

**Files:** [projects/04_records_archive](projects/04_records_archive/).

### Ingredients

Bash, mkdir, mktemp and tar. This recipe adapts the commented archive solution from the Bash lesson pack.

### Method

1. Run `bash projects/04_records_archive/archive.sh` from the cookbook root.
2. First type no. Sample records are created in a new private workspace but no archive is made.
3. Run again, type yes and copy the printed workspace path. The archive contains Invoices/sample.txt, Receipts/sample.txt and Reports/sample.txt.
4. Set `workspace="PASTE_PRINTED_WORKSPACE_PATH"` in your Bash terminal, replacing the placeholder. Use the guarded restore pattern in the master cheat sheet to extract into a fresh directory.

### Expected result

A new workspace under your home directory, three sample records and, after yes, backup/business-records.tar.gz. Listing the archive shows the sample members.

### Make it your own

Add Customers to the categories array. Answer: the new archive has four sample files. Restore the archive and inspect Invoices/sample.txt before considering the exercise complete.

### Error handling and limits

The script creates new practice data, not a backup of your actual business folder. It preserves earlier runs. Failed creation exits nonzero and partial output must not be treated as a valid archive. A same-device archive does not protect against losing the device.

## Recipe 05 Customer and job reports

**Outcome:** Join customer names to jobs and report completed job values while preserving customers with no matches.

**Languages:** SQL with SQLite. **Time:** 60–90 minutes.

**Files:** [projects/05_customer_job_reports](projects/05_customer_job_reports/).

### Ingredients

SQLite command line shell with foreign key support. The source is adapted from the SQL lesson pack. The README in this recipe is the cookbook-specific launch guide.

### Method

1. From the cookbook root open a new practice file: `sqlite3 -bail cookbook_jobs_01.db`. Use a new filename if already used.
2. At the SQLite prompt enter `.bail on`, `.headers on` and `.mode column` on separate lines.
3. Run `.read projects/05_customer_job_reports/setup.sql`, then `.read projects/05_customer_job_reports/reports_solution.sql`.
4. Read the joins and GROUP BY clauses. Run `.read projects/05_customer_job_reports/changes_practice.sql` to see temporary edits rolled back.

### Expected result

Four customers, five jobs and completed job value 50000 cents ($500.00). The completed-customer report retains Pine Office with zero matching jobs.

### Make it your own

Change the grouped-report threshold from 20000 to 10000 cents in a copy. Answer: Cedar Repairs, Aspen Cleaning and Frost Studio qualify. Explain why COUNT(j.job_id), rather than COUNT(*), is used after the LEFT JOIN.

### Error handling and limits

Keep foreign keys enabled on each connection. If a script error leaves an interactive transaction open, enter ROLLBACK before starting over. Completed job value is not necessarily cash collected or recognized revenue. SQL shell dot commands are not portable to PostgreSQL or MySQL.

## Recipe 06 Overdue invoice balances

**Outcome:** Combine invoices with partial payments and list balances overdue before a fixed date.

**Languages:** SQL with SQLite. **Time:** 45–75 minutes.

**Files:** [projects/06_receivables](projects/06_receivables/).

### Ingredients

SQLite command line shell. File: receivables.sql. This is a small fictional teaching ledger, not a payment processor.

### Method

1. Open a fresh file from the cookbook root: `sqlite3 -bail cookbook_receivables_01.db`.
2. Enter `.bail on`, `.headers on` and `.mode column`, each on its own line.
3. Run `.read projects/06_receivables/receivables.sql` once. Read the comments explaining the paid CTE.
4. To experiment without rerunning setup, copy only the final WITH ... SELECT statement into a query file. A CTE exists for the statement immediately following it.

### Expected result

Invoice 1 for Aspen Cleaning, due 2026-10-20, with balance_cents 12500 ($125.00). Invoice 2 is fully paid. Invoice 3 is not yet overdue on 2026-10-29.

### Make it your own

In a new database, add a further 2500-cent payment for invoice 1. Answer: its balance becomes 10000 cents. Advance the comparison date to 2026-11-11 in the report only: invoice 3 also appears with 10000 cents.

### Error handling and limits

Aggregate payments before joining them to invoices. Joining raw one-to-many payments and summing invoice totals would double count some invoices. Overpayments, refunds, voids, multiple currencies and real calendar-date validation are outside this simplified schema.

## Recipe 07 Office opening checklist

**Outcome:** Create a readable checklist with native controls and expandable instructions, without JavaScript.

**Languages:** HTML and CSS. **Time:** 30–45 minutes.

**Files:** [projects/07_opening_checklist](projects/07_opening_checklist/).

### Ingredients

Plain-text editor and browser. Files: index.html and styles.css. Keep them together.

### Method

1. Open projects/07_opening_checklist/index.html in your browser.
2. Read the HTML comments about fieldset, legend and nested labels.
3. Use Tab to focus a checkbox and Space to toggle it. Activate the details summary using keyboard and pointer.
4. Edit a label, save and refresh. This example deliberately does not promise any saved state.

### Expected result

Three labeled tasks and an expandable explanation. The page works as a local interface even without JavaScript.

### Make it your own

Add a fourth labeled checkbox for checking the entrance. Answer: place a new label/input pair inside the fieldset; no script change is required. Explain why a placeholder is not a substitute for a visible label.

### Error handling and limits

There is no completion history, shared account or reliable persistence. A browser might restore form state opportunistically, but this is not an audit record. A real operating procedure should be reviewed by the business owner.

## Recipe 08 Saved daily checklist

**Outcome:** Persist three checkbox states in the browser with schema checks and readable storage-error messages.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

**Files:** [projects/08_saved_checklist](projects/08_saved_checklist/).

### Ingredients

Browser and editor. Python 3 is useful for a predictable local origin. Files: index.html, styles.css and checklist.js.

### Method

1. From the cookbook root start a loopback-only development server: `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08_saved_checklist`. Windows uses py -3 instead of python3.
2. Open http://127.0.0.1:8080/ and check a task. Refresh at the same address. If storage is available, the check remains.
3. Read the try/catch blocks, versioned storage key and JSON shape validation in checklist.js.
4. Clear completed tasks using the button. Stop the terminal server with Ctrl+C when finished.

### Expected result

With available storage, changes report Checklist saved in this browser and survive refresh at the same origin. If storage is blocked, a readable message explains that only the current page session works.

### Make it your own

Add another task only after updating ids and deciding how to migrate or version stored data. Answer: changing the array length makes old saved arrays incompatible; use a new versioned key or a deliberate migration. Explain why this recipe does not call localStorage.clear().

### Error handling and limits

Local file URL storage behavior varies, so use the loopback server for the exercise. Changing hostname, protocol or port changes the storage origin. Browser clearing, private browsing or blocked storage may lose data. This is not a shared audit trail, encrypted vault or backup.

## Recipe 09 Interactive service quote

**Outcome:** Calculate a pretax practice estimate with native form constraints, function validation and a clear breakdown.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

**Files:** [projects/09_service_quote](projects/09_service_quote/).

### Ingredients

Browser and editor. This recipe adapts the JavaScript paid lesson pack and includes commented starter and solution files.

### Method

1. Open projects/09_service_quote/index_solution.html locally. Calculate using its default inputs.
2. Compare quote.js (calculation) and app_solution.js (form events). Trace the named result object to the displayed breakdown.
3. Change a field after calculation; the old estimate must be cleared. Try invalid or fractional input and use Reset inputs.
4. Work through the copied LESSON.md to extend index_starter.html and app_starter.js from labor-only output to the full calculation.

### Expected result

Default subtotal $175.00, discount $17.50 and estimate $157.50. With 4 hours, $60 rate, $40 materials and 5 percent discount, total $266.00.

### Make it your own

Show labor and materials separately using textContent and formatted amounts. Answer: quote.laborCents and quote.materialsCents contain those values; divide by 100 only for currency display. Keep the try/catch and stale-output behavior.

### Error handling and limits

Only bounded whole hours, whole-dollar inputs and whole-percent discounts are accepted. Tax, billing, saved estimates and payment processing are absent. A future backend must independently validate inputs; client-side constraints do not establish server trust.

## Recipe 10 Responsive service cards

**Outcome:** Build equivalent card layouts in plain CSS and Tailwind v4 and understand what the build generates.

**Languages:** HTML, CSS and Tailwind. **Time:** 90–150 minutes plus setup.

**Files:** [projects/10_responsive_service_cards](projects/10_responsive_service_cards/).

### Ingredients

Browser/editor for plain CSS. The Tailwind branch also needs a supported Node LTS release, npm and an internet connection for dependency installation. This recipe adapts the styling lesson pack.

### Method

1. Open projects/10_responsive_service_cards/free_starter/index_solution.html. Inspect the grid and media query in styles_solution.css.
2. In a terminal change into projects/10_responsive_service_cards, then run `npm install` and `npm run build:css`.
3. After a successful build open paid_pack/index_solution.html. Generated paid_pack/assets/tailwind.css supplies the styles.
4. Compare grid grid-cols-1 gap-4 md:grid-cols-3 with the plain CSS grid. Try changes in the starters and rebuild the Tailwind stylesheet.

### Expected result

A readable single column at narrow widths and three columns at medium/wider widths. The Tailwind page needs its generated stylesheet before it can show the intended layout.

### Make it your own

Change md:grid-cols-3 to md:grid-cols-2. Answer: cards use two columns from the medium breakpoint and the third wraps. Add text-brand to a heading and rebuild to exercise the @theme custom color.

### Error handling and limits

Tailwind dependencies and output are not installed or precompiled in this cookbook. Keep the generated package-lock.json after testing. Use complete utility names in scanned source, preserve semantic markup and keep keyboard focus visible. Do not assume a copied older v3 init command matches this v4 project.

## Recipe 11 Data-driven service website

**Outcome:** Combine shared navigation, YAML service cards and the quote calculator into a multi-page static project.

**Languages:** Jekyll, HTML, JavaScript and CSS. **Time:** 2–3 hours plus setup.

**Files:** [projects/11_service_website](projects/11_service_website/).

### Ingredients

Supported Ruby/Jekyll development environment and Bundler. Plain CSS is the default. Optional Tailwind uses its own Node/npm build. This adapts the combined Jekyll project.

### Method

1. Follow projects/11_service_website/README.md for operating system prerequisites.
2. In that project directory run `bundle config set --local path vendor/bundle`, `bundle install` and `bundle exec jekyll build --trace`.
3. Run `bundle exec jekyll serve --host 127.0.0.1` and open http://127.0.0.1:4000/ after success.
4. Add a fictional record to _data/services.yml and rebuild. Trace the Liquid loop, include and layout. Test the calculator and the documented /practice-site baseurl example.

### Expected result

Home, services, calculator and about pages with consistent navigation. The services page contains three cards initially; the default calculator result is $157.50.

### Make it your own

Add a fourth service and a new plain content page. Answer: update the YAML list, then create a page with layout: default and a unique permalink; add a relative_url navigation link. Do not edit _site.

### Error handling and limits

The Ruby build and optional Tailwind build still need verification in a configured environment. _site is generated output, not editable source. No GitHub workflow, hosting action, inquiry delivery or deployment is included. The calculator rate is entered manually rather than automatically selected from YAML.

## Recipe 12 Searchable stock dashboard

**Outcome:** Validate inventory CSV, create a SQLite snapshot and generate a self-contained searchable HTML report.

**Languages:** Python, SQL, HTML, CSS and JavaScript. **Time:** 2–3 hours.

**Files:** [projects/12_stock_dashboard](projects/12_stock_dashboard/).

### Ingredients

Python 3.11 or later with sqlite3 and a browser. Files: stock.csv, build_dashboard.py and dashboard_template.html. No pip packages, web server or API is needed.

### Method

1. Inspect stock.csv, including whole-item quantities, reorder thresholds and dollar unit prices.
2. From the cookbook root run `python3 projects/12_stock_dashboard/build_dashboard.py`.
3. Copy the printed report path and open that index.html in your browser. Search for Reorder, then Gloves, then clear the field.
4. Read validate_stock, create_database and render_dashboard. Values enter SQL through bound parameters and enter HTML through escaping. To place fresh report folders elsewhere, use `--output-parent "EXISTING_WRITABLE_FOLDER"`.

### Expected result

A fresh stock-report-* directory containing stock.db and index.html. Four items, two requiring reorder. Paper towels and Glass cleaner have quantities at or below their thresholds. Filtering Reorder shows those two rows; Gloves shows one.

### Make it your own

Set Gloves quantity to 3 in a practice CSV and rebuild. Answer: three reorder items appear in the new snapshot. Add a duplicate SKU or fractional-cent price and confirm it fails. Put `<em>Sample</em>` in a name and confirm it displays literally rather than becoming HTML.

### Error handling and limits

This is an immutable snapshot: browser filtering changes visibility only. Inventory edits require changing source data and rebuilding. Every run creates new output rather than overwriting earlier reports. A filesystem failure may leave a partial output folder. The page is self-contained but not an authenticated inventory application.

## Combine the recipes into a workflow

Use the expense summary and follow-up queue for personal practice reports. Use SQL customer/job reports to learn relationships before the receivables example. Build a semantic page before adding JavaScript, then compare ordinary CSS with Tailwind. Jekyll turns repeated page content into layouts and data. The stock dashboard combines Python validation, SQLite storage and safe HTML generation without introducing a server API.

These are independent recipes, not an integrated live business suite. They do not share a customer database or authentication. The two explicit combined projects are the Jekyll site and stock dashboard. Linking the other tools into production would require a shared data model and a separate design.

## Official references

- Python CSV: https://docs.python.org/3/library/csv.html
- Python SQLite: https://docs.python.org/3/library/sqlite3.html
- Bash manual: https://www.gnu.org/software/bash/manual/bash.html
- SQLite shell: https://www.sqlite.org/cli.html
- HTML and JavaScript: https://developer.mozilla.org/en-US/docs/Learn_web_development
- Browser storage: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Tailwind CLI: https://tailwindcss.com/docs/installation/tailwind-cli
- Jekyll: https://jekyllrb.com/docs/
