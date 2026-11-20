"""Tests for the read-only Stripe sync, against a local fake Stripe. Run: python3 -m unittest test_stripe_sync"""
import json
import os
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from decimal import Decimal
from unittest import mock

import bi
import stripe_sync as ss

NOW = int(datetime(2026, 11, 10, 12, tzinfo=timezone.utc).timestamp())
PAGES = {
    None: {"data": [
        {"id": "ch_3", "created": NOW, "amount": 4900, "amount_refunded": 0, "currency": "usd", "status": "succeeded", "description": None, "metadata": {"product": "Pro Bundle"}, "customer": "cus_A"},
        {"id": "ch_2", "created": NOW - 60, "amount": 1900, "amount_refunded": 1900, "currency": "usd", "status": "succeeded", "description": "Starter Kit", "metadata": {}, "customer": None},
    ], "has_more": True},
    "ch_2": {"data": [
        {"id": "ch_1", "created": NOW - 3600, "amount": 500, "amount_refunded": 0, "currency": "jpy", "status": "failed", "description": "Sticker", "metadata": {}, "customer": {"id": "cus_B"}},
    ], "has_more": False},
}
seen = []


class FakeStripe(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        seen.append({"auth": self.headers.get("Authorization"), "path": urlparse(self.path).path, "q": q})
        if self.headers.get("Authorization") != "Bearer rk_test_123":
            body, code = {"error": {"message": "bad key"}}, 401
        else:
            body, code = PAGES[q.get("starting_after", [None])[0]], 200
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class SyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeStripe)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        seen.clear()

    def test_follows_pagination_with_auth_and_read_only_get(self):
        charges = ss.fetch_charges("rk_test_123", datetime(2026, 1, 1, tzinfo=timezone.utc), base=self.base)
        self.assertEqual([c["id"] for c in charges], ["ch_3", "ch_2", "ch_1"])
        self.assertEqual(len(seen), 2)
        self.assertTrue(all(s["path"] == "/v1/charges" for s in seen))
        self.assertEqual(seen[1]["q"]["starting_after"], ["ch_2"])
        self.assertIn("created[gte]", seen[0]["q"])

    def test_bad_key_gives_clear_error(self):
        with self.assertRaisesRegex(ss.StripeError, "rejected the key"):
            ss.fetch_charges("rk_wrong", datetime(2026, 1, 1, tzinfo=timezone.utc), base=self.base)

    def test_unreachable_stripe_gives_clear_error(self):
        with self.assertRaisesRegex(ss.StripeError, "Could not reach Stripe"):
            ss.fetch_charges("rk_test_123", datetime(2026, 1, 1, tzinfo=timezone.utc), base="http://127.0.0.1:1")

    def test_csv_is_readable_by_the_importer(self):
        charges = ss.fetch_charges("rk_test_123", datetime(2026, 1, 1, tzinfo=timezone.utc), base=self.base)
        rows, warnings = bi.parse_csv(ss.charges_to_csv(charges))
        self.assertEqual(warnings, [])
        self.assertEqual(len(rows), 3)
        by_amount = {r["product"]: r for r in rows}
        # metadata.product wins over description; description is used when there is no metadata
        self.assertIn("Pro Bundle", by_amount)
        self.assertEqual(by_amount["Pro Bundle"]["amount"], Decimal("49"))
        self.assertEqual(by_amount["Starter Kit"]["refunded"], Decimal("19"))
        # jpy is zero-decimal: 500 is 500 yen, not 5
        jpy = [r for r in rows if r["currency"] == "jpy"][0]
        self.assertEqual(jpy["amount"], Decimal("500"))
        self.assertFalse(jpy["ok"])
        # customer ids are hashed by the importer, never stored raw
        self.assertEqual(len(rows[0]["customer"]), 12)

    def test_saved_dataset_never_holds_raw_customer_ids(self):
        import tempfile
        from pathlib import Path
        import server
        charges = ss.fetch_charges("rk_test_123", datetime(2026, 1, 1, tzinfo=timezone.utc), base=self.base)
        with tempfile.TemporaryDirectory() as tmp:
            ds = server.Dataset(data_dir=Path(tmp) / "data", sample_dir=Path(tmp) / "none")
            self.assertEqual(ds.replace_with(ss.charges_to_csv(charges)), 3)
            saved = "".join(p.read_text(encoding="utf-8") for p in (Path(tmp) / "data").glob("*.csv"))
            self.assertNotIn("cus_A", saved)
            self.assertNotIn("cus_B", saved)
            self.assertEqual(len(ds.rows), 3)
            # the two charges for the same customer still count as one customer
            self.assertEqual(ds.rows[0]["customer"], [r for r in ds.rows if r["product"] == "Pro Bundle"][0]["customer"])

    def test_main_refuses_missing_and_full_secret_keys(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ss.main([]), 2)
        with mock.patch.dict(os.environ, {"STRIPE_API_KEY": "sk_live_abc"}, clear=True):
            self.assertEqual(ss.main([]), 2)


if __name__ == "__main__":
    unittest.main()
