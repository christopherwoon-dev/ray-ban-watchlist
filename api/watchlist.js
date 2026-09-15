// Rewritten from Python (see git history for api/watchlist.py) after that
// version consistently threw "[Errno 16] Device or resource busy" trying to
// reach Upstash's REST endpoint from this project's Python serverless
// sandbox. The configured KV_REST_API_URL host doesn't resolve in public
// DNS at all (checked against Google's and Cloudflare's resolvers) even
// though upstash.io itself does -- the signature of a private, Vercel-
// internal storage hostname, only reachable from Vercel's own network
// fabric. That path is far better trodden/supported from Vercel's Node.js
// runtime than from Python, so this one endpoint moves to Node -- no
// dependencies needed, just the built-in fetch.

const WATCHLIST_KEY = 'mrbd:watchlist';
const DEFAULT_TICKERS = [
  'ARM', 'AMD', 'INTC', 'AVGO', 'MU', 'CRWD', 'TSM', 'NFLX', 'NVDA', 'PANW',
  'QCOM', 'AAPL', 'MSFT', 'SNOW', 'PLTR', 'AMZN', 'GOOGL', 'TSLA', 'META',
];

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL/KV_REST_API_TOKEN not configured');
  return { url, token };
}

async function kvRequest(method, path, body) {
  const { url, token } = kvConfig();
  const res = await fetch(url.replace(/\/$/, '') + path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KV request ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function getWatchlist() {
  const result = await kvRequest('GET', `/get/${WATCHLIST_KEY}`);
  if (result.result) return JSON.parse(result.result);
  return DEFAULT_TICKERS.map((s) => ({ symbol: s, muted: false }));
}

async function setWatchlist(watchlist) {
  await kvRequest('POST', `/set/${WATCHLIST_KEY}`, JSON.stringify(watchlist));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (req.method === 'GET') {
      const watchlist = await getWatchlist();
      res.status(200).json({ watchlist });
    } else if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      await setWatchlist(body.watchlist || []);
      res.status(200).json({ ok: true });
    } else {
      res.status(405).json({ error: 'method not allowed' });
    }
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
