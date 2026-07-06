# Local dev server: serves the static app AND the same /api/quote,
# /api/news endpoints that will run as Vercel Python functions in
# production, so real data can be tested before any deployment.
#
# Run:  python devserver.py [port]   (default port 8743)

import json
import os
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'api'))
from _shared import get_quote, get_news  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        symbol = (qs.get('symbol') or [''])[0].upper()

        if parsed.path == '/api/quote':
            try:
                self._send_json(get_quote(symbol))
            except Exception as e:
                self._send_json({'error': str(e)}, 502)
            return

        if parsed.path == '/api/news':
            try:
                self._send_json(get_news(symbol))
            except Exception as e:
                self._send_json({'error': str(e)}, 502)
            return

        super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8743
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Serving {ROOT} with live /api/quote and /api/news on http://127.0.0.1:{port}')
    server.serve_forever()
