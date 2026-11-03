# Creator Code Cookbook

Snow Seasons Tech • Volume 1 • Version 2.0

Build things for your creative life while learning to code. This edition is aimed at younger beginners and aspiring creators: people making videos, sketches, photos, gaming clips or personal projects. The tone is direct and beginner-friendly, with no assumed business experience.

Start with a project you care about: a creator profile, caption tool, draft checklist or content board. Each recipe has commented source, sample data, expected results and a remix challenge. The projects teach practical coding rather than promises of followers, virality or income.

## Pick your first build

| Recipe | Project | Languages | Time |
| - | - | - | - |
| 01 | [Post stats snapshot](projects/01_post_stats/README.md) | Python | 45–60 minutes |
| 02 | [Draft review queue](projects/02_draft_queue/README.md) | Python | 45–60 minutes |
| 03 | [Clip folder inventory](projects/03_clip_inventory/README.md) | Bash | 30–45 minutes |
| 04 | [Creator asset archive](projects/04_creator_archive/README.md) | Bash | 45–75 minutes |
| 05 | [Channel and post reports](projects/05_post_reports/README.md) | SQL with SQLite | 60–90 minutes |
| 06 | [Content calendar queries](projects/06_content_calendar/README.md) | SQL with SQLite | 45–75 minutes |
| 07 | [Creator profile page](projects/07_creator_profile/README.md) | HTML and CSS | 30–60 minutes |
| 08 | [Saved posting checklist](projects/08_posting_checklist/README.md) | HTML, CSS and JavaScript | 60–90 minutes |
| 09 | [Caption lab](projects/09_caption_lab/README.md) | HTML, CSS and JavaScript | 45–75 minutes |
| 10 | [Responsive creator cards](projects/10_creator_cards/README.md) | HTML, CSS and Tailwind | 90–150 minutes plus setup |
| 11 | [Creator portfolio with Jekyll](projects/11_creator_site/README.md) | Jekyll, HTML, CSS and JavaScript | 2–3 hours plus setup |
| 12 | [Searchable content board](projects/12_content_board/README.md) | Python, SQLite, HTML, CSS and JavaScript | 2–3 hours |


## How to use the cookbook

Run the original sample, compare the expected result, read the comments and make one small change. Predict what will happen before rerunning. Break a practice input on purpose and observe the error message. Keep your edited version separate from the reference.

All terminal commands start at the extracted Creator\_Code\_Cookbook root unless a recipe says to change directory. Linux/macOS examples use python3; Windows users substitute py -3. Bash on Windows uses WSL. SQLite .read commands run inside the SQLite shell, not your operating system terminal. Replace uppercase path placeholders with actual paths and quote paths containing spaces.

Use the HTML/CSS projects first if you want a quick visible result. Follow with caption lab and saved checklist for JavaScript. Python reports and SQL queries build data skills. The Jekyll portfolio and content board combine those ideas. Tailwind and Jekyll have extra setup and are good later projects.

## Tools and sample data

Python recipes use only its standard library. Ordinary browser projects need an editor and browser. Bash, the SQLite shell, Node/npm and Ruby/Bundler are needed only where named. Follow official installation instructions for your system. Tailwind follows v4; Jekyll uses the included Gemfile. Real dependency lockfiles must be generated and tested locally.

The data and creator names are fictional. No project asks for your social password, connects an account or posts automatically. Keep practice captions and examples free of personal details. These are useful coding projects, not a complete social management platform.

## Recipe 01 Post stats snapshot

**Build:** Turn a fictional CSV into a simple post-performance report.

**Languages:** Python. **Time:** 45–60 minutes.

### What you need

Python 3.11 or later; stats.py and posts.csv. No packages or social account login.

### Build and explore

1. Inspect posts.csv: title, views, likes, comments and saves.

2. Run `python3 projects/01\_post\_stats/stats.py` from the cookbook root.

3. Read summarize and the commented zero-view branch. Try a separate file by adding its quoted path to the command.

### What to expect

Three posts; 1500 total views and 190 actions. Combined actions/views is 12.67%. The zero-view post displays not available rather than dividing by zero.

### Remix challenge and answer

Add 10 saves to Sketch timelapse. Answer: 200 total actions and 13.33% combined actions/views. Try a negative count in a copy; it should fail clearly.

### Error handling and limits

The formula is (likes + comments + saves) / views × 100. It is a teaching definition, not an official platform engagement rate. Views may include repeat views and actions are not unique people. Do not average individual percentages to obtain the combined rate.

## Recipe 02 Draft review queue

**Build:** Find drafts planned on or before a chosen date.

