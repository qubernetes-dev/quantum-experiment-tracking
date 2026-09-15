#!/usr/bin/env python3
"""serve.py — serve the tutorial deck on the same origin as a real MLflow server.

Why: the deck's tracking client talks to MLflow's REST API with fetch(). MLflow
sends no CORS headers, so a cross-origin call is refused. Serving the deck and
proxying /api/* to MLflow from one port removes the problem entirely — no MLflow
configuration, no browser flags.

Usage
-----
    pip install mlflow
    mlflow server --host 127.0.0.1 --port 5000     # terminal 1
    python serve.py                                # terminal 2
    open http://127.0.0.1:8000/

Without a running MLflow server the deck still works: the tracking client keeps
runs in the browser's local store, and the panel renders identically.
Standard library only.
"""
import http.server
import socketserver
import urllib.error
import urllib.request
from pathlib import Path

PORT = 8000
MLFLOW = "http://127.0.0.1:5000"
ROOT = Path(__file__).parent
INDEX = "Part 4 QRC Experiment Tracking.dc.html"
PROXY_PREFIXES = ("/api/", "/ajax-api/")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _proxied(self):
        return self.path.startswith(PROXY_PREFIXES)

    def _forward(self, body=None):
        req = urllib.request.Request(
            MLFLOW + self.path,
            data=body,
            method=self.command,
            headers={"Content-Type": self.headers.get("Content-Type", "application/json")},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                payload = res.read()
                self.send_response(res.status)
                self.send_header("Content-Type", res.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            msg = ('{"error":"mlflow unreachable at %s: %s"}' % (MLFLOW, e)).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_GET(self):
        if self._proxied():
            return self._forward()
        if self.path in ("/", "/index.html"):
            self.path = "/" + INDEX
        return super().do_GET()

    def do_POST(self):
        if not self._proxied():
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        self._forward(self.rfile.read(n) if n else None)

    def do_PUT(self):
        self.do_POST()

    def log_message(self, fmt, *args):
        if self._proxied():
            super().log_message(fmt, *args)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("deck    http://127.0.0.1:%d/" % PORT)
        print("proxy   /api/*  ->  %s" % MLFLOW)
        print("mlflow  %s   (start it separately: mlflow server --port 5000)" % MLFLOW)
        httpd.serve_forever()
