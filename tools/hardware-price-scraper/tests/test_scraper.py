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
    assert a.parse_shopify(j, "https://s.com") == [("64GB DDR4 RDIMM", 359.0, "https://s.com/products/x", None)]
    assert scraper.scrape([{"name": "eBay", "type": "api", "api": "ebay", "enabled": False}],
                          [{"q": "x", "category": "gpu"}], None) == []
