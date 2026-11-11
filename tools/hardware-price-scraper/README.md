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
