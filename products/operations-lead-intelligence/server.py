"""Loopback-only browser interface for the local lead workspace."""
import argparse
import io
import json
import secrets
import sqlite3
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from leads import FIELDS, create_lead, export_csv, import_csv, list_leads, update_lead, workspace

MAX_BODY = 2 * 1024 * 1024


def make_handler(database, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Avoid logging lead data or local access tokens.

        def reply(self, status, body, kind='application/json; charset=utf-8'):
            if not isinstance(body, bytes):
                body = json.dumps(body).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            # Reject DNS rebinding and cross-site writes as well as missing tokens.
            allowed = f'127.0.0.1:{self.server.server_port}'
            return self.headers.get('Host') == allowed and secrets.compare_digest(self.headers.get('X-Workspace-Token', ''), token)

        def do_GET(self):
            route = urlsplit(self.path)
            if route.path in ('/', '/app.js', '/style.css'):
                if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
                    return self.reply(403, {'error': 'Use the displayed loopback URL.'})
                name, kind = {'/': ('workspace.html', 'text/html; charset=utf-8'), '/app.js': ('workspace.js', 'text/javascript; charset=utf-8'), '/style.css': ('workspace.css', 'text/css; charset=utf-8')}[route.path]
                return self.reply(200, Path(__file__).with_name(name).read_bytes(), kind)
            if not self.authorized():
                return self.reply(403, {'error': 'Workspace token required. Reopen the startup URL.'})
            try:
                with workspace(database) as db:
                    if route.path == '/api/leads':
                        return self.reply(200, list_leads(db))
                    if route.path == '/api/export':
                        query = parse_qs(route.query)
                        minimum = int(query.get('minimum', ['0'])[0])
                        if not 0 <= minimum <= 100:
                            raise ValueError('Minimum score must be 0–100.')
                        output = io.StringIO(newline='')
                        due_by = query.get('due_by', [None])[0]
                        if due_by:
                            due_by = date.fromisoformat(due_by).isoformat()
                        export_csv(db, output, query.get('stage', [None])[0] or None, minimum, query.get('search', [''])[0], due_by or None)
                        return self.reply(200, output.getvalue().encode('utf-8'), 'text/csv; charset=utf-8')
                self.reply(404, {'error': 'Unknown route.'})
            except (ValueError, sqlite3.Error):
                self.reply(400, {'error': 'Unable to read workspace. Check filter values and database availability.'})

        def do_POST(self):
            if not self.authorized():
                return self.reply(403, {'error': 'Workspace token required. Reopen the startup URL.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BODY:
                    return self.reply(413, {'error': 'Request must be between 1 byte and 2 MB.'})
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError('Expected a JSON object.')
                route = urlsplit(self.path).path
                with workspace(database) as db:
                    if route == '/api/create':
                        return self.reply(201, {'id': create_lead(db, body)})
                    if route == '/api/import':
                        if not isinstance(body.get('csv'), str):
                            raise ValueError('CSV text is required.')
                        mapping = body.get('mapping', {})
                        if not isinstance(mapping, dict) or any(not isinstance(v, str) for v in mapping.values()):
                            raise ValueError('Mapping must contain string column names.')
                        return self.reply(200, import_csv(db, io.StringIO(body['csv'].lstrip('\ufeff')), mapping))
                    if route == '/api/update':
                        changes = body.get('changes')
                        if not isinstance(changes, dict) or any(key not in FIELDS for key in changes):
                            raise ValueError('Invalid update fields.')
                        update_lead(db, int(body['id']), changes)
                        return self.reply(200, {'updated': True})
                self.reply(404, {'error': 'Unknown route.'})
            except (ValueError, KeyError, TypeError, UnicodeError) as error:
                self.reply(400, {'error': str(error)})
            except sqlite3.IntegrityError:
                self.reply(409, {'error': 'Another lead already has that name and email.'})
            except sqlite3.Error:
                self.reply(503, {'error': 'Database unavailable. Close other writers and retry.'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default='leads.sqlite3')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    with workspace(args.db):
        pass
    token = secrets.token_urlsafe(32)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.db, token))
    print(f'Open http://127.0.0.1:{server.server_port}/#token={token}', flush=True)
    print('Local access only. Ctrl+C stops the server.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
