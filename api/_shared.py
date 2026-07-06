# Shared, no-API-key data providers. Used by both the Vercel functions in
# this folder (quote.py, news.py) and the local dev server (../devserver.py)
# so there's a single source of truth for how real data is fetched/parsed.
#
# Prices and news both come from Yahoo Finance's public (unofficial, no key)
# endpoints. Google News RSS was tried first for headlines and works fine
# from a normal residential/sandbox IP, but Google's anti-bot layer
# consistently 503s requests from Vercel's Lambda IP ranges — Yahoo's own
# news search endpoint doesn't have that problem, so it's used for both.

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

USER_AGENT = 'Mozilla/5.0 (compatible; ray-ban-watchlist/1.0)'

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
