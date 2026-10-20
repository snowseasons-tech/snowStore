#!/usr/bin/env python3
"""Gumroad scraper: product details, ratings and pricing -> CSV / JSON / XLSX.

Inputs (mix freely):
  --search "notion template"   keyword search (paginated, with sort/price/rating filters)
  --url <product-or-profile>   product page (…/l/slug) or creator profile (name.gumroad.com)
  --urls-file urls.txt         one URL per line (batch mode)

Uses only Gumroad's public pages and the public search endpoint that powers
gumroad.com/discover. Be polite: keep --delay >= 0.5 and --workers low.
"""
import argparse
import csv
import html as htmllib
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SEARCH_URL = "https://gumroad.com/products/search"
SORTS = ["default", "highest_rated", "most_reviewed", "newest", "hot_and_new", "price_asc", "price_desc"]

FIELDS = [
    "id", "permalink", "name", "url", "seller_name", "seller_url", "seller_verified",
    "seller_rating_avg", "seller_rating_count", "seller_products_count",
    "price", "currency", "price_display", "pay_what_you_want", "is_free",
    "recurrence", "is_membership", "native_type", "local_price", "local_currency",
    "rating_average", "rating_count", "rating_1", "rating_2", "rating_3", "rating_4", "rating_5",
    "sales_count", "quantity_remaining", "refund_policy", "options",
    "description", "thumbnail_url", "cover_urls", "scraped_at",
]

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, delay, params=None, accept=None, retries=4):
    """GET with polite delay and exponential backoff on 429/5xx."""
    headers = {"Accept": accept} if accept else {}
    for attempt in range(retries):
        time.sleep(delay)
        try:
            r = session.get(url, params=params, headers=headers, timeout=30)
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
            continue
        if r.status_code in (429, 500, 502, 503, 504) and attempt < retries - 1:
            time.sleep(2 ** (attempt + 1))
            continue
        return r
    return r


def clean_url(u):
    """Drop tracking/query params so the same product dedupes cleanly."""
    p = urlparse(u)
    return urlunparse((p.scheme, p.netloc, p.path.rstrip("/"), "", "", ""))


def page_props(html_text):
    m = re.search(r'<div id="app"[^>]*data-page="([^"]+)"', html_text)
    if not m:
        return None
    return json.loads(htmllib.unescape(m.group(1))).get("props")


def html_to_text(s):
    if not s:
        return ""
    soup = BeautifulSoup(s, "lxml") if _has_lxml() else BeautifulSoup(s, "html.parser")
    for t in soup(["script", "style", "iframe"]):
        t.decompose()
    return re.sub(r"\n{3,}", "\n\n", soup.get_text("\n")).strip()


def _has_lxml():
    try:
        import lxml  # noqa: F401
        return True
    except ImportError:
        return False


def money(cents, currency):
    if cents is None:
        return None
    zero_decimal = {"jpy", "krw", "vnd", "clp", "isk"}
    return cents if (currency or "").lower() in zero_decimal else round(cents / 100, 2)


def normalise(p, scraped_at):
    """Flatten a Gumroad product dict (page or search result) into one row."""
    seller = p.get("seller") or {}
    rep = p.get("seller_reputation") or {}
    ratings = p.get("ratings") or {}
    pct = ratings.get("percentages") or []
    cur = (p.get("currency_code") or "").upper()
    price = money(p.get("price_cents"), cur)
    local_cur = (p.get("buyer_currency") or "").upper()
    local = money(p.get("buyer_local_price_cents"), local_cur)
    rec = p.get("recurrence") or (
        (p.get("recurrences") or [{}])[0].get("recurrence") if p.get("recurrences") else None
    )
    opts = []
    for o in p.get("options") or []:
        entry = {"name": o.get("name")}
        if o.get("price_difference_cents") is not None:
            entry["price_difference"] = money(o["price_difference_cents"], cur)
        if o.get("recurrence_price_values"):
            entry["recurrence_prices"] = {
                k: money(v.get("price_cents"), cur)
                for k, v in o["recurrence_price_values"].items() if isinstance(v, dict)
            }
        opts.append(entry)
    url = p.get("long_url") or p.get("url") or ""
    covers = [c.get("url") for c in p.get("covers") or [] if c.get("url")]
    pr = p.get("pwyw") is not None or bool(p.get("is_pay_what_you_want"))
    refund = (p.get("refund_policy") or {}).get("title")
    row = {
        "id": p.get("permalink"),
        "permalink": p.get("permalink"),
        "name": p.get("name"),
        "url": clean_url(url) if url else None,
        "seller_name": seller.get("name"),
        "seller_url": clean_url(seller["profile_url"]) if seller.get("profile_url") else None,
        "seller_verified": seller.get("is_verified"),
        "seller_rating_avg": rep.get("average"),
        "seller_rating_count": rep.get("count"),
        "seller_products_count": rep.get("products_count"),
        "price": price,
        "currency": cur,
        "price_display": f"{price} {cur}" if price is not None else None,
        "pay_what_you_want": pr,
        "is_free": price == 0 and not pr if price is not None else None,
        "recurrence": rec,
        "is_membership": bool(p.get("is_tiered_membership") or p.get("is_recurring_billing") or p.get("duration_in_months") or rec),
        "native_type": p.get("native_type"),
        "local_price": local,
        "local_currency": local_cur or None,
        "rating_average": ratings.get("average"),
        "rating_count": ratings.get("count"),
        "sales_count": p.get("sales_count"),
        "quantity_remaining": p.get("quantity_remaining"),
        "refund_policy": refund,
        "options": json.dumps(opts, ensure_ascii=False) if opts else None,
        "description": html_to_text(p.get("description_html")) or p.get("description"),
        "thumbnail_url": p.get("thumbnail_url"),
        "cover_urls": covers,
        "scraped_at": scraped_at,
    }
    for i in range(5):  # percentages are ordered 1★ .. 5★
        row[f"rating_{i + 1}"] = pct[i] if i < len(pct) else None
    return row


