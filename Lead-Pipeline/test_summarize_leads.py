"""Run from this folder: python3 -m unittest test_summarize_leads"""
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

import common as c
import summarize_leads as s


class Fake(BaseHTTPRequestHandler):
    reply = "<think>hmm</think>Acme makes widgets."
    status = 200
    prompts: list = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        Fake.prompts.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        body = json.dumps({"response": Fake.reply}).encode()
        self.send_response(Fake.status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class SummarizeTest(unittest.TestCase):
    def setUp(self):
        Fake.prompts, Fake.reply, Fake.status = [], "<think>hmm</think>Acme makes widgets.", 200
        self.server = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.patches = [mock.patch.object(c, "LEADS", d / "leads.csv"), mock.patch.object(c, "CONTACTS", d / "contacts.csv")]
        for p in self.patches:
            p.start()
        c.write_csv_atomic(c.LEADS, c.LEAD_FIELDS, [
            {"company": "Acme", "domain": "acme.example", "description": "Widgets"},
            {"company": "Kept", "description": "x", "ai_summary": "My own words"},
            {"company": "Bare"},
        ])
        c.write_csv_atomic(c.CONTACTS, c.CONTACT_FIELDS, [{"company": "Acme", "email": "jane@acme.example", "name": "Jane Doe"}])
        self.env = {"OLLAMA_URL": f"http://127.0.0.1:{self.server.server_port}", "LEAD_SUMMARY_MODEL": "m"}

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def run_step(self, **env):
        with mock.patch.dict(os.environ, self.env | env):
            return s.main(["--limit", "5"])

    def leads(self):
        return {l["company"]: l for l in c.read_csv(c.LEADS)}

    def test_fills_blanks_and_keeps_edits(self):
        self.assertEqual(self.run_step(), 0)
        leads = self.leads()
        self.assertEqual(leads["Acme"]["ai_summary"], "Acme makes widgets.")
        self.assertEqual(leads["Kept"]["ai_summary"], "My own words")
        self.assertEqual(leads["Bare"]["ai_summary"], "")
        self.assertEqual(len(Fake.prompts), 1)

    def test_contact_details_never_reach_the_model(self):
        self.run_step()
        self.assertNotIn("jane", Fake.prompts[0]["prompt"].lower())
        self.assertIn("Contacts found: 1", Fake.prompts[0]["prompt"])

    def test_down_or_failing_ollama_exits_ok_and_changes_nothing(self):
        Fake.status = 500
        self.assertEqual(self.run_step(), 0)
        self.assertEqual(self.run_step(OLLAMA_URL="http://127.0.0.1:9"), 0)
        self.assertEqual(self.leads()["Acme"]["ai_summary"], "")

    def test_cloud_models_are_refused_by_default(self):
        self.assertEqual(self.run_step(LEAD_SUMMARY_MODEL="x:cloud"), 0)
        self.assertEqual(Fake.prompts, [])

    def test_spreadsheet_formulas_are_defused(self):
        Fake.reply = "=HYPERLINK(1)"
        self.run_step()
        self.assertEqual(self.leads()["Acme"]["ai_summary"], "'=HYPERLINK(1)")


if __name__ == "__main__":
    unittest.main()
