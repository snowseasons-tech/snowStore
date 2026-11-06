import io
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from leads import import_csv, workspace
from server import make_handler


class BrowserServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / 'leads.sqlite3'
        with workspace(self.database) as db:
            import_csv(db, io.StringIO('name,email\nExample Co,hello@example.com\n'))
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.database, 'test-token'))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, route, body=None, token='test-token', host=None):
        client = HTTPConnection('127.0.0.1', self.server.server_port)
        headers = {'X-Workspace-Token': token, 'Host': host or f'127.0.0.1:{self.server.server_port}'}
        client.request('POST' if body is not None else 'GET', route, json.dumps(body) if body is not None else None, headers)
        response = client.getresponse()
        result = response.status, response.read(), dict(response.getheaders())
        client.close()
        return result

    def test_access_controls_and_assets(self):
        self.assertEqual(self.request('/api/leads', token='wrong')[0], 403)
        self.assertEqual(self.request('/api/leads', host='example.com')[0], 403)
        self.assertEqual(self.request('/', host='example.com')[0], 403)
        for route in ('/', '/app.js', '/style.css'):
            status, body, headers = self.request(route, token='')
            self.assertEqual(status, 200)
            self.assertTrue(body)
            self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/../../leads.py')[0], 404)

    def test_persistent_update_and_export(self):
        self.assertEqual(self.request('/api/update', {'id': 1, 'changes': {'stage': 'Qualified', 'notes': 'Call'}})[0], 200)
        rows = json.loads(self.request('/api/leads')[1])
        self.assertEqual(rows[0]['notes'], 'Call')
        status, body, _ = self.request('/api/export?stage=&minimum=0')
        self.assertEqual(status, 200)
        self.assertIn(b'Example Co', body)
        self.assertNotIn(b'Example Co', self.request('/api/export?stage=Won')[1])

    def test_validation_and_import(self):
        self.assertEqual(self.request('/api/import', {'csv': 'Company\nSample Co\n', 'mapping': {'name': 'Company'}})[0], 200)
        self.assertEqual(len(json.loads(self.request('/api/leads')[1])), 2)
        for body in ({'csv': 'name,fit\nBad,101\n'}, {'csv': 'name\nA\n', 'mapping': []}):
            self.assertEqual(self.request('/api/import', body)[0], 400)
        self.assertEqual(self.request('/api/update', {'id': 1, 'changes': {'stage': 'Invalid'}})[0], 400)
        self.assertEqual(self.request('/api/update', {'id': 999, 'changes': {'stage': 'Won'}})[0], 400)
        self.assertEqual(self.request('/api/export?minimum=101')[0], 400)
        self.assertEqual(self.request('/api/import', {'csv': 'name\nB\n'}, token='')[0], 403)


if __name__ == '__main__':
    unittest.main()
