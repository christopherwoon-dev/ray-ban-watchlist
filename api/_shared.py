# Shared, no-API-key data providers. Used by both the Vercel functions in
# this folder (quote.py, news.py) and the local dev server (../devserver.py)
# so there's a single source of truth for how real data is fetched/parsed.
#
# Prices and news both come from Yahoo Finance's public (unofficial, no key)
# endpoints. Google News RSS was tried first for headlines and works fine
# from a normal residential/sandbox IP, but Google's anti-bot layer
# consistently 503s requests from Vercel's Lambda IP ranges — Yahoo's own
# news search endpoint doesn't have that problem, so it's used for both.

import http.client
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

USER_AGENT = 'Mozilla/5.0 (compatible; ray-ban-watchlist/1.0)'

WATCHLIST_KEY = 'mrbd:watchlist'
DEFAULT_TICKERS = [
    'ARM', 'AMD', 'INTC', 'AVGO', 'MU', 'CRWD', 'TSM', 'NFLX', 'NVDA', 'PANW',
    'QCOM', 'AAPL', 'MSFT', 'SNOW', 'PLTR', 'AMZN', 'GOOGL', 'TSLA', 'META',
]

CATEGORY_KEYWORDS = {
    'earnings': ['earnings', 'quarterly results', 'eps ', 'revenue beat', 'revenue miss'],
    'guidance': ['guidance', 'outlook', 'forecast'],
    'M&A': ['acquire', 'acquisition', 'merger', 'buyout', 'stake'],
    'regulatory': ['regulat', 'fda', 'antitrust', 'lawsuit', 'sec filing', 'ruling'],
    'analyst_action': ['price target', 'upgrade', 'downgrade', 'rating', 'initiates coverage'],
}


def categorize(text):
    lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return category
    return 'other'


def _get(url, timeout=6):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_quote(symbol):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?interval=1d&range=1d'
    data = json.loads(_get(url))
    result = data['chart']['result'][0]
    meta = result['meta']
    price = meta['regularMarketPrice']
    prev_close = meta.get('chartPreviousClose') or meta.get('previousClose') or price
    change_pct = ((price - prev_close) / prev_close) * 100 if prev_close else 0.0
    return {'price': round(price, 2), 'changePct': round(change_pct, 2)}


def get_news(symbol, limit=3):
    url = f'https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(symbol)}&newsCount={limit}&quotesCount=0'
    data = json.loads(_get(url))
    now = datetime.now(timezone.utc)
    results = []
    for item in data.get('news', [])[:limit]:
        text = item.get('title', '')
        publish_ts = item.get('providerPublishTime')
        minutes_ago = 0
        if publish_ts:
            dt = datetime.fromtimestamp(publish_ts, tz=timezone.utc)
            minutes_ago = max(0, int((now - dt).total_seconds() / 60))
        results.append({
            'source': item.get('publisher', 'Yahoo Finance'),
            'minutesAgo': minutes_ago,
            'text': text,
            'category': categorize(text),
        })
    return results


# ==================== SHARED WATCHLIST (Upstash Redis via REST API) ====================
# Backs the watchlist behind /api/watchlist so the phone edit page and the
# glasses app — separate browser contexts that can't share localStorage —
# see the same state. Uses Upstash's REST API (KV_REST_API_URL/TOKEN, the
# env vars Vercel injects once the database is connected to the project)
# rather than the redis:// protocol, so no extra pip dependency is needed.

def _kv_config():
    url = os.environ.get('KV_REST_API_URL')
    token = os.environ.get('KV_REST_API_TOKEN')
    if not url or not token:
        raise RuntimeError('KV_REST_API_URL/KV_REST_API_TOKEN not configured')
    return url, token


def _kv_request(method, path, body=None):
    # Deliberately NOT urllib.request.urlopen here (unlike _get() above,
    # used for Yahoo Finance): the live deployment reproducibly threw
    # "<urlopen error [Errno 16] Device or resource busy>" for this specific
    # Upstash host on every attempt, retry included, while the same urlopen
    # path works fine for Yahoo — so it's not a generic network/DNS issue in
    # this runtime, and not transient. http.client.HTTPSConnection is a
    # different code path (skips urllib.request's opener/handler layer) and
    # is the commonly effective workaround for this exact class of bug in
    # constrained serverless Python sandboxes.
    url, token = _kv_config()
    if not url.startswith('http://') and not url.startswith('https://'):
        raise RuntimeError(f'KV_REST_API_URL missing http(s) scheme: {url!r}')
    parsed = urllib.parse.urlparse(url)
    data = body.encode() if isinstance(body, str) else body
    conn_cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
    conn = conn_cls(parsed.netloc, timeout=6)
    try:
        conn.request(method, path, body=data, headers={'Authorization': f'Bearer {token}'})
        resp = conn.getresponse()
        raw = resp.read()
        if resp.status >= 400:
            raise RuntimeError(f'KV request to {url}{path} returned {resp.status}: {raw[:200]!r}')
        return json.loads(raw)
    finally:
        conn.close()


def get_watchlist():
    result = _kv_request('GET', f'/get/{WATCHLIST_KEY}')
    raw = result.get('result')
    if raw:
        return json.loads(raw)
    return [{'symbol': s, 'muted': False} for s in DEFAULT_TICKERS]


def set_watchlist(watchlist):
    _kv_request('POST', f'/set/{WATCHLIST_KEY}', body=json.dumps(watchlist))
