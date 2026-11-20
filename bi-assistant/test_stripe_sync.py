"""Tests for the read-only Stripe sync, against a local fake Stripe. Run: python3 -m unittest test_stripe_sync"""
import json
import os
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

import bi
import stripe_sync as ss

NOW = int(datetime(2026, 11, 10, 12, tzinfo=timezone.utc).timestamp())
CHARGE_PAGES = {
    None: {"data": [
        {"id": "ch_3", "created": NOW, "amount": 4900, "amount_refunded": 0, "currency": "usd", "status": "succeeded", "description": None, "metadata": {"product": "Pro Bundle"}, "customer": "cus_A", "invoice": None},
        {"id": "ch_2", "created": NOW - 60, "amount": 1900, "amount_refunded": 1900, "currency": "usd", "status": "succeeded", "description": "Starter Kit", "metadata": {}, "customer": None, "invoice": None},
    ], "has_more": True},
    "ch_2": {"data": [
        {"id": "ch_1", "created": NOW - 3600, "amount": 500, "amount_refunded": 0, "currency": "jpy", "status": "failed", "description": "Sticker", "metadata": {}, "customer": {"id": "cus_B"}, "invoice": None},
    ], "has_more": True},
}
# A renewal: no description and no metadata, but its invoice names a product via the price.
CHARGE_PAGES["ch_1"] = {"data": [
    {"id": "ch_0", "created": NOW - 7200, "amount": 2900, "amount_refunded": 0, "currency": "usd", "status": "succeeded", "description": None, "metadata": {}, "customer": "cus_C", "invoice": "in_1"},
], "has_more": False}
INVOICE_PAGES = {None: {"data": [
    {"id": "in_1", "lines": {"data": [
        {"id": "il_1", "amount": 2900, "price": {"product": "prod_mem"}},
        {"id": "il_2", "amount": 100, "price": {"product": "prod_other"}},
    ]}},
    {"id": "in_2", "lines": {"data": []}},
], "has_more": False}}
PRODUCT_PAGES = {None: {"data": [{"id": "prod_mem", "name": "Monthly Membership"}, {"id": "prod_other", "name": "Add-on"}], "has_more": False}}
seen = []


