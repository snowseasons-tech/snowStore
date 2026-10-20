# Gumroad Scraper

Extract Gumroad product details, ratings and pricing. Export to CSV, JSON, XLSX and Markdown.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt lxml

# keyword search, 100 best-rated results
.venv/bin/python gumroad_scraper.py -s "notion template" -n 100 --sort highest_rated

# a creator's whole store, and specific products
.venv/bin/python gumroad_scraper.py -u https://creator.gumroad.com -u https://creator.gumroad.com/l/slug

# batch from a file (one URL per line), JSON only
.venv/bin/python gumroad_scraper.py --urls-file urls.txt -f json -o results

# convert saved results to another format without scraping again
.venv/bin/python gumroad_scraper.py --from-json results.json -f md
```

Options: `--sort`, `--min-price/--max-price`, `--min-rating`, `--tag`, `--no-details`
(search results only: faster, fewer fields), `--format csv,json,xlsx,md`, `--from-json`, `--workers`, `--delay`.

Fields: name, url, seller (+ reputation), price/currency, pay-what-you-want, membership/recurrence,
tier options, rating average/count and 1-5★ distribution, sales count (when shown), refund policy,
description text, cover/thumbnail URLs.

Notes
- `price` is in the product's own currency; `local_price` is what Gumroad displayed for your IP.
- `sales_count` is null unless the creator shows it publicly.
- Data comes from the page payload and the public search endpoint behind gumroad.com/discover; Gumroad
  may change these without notice. Respect Gumroad's terms and keep the request rate low.
