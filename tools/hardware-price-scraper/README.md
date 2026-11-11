# Hardware price scraper

Finds the cheapest prices for server and LLM-capable hardware (GPUs, GPU servers, ECC RAM, enterprise NVMe).
GPUs are ranked by **$ per GB of VRAM**, the number that decides what models you can run.

```bash
pip install -r requirements.txt
python scraper.py                                   # everything in queries.json
python scraper.py -q "RTX 4090 24GB" --site Newegg  # ad hoc
python scraper.py -q "R740" --category server --delay 5
python -m pytest tests                              # offline parser tests
```

Output: ranked table in the terminal, `output/latest.csv`, and `output/history.db` (SQLite, one row per listing per run, for price tracking).

## Sources
Out of the box: **ServerPartDeals** (Shopify public search endpoint, no key; storage and RAM, no GPUs). eBay and Best Buy are included but disabled (`"enabled": false` in `sites.json`). Any other Shopify-based reseller can be added as `{"name":..., "type":"api", "api":"shopify", "domain":...}` after checking its robots.txt.

**Watchlist** (`watchlist.json`): product-page URLs fetched politely (robots.txt, rate limit, cache) and read from schema.org data; USD only, other currencies are skipped. Seeded with IT Creations GPU pages (A100, H100, L40S, V100). IT Creations has no crawlable search, so add pages by hand; a dead page just logs a warning. Re-running builds price history in `history.db`.
Bytestock was evaluated and skipped: it prices in GBP only and its robots.txt forbids search pages.

## API keys (optional, free)
```bash
export EBAY_CLIENT_ID=...  EBAY_CLIENT_SECRET=...   # developer.ebay.com, production keyset
export BESTBUY_API_KEY=...                           # developer.bestbuy.com
```
Or copy `.env.example` to `.env` (gitignored) and fill it in; real environment variables take precedence.

A source without its key is skipped with a notice. eBay carries most used server/datacenter GPUs; Best Buy is new consumer cards only.

## Edit it
- `queries.json`: what to search. `category` drives spec parsing (gpu → VRAM, server/ram → RAM GB).
- `sites.json`: retailers. Add one with a `search_url` containing `{q}` and CSS selectors. With no `item` selector it falls back to schema.org JSON-LD, which many shops publish.

## Caveats
- HTML scraping is off by default: Newegg and ServerMonkey return 403 to bots and eBay's robots.txt disallows search pages. The HTML path (robots.txt-aware, rate-limited) remains for sites that permit it; add them in `sites.json`.
- Results mix new, used and refurbished listings; the condition is shown where the API provides it.

## Scheduled runs
`systemd/` holds a user timer that runs the scraper daily at ~07:15 (`Persistent=true`, so a missed run catches up after sleep). Paths in the service file are absolute; edit them if the repo moves.
```bash
cp systemd/hardware-price-scraper.* ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now hardware-price-scraper.timer
systemctl --user list-timers hardware-price-scraper.timer   # next run
journalctl --user -u hardware-price-scraper.service         # last run's output
```
Query history: `sqlite3 output/history.db "select ts, price, title from prices where title like '%L40S%' order by ts"`.

## Build planner
`builder.py` turns the latest prices in `history.db` into complete LLM machines for several VRAM targets (24 / 48 / 96 / 128 GB): GPUs + a host that can hold them + ECC RAM + NVMe, plus turnkey options (8-GPU servers, unified-memory mini PCs).
```bash
python scraper.py                      # refresh prices first
python builder.py                      # default targets
python builder.py --targets 48 --budget 4000 --top 5
```
Add `--host t640` to force a specific host (the T640 is a tower, for desktop-style builds) and `--bom parts.csv` (or `.md`) to export the builds shown as a bill of materials: one row per part with qty, unit price, line total, source and URL, closed by a `TOTAL` row per build (filter that role out before summing a column).
Compatibility is a coarse heuristic: the `HOSTS` table in `builder.py` lists how many double-width GPUs each known server takes (R740 and DL380 Gen10: 3, R730: 2, T640 tower: 4, T630 tower: 2 assumed; the R730xd is excluded since it has no internal GPU support). Host prices are often a base chassis (CPUs, PSUs and risers may be extra), SXM modules are excluded (they need a baseboard), and prices older than `--days` (7) are ignored. Treat the output as a shortlist and confirm risers, power and cooling with the seller.
