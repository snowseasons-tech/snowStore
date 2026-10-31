"""Mapping tests run anywhere; database tests need MARIADB_TEST_URL and wipe that database's lead tables."""
import csv
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import common as c
import sync_mariadb as s

LEAD = {"company": "Acme, Inc.", "domain": "acme.com", "created_at": "2026-10-30T01:02:03",
        "scrape_attempts": "2", "notes": "call Monday"}


def write(path, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


class Mapping(unittest.TestCase):
    def test_types_and_extra_columns(self):
        r = s.to_record(LEAD, c.LEAD_FIELDS, lambda x: ["k"])
        self.assertEqual(r["created_at"], datetime(2026, 10, 30, 1, 2, 3))
        self.assertEqual(r["scrape_attempts"], 2)
        self.assertEqual(r["extra"], '{"notes": "call Monday"}')

    def test_bad_hand_edits_become_null(self):
        self.assertIsNone(s.typed("created_at", "next week"))
        self.assertIsNone(s.typed("rank", "n/a"))

    def test_contact_identity_ignores_email_case(self):
        self.assertEqual(s.contact_identity({"company": "A", "email": "X@a.com"}),
                         s.contact_identity({"company": "a", "email": "x@a.com"}))


@unittest.skipUnless(os.environ.get("MARIADB_TEST_URL"), "MARIADB_TEST_URL not set")
class Database(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        d = Path(self.dir.name)
        self.saved = c.LEADS, c.CONTACTS, c.SEARCH_RESULTS, c.SEARCH_LOG
        c.LEADS, c.CONTACTS, c.SEARCH_RESULTS, c.SEARCH_LOG = (
            d / "leads.csv", d / "contacts.csv", d / "search_results.csv", d / "search_log.csv")
        self.conn = s.connect(os.environ["MARIADB_TEST_URL"])
        with self.conn.cursor() as cur:
            s.apply_schema(cur)
            for t, *_ in s.TABLES:
                cur.execute(f"DELETE FROM `{t}`")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        c.LEADS, c.CONTACTS, c.SEARCH_RESULTS, c.SEARCH_LOG = self.saved

    def rows(self, sql):
        with self.conn.cursor() as cur:
            cur.execute(sql)
            result = cur.fetchall()
        self.conn.commit()
        return result

    def test_second_run_changes_nothing(self):
        write(c.LEADS, [LEAD, {**LEAD, "company": "Beta"}])
        self.assertEqual(s.sync(self.conn)["leads"]["inserted"], 2)
        before = self.rows("SELECT row_key, content_hash, synced_at FROM leads ORDER BY row_key")
        self.assertEqual(s.sync(self.conn)["leads"],
                         {"inserted": 0, "updated": 0, "deleted": 0, "unchanged": 2})
        self.assertEqual(before, self.rows("SELECT row_key, content_hash, synced_at FROM leads ORDER BY row_key"))

    def test_edit_and_removal_follow_the_csv(self):
        write(c.LEADS, [LEAD, {**LEAD, "company": "Beta"}])
        s.sync(self.conn)
        write(c.LEADS, [{**LEAD, "notes": "won", "ai_summary": "Émile's tree firm"}])
        stats = s.sync(self.conn)["leads"]
        self.assertEqual((stats["updated"], stats["deleted"]), (1, 1))
        self.assertEqual(self.rows("SELECT JSON_VALUE(extra, '$.ai_summary') FROM leads"),
                         (("Émile's tree firm",),))

    def test_missing_csv_keeps_rows(self):
        write(c.LEADS, [LEAD])
        s.sync(self.conn)
        c.LEADS.unlink()
        self.assertEqual(s.sync(self.conn)["leads"], {"skipped": 1})
        self.assertEqual(self.rows("SELECT COUNT(*) FROM leads"), ((1,),))

    def test_failure_rolls_back_everything(self):
        write(c.LEADS, [LEAD])
        write(c.CONTACTS, [{"company": "Acme", "email": "a@acme.com"}])
        original = s.sync_table
        def fail_on_contacts(cur, table, *rest):
            if table == "contacts":
                raise RuntimeError("boom")
            return original(cur, table, *rest)
        s.sync_table = fail_on_contacts
        self.addCleanup(setattr, s, "sync_table", original)
        with self.assertRaises(RuntimeError):
            s.sync(self.conn)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM leads"), ((0,),))


if __name__ == "__main__":
    unittest.main()