**Languages:** Python. **Time:** 45–60 minutes.

### What you need

Python 3.11 or later; drafts.py and drafts.csv.

### Build and explore

1. Read the sample dates and draft/published statuses.

2. Run `python3 projects/02\_draft\_queue/drafts.py --as-of 2026-10-29`.

3. Repeat with --as-of 2026-11-05. Read the date validation and sorted output.

### What to expect

Desk setup tour and Sketch timelapse appear first: Drafts to review: 2. The later comparison date includes Weekend photo walk for a count of 3.

### Remix challenge and answer

Change Sketch timelapse to published. Answer: at the original fixed date, only Desk setup tour remains. Try an invalid date to check the error message.

### Error handling and limits

This is a local date-based review list. It neither posts content nor claims that the planned date is the best time to post. Omit --as-of to use your computer’s local current date.

## Recipe 03 Clip folder inventory

**Build:** See what is inside one project folder without renaming or moving files.

**Languages:** Bash. **Time:** 30–45 minutes.

### What you need

Bash 3.2 or later; Windows uses WSL. Sample files are fictional text notes, not actual clips.

### Build and explore

1. Run `bash projects/03\_clip\_inventory/inventory.sh "projects/03\_clip\_inventory/sample clips"`.

2. Read the comments explaining quoted paths, the loop and printf %q.

3. Try an empty folder and a missing folder.

### What to expect

Three regular files. Spaces appear shell-escaped in the listing so filenames remain identifiable.

### Remix challenge and answer

Add one more text note and a subfolder. Answer: regular file count becomes four; the subfolder is not counted. A symlink is also skipped.

### Error handling and limits

This is a one-level inventory, not a recursive media scanner. Hidden regular files are included. The script does not modify source files or inspect their contents.

## Recipe 04 Creator asset archive

**Build:** Archive fictional clips, captions and thumbnail notes into a fresh workspace.

**Languages:** Bash. **Time:** 45–75 minutes.

### What you need

Bash, mkdir, mktemp and tar. No admin permissions are needed.

### Build and explore

1. Run `bash projects/04\_creator\_archive/archive.sh`.

2. Type no first; sample assets are created but no archive is made.

3. Run again, type yes and copy the printed workspace path. Use the master cheat sheet’s guarded restore command to extract the archive into a new folder.

### What to expect

A fresh directory under your home folder with Clips/sample.txt, Captions/sample.txt and Thumbnails/sample.txt. A confirmed run creates backup/creator-assets.tar.gz.

### Remix challenge and answer

Add Audio to the categories array. Answer: the next archive contains four sample asset files. Restore and read Clips/sample.txt to check its contents.

### Error handling and limits

This example creates fictional assets rather than archiving your actual media library. The archive is local and unencrypted; it does not protect against losing the drive. Each run preserves earlier workspaces.

## Recipe 05 Channel and post reports

**Build:** Join posts to creative series and include channels that have no published posts.

**Languages:** SQL with SQLite. **Time:** 60–90 minutes.

### What you need

SQLite shell with foreign key support; setup.sql and reports.sql.

### Build and explore

1. Open a new practice file: `sqlite3 -bail creator\_posts\_01.db`.

2. At the SQLite prompt enter `.bail on`, `.headers on` and `.mode column`, one per line.

3. Run `.read projects/05\_post\_reports/setup.sql`, then `.read projects/05\_post\_reports/reports.sql`.

4. Read the comments on LEFT JOIN, COUNT and NULLIF.

### What to expect

Studio Notes has two published posts and 1500 total views. Weekend Lens and Game Sketches remain in the report with zero published posts. Individual actions/views rates are 11.00%, 16.00% and NULL for zero views.

### Remix challenge and answer

Add a published Game Sketches post with 200 views in a new practice database. Answer: that channel’s published count becomes one and total views 200. Explain why the filter is in ON rather than WHERE.

### Error handling and limits

The data is fictional and manually entered. Channel names are creative series, not connected platform accounts. Enable PRAGMA foreign\_keys = ON on each connection before writing related data. Rates do not imply reach quality or official platform definitions.

## Recipe 06 Content calendar queries

**Build:** Filter a content plan by date and practice a status change you can undo.

**Languages:** SQL with SQLite. **Time:** 45–75 minutes.

### What you need

SQLite shell; calendar.sql. Use a fresh database separate from recipe 5.

### Build and explore

1. Open `sqlite3 -bail creator\_calendar\_01.db` from the cookbook root.

2. Enter `.bail on`, `.headers on` and `.mode column` on separate lines.

