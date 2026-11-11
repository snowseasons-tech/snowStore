import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import scraper

SITE = {"item": "div.i", "title": "a.t", "price": "span.p", "link": "a.t"}
HTML = """<div class=i><a class=t href="/a">NVIDIA RTX 3090 24GB Founders</a><span class=p>$1,099.99</span></div>
<div class=i><a class=t href="/b">RTX 3090 24GB water block</a><span class=p>$150.00</span></div>
<div class=i><a class=t href="/c">RTX 3080 10GB</a><span class=p>$400.00</span></div>"""
LD = '<script type="application/ld+json">{"@type":"Product","name":"Tesla P40 24GB","url":"/p","offers":{"price":"249.00"}}</script>'

def test_price():
    assert scraper.parse_price("$1,099.99 to $1,200") == 1099.99
    assert scraper.parse_price("call us") is None

def test_selectors_and_filters():
    items = scraper.parse_page(HTML, SITE, "https://x.com/s")
    assert len(items) == 3 and items[0][2] == "https://x.com/a"
    assert scraper.relevant(items[0][0], "NVIDIA RTX 3090 24GB")
    assert not scraper.relevant(items[2][0], "NVIDIA RTX 3090 24GB")

def test_jsonld_fallback():
    assert scraper.parse_page(LD, {}, "https://x.com")[0][1] == 249.0

def test_specs():
    assert scraper.extract_specs("RTX 3090 24GB", "gpu") == {"vram_gb": 24}

def test_api_parsers():
    import api_sources as a
    assert a.parse_ebay({"itemSummaries": [
        {"title": "RTX 3090 24GB", "price": {"value": "899.00", "currency": "USD"}, "itemWebUrl": "u", "condition": "Used"},
        {"title": "x", "price": {"value": "5", "currency": "EUR"}}]}) == [("RTX 3090 24GB", 899.0, "u", "Used")]
    assert a.parse_bestbuy({"products": [{"name": "RTX 4090", "salePrice": 1599.99, "url": "b", "condition": "new"}]})[0][1] == 1599.99

def test_pipeline_with_fake_api(monkeypatch):
    class Fake:
        s, delay, last = None, 0, {}
    import api_sources as a
    class FakeAPI:
        def __init__(self, s): pass
        def search(self, q): return [("RTX 3090 24GB card", 800.0, "u", "Used"), ("RTX 3090 24GB water block", 90.0, "v", None)]
    monkeypatch.setitem(a.API_CLASSES, "ebay", FakeAPI)
    r = scraper.scrape([{"name": "eBay", "type": "api", "api": "ebay"}], [{"q": "RTX 3090 24GB", "category": "gpu"}], Fake())
    assert len(r) == 1 and r[0].usd_per_gb_vram == round(800 / 24, 2) and r[0].condition == "Used"

