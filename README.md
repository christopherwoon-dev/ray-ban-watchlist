# Ray-Ban Display Stock Watchlist

Two separate webapps sharing one backend:

- **`/` (this folder)** — phone/browser edit page. Add/remove tickers.
- **`/glasses/`** — the actual Meta Ray-Ban Display webapp. D-pad navigable,
  built against the real
  [meta-wearables-webapp](https://github.com/facebookincubator/meta-wearables-webapp)
  toolkit (cloned and inspected directly — see "Toolkit compliance" below).
  Full parity with the phone page: add, remove, mute, view catalyst headlines
  — all D-pad/focus navigable, using a standard `<input>` for the Add Ticker
  screen (see "Text entry on glasses" below) rather than a read-only view.

Both talk to the same `/api/watchlist`, `/api/quote`, `/api/news` backend, so
edits made on the phone page show up in the glasses app immediately.

There is no `window.storage` bridge or similar SDK-provided sync mechanism —
that was an assumption from early mockups made before the real toolkit was
available. The real toolkit gives each surface only plain `localStorage`,
which can't sync across two separate browser contexts (a phone browser and
the glasses' own WebView) on its own. `/api/watchlist`, backed by Upstash
Redis, is what actually makes the two surfaces share state.

## Run it locally

```
python devserver.py 8743
```

Then open `http://localhost:8743` (edit page) and `http://localhost:8743/glasses/`
(the D-pad app — use arrow keys + Enter/Escape to navigate, same as the
toolkit's own dev-testing instructions).

Do not use plain `python -m http.server` — it can't serve `/api/*`, so both
pages will fall back to defaults/mock data.

To test the real watchlist sync locally (optional): copy `.env.local.example`
to `.env.local` and fill in `KV_REST_API_URL`/`KV_REST_API_TOKEN` from your
Vercel project's Environment Variables page.

## Toolkit compliance

`glasses/` was rebuilt against the actual toolkit template
(`plugins/meta-wearables-webapp/skills/create-webapp/templates/`), not the
original aesthetic mockups, after cloning the toolkit and finding real
mismatches:

| Assumption from early mockups | What the real toolkit requires |
|---|---|
| Touch: tap to expand, swipe to scroll, hold to mute | No touchscreen at all — D-pad only. Arrow keys move focus (wrap-around), Enter activates, Escape goes back. Mute is a normal focusable button, not a synthetic long-press. |
| Custom ~340×380px "lens" mockup frame | Fixed 600×600dp viewport, 8dp safe margin |
| Amber trading-terminal palette throughout | `#000000` transparent page background (mandatory — real world shows through on the additive display), visible UI surfaces in `#0a0a0f`–`#1C1E21`, **cyan focus ring is a hardware/legibility requirement, not a style choice**. Amber is kept for prices/CATALYST tags on top of that base. |
| `window.storage` bridge for phone↔glasses sync | Plain `localStorage`, no bridge — hence the `/api/watchlist` backend described above |

`data.js`, `scoring.js`, and `storage.js` are shared unmodified between both
surfaces (`glasses/index.html` loads them via `../`) — only the UI/interaction
layer differs.

## Text entry on glasses (Add Ticker)

The Add Ticker screen (`glasses/index.html`) uses a plain
`<input type="text" class="text-input focusable">`, following the toolkit's
own "Form Screen" pattern (`skills/add-ui/references/vanilla-patterns.md`).
There is no separate JS API for the Neural Band's handwriting input — the
glasses OS attaches its own text-entry modality (handwriting, dictation,
whatever it supports) to any focused HTML text input automatically, the same
way a phone browser's native keyboard appears for a focused `<input>`. This
app's job is just to provide a standard, correctly-focusable input; the
actual handwriting recognition itself isn't something testable from a
desktop browser preview — only confirmable on the physical hardware.

While the input is focused, arrow keys are left alone (so typing/cursor
movement isn't hijacked by D-pad focus-navigation) — only Enter (submit,
via `data-submit-action`) and Escape (cancel) are intercepted, matching the
toolkit template's own keydown handling.

## What's implemented

- **Catalyst scoring** (`scoring.js`): category weight (earnings/guidance/M&A/
  regulatory/analyst action) × recency decay × a real-move confirmation bonus
  (price change ≥ 1.5%), matching the framework style used by the
  `swing-trade-architect` / `daily-catalyst-scanner` skills. The `CATALYST`
  tag only appears above a threshold score.
- Default 19-ticker watchlist, plus ad-hoc ticker add/remove on both surfaces.
- **Real data, no API keys**: prices and headlines both from Yahoo Finance's
  public (unofficial) endpoints — see `api/_shared.py`. Google News RSS was
  tried first for headlines and works from a normal IP, but Google blocks
  Vercel's Lambda IP ranges; Yahoo's own news search endpoint doesn't have
  that problem.
- **Shared watchlist sync**: `/api/watchlist` (GET/POST), backed by Upstash
  Redis via its REST API (`KV_REST_API_URL`/`KV_REST_API_TOKEN`, the env vars
  Vercel injects once the database is connected to the project).
- If any live call fails, both pages fall back to mock/default data so the UI
  never breaks.

## Known limitation

`/api/watchlist`'s POST has no auth — anyone with the deployed URL could
overwrite the watchlist. Low stakes for a personal ticker list, but worth
knowing if you ever share the URL.

## Remaining step: load onto physical glasses

Everything above is finished, deployed, and tested in a browser (including
D-pad keyboard navigation). What's left needs the actual hardware, which I
don't have access to test against:

1. Enable Developer Mode in the Meta AI app
2. Use the toolkit's publish skill to generate a QR code from
   `https://ray-ban-watchlist.vercel.app/glasses/`
3. Scan it from the glasses

Happy to debug alongside you once you hit that stage — I can't verify
anything about the actual on-device rendering/gesture behavior from here.