3. Run `.read projects/06\_content\_calendar/calendar.sql` once. Read the date-window query and BEGIN/UPDATE/ROLLBACK sequence.

### What to expect

Three planned posts fall in the 2026-10-29 to before 2026-11-02 window. Post 2 changes to ready inside the transaction and returns to draft after rollback.

### Remix challenge and answer

Copy only the report query and filter for status ready. Answer: Desk setup tour. Do not rerun setup in the same database, because it deliberately refuses to recreate its table.

### Error handling and limits

ISO dates are stored as text; the schema alone does not validate calendar dates. A script error can leave an interactive transaction open: use ROLLBACK before starting over. This is not an automatic posting scheduler.

## Recipe 07 Creator profile page

**Build:** Build a home for sketches, short-video ideas and photo projects.

**Languages:** HTML and CSS. **Time:** 30–60 minutes.

### What you need

A browser and plain-text editor; index.html and styles.css.

### Build and explore

1. Open projects/07\_creator\_profile/index.html in your browser.

2. Change the fictional creator name in title and h1, then save and refresh.

3. Follow the Projects and About links. Open the disclosure with keyboard and pointer.

4. Read the comments on ids, headings and articles.

### What to expect

A local profile page with three creative project cards and working in-page navigation. Cards stack on narrow screens.

### Remix challenge and answer

Add a fourth project card. Answer: add an article inside the cards container with an h3 and paragraph. Keep a meaningful heading hierarchy rather than choosing headings just for their font size.

### Error handling and limits

There is no real handle, sign-in, contact collection or publishing connection. Use your own work or media you have permission to share. Layout and keyboard behavior still need real-browser review.

## Recipe 08 Saved posting checklist

**Build:** Save a personal pre-share checklist in your browser.

**Languages:** HTML, CSS and JavaScript. **Time:** 60–90 minutes.

### What you need

A browser; Python 3 can serve the page at a stable local origin.

### Build and explore

1. Run `python3 -m http.server 8080 --bind 127.0.0.1 --directory projects/08\_posting\_checklist`.

2. Open http://127.0.0.1:8080/, check a task and refresh at the same address.

3. Read checklist.js: the versioned key, JSON shape checks and storage error handling.

4. Try Clear completed tasks, then stop the server with Ctrl+C.

### What to expect

Three review tasks covering the idea/media, caption/private details and accessible text. When browser storage is available, checks survive refresh.

### Remix challenge and answer

Add a new task only after updating the ids array and storage version. Answer: the existing stored array has the old length, so change the key version or write an explicit migration. Do not clear unrelated localStorage keys.

### Error handling and limits

Blocked storage or invalid saved data produces a readable message. File-URL storage is inconsistent, so use the loopback server for this exercise. These checks are personal reminders, not automated content review or a shared audit trail.

## Recipe 09 Caption lab

**Build:** Count a draft against your own writing budget without sending it anywhere.

**Languages:** HTML, CSS and JavaScript. **Time:** 45–75 minutes.

### What you need

A browser and editor; index.html, caption.js and styles.css.

### Build and explore

1. Open projects/09\_caption\_lab/index.html locally.

2. Type hello. Expect five Unicode code points and 275 remaining in the default budget.

3. Type more than 280 ordinary letters and see the over-budget message.

4. Read countCodePoints and update. Try Clear caption and notice focus returns to the text area.

### What to expect

Live count, remaining budget and an over-budget message with text as well as color. Nothing is saved or published.

### Remix challenge and answer

Change the personal budget to 150 and test 151 plain letters. Answer: one over budget. Try an emoji sequence and explain why one visible symbol can count as several code points.

### Error handling and limits

The 280-point budget is a personal exercise value, not a claim about any platform’s current limit. Code points differ from UTF-16 units, grapheme clusters and platform-specific counting. The textarea’s generous maxlength uses UTF-16 units; our displayed counter uses code points.

## Recipe 10 Responsive creator cards

**Build:** Style a project gallery with ordinary CSS, then recreate it using Tailwind v4.

**Languages:** HTML, CSS and Tailwind. **Time:** 90–150 minutes plus setup.

### What you need

Browser/editor for CSS; supported Node LTS and npm for the optional Tailwind build.

### Build and explore

1. Open projects/10\_creator\_cards/free\_starter/index\_solution.html.

2. Compare its CSS grid and media query with the starter.

3. Change directory into projects/10\_creator\_cards and run `npm install`, then `npm run build:css`.

4. Open paid\_pack/index\_solution.html after the generated stylesheet exists. Compare grid-cols-1 and md:grid-cols-3.

### What to expect