def scrape_product(url, delay):
    r = get(url, delay)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    props = page_props(r.text)
    if not props or "product" not in props:
        raise RuntimeError("no product data on page (not a product URL?)")
    p = props["product"]
    p["seller_reputation"] = (props.get("creator_profile") or {}).get("reputation") or p.get("seller_reputation")
    return normalise(p, now())


def scrape_profile(url, delay):
    """Return product URLs listed on a creator profile."""
    r = get(url, delay)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    props = page_props(r.text) or {}
    urls = []
    for sec in props.get("sections") or []:
        for p in (sec.get("search_results") or {}).get("products") or []:
            if p.get("url"):
                urls.append(clean_url(p["url"]))
        # featured product sections reference a single product
        fp = sec.get("featured_product")
        if isinstance(fp, dict) and fp.get("url"):
            urls.append(clean_url(fp["url"]))
    if not urls:  # fallback: any /l/ links in the page
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        urls = [base + m for m in dict.fromkeys(re.findall(r"/l/[\w-]+", r.text))]
    return list(dict.fromkeys(urls))


def search(query, args):
    """Yield search-result product dicts, paginating until max or exhausted."""
    offset, got = 0, 0
    while got < args.max_items:
        params = {"query": query, "from": offset}
        if args.sort != "default":
            params["sort"] = args.sort
        if args.min_price is not None:
            params["min_price"] = args.min_price
        if args.max_price is not None:
            params["max_price"] = args.max_price
        if args.min_rating:
            params["rating"] = args.min_rating
        if args.tag:
            params["tags"] = args.tag
        r = get(SEARCH_URL, args.delay, params=params, accept="application/json")
        if r.status_code != 200:
            log(f"search '{query}' failed: HTTP {r.status_code}")
            return
        data = r.json()
        prods = data.get("products") or []
        if offset == 0:
            log(f"search '{query}': {data.get('total')} total results")
        if not prods:
            return
        for p in prods:
            yield p
            got += 1
            if got >= args.max_items:
                return
        offset += len(prods)
        if offset >= (data.get("total") or 0):
            return


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def is_product_url(u):
    return "/l/" in urlparse(u).path


def collect(args):
    """Resolve all inputs to either full rows or product URLs to fetch."""
    urls, rows, seen = [], [], set()

    def add_url(u):
        c = clean_url(u)
        if c not in seen:
            seen.add(c)
            urls.append(c)

    inputs = list(args.url or [])
    if args.urls_file:
        with open(args.urls_file) as f:
            inputs += [l.strip() for l in f if l.strip() and not l.startswith("#")]

    for u in inputs:
        if not u.startswith("http"):
            u = "https://" + u
        if is_product_url(u):
            add_url(u)
        else:
            try:
                found = scrape_profile(u, args.delay)
                log(f"profile {u}: {len(found)} products")
                for x in found[: args.max_items]:
                    add_url(x)
            except Exception as e:
                log(f"profile {u} failed: {e}")

    for q in args.search or []:
        for p in search(q, args):
            if args.no_details:
                c = clean_url(p.get("url", ""))
                if c not in seen:
                    seen.add(c)
                    rows.append(normalise(p, now()))
            else:
                add_url(p["url"])
    return urls, rows


def run(args):
    urls, rows = collect(args)
    log(f"{len(urls)} product pages to fetch")

    def work(u):
        try:
            return scrape_product(u, args.delay)
        except Exception as e:
            log(f"  skip {u}: {e}")
            return None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, row in enumerate(ex.map(work, urls), 1):
            if row:
                rows.append(row)
            if i % 10 == 0:
                log(f"  {i}/{len(urls)}")
    return rows


