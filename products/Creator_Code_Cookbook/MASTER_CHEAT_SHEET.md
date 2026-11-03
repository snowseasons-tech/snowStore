# Creator Coding Cheat Sheet

## Run the projects

Start in the cookbook root. Windows Python users substitute py -3; Bash users use WSL.

| Project | Command or action |
| - | - |
| Post stats | `python3 projects/01\_post\_stats/stats.py` |
| Draft queue | `python3 projects/02\_draft\_queue/drafts.py --as-of 2026-10-29` |
| Clip inventory | `bash projects/03\_clip\_inventory/inventory.sh "projects/03\_clip\_inventory/sample clips"` |
| Sample asset archive | `bash projects/04\_creator\_archive/archive.sh` |
| SQL practice file | `sqlite3 -bail creator\_posts\_01.db` |
| Post setup inside SQLite | `.read projects/05\_post\_reports/setup.sql` |
| Post reports inside SQLite | `.read projects/05\_post\_reports/reports.sql` |
| Creator profile | Open projects/07\_creator\_profile/index.html |
| Posting checklist | `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08\_posting\_checklist` |
| Caption lab | Open projects/09\_caption\_lab/index.html |
| Content board | `python3 projects/12\_content\_board/build\_board.py` |


Stop local development servers with Ctrl+C. Use http://127.0.0.1:8080/ for the checklist. Keeping the same protocol, hostname and port keeps the same storage origin.


## Python

`csv.DictReader` turns CSV records into dictionaries. Validate headings and values before reporting. `date.fromisoformat(text)` parses ISO dates. `sqlite3.connect(path)` opens a database; use a transaction and close the connection explicitly. `execute(sql, parameters)` and executemany use bound parameters rather than concatenated SQL. `html.escape(text)` keeps CSV content from becoming HTML markup.

## Bash

Quote "$folder" to preserve spaces. Assign with no spaces around =. `for entry in "$folder"/\*; do ...; done` loops over entries. `\[\[ -f "$entry" && ! -L "$entry" \]\]` selects non-symlink regular files. `if ! COMMAND; then ...; fi` handles failure. `exit 0` means success and `exit 1` failure. `%q` in printf displays shell-escaped names.

For recipe 4, set workspace to the printed path and restore only your own generated archive:

```
workspace="PASTE\_PRINTED\_WORKSPACE\_PATH"  
if restored=$(mktemp -d "$workspace/restore.XXXXXX"); then  
    if tar -xzf "$workspace/backup/creator-assets.tar.gz" -C "$restored"; then  
        cat "$restored/Clips/sample.txt"  
    else  
        printf 'Restore failed. Inspect the error.\\n' \>&2  
    fi  
else  
    printf 'Could not create a restore folder.\\n' \>&2  
fi
```

## SQL and SQLite

Dot commands start on their own line without a semicolon: .tables, .schema posts, .headers on, .mode column, .quit. SQL statements end in semicolons.

```
PRAGMA foreign\_keys = ON;  
SELECT title, views FROM posts WHERE status = 'published' ORDER BY views DESC;  
SELECT channel\_id, COUNT(\*) FROM posts GROUP BY channel\_id;
```

WHERE filters rows, GROUP BY groups them and HAVING filters groups. LEFT JOIN keeps unmatched rows from the left table; count the matched id to avoid counting an empty match. NULLIF(views,0) avoids division by zero; a resulting NULL means the rate is unavailable, not zero. BEGIN starts a transaction, COMMIT keeps it and ROLLBACK undoes it. Preview a WHERE clause before UPDATE or DELETE. A statement failure does not always undo an entire open transaction.


## HTML and CSS

`\<article\>` describes a standalone project. `\<label for="caption"\>` matches a control id. `\<details\>\<summary\>` creates a native disclosure. `id` is unique; `class` can repeat. `.cards \{ display:grid; gap:1rem; \}` sets a grid. A min-width media query adjusts layout at wider widths. Keep visible focus and readable contrast; never rely on color alone for a message.

## JavaScript

`querySelector` and getElementById may return null. `addEventListener("input", handler)` runs on edits. `textContent` writes plain text. `Array.from(text).length` counts Unicode code points, not visible symbols. `classList.toggle(name, condition)` applies a class conditionally. `JSON.parse` can fail; validate the parsed shape. localStorage operations can fail; handle load and save errors. Store only this lesson’s task booleans, not confidential information. Clear only this project’s key, not the entire origin’s storage.

## Tailwind v4

From projects/10\_creator\_cards run npm install and npm run build:css. Keep the generated package-lock.json. Use grid grid-cols-1 gap-4 md:grid-cols-3 for responsive cards. Complete literal classes must occur in scanned source. The v4 input uses @import "tailwindcss" and explicit @source paths; it does not use an older v3 init command. Generated CSS must exist before viewing the Tailwind page.

## Jekyll

From projects/11\_creator\_site run bundle config set --local path vendor/bundle, bundle install, bundle exec jekyll build --trace, then bundle exec jekyll serve --host 127.0.0.1. Keep Gemfile.lock. Restart after \_config.yml changes.

Front matter selects the layout and page title. `\{\{ content \}\}` inserts page output. `\{% include header.html %\}` reuses navigation. `site.data.projects` reads YAML. `\{\{ '/projects/' | relative\_url \}\}` adds baseurl for project-path hosting. Edit source rather than generated \_site files. Liquid runs at build time; JavaScript runs later in the browser.

