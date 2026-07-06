# Ray-Ban Display Stock Watchlist — webapp

Real (runnable) implementation of the two-surface design from `../PROJECT_BRIEF.md`
and the four reference mockups. Plain HTML/CSS/JS frontend + a small Python
backend for real data (no Node needed anywhere in this project).

## Run it locally

```
python devserver.py 8743
```

Then open `http://localhost:8743`. This serves the static app *and* the
`/api/quote` / `/api/news` endpoints (see below) from the same process.

Do not use plain `python -m http.server` — it can't serve the `/api/*`
endpoints, so the app will silently fall back to mock data.

## What's implemented

- **Two-surface architecture**: phone/web edit view (add/remove tickers) and a
  glasses read-only lens, both reading/writing the same shared watchlist
  (`storage.js` — uses the Meta toolkit's `window.storage` bridge when present,
  falls back to `localStorage` for plain-browser testing).
- **Tap-to-expand detail view** in the lens: one headline per ticker in the list,
  tap opens 2-3 ranked articles with a `TOP` badge, tap back to return. Article
  age is shown as `Xm/Xh/Xd ago`.
- **Hold-to-mute**: press and hold a lens card (~550ms) to mute a ticker — dims
  it and suppresses its headline/CATALYST tag, without removing it from the list
  (edit/remove still only happens on the phone surface).
- **Catalyst scoring** (`scoring.js`): category weight (earnings/guidance/M&A/
  regulatory/analyst action) × recency decay × a real-move confirmation bonus
  (price change ≥ 1.5%), matching the framework style used by the
  `swing-trade-architect` / `daily-catalyst-scanner` skills. The `CATALYST` tag
  only appears above a threshold score.
- Default 19-ticker watchlist from the brief, plus ad-hoc ticker add.
- **Real data, no API keys**: prices from Yahoo Finance's public chart endpoint,
  headlines from Google News RSS, both fetched server-side in `api/_shared.py`
  (see below) — verified live in-browser with real prices and real headlines.

## How the real data works

`data.js`'s `fetchQuote`/`fetchHeadlines` call `/api/quote?symbol=X` and
`/api/news?symbol=X`. Those endpoints are implemented once, in
`api/_shared.py`, and used by two different runners:

- **`devserver.py`** (local dev) — a plain Python `http.server` that serves
  the static files and calls `_shared.py` directly for `/api/*`.
- **`api/quote.py` / `api/news.py`** — Vercel Python serverless functions
  (Vercel auto-detects any `api/*.py` exporting a `handler` class — no Node
  or `vercel.json` needed for this). These import `_shared.py` from the same
  folder, so the logic is identical to what you tested locally.

If a live call fails (offline, rate-limited) or returns nothing, `data.js`
falls back to the mock generator in `data.js` itself, so the UI never breaks
— rendering "Loading…" only briefly on first load.

**Caveat on the news source**: Google's RSS feed terms restrict use to
personal, non-commercial use in a feed reader. That fits this app (your own
personal watchlist, run for yourself), but don't repackage/redistribute the
scraped headlines beyond that.

## Remaining steps to actually run this on glasses

Everything above is finished and tested in a browser. What's left needs your
accounts/hardware, not more app code:

1. **Deploy to Vercel** (or any host that runs Python serverless functions):
   - Push this `webapp/` folder to a GitHub repo
   - `vercel` login → import the repo → deploy (it should auto-detect the
     `api/*.py` functions and serve everything else as static files)
   - I can walk through this step-by-step once you're ready — I'd need you
     to run the `vercel` CLI login interactively, since that's a browser/
     account action I can't do for you.
2. **Clone the actual toolkit**: `git clone
   https://github.com/facebookincubator/meta-wearables-webapp.git`, run
   `./install-skills.sh claude`. This app was built to match that toolkit's
   `window.storage` shape from the mockups, but hasn't been tested against
   the real SDK — there may be adjustments once you can see its actual API.
3. **Load onto glasses**: enable Developer Mode in the Meta AI app, use the
   toolkit's publish skill to generate a QR code from your deployed URL, scan
   it from the glasses.

Steps 2-3 need the physical glasses + Meta AI app, which I don't have access
to test against — happy to debug alongside you once you hit that stage.
