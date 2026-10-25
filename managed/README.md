# Done-for-you runner

Runs the Lead Generation Pipeline and Blog Roundup Generator on a schedule for service clients, and emails each client a report. One server handles every client; each client gets their own folder, so data never mixes.

```
managed/
  setup.sh           one-time server setup
  new-client.sh      create a client folder
  run.sh             run a client's job (cron calls this; alerts you on failure)
  report.mjs         email a client their report (cron calls this)
  install-cron.sh    schedule a client's run + report
  remove-client.sh   stop a client, optionally delete their data
  ops.env            your Resend key and addresses (created by setup.sh, never committed)
  clients/<id>/      one folder per client (never committed)
```

The jobs use the code in this repo: `Lead-Pipeline/` and `Blogen/`.

## 1. Pick a server

The jobs need a Linux machine that is always on, with cron. Any of these works:

- **A small VPS** (Hetzner, DigitalOcean, Linode and similar, about $5–6/month). Recommended: it runs while your own computer is off, and it has a stable IP for scraping.
- **An always-on Linux box at home** (mini PC, old laptop). Free, but jobs stop if it sleeps or loses power.

Avoid running client jobs on GitHub Actions or other shared CI: client lists and contact data would pass through someone else's logs.

Requirements: Python 3.10+, Node.js 20+, `git`, `cron`, and `flock`/`timeout` (standard on Debian/Ubuntu). On Ubuntu:

```bash
sudo apt install -y python3 python3-venv git cron
# Node.js 20+: https://nodejs.org/en/download (or nodesource / nvm)
```

## 2. Set up (once)

```bash
git clone <this repo> snowstore && cd snowstore
managed/setup.sh
nano managed/ops.env        # RESEND_API_KEY, MAIL_FROM, OPS_EMAIL
```

`MAIL_FROM` must use a domain verified in Resend. `OPS_EMAIL` receives failure alerts and a blind copy of every report.

Keep the server patched (`sudo apt upgrade`), use SSH keys, and don't share the login: `clients/` holds client contact data and publishing passwords.

## 3. Add a client

After the client accepts your quote and pays the setup fee:

```bash
managed/new-client.sh acme-plumbing lead     # or: blog
nano managed/clients/acme-plumbing/client.env
```

In `client.env`, set `CLIENT_NAME`, `REPORT_TO`, and the two schedules (cron syntax, server time):

| Setting | Lead default | Blog default |
| --- | --- | --- |
| `RUN_SCHEDULE` | `15 2 * * *` (nightly 2:15) | `0 6 * * 1` (Mondays 6:00) |
| `REPORT_SCHEDULE` | `0 8 * * 1` (Mondays 8:00) | `0 8 * * 1` (Mondays 8:00) |

Then give it its inputs:

- **Lead:** company names in `clients/<id>/companies_queue.txt`, one per line. Optional tuning (`SCRAPE_LIMIT`, `SEARCH_REGION`, ...) goes in `client.env`; see `Lead-Pipeline/run_pipeline.sh`.
- **Blog:** topics and sources in `clients/<id>/sources.json` (see `Blogen/README.md`). To post to their site, set `BLOG_ARGS="--publish wordpress"` (or `ghost`/`hugo`) and their credentials in `client.env`. Posts are drafts unless you add `--live`.

Test before scheduling:

```bash
managed/run.sh acme-plumbing --dry-run     # lead: shows what would run (blog: --dry)
managed/run.sh acme-plumbing               # a real run, output in clients/<id>/logs/
node managed/report.mjs acme-plumbing --dry   # preview the report email and attachments
managed/install-cron.sh acme-plumbing      # schedule the run and the report
```

## 4. What the client gets

The report covers everything since the last report sent (the first one covers the last 7 days).

- **Lead:** counts of new companies and contacts, how many companies are still queued, and CSVs: `new-contacts-<date>.csv`, `new-companies-<date>.csv` and `all-contacts-<date>.csv`. The CSVs open cleanly in Excel. Cells that start like a formula are prefixed so they show as text.
- **Blog:** the list of roundups written in the period, attached as Markdown and HTML, and whether they were posted to the client's site.

Replies to a report go to `OPS_EMAIL`. A client adds companies by replying with names; paste them into their queue file.

## 5. When something fails

`run.sh` emails `OPS_EMAIL` when a job fails, naming the client and the log folder. Look in `clients/<id>/logs/` (lead: `pipeline_*.log`, blog: `blog_*.log`, plus `cron.log` for both jobs). Logs older than 30 days are deleted automatically.

Common causes: a site blocking automated visits (nothing to do; it is skipped), the search provider rate-limiting (lower the batch with fewer queued names), or expired publishing credentials (ask the client for new ones).

## 6. When a client cancels

```bash
managed/remove-client.sh acme-plumbing                # stops the jobs, keeps the data
managed/remove-client.sh acme-plumbing --delete-data  # deletes their folder (asks to confirm)
```

The Terms promise deletion within 30 days after the service ends. Send a final report or export first if they ask. Also delete them from anywhere else you copied their data, such as email attachments you saved.

## Privacy reminders

- Only collect what the client asked for, and only from public business websites. The pipeline respects robots.txt.
- If someone asks to be removed from a client's report, delete their rows from `clients/<id>/data/contacts.csv`, add their domain to the client's skip list if needed, and tell the client (the Privacy page promises this).
- Never put client folders, `ops.env` or credentials in git, chat tools or shared drives. `.gitignore` already excludes them.