class FakeStripe(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        seen.append({"auth": self.headers.get("Authorization"), "path": url.path, "q": q})
        if self.headers.get("Authorization") != "Bearer rk_test_123":
            body, code = {"error": {"message": "bad key"}}, 401
        else:
            cursor = q.get("starting_after", [None])[0]
            table = {"/v1/charges": CHARGE_PAGES, "/v1/invoices": INVOICE_PAGES, "/v1/products": PRODUCT_PAGES}.get(url.path)
            body, code = (table or {}).get(cursor, {"data": [], "has_more": False}), (200 if table else 404)
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


SINCE = datetime(2026, 1, 1, tzinfo=timezone.utc)


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

    def pull(self):
        charges = ss.fetch_charges("rk_test_123", SINCE, base=self.base)
        inv = ss.fetch_invoice_products("rk_test_123", SINCE, base=self.base)
        names = ss.fetch_product_names("rk_test_123", base=self.base)
        return charges, inv, names

    def test_follows_pagination_with_auth_and_read_only_get(self):
        charges, _, _ = self.pull()
        self.assertEqual([c["id"] for c in charges], ["ch_3", "ch_2", "ch_1", "ch_0"])
        charge_calls = [s for s in seen if s["path"] == "/v1/charges"]
        self.assertEqual(len(charge_calls), 3)
        self.assertEqual(charge_calls[1]["q"]["starting_after"], ["ch_2"])
        self.assertTrue(all(s["auth"] == "Bearer rk_test_123" for s in seen))

    def test_invoice_products_map_to_the_largest_line(self):
        _, inv, names = self.pull()
        self.assertEqual(inv, {"in_1": "prod_mem"})
        self.assertEqual(names["prod_mem"], "Monthly Membership")

    def test_bad_key_gives_clear_error(self):
        with self.assertRaisesRegex(ss.StripeError, "rejected the key"):
            ss.fetch_charges("rk_wrong", SINCE, base=self.base)

    def test_unreachable_stripe_gives_clear_error(self):
        with self.assertRaisesRegex(ss.StripeError, "Could not reach Stripe"):
            ss.fetch_charges("rk_test_123", SINCE, base="http://127.0.0.1:1")

    def test_product_name_priority_and_csv_for_importer(self):
        charges, inv, names = self.pull()
        text = ss.charges_to_csv(charges, inv, names)
        rows, warnings = bi.parse_csv(text)
        self.assertEqual(warnings, [])
        self.assertEqual(len(rows), 4)  # one row per charge: no double counting for renewals
        products = [r["product"] for r in rows]
        self.assertEqual(products, ["Pro Bundle", "Starter Kit", "Sticker", "Monthly Membership"])
        self.assertEqual(rows[0]["amount"], Decimal("49"))
        self.assertEqual(rows[1]["refunded"], Decimal("19"))
        jpy = rows[2]
        self.assertEqual(jpy["amount"], Decimal("500"))  # zero-decimal: 500 yen, not 5
        self.assertFalse(jpy["ok"])
        self.assertEqual(rows[3]["amount"], Decimal("29"))

    def test_metadata_beats_invoice_and_invoice_beats_description(self):
        charge = {"metadata": {"product": "Meta"}, "invoice": "in_1", "description": "Desc"}
        self.assertEqual(ss.product_for(charge, {"in_1": "prod_mem"}, {"prod_mem": "Membership"}), "Meta")
        charge = {"metadata": {}, "invoice": "in_1", "description": "Desc"}
        self.assertEqual(ss.product_for(charge, {"in_1": "prod_mem"}, {"prod_mem": "Membership"}), "Membership")
        charge = {"metadata": {}, "invoice": "in_9", "description": "Desc"}
        self.assertEqual(ss.product_for(charge, {}, {}), "Desc")

    def test_saved_dataset_never_holds_raw_customer_ids(self):
        charges, inv, names = self.pull()
        with tempfile.TemporaryDirectory() as tmp:
            import server
            ds = server.Dataset(data_dir=Path(tmp) / "data", sample_dir=Path(tmp) / "none")
            self.assertEqual(ds.replace_with(ss.charges_to_csv(charges, inv, names)), 4)
            saved = "".join(p.read_text(encoding="utf-8") for p in (Path(tmp) / "data").glob("*.csv"))
            self.assertNotIn("cus_A", saved)
            self.assertNotIn("cus_B", saved)
            self.assertNotIn("cus_C", saved)
            self.assertEqual(len(ds.rows), 4)

    def test_main_refuses_missing_and_full_secret_keys(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ss.main([]), 2)
        with mock.patch.dict(os.environ, {"STRIPE_API_KEY": "sk_live_abc"}, clear=True):
            self.assertEqual(ss.main([]), 2)

    def test_paid_invoice_fetch_skips_zero_totals(self):
        pages = [
            {"id": "in_paid", "amount_paid": 1500, "currency": "usd", "lines": {"data": []}},
            {"id": "in_free", "amount_paid": 0, "currency": "usd", "lines": {"data": []}},
        ]
        with mock.patch.object(ss, "_paged", return_value=pages) as paged:
            kept = ss.fetch_paid_invoices("rk_test_123", SINCE, base=self.base)
        self.assertEqual([i["id"] for i in kept], ["in_paid"])
        self.assertEqual(paged.call_args.args[2]["status"], "paid")

    def test_invoices_csv_uses_paid_total_and_product_name(self):
        invoices = [{
            "id": "in_9", "created": NOW, "amount_paid": 2900, "currency": "usd", "customer": "cus_Z",
            "lines": {"data": [{"amount": 2900, "price": {"product": "prod_mem"}}]},
        }]
        text = ss.invoices_to_csv(invoices, {"prod_mem": "Monthly Membership"})
        rows, warnings = bi.parse_csv(text)
        self.assertEqual(warnings, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["product"], "Monthly Membership")
        self.assertEqual(rows[0]["amount"], Decimal("29"))
        self.assertEqual(rows[0]["refunded"], Decimal("0"))

    def test_main_falls_back_to_paid_invoices_when_no_charges(self):
        invoice = {"id": "in_9", "created": NOW, "amount_paid": 2900, "currency": "usd", "customer": "cus_Z",
                   "lines": {"data": [{"amount": 2900, "price": {"product": "prod_mem"}}]}}
        import server
        with mock.patch.dict(os.environ, {"STRIPE_API_KEY": "rk_test_123"}, clear=True), \
             mock.patch.object(ss, "fetch_charges", return_value=[]), \
             mock.patch.object(ss, "fetch_invoice_products", return_value={}), \
             mock.patch.object(ss, "fetch_product_names", return_value={"prod_mem": "Monthly Membership"}), \
             mock.patch.object(ss, "fetch_paid_invoices", return_value=[invoice]), \
             mock.patch.object(server, "Dataset") as dataset_cls:
            dataset_cls.return_value.replace_with.return_value = 1
            self.assertEqual(ss.main(["--days", "30"]), 0)
        saved = dataset_cls.return_value.replace_with.call_args.args[0]
        self.assertIn("Monthly Membership", saved)

    def test_charges_block_the_invoice_fallback(self):
        charge = {"id": "ch_1", "created": NOW, "amount": 4900, "amount_refunded": 0, "currency": "usd",
                  "status": "succeeded", "description": "Pro", "metadata": {}, "customer": None, "invoice": None}
        import server
        with mock.patch.dict(os.environ, {"STRIPE_API_KEY": "rk_test_123"}, clear=True), \
             mock.patch.object(ss, "fetch_charges", return_value=[charge]), \
             mock.patch.object(ss, "fetch_invoice_products", return_value={}), \
             mock.patch.object(ss, "fetch_product_names", return_value={}), \
             mock.patch.object(ss, "fetch_paid_invoices") as fallback, \
             mock.patch.object(server, "Dataset") as dataset_cls:
            dataset_cls.return_value.replace_with.return_value = 1
            self.assertEqual(ss.main(["--days", "30"]), 0)
        fallback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