Cards for a setup tour, sketch timelapse and photo collection. One narrow column becomes three at the medium breakpoint.

### Remix challenge and answer

Change md:grid-cols-3 to md:grid-cols-2, rebuild and predict which card wraps. Answer: the third begins another row. Keep complete class names in scanned source.

### Error handling and limits

Tailwind dependencies and compiled output are not bundled or verified here. Plain CSS needs no npm. Preserve readable contrast and keyboard focus. The CLI setup uses v4; do not substitute an older v3 init workflow.

## Recipe 11 Creator portfolio with Jekyll

**Build:** Turn the profile and caption lab into a reusable multi-page project.

**Languages:** Jekyll, HTML, CSS and JavaScript. **Time:** 2–3 hours plus setup.

### What you need

Supported Ruby, Bundler and Jekyll prerequisites from [https://jekyllrb.com/docs/installation/](https://jekyllrb.com/docs/installation/) . Windows learners follow the documented WSL path.

### Build and explore

1. Change directory into projects/11\_creator\_site.

2. Run `bundle config set --local path vendor/bundle`, `bundle install` and `bundle exec jekyll build --trace`.

3. Start `bundle exec jekyll serve --host 127.0.0.1` and open http://127.0.0.1:4000/ after it succeeds.

4. Read the shared layout, header include and \_data/projects.yml. Test the caption lab and the three navigation links.

### What to expect

Home, Projects and Caption lab pages with shared navigation. Three YAML records become project cards. The caption script loads only on the caption-lab page.

### Remix challenge and answer

Add a fourth YAML project and rebuild. Answer: the Projects page gets a fourth card without duplicating card HTML. Test `bundle exec jekyll serve --baseurl /creator-site --host 127.0.0.1` at /creator-site/.

### Error handling and limits

Ruby dependency resolution and the Jekyll build require verification on a configured machine. Keep the generated Gemfile.lock. Edit source, not \_site. This is a local project: hosting, real accounts and deployment are not included.

## Recipe 12 Searchable content board

**Build:** Turn a CSV content plan into a SQLite snapshot and a searchable local board.

**Languages:** Python, SQLite, HTML, CSS and JavaScript. **Time:** 2–3 hours.

### What you need

Python 3.11 or later with sqlite3 and a browser; content.csv, build\_board.py and board\_template.html.

### Build and explore

1. Inspect the four fictional content.csv rows.

2. Run `python3 projects/12\_content\_board/build\_board.py` from the cookbook root.

3. Open the printed index.html path. Filter for ready, video and then an empty search.

4. Read the complete CSV validation, bound SQL insert and HTML escaping. Each run creates a fresh content-board-\* folder.

### What to expect

Four posts, one ready. Search ready shows Desk setup tour; video shows two rows. A new content.db sits beside the self-contained HTML snapshot.

### Remix challenge and answer

Change Sketch timelapse to ready and rebuild. Answer: the new board reports two ready posts. Try a duplicate post id or invalid date: it should fail before creating output. Put Sketch in a title and confirm it remains literal text.

### Error handling and limits

This is a snapshot, not a live scheduler. Filtering changes visibility only. Edit CSV and rebuild to change data. The database is generated locally; there is no platform API, automatic publishing, shared editing or login. Filesystem errors may leave a partial output folder.

## Where to go next

Make the projects yours: change the creative topic, improve a label, add a status or choose a different visual style. Document the change and show one successful case and one failure case. That makes a stronger portfolio entry than a screenshot alone.

These recipes are independent except for the explicit combinations in the Jekyll portfolio and content board. They do not share accounts or live data. The next development step would be a separately designed application with a shared data model, clear permissions and a deliberate publishing workflow.

## Reference shelf

- Python CSV: [https://docs.python.org/3/library/csv.html](https://docs.python.org/3/library/csv.html)

- Python SQLite: [https://docs.python.org/3/library/sqlite3.html](https://docs.python.org/3/library/sqlite3.html)

- Bash: [https://www.gnu.org/software/bash/manual/bash.html](https://www.gnu.org/software/bash/manual/bash.html)

- SQLite shell: [https://www.sqlite.org/cli.html](https://www.sqlite.org/cli.html)

- HTML/CSS/JavaScript learning: [https://developer.mozilla.org/en-US/docs/Learn\_web\_development](https://developer.mozilla.org/en-US/docs/Learn_web_development)

- Browser storage: [https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

- Tailwind: [https://tailwindcss.com/docs/installation/tailwind-cli](https://tailwindcss.com/docs/installation/tailwind-cli)

- Jekyll: [https://jekyllrb.com/docs/](https://jekyllrb.com/docs/)
