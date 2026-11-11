import os, sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).parent.parent))
import mariadb_store as m


def test_row_key_is_stable_and_distinct():
    a = m.row_key("2026-01-01 00:00:00", "q", "http://x")
    assert a == m.row_key("2026-01-01 00:00:00", "q", "http://x") and len(a) == 40
    assert a != m.row_key("2026-01-02 00:00:00", "q", "http://x")


@pytest.fixture
def conn():
    try:
        c = m.connect()
    except Exception as e:
        pytest.skip(f"MariaDB not reachable: {e}")
    table = f"prices_test_{os.getpid()}"
    m.ensure_schema(c, table)
    yield c, table
    with c.cursor() as cur:
        cur.execute(f"DROP TABLE IF EXISTS `{table}`")
    c.commit(); c.close()


def rec(url, price, **kw):
    base = {"site": "S", "query": "q", "category": "gpu", "title": "T4 16GB", "price": price, "url": url,
            "vram_gb": 16, "ram_gb": None, "usd_per_gb_vram": round(price / 16, 2), "condition": "Used",
            "usd_per_gb_ram": None}
    return {**base, **kw}


def test_insert_is_idempotent_and_latest_picks_newest(conn):
    c, table = conn
    assert m.insert(c, "2026-01-01 10:00:00", [rec("u1", 100.0), rec("u2", 200.0)], table) == 2
    assert m.insert(c, "2026-01-01 10:00:00", [rec("u1", 100.0)], table) == 0          # duplicate ignored
    m.insert(c, "2026-01-02 10:00:00", [rec("u1", 90.0, title="Tesla T4 \u2122 16GB")], table)
    rows = {r["url"]: r for r in m.latest_rows(c, "2026-01-01 00:00:00", table)}
    assert rows["u1"]["price"] == 90.0 and rows["u1"]["condition"] == "Used"
    assert rows["u1"]["title"].endswith("16GB") and "\u2122" in rows["u1"]["title"]   # utf8mb4 round-trips
    assert rows["u2"]["price"] == 200.0 and len(rows) == 2
