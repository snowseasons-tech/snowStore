---
name: run-data-analyst
description: Run, test and drive the hardware price scraper and LLM build planner (tools/hardware-price-scraper). Use when asked to scrape or compare prices for servers, GPUs, RAM, NVMe or mini PCs, plan or price an LLM-capable build, export a bill of materials (BOM), query the price history in SQLite or the MariaDB `hardware` database, run its tests, or check the daily scrape timer.
---

The tool scrapes key-free sources (Shopify search endpoints, a product-page watchlist) into SQLite (`output/history.db`) and the MariaDB `hardware.prices` table, then `builder.py` assembles LLM builds from the latest prices. It is a CLI and library, so the driver is `.claude/skills/run-data-analyst/drive.sh`. **All paths are relative to `tools/hardware-price-scraper/`.**

## Prerequisites

Verified: Python 3.14 (there is no `python`, only `python3`), `mariadb` client, systemd user session. The system Python refuses `pip install` (PEP 668), so everything runs from `.venv` (gitignored). MariaDB auth is the OS user over the unix socket, no password.

## Run (agent path)

```bash
cd tools/hardware-price-scraper
D=.claude/skills/run-data-analyst/drive.sh
$D setup                                              # venv + deps, idempotent
$D test                                               # 28 offline tests (MariaDB ones use a scratch table)
$D scrape "Tesla P100 16GB" gpu "The Server Store"    # one live query, one site
$D plan --mariadb --targets 48 --top 1                # cheapest builds for 48GB VRAM, from MariaDB
$D plan --targets 48 --host t640 --top 1 --bom /tmp/parts.md   # tower host only, export a BOM (.csv or .md)
$D db                                                 # row counts and price ranges per site in MariaDB
$D timer                                              # next daily run and the last journal lines
```

- `scrape` takes `"<query>" <category> [site ...]` and **both** query and category are required (`$D scrape` alone fails). Categories: `gpu`, `server`, `ram`, `storage`, `minipc`. Site names are those in `sites.json` (for example `ServerPartDeals`, `Alta Technologies`, `The Server Store`, `Computer Overhauls`, `Beelink`, `GMKtec`, `Minisforum`). It writes to a scratch dir under `/tmp/scrape-*` with `--no-mariadb`, so it never touches the real history.
- `plan` passes its arguments to `builder.py`. Without `--mariadb` it reads SQLite. `--host <regex>` restricts the host (for example `t640`, `r730`) and drops the turnkey options. `--targets` takes VRAM in GB (24, 48, 96, 128 have labels).
- The full daily run is just `.venv/bin/python scraper.py --delay 4 --top 3`; it makes many requests spaced by `--delay`, so it is slow, and it writes to SQLite and MariaDB. Don't run it casually: it adds a full batch of rows to the history.

## Direct invocation

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -c "
import scraper
print(scraper.relevant('Dell PowerEdge R740xd 24x2.5 Server', 'Dell PowerEdge R740 server'))
print(scraper.extract_specs('Beelink GTR9 Pro', 'minipc', 'Packed with 128GB LPDDR5X RAM'))"
```

Parsers (`scraper.parse_page`, `parse_product_page`, `extract_specs`, `relevant`) and the planner (`builder.build_options`, `bom_rows`) are pure functions over strings and row dicts, so they run with no network.

## Gotchas

- **`python: command not found`.** Use `python3` or `.venv/bin/python`.
- **Major vendors block bots.** Newegg, ServerMonkey, Micro Center, Dell/Alienware, Lenovo and HP return 403 or time out; Brightstar and Techmikeny disallow it in robots.txt; Bytestock prices in GBP only. Don't retry or work around them.
- **eBay and Best Buy are disabled** in `sites.json`; they need API keys the user has not provided. So RTX 3090/4090 and Tesla P40 prices are mostly absent.
- **HTTP 429 on product `.js` endpoints** (GMKtec, Beelink). The scraper waits `Retry-After` (max 90 s) once, then falls back to base prices. GMKtec keeps refusing, so its per-variant prices are unverified.
- **Suggest results include parts.** A query like `Dell PowerEdge T630` returns RAM kits and power supplies that mention the model. `scraper.py` and `builder.py` filter part words (`PART_WORDS`, junk regex); add words there if odd rows appear, don't loosen the host price floor (`MIN_HOST_PRICE`).
- **The planner only sees prices from the last 7 days** (`--days`). If it says "No prices from the last 7 days", run a scrape first.
- **Hosts are base chassis.** A listed R740xd or DL380 may exclude CPUs, PSUs and GPU risers, and the slot counts in `builder.HOSTS` are approximate.
- **Don't scrape without `--no-mariadb --out <dir>` just to test.** Every normal run writes real rows to both databases, and early test batches already pollute the history.
- **Creating the MariaDB database needs admin rights** that the `uselesse` user lacks; it was created once by the user with `sudo mariadb`. The user's grants cover only the `hardware` schema (plus a few unrelated ones).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `error: externally-managed-environment` on `pip install` | Use `drive.sh setup` (creates `.venv`). |
| `ERROR 1044 ... Access denied ... to database 'hardware'` | The database or grant is missing; only an admin can create it (`sudo mariadb`). |
| `MariaDB mirror skipped (...)` after a scrape | MariaDB is down or PyMySQL is missing. SQLite still has the data; re-import with `.venv/bin/python mariadb_store.py --import-sqlite output/history.db` (idempotent). |
| `0 matching listings` and `No listings found. Selectors may be stale or sites blocked the request` | The relevance filter needs every query word in the title and the store may simply not stock it; check the query against the store's own search first. |
| `! https://... still rate-limiting variant lookups` | Normal for GMKtec/Beelink; the base prices are used. Wait a few minutes before retrying. |
