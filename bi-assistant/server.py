#!/usr/bin/env python3
"""SnowStore BI assistant: a local dashboard plus an Ollama-backed Q&A panel.

Run:  python3 server.py            then open http://127.0.0.1:8765
Only listens on 127.0.0.1 and refuses requests whose Host header is not localhost, which blocks
DNS-rebinding attacks against the data. Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import threading
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import bi
from assistant import DEFAULT_MODEL, DEFAULT_HOST, AssistantError, Ollama

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
SAMPLE_DIR = HERE / "sample"
INDEX = HERE / "index.html"
MAX_UPLOAD = 5 * 1024 * 1024
MAX_WINDOW_DAYS = 3660
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
ALLOWED_WINDOWS = {"7", "30", "90", "365"}


class Dataset:
    """Holds the loaded sales rows. Reloads are guarded by a lock, so an upload can't race a read."""

    def __init__(self, data_dir: Path = DATA_DIR, sample_dir: Path = SAMPLE_DIR):
        self.data_dir, self.sample_dir = data_dir, sample_dir
        self.lock = threading.Lock()
        self.reload()

    def reload(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        using_sample = not any(self.data_dir.glob("*.csv"))
        src = self.sample_dir if using_sample else self.data_dir
        rows, warnings = bi.load_dir(src)
        with self.lock:
            self.rows, self.warnings, self.using_sample = rows, warnings, using_sample

    def snapshot(self) -> tuple[list[dict], list[str], bool]:
        with self.lock:
            return self.rows, self.warnings, self.using_sample

    def replace_with(self, text: str) -> int:
        """Validate an uploaded CSV, then make it the only dataset. Previous files go to data/archive/."""
        rows, _ = bi.parse_csv(text)
        if not rows:
            raise ValueError("The file has a header but no sales rows")
        canonical = bi.to_canonical_csv(rows)
        archive = self.data_dir / "archive"
        archive.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        for old in self.data_dir.glob("*.csv"):
            old.rename(archive / f"{stamp}-{old.name}")
        (self.data_dir / f"sales-{stamp}.csv").write_text(canonical, encoding="utf-8")
        self.reload()
        return len(rows)


def parse_window(qs: dict, rows: list[dict]) -> tuple[date, date]:
    """Explicit start/end, or the last N days (7/30/90/365) ending at the newest sale."""
    if qs.get("start") and qs.get("end"):
        try:
            start, end = date.fromisoformat(qs["start"]), date.fromisoformat(qs["end"])
        except ValueError as e:
            raise ValueError("start and end must be YYYY-MM-DD") from e
        if start > end:
            raise ValueError("start is after end")
        if (end - start).days > MAX_WINDOW_DAYS:
            raise ValueError("window is longer than 10 years")
        return start, end
    days = qs.get("days", "30")
    if days not in ALLOWED_WINDOWS:
        raise ValueError("days must be one of 7, 30, 90, 365")
    return bi.default_window(rows, int(days))


def build_metrics(rows: list[dict], start: date, end: date) -> dict:
    report = bi.compare(rows, start, end)
    return {"window": {"start": start.isoformat(), "end": end.isoformat()}, **report, "signals": bi.signals(rows, start, end)}


def make_handler(dataset: Dataset, ollama: Ollama):
    class Handler(BaseHTTPRequestHandler):
        server_version = "SnowBI"
        sys_version = ""

        def log_message(self, fmt, *args):  # keep the console quiet; errors are returned to the page
            pass

        # ---- helpers -------------------------------------------------------------
        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
            return host in ALLOWED_HOSTS

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, obj: dict) -> None:
            self._send(code, json.dumps(obj, default=str).encode(), "application/json; charset=utf-8")

        def _error(self, code: int, message: str) -> None:
            self._json(code, {"error": message})

        def _read_body(self, limit: int) -> bytes | None:
            length = self.headers.get("Content-Length")
            if not length or not length.isdigit():
                self._error(411, "Content-Length required")
                return None
            if int(length) > limit:
                self._error(413, "Request too large")
                return None
            return self.rfile.read(int(length))

        def _query(self) -> dict:
            from urllib.parse import parse_qsl, urlparse
            return dict(parse_qsl(urlparse(self.path).query))

        # ---- routes --------------------------------------------------------------
        def do_GET(self):
            if not self._host_ok():
                return self._error(403, "Forbidden host")
            path = self.path.split("?", 1)[0]
            if path in ("/", "/index.html"):
                return self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
            if path == "/api/status":
                rows, warnings, sample = dataset.snapshot()
                return self._json(200, {"rows": len(rows), "warnings": warnings[:20], "sample": sample, "ollama": ollama.status(), "defaultModel": ollama.model})
            if path == "/api/metrics":
                rows, _, _ = dataset.snapshot()
                try:
                    start, end = parse_window(self._query(), rows)
                except ValueError as e:
                    return self._error(400, str(e))
                return self._json(200, build_metrics(rows, start, end))
            return self._error(404, "Not found")

        def do_POST(self):
            if not self._host_ok():
                return self._error(403, "Forbidden host")
            path = self.path.split("?", 1)[0]
            ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if path == "/api/upload":
                if ctype not in ("text/csv", "application/vnd.ms-excel", "text/plain"):
                    return self._error(415, "Upload a CSV file")
                body = self._read_body(MAX_UPLOAD)
                if body is None:
                    return
                try:
                    count = dataset.replace_with(body.decode("utf-8-sig"))
                except (ValueError, UnicodeDecodeError) as e:
                    return self._error(400, f"Could not read this CSV: {e}")
                return self._json(200, {"rows": count, "message": "Dataset replaced. The previous file is in data/archive."})

            if path in ("/api/ask", "/api/brief"):
                if ctype != "application/json":
                    return self._error(415, "Send JSON")
                body = self._read_body(64 * 1024)
                if body is None:
                    return
                try:
                    req = json.loads(body or b"{}")
                    if not isinstance(req, dict):
                        raise ValueError
                except ValueError:
                    return self._error(400, "Bad JSON")
                rows, _, _ = dataset.snapshot()
                try:
                    start, end = parse_window({k: str(req[k]) for k in ("start", "end", "days") if req.get(k)}, rows)
                except ValueError as e:
                    return self._error(400, str(e))
                metrics = build_metrics(rows, start, end)
                try:
                    if path == "/api/ask":
                        question = str(req.get("question") or "").strip()
                        if not question:
                            return self._error(400, "Ask a question")
                        answer = ollama.ask(question, metrics)
                    else:
                        answer = ollama.brief(metrics)
                except AssistantError as e:
                    return self._error(503, str(e))
                return self._json(200, {"answer": answer, "model": ollama.model, "window": metrics["window"]})
            return self._error(404, "Not found")

    return Handler


def main() -> None:
    p = argparse.ArgumentParser(description="SnowStore BI assistant")
    p.add_argument("--host", default="127.0.0.1", help="keep this on localhost")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model name")
    p.add_argument("--ollama", default=DEFAULT_HOST, help="Ollama base URL")
    args = p.parse_args()
    if args.host not in ("127.0.0.1", "localhost"):
        raise SystemExit("Refusing to bind to a non-local address.")
    dataset = Dataset()
    ollama = Ollama(host=args.ollama, model=args.model)
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(dataset, ollama))
    state = "SAMPLE data (no CSV in bi-assistant/data yet)" if dataset.using_sample else "your data"
    print(f"SnowStore BI assistant on http://{args.host}:{args.port} using {state}. Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.server_close()


if __name__ == "__main__":
    main()
