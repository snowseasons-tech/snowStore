"""MariaDB mirror of the price history (database `hardware`, table `prices`).

Connection comes from env (or the tool's .env): MARIADB_DATABASE (default hardware),
MARIADB_USER (default: current OS user), MARIADB_PASSWORD (optional), MARIADB_SOCKET
(default /var/run/mysqld/mysqld.sock) or MARIADB_HOST/MARIADB_PORT for TCP.
With the default unix-socket auth no password is needed.

CLI:  python3 mariadb_store.py --import-sqlite output/history.db   (idempotent)
"""
import argparse, getpass, hashlib, os, sqlite3, sys
from pathlib import Path

HERE = Path(__file__).parent

# `condition` is a reserved word in MariaDB, so the column is item_condition.
COLUMNS = ["site", "query", "category", "title", "price", "url", "vram_gb", "ram_gb",
           "usd_per_gb_vram", "condition", "usd_per_gb_ram"]
SQL_COL = {"condition": "item_condition"}

SCHEMA = """CREATE TABLE IF NOT EXISTS `{table}` (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  row_key CHAR(40) NOT NULL,
  ts DATETIME NOT NULL,
  site VARCHAR(64) NOT NULL,
  `query` VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  vram_gb SMALLINT UNSIGNED NULL,
  ram_gb SMALLINT UNSIGNED NULL,
  usd_per_gb_vram DECIMAL(12,2) NULL,
  item_condition VARCHAR(32) NULL,
  usd_per_gb_ram DECIMAL(12,2) NULL,
  UNIQUE KEY uq_row (row_key),
  KEY idx_ts (ts),
  KEY idx_category_ts (category, ts),
  KEY idx_url_ts (url(191), ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""


def row_key(ts: str, query: str, url: str) -> str:
    """Stable id for one observation, so re-importing the same row is a no-op."""
    return hashlib.sha1(f"{ts}\x00{query}\x00{url}".encode()).hexdigest()


def connect():
    import pymysql  # imported lazily so the scraper still runs without the driver
    kw = {"user": os.environ.get("MARIADB_USER") or getpass.getuser(),
          "database": os.environ.get("MARIADB_DATABASE", "hardware"), "charset": "utf8mb4",
          "connect_timeout": 5, "autocommit": False}
    if os.environ.get("MARIADB_PASSWORD"):
        kw["password"] = os.environ["MARIADB_PASSWORD"]
    if os.environ.get("MARIADB_HOST"):
        kw.update(host=os.environ["MARIADB_HOST"], port=int(os.environ.get("MARIADB_PORT", 3306)))
    else:
        kw["unix_socket"] = os.environ.get("MARIADB_SOCKET", "/var/run/mysqld/mysqld.sock")
    return pymysql.connect(**kw)


def ensure_schema(conn, table: str = "prices"):
    with conn.cursor() as cur:
        cur.execute(SCHEMA.format(table=table))
    conn.commit()


def insert(conn, stamp: str, records, table: str = "prices") -> int:
    """records: dicts keyed by COLUMNS. Returns rows actually inserted (duplicates ignored)."""
    cols = ["row_key", "ts"] + [("`query`" if c == "query" else SQL_COL.get(c, c)) for c in COLUMNS]
    sql = f"INSERT IGNORE INTO `{table}` ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
    data = [(row_key(stamp, r["query"], r["url"]), stamp, *(r.get(c) for c in COLUMNS)) for r in records]
    with conn.cursor() as cur:
        cur.executemany(sql, data)
        n = cur.rowcount
    conn.commit()
    return n


def latest_rows(conn, cutoff: str, table: str = "prices"):
    """Most recent observation per URL since `cutoff` ('YYYY-MM-DD HH:MM:SS'), as builder-ready dicts."""
    sel = ", ".join(f"p.`{SQL_COL.get(c, c)}` AS `{c}`" for c in COLUMNS)
    sql = (f"SELECT {sel}, p.ts FROM `{table}` p JOIN "
           f"(SELECT url, MAX(ts) AS ts FROM `{table}` WHERE ts >= %s GROUP BY url) m "
           f"ON p.url = m.url AND p.ts = m.ts")
    import pymysql
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, (cutoff,))
        rows = cur.fetchall()
    seen, out = set(), []
    for r in rows:
        if r["url"] not in seen:
            seen.add(r["url"])
            r["price"] = float(r["price"])
            for k in ("usd_per_gb_vram", "usd_per_gb_ram"):
                r[k] = float(r[k]) if r[k] is not None else None
            r["ts"] = r["ts"].strftime("%Y-%m-%d %H:%M:%S")
            out.append(r)
    return out


def import_sqlite(conn, path: Path, table: str = "prices") -> tuple[int, int]:
    """Copy every row of a history.db into MariaDB. Returns (rows read, rows inserted)."""
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    have = {r[1] for r in db.execute("PRAGMA table_info(prices)")}
    read = inserted = 0
    by_ts: dict[str, list] = {}
    for r in db.execute("SELECT * FROM prices ORDER BY ts"):
        d = {c: (r[c] if c in have else None) for c in COLUMNS}
        by_ts.setdefault(r["ts"], []).append(d)
        read += 1
    for ts, recs in by_ts.items():
        inserted += insert(conn, ts, recs, table)
    return read, inserted


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--import-sqlite", type=Path, metavar="HISTORY_DB")
    ap.add_argument("--init", action="store_true", help="just create the table")
    a = ap.parse_args()
    try:
        import scraper
        scraper.load_env()
    except Exception:
        pass
    conn = connect()
    ensure_schema(conn)
    if a.import_sqlite:
        read, ins = import_sqlite(conn, a.import_sqlite)
        print(f"read {read} rows from {a.import_sqlite}, inserted {ins} new ({read - ins} already present)")
    elif a.init:
        print("table `prices` ready")
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
