#!/usr/bin/env python3
"""One-way sync of the lead CSVs into MariaDB for analytics.

The CSVs stay the source of truth, so spreadsheet edits keep working. Each run
makes the tables match the CSVs in one transaction: new rows are inserted,
changed rows updated, unchanged rows left alone, and rows gone from a CSV
deleted. Re-running changes nothing. A missing or empty CSV is skipped, so a
lost file can't wipe its table. Columns that aren't standard (hand-added ones,
ai_summary) are kept in the row's `extra` JSON.

Usage:  MARIADB_URL=YOUR_MARIADB_URL ./sync_mariadb.py
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

import common as c

SCHEMA = Path(__file__).resolve().parent / "schema.sql"
DATETIMES = {"created_at", "scraped_at", "searched_at"}
INTS = {"scrape_attempts", "rank", "ok", "n_results"}


def contact_identity(r: dict) -> list[str]:
    """Same identity scrape_contacts.py dedupes on: email, else name."""
    email = r.get("email", "").lower()
    return [c.company_key(r.get("company", "")), email or "name:" + r.get("name", "").lower()]


# table, csv path, standard columns, identity of a row
TABLES = [
    ("leads", lambda: c.LEADS, c.LEAD_FIELDS, lambda r: [c.company_key(r.get("company", ""))]),
    ("contacts", lambda: c.CONTACTS, c.CONTACT_FIELDS, contact_identity),
    ("search_results", lambda: c.SEARCH_RESULTS,
     ["company", "rank", "title", "url", "host", "snippet", "searched_at"],
     lambda r: [c.company_key(r.get("company", "")), r.get("url", "")]),
    # one company can be searched many times: the whole row is the identity
    ("search_log", lambda: c.SEARCH_LOG,
     ["company", "searched_at", "ok", "n_results", "error"],
     lambda r: [json.dumps(r, sort_keys=True)]),
]


def sha(parts: list[str]) -> str:
    return hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()


def typed(col: str, value: str):
    """CSV text to the column's type. Unparseable hand edits become NULL
    in the typed column; the CSV still has the original."""
    value = (value or "").strip()
    if col in DATETIMES:
        try:
            return datetime.fromisoformat(value).replace(tzinfo=None, microsecond=0)
        except ValueError:
            return None
    if col in INTS:
        return int(value) if re.fullmatch(r"-?\d{1,9}", value) else None
    return value


def to_record(row: dict, fields: list[str], identity) -> dict:
    """Column values for one CSV row, plus its row_key and content_hash."""
    extra = {k: v for k, v in row.items() if k not in fields}
    extra_json = json.dumps(extra, sort_keys=True, ensure_ascii=False)
    record = {f: typed(f, row.get(f, "")) for f in fields}
    record["extra"] = extra_json
    record["row_key"] = sha(identity(row))
    record["content_hash"] = sha([row.get(f, "") for f in fields] + [extra_json])
    return record


def sync_table(cur, table: str, path: Path, fields: list[str], identity) -> dict:
    rows = c.read_csv(path)
    if not rows:
        c.log(f"sync: {table}: {path.name} missing or empty - skipped")
        return {"skipped": 1}
    records = {}                                      # a repeated identity: last row wins
    for row in rows:
        record = to_record(row, fields, identity)
        records[record["row_key"]] = record

    cur.execute(f"SELECT row_key, content_hash FROM `{table}`")
    existing = dict(cur.fetchall())
    changed = [r for k, r in records.items() if existing.get(k) != r["content_hash"]]
    gone = [k for k in existing if k not in records]

    cols = ["row_key", "content_hash", *fields, "extra"]
    names = ", ".join(f"`{x}`" for x in cols)
    marks = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"`{x}` = VALUES(`{x}`)" for x in cols[1:])
    if changed:
        cur.executemany(
            f"INSERT INTO `{table}` ({names}) VALUES ({marks}) ON DUPLICATE KEY UPDATE {updates}",
            [[r[x] for x in cols] for r in changed])
    if gone:
        cur.executemany(f"DELETE FROM `{table}` WHERE row_key = %s", gone)
    stats = {"inserted": sum(r["row_key"] not in existing for r in changed),
             "updated": sum(r["row_key"] in existing for r in changed),
             "deleted": len(gone),
             "unchanged": len(records) - len(changed)}
    c.log(f"sync: {table}: " + ", ".join(f"{v} {k}" for k, v in stats.items()))
    return stats


def connect(url: str):
    import pymysql
    u = urlparse(url)
    return pymysql.connect(host=u.hostname or "127.0.0.1", port=u.port or 3306,
                           user=unquote(u.username or ""), password=unquote(u.password or ""),
                           database=u.path.lstrip("/"), charset="utf8mb4", autocommit=False)


def apply_schema(cur) -> None:
    sql = re.sub(r"^--.*$", "", SCHEMA.read_text(encoding="utf-8"), flags=re.M)
    for statement in sql.split(";"):
        if statement.strip():
            cur.execute(statement)


def sync(conn) -> dict:
    with conn.cursor() as cur:
        apply_schema(cur)
        try:
            result = {t: sync_table(cur, t, path(), fields, identity)
                      for t, path, fields, identity in TABLES}
        except BaseException:
            conn.rollback()
            raise
    conn.commit()
    return result


def main() -> int:
    url = os.environ.get("MARIADB_URL")
    if not url:
        print("sync_mariadb: set MARIADB_URL", file=sys.stderr)
        return 2
    conn = connect(url)
    try:
        sync(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
