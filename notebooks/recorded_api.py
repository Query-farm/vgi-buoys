"""Serve verified, unchanged official NOAA response recordings over loopback."""

from __future__ import annotations

import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread


class RecordedApi:
    def __init__(self, directory: Path):
        self.manifest = json.loads((directory / "manifest.json").read_text())
        self.records = self.manifest["records"]
        self.payloads = {}
        for path, record in self.records.items():
            raw = (directory / record["file"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != record["sha256"]:
                raise ValueError(f"Recording checksum mismatch: {record['file']}")
            self.payloads[path] = raw
        self.requests = []
        self.server = None
        self.thread = None

    def start(self):
        replay = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                if self.path not in replay.payloads:
                    self.send_error(404, "Request outside the documented recording coverage")
                    return
                raw = replay.payloads[self.path]
                replay.requests.append(self.path)
                self.send_response(200)
                self.send_header("Content-Type", replay.records[self.path]["content_type"])
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        return self

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join(timeout=2)
