#!/usr/bin/env python3
"""Compare prices for server / LLM-capable hardware across retailers.

Polite by design: honours robots.txt, rate-limits per host, identifies itself,
and caches responses so re-runs don't re-hit sites.
"""
import argparse, csv, hashlib, json, os, re, sqlite3, sys, time
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import quote_plus, urlparse, urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

import api_sources

HERE = Path(__file__).parent
UA = "hardware-price-scraper/1.0 (personal price comparison)"
CACHE = HERE / ".cache"

def load_env(path: Path = HERE / ".env"):
    """Minimal KEY=VALUE loader; real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


# VRAM per card: used to rank GPUs by $/GB, the metric that matters for LLMs.
PRICE_RE = re.compile(r"\$\s*([\d,]+(?:\.\d{1,2})?)")


@dataclass
class Listing:
    site: str
    query: str
    category: str
    title: str
    price: float
    url: str
    vram_gb: int | None = None
    ram_gb: int | None = None
    usd_per_gb_vram: float | None = None
    condition: str | None = None


def parse_price(text: str) -> float | None:
    """First dollar amount in text; for 'a to b' ranges takes the low end."""
    m = PRICE_RE.search(text or "")
    return float(m.group(1).replace(",", "")) if m else None


def extract_specs(title: str, category: str) -> dict:
    t = title.upper()
    out = {}
    gb = [int(x) for x in re.findall(r"(\d{1,3})\s*GB", t)]
    if category == "gpu" and gb:
        out["vram_gb"] = max(gb)
    elif category in ("server", "ram") and gb:
        out["ram_gb"] = max(gb)
    return out


def relevant(title: str, query: str) -> bool:
    """Every alphanumeric token of the query (ignoring filler) must appear in the title."""
    stop = {"server", "gpu", "4u", "enterprise", "ssd", "nvme"}
    toks = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if w not in stop]
    low = title.lower()
    return all(w in low for w in toks)


class Fetcher:
    def __init__(self, delay: float, use_cache: bool, ignore_robots: bool = False):
        self.delay, self.use_cache, self.ignore_robots = delay, use_cache, ignore_robots
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
        self.last: dict[str, float] = {}
        self.robots: dict[str, RobotFileParser | None] = {}
        CACHE.mkdir(exist_ok=True)

    def allowed(self, url: str) -> bool:
        if self.ignore_robots:
            return True
        host = urlparse(url)
        base = f"{host.scheme}://{host.netloc}"
        if base not in self.robots:
            rp = RobotFileParser()
            try:
                r = self.s.get(base + "/robots.txt", timeout=10)
                rp.parse(r.text.splitlines()) if r.ok else rp.parse([])
            except requests.RequestException:
                rp = None
            self.robots[base] = rp
        rp = self.robots[base]
        return True if rp is None else rp.can_fetch(UA, url)

    def get(self, url: str) -> str | None:
        key = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")
        if self.use_cache and key.exists() and time.time() - key.stat().st_mtime < 3600:
            return key.read_text()
        if not self.allowed(url):
            print(f"  ! robots.txt disallows {url}", file=sys.stderr)
            return None
        host = urlparse(url).netloc
        wait = self.delay - (time.time() - self.last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        self.last[host] = time.time()
        try:
            r = self.s.get(url, timeout=20)
        except requests.RequestException as e:
            print(f"  ! {url}: {e}", file=sys.stderr)
            return None
        if r.status_code != 200:
            print(f"  ! HTTP {r.status_code} for {url}", file=sys.stderr)
            return None
        key.write_text(r.text)
        return r.text


def parse_jsonld(soup: BeautifulSoup, base: str):
    """Yield (title, price, url) from schema.org Product / ItemList JSON-LD."""
    def walk(node):
        if isinstance(node, list):
            for n in node:
                yield from walk(n)
        elif isinstance(node, dict):
            if node.get("@type") == "Product":
                offers = node.get("offers") or {}
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                price = offers.get("price") or offers.get("lowPrice")
                if node.get("name") and price:
                    yield node["name"], float(str(price).replace(",", "")), urljoin(base, node.get("url") or offers.get("url") or "")
            for v in node.values():
                if isinstance(v, (dict, list)):
                    yield from walk(v)
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            yield from walk(json.loads(tag.string or ""))
        except (ValueError, TypeError):
            continue


def parse_page(html: str, site: dict, base: str):
    soup = BeautifulSoup(html, "html.parser")
    found = []
    if site.get("item"):
        for el in soup.select(site["item"]):
            t, p, l = (el.select_one(site[k]) for k in ("title", "price", "link"))
            if not (t and p):
                continue
            price = parse_price(p.get_text(" ", strip=True))
            href = l.get("href") if l is not None else ""
            if price:
                found.append((t.get_text(" ", strip=True), price, urljoin(base, href or "")))
    return found or list(parse_jsonld(soup, base))


def candidates(site, q, fetcher, apis):
    """Yield (title, price, url, condition) from an API or HTML source; [] if unavailable."""
    if site.get("type") == "api":
        cls, args = api_sources.API_CLASSES[site["api"]], ([site["domain"]] if site["api"] == "shopify" else [])
        api = apis.setdefault(site["name"], cls(fetcher.s, *args))
        wait = fetcher.delay - (time.time() - fetcher.last.get(site["name"], 0))
        if wait > 0:
            time.sleep(wait)
        fetcher.last[site["name"]] = time.time()
        try:
            return api.search(q["q"])
        except api_sources.MissingCredentials as e:
            print(f"  - skipped: {e}")
        except requests.RequestException as e:
            print(f"  ! API error: {e}", file=sys.stderr)
        return []
    url = site["search_url"].format(q=quote_plus(q["q"]))
    html = fetcher.get(url)
    return [(t, p, l, None) for t, p, l in parse_page(html, site, url)] if html else []


def scrape(sites, queries, fetcher, max_per=15, min_price=20.0):
    results: list[Listing] = []
    apis: dict = {}
    for q in queries:
        for site in sites:
            if site.get("enabled", True) is False:
                continue
            print(f"[{site['name']}] {q['q']}")
            n = 0
            for title, price, link, cond in candidates(site, q, fetcher, apis):
                if price < min_price or not relevant(title, q["q"]):
                    continue
                if re.search(r"\b(for parts|not working|box only|case only|water ?block|bracket|cooler)\b", title, re.I):
                    continue
                specs = extract_specs(title, q["category"])
                li = Listing(site["name"], q["q"], q["category"], title[:140], price, link, condition=cond, **specs)
                if li.vram_gb:
                    li.usd_per_gb_vram = round(price / li.vram_gb, 2)
                results.append(li)
                n += 1
                if n >= max_per:
                    break
            print(f"  {n} matching listings")
    return results


def save(results, out: Path):
    out.mkdir(exist_ok=True)
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(out / "latest.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(Listing.__dataclass_fields__))
        w.writeheader()
        w.writerows(asdict(r) for r in results)
    db = sqlite3.connect(out / "history.db")
    db.execute("""CREATE TABLE IF NOT EXISTS prices(ts TEXT, site TEXT, query TEXT, category TEXT,
                  title TEXT, price REAL, url TEXT, vram_gb INT, ram_gb INT, usd_per_gb_vram REAL, condition TEXT)""")
    db.executemany("INSERT INTO prices VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   [(stamp, *asdict(r).values()) for r in results])
    db.commit()


def report(results, top=5):
    for q in dict.fromkeys(r.query for r in results):
        rows = [r for r in results if r.query == q]
        key = (lambda r: r.usd_per_gb_vram) if rows[0].category == "gpu" and all(r.usd_per_gb_vram for r in rows) else (lambda r: r.price)
        rows.sort(key=key)
        print(f"\n== {q} ({len(rows)} listings) ==")
        for r in rows[:top]:
            extra = (f"  ${r.usd_per_gb_vram}/GB VRAM" if r.usd_per_gb_vram else "") + (f"  [{r.condition}]" if r.condition else "")
            print(f"  ${r.price:>9,.2f}  {r.site:<18} {r.title[:60]}{extra}\n             {r.url}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-q", "--query", action="append", help="ad-hoc query (repeatable); default: queries.json")
    ap.add_argument("--category", default="gpu", help="category for --query (gpu|server|ram|storage)")
    ap.add_argument("--site", action="append", help="limit to site name(s)")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests per host")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--out", type=Path, default=HERE / "output")
    a = ap.parse_args()
    load_env()

    sites = json.loads((HERE / "sites.json").read_text())["sites"]
    if a.site:
        sites = [s for s in sites if s["name"].lower() in {x.lower() for x in a.site}]
    queries = ([{"q": q, "category": a.category} for q in a.query] if a.query
               else json.loads((HERE / "queries.json").read_text())["queries"])

    results = scrape(sites, queries, Fetcher(a.delay, not a.no_cache))
    if not results:
        print("\nNo listings found. Selectors may be stale or sites blocked the request; see README.")
        return 1
    save(results, a.out)
    report(results, a.top)
    print(f"\nSaved {len(results)} rows to {a.out}/latest.csv and history.db")
    return 0


if __name__ == "__main__":
    sys.exit(main())
