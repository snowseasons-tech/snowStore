"""Tests for the BI metrics and the local server. Run: python3 -m unittest -v test_bi.py"""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date
from http.server import ThreadingHTTPServer
from pathlib import Path
from decimal import Decimal

import bi
import server
from unittest import mock

from assistant import AssistantError, Ollama

CANON = (
    "date,product,amount,currency,customer,status,refunded\n"
    "2026-11-01,Starter,20,usd,a@x.com,succeeded,0\n"
    "2026-11-02,Starter,20,usd,a@x.com,succeeded,0\n"
    "2026-11-02,Pro,50,usd,b@x.com,succeeded,10\n"
    "2026-11-03,Pro,50,usd,c@x.com,failed,0\n"
    "2026-10-30,Starter,20,usd,z@x.com,succeeded,0\n"
)


class ParseTests(unittest.TestCase):
    def test_canonical_columns(self):
        rows, warnings = bi.parse_csv(CANON)
        self.assertEqual(len(rows), 5)
        self.assertEqual(warnings, [])
        self.assertEqual(rows[0]["amount"], Decimal("20"))
        self.assertFalse(rows[3]["ok"])

    def test_stripe_style_headers_and_money_strings(self):
        text = (
            "Created date (UTC),Description,Amount,Currency,Customer ID,Status,Amount Refunded\n"
            '2026-11-01 13:22:00,Pro,"$1,049.50",USD,cus_1,succeeded,"$0.00"\n'
        )
        rows, _ = bi.parse_csv(text)
        self.assertEqual(rows[0]["amount"], Decimal("1049.50"))
        self.assertEqual(rows[0]["date"], date(2026, 11, 1))
        self.assertTrue(rows[0]["ok"])

    def test_bad_rows_are_skipped_with_a_warning(self):
        text = "date,amount\n2026-11-01,10\nnot-a-date,5\n2026-11-02,oops\n"
        rows, warnings = bi.parse_csv(text)
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(warnings), 2)
        self.assertIn("line 3", warnings[0])

    def test_missing_required_column_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "missing required"):
            bi.parse_csv("product,qty\nPro,1\n")

    def test_customers_are_hashed_and_emails_are_not_kept(self):
        rows, _ = bi.parse_csv(CANON)
        self.assertNotIn("@", rows[0]["customer"])
        self.assertEqual(rows[0]["customer"], rows[1]["customer"])
        self.assertEqual(len(rows[0]["customer"]), 12)

    def test_bom_is_stripped(self):
        rows, _ = bi.parse_csv("﻿" + CANON)
        self.assertEqual(len(rows), 5)


