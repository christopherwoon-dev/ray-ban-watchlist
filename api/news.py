import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_news  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        symbol = (qs.get('symbol') or [''])[0].upper()
        try:
            body = json.dumps(get_news(symbol)).encode()
            status = 200
        except Exception as e:
            body = json.dumps({'error': str(e)}).encode()
            status = 502
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