def flat(row):
    out = {}
    for k in FIELDS:
        v = row.get(k)
        out[k] = " | ".join(v) if isinstance(v, list) else v
    return out


def write_csv(rows, path):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(flat(r) for r in rows)


def write_json(rows, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def write_xlsx(rows, path):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append(FIELDS)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([_xl(v) for v in flat(r).values()])
    ws.freeze_panes = "A2"
    widths = {"name": 40, "url": 50, "description": 60, "seller_name": 24}
    for i, k in enumerate(FIELDS, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = widths.get(k, 16)
    wb.save(path)


def _xl(v):
    if isinstance(v, str):  # Excel cell limit + illegal control chars
        v = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", v)[:32000]
    return v


def write_md(rows, path):
    def cell(v):
        return "" if v is None else str(v).replace("|", "\\|").replace("\n", " ")

    out = [f"# Gumroad products ({len(rows)})", ""]
    out += ["| Name | Seller | Price | Rating | Reviews | Type |", "|---|---|---|---|---|---|"]
    for r in rows:
        name = f"[{cell(r.get('name'))}]({r.get('url')})" if r.get("url") else cell(r.get("name"))
        price = "PWYW" if r.get("pay_what_you_want") else cell(r.get("price_display"))
        out.append(f"| {name} | {cell(r.get('seller_name'))} | {price} | {cell(r.get('rating_average'))} "
                   f"| {cell(r.get('rating_count'))} | {cell(r.get('native_type'))} |")
    out.append("")
    for r in rows:
        out += [f"## {r.get('name')}", ""]
        for label, key in [("URL", "url"), ("Seller", "seller_name"), ("Price", "price_display"),
                           ("Local price", "local_price"), ("Rating", "rating_average"),
                           ("Reviews", "rating_count"), ("Sales", "sales_count"),
                           ("Recurrence", "recurrence"), ("Refund policy", "refund_policy")]:
            if r.get(key) not in (None, ""):
                out.append(f"- **{label}:** {r[key]}")
        dist = [r.get(f"rating_{i}") for i in range(5, 0, -1)]
        if any(d is not None for d in dist):
            out.append("- **Rating split (5★→1★):** " + " / ".join(f"{d}%" for d in dist))
        if r.get("options"):
            out.append(f"- **Options:** `{r['options']}`")
        if r.get("description"):
            desc = r["description"].strip()
            out += ["", "> " + (desc[:600] + ("…" if len(desc) > 600 else "")).replace("\n", "\n> ")]
        out.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))


WRITERS = {"csv": write_csv, "json": write_json, "xlsx": write_xlsx, "md": write_md}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-json", help="skip scraping: convert an existing results .json to the --format list")
    ap.add_argument("-s", "--search", action="append", help="search keyword (repeatable)")
    ap.add_argument("-u", "--url", action="append", help="product or profile URL (repeatable)")
    ap.add_argument("--urls-file", help="text file with one URL per line")
    ap.add_argument("-n", "--max-items", type=int, default=50, help="max products per search/profile (default 50)")
    ap.add_argument("--sort", choices=SORTS, default="default")
    ap.add_argument("--min-price", type=float, help="search filter, in dollars")
    ap.add_argument("--max-price", type=float)
    ap.add_argument("--min-rating", type=int, choices=[1, 2, 3, 4], help="search filter: N stars and up")
    ap.add_argument("--tag", help="search filter: tag")
    ap.add_argument("--no-details", action="store_true", help="search results only: faster, fewer fields")
    ap.add_argument("-f", "--format", default="csv,json,xlsx", help="comma list of csv,json,xlsx,md")
    ap.add_argument("-o", "--output", default="gumroad_products", help="output path without extension")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--delay", type=float, default=0.6, help="seconds before each request")
    args = ap.parse_args()

    if args.from_json:
        rows = json.load(open(args.from_json, encoding="utf-8"))
        out = args.output if args.output != "gumroad_products" else args.from_json.rsplit(".", 1)[0]
        for fmt in [x.strip() for x in args.format.split(",") if x.strip()]:
            WRITERS[fmt](rows, f"{out}.{fmt}")
            log(f"wrote {len(rows)} rows -> {out}.{fmt}")
        return 0
    if not (args.search or args.url or args.urls_file):
        ap.error("give at least one of --search, --url, --urls-file")
    fmts = [x.strip() for x in args.format.split(",") if x.strip()]
    bad = [x for x in fmts if x not in WRITERS]
    if bad:
        ap.error(f"unknown format(s): {', '.join(bad)}")

    rows = run(args)
    if not rows:
        log("no products scraped")
        return 1
    for fmt in fmts:
        path = f"{args.output}.{fmt}"
        WRITERS[fmt](rows, path)
        log(f"wrote {len(rows)} rows -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