def test_load_env(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text('# c\nEBAY_CLIENT_ID="abc"\nBESTBUY_API_KEY=k1\n')
    monkeypatch.delenv("EBAY_CLIENT_ID", raising=False)
    monkeypatch.setenv("BESTBUY_API_KEY", "real")
    scraper.load_env(f)
    import os
    assert os.environ["EBAY_CLIENT_ID"] == "abc" and os.environ["BESTBUY_API_KEY"] == "real"
    monkeypatch.delenv("EBAY_CLIENT_ID")

def test_shopify_parser_and_disabled_sources():
    import api_sources as a
    j = {"resources": {"results": {"products": [
        {"title": "64GB DDR4 RDIMM", "price": "359.00", "url": "/products/x?_pos=1", "available": True},
        {"title": "sold out", "price": "10", "url": "/products/y", "available": False}]}}}
    assert a.parse_shopify(j, "https://s.com") == [("64GB DDR4 RDIMM", 359.0, "https://s.com/products/x", None, "")]
    assert scraper.scrape([{"name": "eBay", "type": "api", "api": "ebay", "enabled": False}],
                          [{"q": "x", "category": "gpu"}], None) == []

ITC = '<script type="application/ld+json">{"@type":"Product","name":"NVIDIA L40S 48GB","offers":{"@type":"Offer","priceCurrency":"USD","price":11995,"itemCondition":"https://schema.org/RefurbishedCondition"}}</script>'
BS = '<meta property="product:price:amount" content="16250"/><meta property="product:price:currency" content="GBP"/><meta property="og:title" content="A100 80GB"/>'

def test_product_page():
    assert scraper.parse_product_page(ITC) == {"title": "NVIDIA L40S 48GB", "price": 11995.0, "currency": "USD", "condition": "Refurbished"}
    assert scraper.parse_product_page(BS)["currency"] == "GBP"
    assert scraper.parse_product_page("<html></html>") is None

def test_watchlist_skips_non_usd(tmp_path, monkeypatch):
    (tmp_path / "w.json").write_text('{"urls":["u1","u2"]}')
    monkeypatch.setattr(scraper, "HERE", tmp_path)
    class F:
        def get(self, u): return ITC if u == "u1" else BS
    out = scraper.watchlist_items({"name": "W", "file": "w.json"}, F(), {})
    assert [i[1] for i in out] == [11995.0]

def test_relevance_tightened():
    r = scraper.relevant
    gpu_srv = "Supermicro GPU server 4U"
    assert r("Supermicro AS-4124GS-TNR 4U GPU Server 8x A100", gpu_srv)
    assert not r("Supermicro 1000W 80 PLUS Titanium 1U Rackmount Power Supply", gpu_srv)
    assert not r("SuperMicro CSE-815 CTO 1U 4x 3.5\" Server", gpu_srv)
    assert not r("Dell 3.84TB SSD SAS 2.5 12G RI", "NVMe SSD 3.84TB enterprise")
    assert r("Samsung PM9A3 3.84TB NVMe SSD U.2", "NVMe SSD 3.84TB enterprise")
    assert r("Dell PowerEdge R740XD 24x2.5\" Server", "Dell PowerEdge R740 server")
    assert not r("RTX 3090 124GB", "RTX 3090 24GB")

def test_minipc_specs():
    body = "Packed with 128GB LPDDR5X-8000 RAM and dual M.2 slots up to 16TB, 2TB SSD, 512GB cache"
    assert scraper.extract_specs("Beelink GTR9 Pro", "minipc", body) == {"ram_gb": 128}
    assert scraper.extract_specs("Mini PC 32GB DDR5 512GB SSD", "minipc") == {"ram_gb": 32}
    assert scraper.extract_specs("Mini PC", "minipc") == {}

def test_minipc_routing(monkeypatch):
    import api_sources as a
    class Fake:
        s, delay, last = None, 0, {}
    class FakeStore:
        def __init__(self, s, d): pass
        def search(self, q): return [("Beelink GTR9 Pro Ryzen AI Max+ 395", 4199.0, "u", None, "128GB LPDDR5X"),
                                     ("Beelink SSD Upgrade Kit GTR", 189.0, "v", None, "")]
        def variants(self, url): return []
    monkeypatch.setitem(a.API_CLASSES, "shopify", FakeStore)
    sites = [{"name": "B", "type": "api", "api": "shopify", "domain": "d", "categories": ["minipc"]},
             {"name": "G", "type": "api", "api": "shopify", "domain": "d"}]
    r = scraper.scrape(sites, [{"q": "Beelink GTR", "category": "minipc"}], Fake())
    assert [x.site for x in r] == ["B"] and r[0].ram_gb == 128 and r[0].usd_per_gb_ram == round(4199 / 128, 2)
    assert [x.site for x in scraper.scrape(sites, [{"q": "Beelink GTR", "category": "gpu"}], Fake())] == ["G"]

def test_variants_expand_minipc(monkeypatch):
    import api_sources as a
    assert a.parse_variants({"variants": [{"title": "64GB+1TB", "price": 219999, "available": True},
                                          {"title": "128GB+2TB", "price": 349999, "available": False}]}) == \
        [("64GB+1TB", 2199.99, True), ("128GB+2TB", 3499.99, False)]
    assert scraper.variant_ram("64GB+1TB") == 64 and scraper.variant_ram("32GB / 512GB") == 32
    assert scraper.variant_ram("Default Title") is None
    class Fake:
        s, delay, last = None, 0, {}
    class FakeStore:
        def __init__(self, s, d): pass
        def search(self, q): return [("GMKtec EVO-X2 Ryzen AI Max+ 395 Mini PC", 2199.99, "u", None, "")]
        def variants(self, url): return [("64GB+1TB", 2199.99, True), ("128GB+2TB", 2999.0, True), ("96GB", 2500.0, False)]
    monkeypatch.setitem(a.API_CLASSES, "shopify", FakeStore)
    r = scraper.scrape([{"name": "G", "type": "api", "api": "shopify", "domain": "d", "categories": ["minipc"]}],
                       [{"q": "Ryzen AI Max 395", "category": "minipc"}], Fake())
    assert [(x.ram_gb, x.price, x.usd_per_gb_ram) for x in r] == [(64, 2199.99, 34.37), (128, 2999.0, 23.43)]

def test_variants_dedupe_regions():
    import api_sources as a
    got = a.parse_variants({"variants": [{"title": "64GB RAM + 1TB SSD / US", "price": 219999},
                                         {"title": "64GB RAM + 1TB SSD / EU", "price": 219999},
                                         {"title": "128GB RAM + 1TB SSD / US", "price": 349999}]})
    assert got == [("64GB RAM + 1TB SSD", 2199.99, True), ("128GB RAM + 1TB SSD", 3499.99, True)]

def test_variants_stop_after_429(monkeypatch):
    import api_sources as a
    calls = []
    class R:
        status_code, headers, ok = 429, {"retry-after": "60"}, False
    class S:
        def get(self, url, **kw): calls.append(url); return R()
    st = a.ShopifyStore(S(), "x.com")
    assert st.variants("https://x.com/products/a") == [] and st.variants("https://x.com/products/b") == []
    assert len(calls) == 1

def test_part_words_filtered(monkeypatch):
    import api_sources as a
    class Fake:
        s, delay, last = None, 0, {}
    class FakeStore:
        def __init__(self, s, d): pass
        def search(self, q): return [("Lenovo SR630 THINKSYSTEM SERVER", 394.99, "u", None, ""),
                                     ("Lenovo 01KP697 FAN FOR THINKSYSTEM SR630", 44.95, "v", None, ""),
                                     ("Lenovo 01GV283 ThinkSystem SR650 Backplane", 50.0, "w", None, "")]
    monkeypatch.setitem(a.API_CLASSES, "shopify", FakeStore)
    r = scraper.scrape([{"name": "S", "type": "api", "api": "shopify", "domain": "d"}],
                       [{"q": "Lenovo ThinkSystem SR630", "category": "server"}], Fake())
    assert [x.price for x in r] == [394.99]


def test_mariadb_failure_never_raises(monkeypatch, capsys):
    import mariadb_store
    def boom(): raise RuntimeError("server down")
    monkeypatch.setattr(mariadb_store, "connect", boom)
    li = scraper.Listing("S", "q", "gpu", "t", 1.0, "u")
    scraper.mirror_to_mariadb([li], "2026-01-01 00:00:00")      # must not raise
    assert "MariaDB mirror skipped" in capsys.readouterr().err
