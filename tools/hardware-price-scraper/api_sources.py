"""Official-API price sources. Each returns [(title, price, url, condition)]."""
import base64, os, re, time

import requests

EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
EBAY_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
BESTBUY_URL = "https://api.bestbuy.com/v1/products"


MAX_BACKOFF = 90  # seconds to wait on HTTP 429 before one retry


class MissingCredentials(Exception):
    pass


class EbayAPI:
    """Browse API, client-credentials flow. Needs EBAY_CLIENT_ID / EBAY_CLIENT_SECRET."""

    def __init__(self, session: requests.Session):
        self.s = session
        self.token, self.expires = None, 0.0

    def _auth(self):
        if self.token and time.time() < self.expires - 60:
            return
        cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
        if not (cid and secret):
            raise MissingCredentials("set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET")
        basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
        r = self.s.post(EBAY_TOKEN_URL, timeout=20,
                        headers={"Authorization": f"Basic {basic}"},
                        data={"grant_type": "client_credentials",
                              "scope": "https://api.ebay.com/oauth/api_scope"})
        r.raise_for_status()
        j = r.json()
        self.token, self.expires = j["access_token"], time.time() + int(j.get("expires_in", 7200))

    def search(self, q: str, limit: int = 50):
        self._auth()
        r = self.s.get(EBAY_SEARCH_URL, timeout=20, params={
            "q": q, "limit": limit, "sort": "price",
            "filter": "buyingOptions:{FIXED_PRICE},priceCurrency:USD,price:[20..]",
        }, headers={"Authorization": f"Bearer {self.token}",
                    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"})
        r.raise_for_status()
        return parse_ebay(r.json())


def parse_ebay(j: dict):
    out = []
    for it in j.get("itemSummaries", []):
        p = it.get("price") or {}
        if p.get("currency") == "USD" and p.get("value"):
            out.append((it.get("title", ""), float(p["value"]), it.get("itemWebUrl", ""), it.get("condition")))
    return out


class BestBuyAPI:
    """Products API. Needs BESTBUY_API_KEY."""

    def __init__(self, session: requests.Session):
        self.s = session

    def search(self, q: str, limit: int = 25):
        key = os.environ.get("BESTBUY_API_KEY")
        if not key:
            raise MissingCredentials("set BESTBUY_API_KEY")
        terms = "&".join(f"search={w}" for w in re.findall(r"[A-Za-z0-9]+", q))
        r = self.s.get(f"{BESTBUY_URL}(({terms}))", timeout=20, params={
            "apiKey": key, "format": "json", "pageSize": limit, "sort": "salePrice.asc",
            "show": "name,salePrice,url,condition",
        })
        r.raise_for_status()
        return parse_bestbuy(r.json())


def parse_bestbuy(j: dict):
    return [(p["name"], float(p["salePrice"]), p.get("url", ""), p.get("condition"))
            for p in j.get("products", []) if p.get("name") and p.get("salePrice")]


class ShopifyStore:
    """Any Shopify storefront via its public /search/suggest.json (no key, max 10 hits).

    Built for polite use: the caller rate-limits and the endpoint is allowed by robots.txt
    on the stores configured in sites.json (verify before adding another).
    """

    def __init__(self, session: requests.Session, domain: str):
        self.s, self.base = session, f"https://{domain}"
        self.rate_limited = False

    def search(self, q: str, limit: int = 10):
        r = self.s.get(f"{self.base}/search/suggest.json", timeout=20, params={
            "q": q, "resources[type]": "product", "resources[limit]": min(limit, 10)})
        if r.status_code == 429:
            raise requests.RequestException("rate limited (HTTP 429), try a larger --delay")
        r.raise_for_status()
        return parse_shopify(r.json(), self.base)

    def variants(self, url: str):
        """Per-variant prices from the public product .js endpoint.

        Returns [] on any failure. After one HTTP 429 it stops asking for the rest of the
        run (callers then fall back to the listing's base price).
        """
        if self.rate_limited:
            return []
        try:
            r = self.s.get(url + ".js", timeout=20)
            if r.status_code == 429:  # honour Retry-After once (capped), then give up for this run
                wait = min(int(r.headers.get("retry-after", 30) or 30), MAX_BACKOFF)
                print(f"  - {self.base} asked us to slow down; waiting {wait}s")
                time.sleep(wait)
                r = self.s.get(url + ".js", timeout=20)
            if r.status_code == 429:
                self.rate_limited = True
                print(f"  ! {self.base} still rate-limiting variant lookups; using base prices")
                return []
            return parse_variants(r.json()) if r.ok else []
        except (requests.RequestException, ValueError):
            return []


def parse_variants(j: dict):
    """Product .js payload -> [(variant title, price USD, available)]; prices are in cents."""
    out, seen = [], set()
    for v in j.get("variants", []):
        if not v.get("price"):
            continue
        # Stores often clone each variant per region ("... / US", "... / EU") at the same price.
        title = re.sub(r"\s*/\s*(US|EU|UK|AU|CA|DE|FR|JP)$", "", v.get("title", ""))
        key = (title, v["price"])
        if key not in seen:
            seen.add(key)
            out.append((title, v["price"] / 100, bool(v.get("available", True))))
    return out


def parse_shopify(j: dict, base: str):
    out = []
    for p in j.get("resources", {}).get("results", {}).get("products", []):
        if p.get("title") and p.get("price") and p.get("available", True):
            body = re.sub(r"<[^>]+>|&nbsp;|&amp;", " ", p.get("body") or "")
            out.append((p["title"], float(p["price"]), base + p.get("url", "").split("?")[0], None, body))
    return out


API_CLASSES = {"ebay": EbayAPI, "bestbuy": BestBuyAPI, "shopify": ShopifyStore}
