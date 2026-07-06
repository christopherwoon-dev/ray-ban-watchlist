import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_watchlist, set_watchlist  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _reply(self, body, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_GET(self):
        try:
            self._reply({'watchlist': get_watchlist()})
        except Exception as e:
            self._reply({'error': str(e)}, 502)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        raw = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(raw)
            set_watchlist(payload.get('watchlist', []))
            self._reply({'ok': True})
        except Exception as e:
            self._reply({'error': str(e)}, 502)
