#!/usr/bin/env python3
"""Deterministic NOAA-shaped responses for tests; never contacts the network."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
import json
import os

class Handler(BaseHTTPRequestHandler):
    seen = set()
    def log_message(self, *_): pass
    def send(self, value, status=200, content_type="application/json", headers=None):
        body=(json.dumps(value) if content_type == "application/json" else value).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        url=urlparse(self.path)
        q={k:v[0] for k,v in parse_qs(url.query).items()}
        if os.environ.get("MOCK_API_FLAKY") and self.path not in self.seen:
            self.seen.add(self.path)
            return self.send({"error":"rate limited"},429,headers={"Retry-After":"0"})
        try:
            self.route(url.path,q)
        except (ValueError, KeyError, AssertionError) as error:
            self.send({"error":{"message":str(error)}},400)
    def route(self, path, q):
        fixtures=__import__("pathlib").Path(__file__).with_name("fixtures")
        files={"/activestations.xml":"stations.xml","/data/latest_obs/latest_obs.txt":"latest.txt","/data/realtime2/44013.txt":"history.txt","/data/realtime2/drift.txt":"drifting.txt","/data/realtime2/empty.txt":"empty.txt"}
        if path in files:return self.send((fixtures/files[path]).read_text(),content_type="application/xml" if path.endswith("xml") else "text/plain")
        if path=="/data/realtime2/large.txt":
            header=(fixtures/"history.txt").read_text().splitlines()[:2]
            rows=[(datetime(2026,1,1)+timedelta(minutes=i*10)).strftime("%Y %m %d %H %M")+" 90 5 7 1.5 8 6 180 1013 10 12 8 2 +1 3" for i in range(5001)]
            return self.send("\n".join(header+rows)+"\n",content_type="text/plain")
        return self.send({},404)

if __name__ == "__main__":
    server=ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("MOCK_API_PORT","0"))),Handler)
    print(f"PORT:{server.server_address[1]}",flush=True)
    server.serve_forever()