class MetricTests(unittest.TestCase):
    def setUp(self):
        self.rows, _ = bi.parse_csv(CANON)

    def test_summary_numbers(self):
        s = bi.summarize(self.rows, date(2026, 11, 1), date(2026, 11, 3))
        # ok rows: 20 + 20 + 50 = 90 gross; refunds 10 -> net 80
        self.assertEqual(s["gross"], 90.0)
        self.assertEqual(s["refunds"], 10.0)
        self.assertEqual(s["net"], 80.0)
        self.assertEqual(s["orders"], 3)
        self.assertEqual(s["failed_or_pending"], 1)
        self.assertAlmostEqual(s["success_rate"], 0.75)
        self.assertAlmostEqual(s["refund_rate"], round(10 / 90, 4))
        self.assertEqual(s["average_order"], 30.0)
        self.assertEqual(s["unique_customers"], 2)

    def test_new_vs_repeat_uses_full_history(self):
        s = bi.summarize(self.rows, date(2026, 11, 1), date(2026, 11, 3), all_rows=self.rows)
        # a@ bought twice in window (repeat); b@ is new; z@ is outside the window
        self.assertEqual(s["repeat_customers"], 1)
        self.assertEqual(s["new_customers"], 2)

    def test_products_sorted_by_revenue_with_share(self):
        s = bi.summarize(self.rows, date(2026, 11, 1), date(2026, 11, 3))
        self.assertEqual(s["products"][0]["product"], "Pro")
        self.assertAlmostEqual(s["products"][0]["share_of_gross"], round(50 / 90, 4), places=4)

    def test_daily_series_fills_gaps_with_zero(self):
        s = bi.summarize(self.rows, date(2026, 11, 1), date(2026, 11, 4))
        self.assertEqual([d["date"] for d in s["daily"]], ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"])
        self.assertEqual(s["daily"][3]["net"], 0.0)

    def test_compare_growth_against_previous_window(self):
        c = bi.compare(self.rows, date(2026, 11, 1), date(2026, 11, 3))
        # previous 3-day window is Oct 29 to Oct 31: only the z@ sale (20) on Oct 30
        self.assertEqual(c["previous"]["net"], 20.0)
        self.assertAlmostEqual(c["net_growth"], (80 - 20) / 20)

    def test_signals_flag_refunds_failures_and_growth(self):
        out = " ".join(bi.signals(self.rows, date(2026, 11, 1), date(2026, 11, 3)))
        self.assertIn("up", out)           # growth vs previous window is +300%
        self.assertIn("attempts succeeded", out)  # 75% < 95%
        self.assertIn("Refunds", out)      # 11% > 5%

    def test_default_window_ends_on_newest_sale(self):
        start, end = bi.default_window(self.rows, 2)
        self.assertEqual(end, date(2026, 11, 3))
        self.assertEqual(start, date(2026, 11, 2))

    def test_empty_dataset_does_not_crash(self):
        s = bi.summarize([], date(2026, 11, 1), date(2026, 11, 2))
        self.assertEqual(s["net"], 0.0)
        self.assertIsNone(s["average_order"])
        self.assertIsNone(s["success_rate"])
        self.assertEqual(bi.signals([], date(2026, 11, 1), date(2026, 11, 2)), ["No successful orders in this window or the one before it."])


class FakeOllama(Ollama):
    def __init__(self):
        super().__init__(host="http://127.0.0.1:1", model="test-model")
        self.calls = []

    def status(self):
        return {"online": True, "host": self.host, "model": self.model, "model_installed": True, "models": [self.model, "other-model:1b"]}

    def ask(self, question, metrics, model=None):
        self.calls.append(("ask", question, metrics, model))
        return f"answer to: {question}"

    def brief(self, metrics, model=None):
        self.calls.append(("brief", None, metrics, model))
        return "weekly brief"


class BrokenOllama(FakeOllama):
    def ask(self, question, metrics, model=None):
        raise AssistantError("Ollama is not reachable")


class ChatOptionTests(unittest.TestCase):
    def test_payload_keeps_model_loaded_and_caps_answer_length(self):
        client = Ollama(host="http://127.0.0.1:1", model="default-model")
        with mock.patch.object(client, "_call", return_value={"message": {"content": "ok"}}) as call:
            self.assertEqual(client.ask("q?", {"net": 1}, model="other-model:1b"), "ok")
        payload = call.call_args[0][1]
        self.assertEqual(payload["model"], "other-model:1b")
        self.assertIn("keep_alive", payload)
        self.assertLessEqual(payload["options"]["num_predict"], 500)

    def test_default_model_used_when_none_chosen(self):
        client = Ollama(host="http://127.0.0.1:1", model="default-model")
        with mock.patch.object(client, "_call", return_value={"message": {"content": "ok"}}) as call:
            client.brief({"net": 1})
        self.assertEqual(call.call_args[0][1]["model"], "default-model")


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.data = root / "data"
        self.sample = root / "sample"
        self.sample.mkdir()
        (self.sample / "s.csv").write_text(CANON, encoding="utf-8")
        self.dataset = server.Dataset(data_dir=self.data, sample_dir=self.sample)
        self.ollama = FakeOllama()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(self.dataset, self.ollama))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.port}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None, ctype=None, host=None):
        data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if ctype:
            req.add_header("Content-Type", ctype)
        if host:
            req.add_header("Host", host)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            with e:
                return e.code, json.loads(e.read() or b"{}")

    def test_sample_is_used_when_no_data(self):
        code, body = self.call("GET", "/api/status")
        self.assertEqual(code, 200)
        self.assertTrue(body["sample"])
        self.assertEqual(body["rows"], 5)

    def test_metrics_default_window(self):
        code, body = self.call("GET", "/api/metrics?days=7")
        self.assertEqual(code, 200)
        self.assertEqual(body["window"]["end"], "2026-11-03")
        # 7-day window Oct 28 to Nov 3 holds Oct 30 (20) + Nov 1 (20) + Nov 2 (50 - 10 refund + 20) = 100
        self.assertEqual(body["current"]["net"], 100.0)

    def test_metrics_rejects_bad_window(self):
        self.assertEqual(self.call("GET", "/api/metrics?days=13")[0], 400)
        self.assertEqual(self.call("GET", "/api/metrics?start=2026-11-05&end=2026-11-01")[0], 400)
        self.assertEqual(self.call("GET", "/api/metrics?start=nope&end=2026-11-01")[0], 400)

    def test_forbidden_host_is_refused(self):
        code, _ = self.call("GET", "/api/status", host="evil.example.com")
        self.assertEqual(code, 403)

    def test_ask_passes_only_metrics_and_returns_answer(self):
        code, body = self.call("POST", "/api/ask", {"question": "How did we do?", "days": "7"}, ctype="application/json")
        self.assertEqual(code, 200)
        self.assertEqual(body["answer"], "answer to: How did we do?")
        kind, question, metrics, _model = self.ollama.calls[-1]
        self.assertEqual(kind, "ask")
        self.assertNotIn("@", json.dumps(metrics))  # no raw customer identifiers reach the model

    def test_ask_requires_json_and_a_question(self):
        self.assertEqual(self.call("POST", "/api/ask", b"{}", ctype="text/plain")[0], 415)
        self.assertEqual(self.call("POST", "/api/ask", {"question": "  "}, ctype="application/json")[0], 400)

    def test_ollama_failure_is_reported_not_crashing(self):
        self.ollama.ask = BrokenOllama().ask
        code, body = self.call("POST", "/api/ask", {"question": "hi"}, ctype="application/json")
        self.assertEqual(code, 503)
        self.assertIn("not reachable", body["error"])

    def test_ask_accepts_installed_model_and_rejects_others(self):
        code, body = self.call("POST", "/api/ask", {"question": "hi", "model": "other-model:1b"}, ctype="application/json")
        self.assertEqual(code, 200)
        self.assertEqual(body["model"], "other-model:1b")
        self.assertEqual(self.ollama.calls[-1][3], "other-model:1b")
        code, body = self.call("POST", "/api/ask", {"question": "hi", "model": "not-installed:latest"}, ctype="application/json")
        self.assertEqual(code, 400)
        self.assertIn("not installed", body["error"])

    def test_brief_endpoint(self):
        code, body = self.call("POST", "/api/brief", {"days": "30"}, ctype="application/json")
        self.assertEqual(code, 200)
        self.assertEqual(body["answer"], "weekly brief")

    def test_upload_replaces_dataset_and_archives_old(self):
        self.data.mkdir(parents=True, exist_ok=True)
        csv_text = "Created date (UTC),Description,Amount,Status\n2026-11-05,Pro,100,succeeded\n"
        code, body = self.call("POST", "/api/upload", csv_text.encode(), ctype="text/csv")
        self.assertEqual(code, 200)
        self.assertEqual(body["rows"], 1)
        self.assertEqual(len(list((self.data / "archive").glob("*.csv"))), 0)  # nothing was in data/ yet
        code, _ = self.call("POST", "/api/upload", csv_text.encode(), ctype="text/csv")
        self.assertEqual(len(list((self.data / "archive").glob("*.csv"))), 1)
        status, st = self.call("GET", "/api/status")
        self.assertFalse(st["sample"])
        self.assertEqual(st["rows"], 1)

    def test_upload_rejects_bad_files_and_keeps_old_data(self):
        self.data.mkdir(parents=True, exist_ok=True)
        self.call("POST", "/api/upload", b"date,amount\n2026-11-05,10\n", ctype="text/csv")
        code, body = self.call("POST", "/api/upload", b"product,qty\nPro,1\n", ctype="text/csv")
        self.assertEqual(code, 400)
        code, body = self.call("POST", "/api/upload", b"date,amount\n", ctype="text/csv")
        self.assertEqual(code, 400)
        self.assertEqual(self.call("GET", "/api/status")[1]["rows"], 1)

    def test_upload_requires_csv_content_type(self):
        self.assertEqual(self.call("POST", "/api/upload", b"date,amount\n", ctype="application/json")[0], 415)


class SampleFileTests(unittest.TestCase):
    def test_bundled_sample_loads(self):
        rows, warnings = bi.load_dir(Path(__file__).parent / "sample")
        self.assertEqual(warnings, [])
        self.assertGreater(len(rows), 100)


if __name__ == "__main__":
    unittest.main()
