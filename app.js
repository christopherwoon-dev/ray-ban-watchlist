// Phone/web edit surface: add/remove tickers, synced via storage.js to the
// same backend the glasses app (glasses/app.js) reads from. Muting a ticker
// is a glasses-only action (done there via its Mute button), not exposed
// here — this page only adds/removes.

const STORAGE_KEY = 'mrbd:watchlist';
const REFRESH_MS = 20000;

let watchlist = []; // [{ symbol, muted }]
let tick = 0;
let rawCache = {};  // symbol -> { quote: {price,changePct}, articles: [...] } — avoids re-fetching on every remove
let display = [];   // built each render: [{ symbol, price, changePct, up, headline }]

const phoneList = document.getElementById('phoneList');
const tickerInput = document.getElementById('tickerInput');
const addBtn = document.getElementById('addBtn');
const syncNote = document.getElementById('syncNote');

async function loadWatchlist() {
  const saved = await storageGet(STORAGE_KEY);
  watchlist = saved ?? DEFAULT_TICKERS.map((symbol) => ({ symbol, muted: false }));
  await refreshData(watchlist.map((w) => w.symbol));
  buildDisplay();
  renderPhone();
}

async function saveWatchlist() {
  const ok = await storageSet(STORAGE_KEY, watchlist);
  syncNote.textContent = ok ? 'synced to glasses' : 'save failed — session only';
  setTimeout(() => { syncNote.textContent = ''; }, 1400);
}

// Fetches quote + headlines for the given symbols and populates rawCache.
// Network calls only happen here — removing a ticker just re-derives
// `display` from the cache via buildDisplay(), no re-fetch needed.
async function refreshData(symbols) {
  await Promise.all(symbols.map(async (symbol) => {
    const [quote, articles] = await Promise.all([
      fetchQuote(symbol, tick),
      fetchHeadlines(symbol, tick),
    ]);
    rawCache[symbol] = { quote, articles };
  }));
}

function buildDisplay() {
  display = watchlist.map(({ symbol }) => {
    const cached = rawCache[symbol];
    if (!cached) return { symbol, price: '—', changePct: 0, up: true, headline: 'Loading…' };
    const ranked = rankArticles(cached.articles, cached.quote.changePct);
    return {
      symbol,
      price: cached.quote.price,
      changePct: cached.quote.changePct,
      up: cached.quote.changePct >= 0,
      headline: ranked[0]?.text ?? '',
    };
  });
}

function renderPhone() {
  phoneList.innerHTML = '';
  if (display.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'phone-empty';
    empty.textContent = 'No tickers yet. Add one below.';
    phoneList.appendChild(empty);
    return;
  }
  display.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'phone-row';
    row.innerHTML = `
      <div class="info">
        <div class="t">${d.symbol}</div>
        <div class="h">${d.headline}</div>
      </div>
      <div class="stats">
        <div class="price">${d.price}</div>
        <div class="chg ${d.up ? 'up' : 'down'}">${d.up ? '+' : ''}${d.changePct}%</div>
      </div>
      <div class="phone-remove" data-idx="${i}">×</div>
    `;
    phoneList.appendChild(row);
  });
  phoneList.querySelectorAll('.phone-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      watchlist.splice(idx, 1);
      buildDisplay();
      saveWatchlist();
      renderPhone();
    });
  });
}

tickerInput.addEventListener('input', () => {
  addBtn.disabled = tickerInput.value.trim().length === 0;
});
tickerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !addBtn.disabled) addTicker();
});
addBtn.addEventListener('click', addTicker);

async function addTicker() {
  const raw = tickerInput.value.trim().toUpperCase();
  if (!raw) return;
  if (watchlist.some((w) => w.symbol === raw)) {
    tickerInput.value = '';
    addBtn.disabled = true;
    return;
  }
  watchlist.push({ symbol: raw, muted: false });
  tickerInput.value = '';
  addBtn.disabled = true;
  await refreshData([raw]);
  buildDisplay();
  saveWatchlist();
  renderPhone();
}

setInterval(async () => {
  tick += 1;
  await refreshData(watchlist.map((w) => w.symbol));
  buildDisplay();
  renderPhone();
}, REFRESH_MS);

loadWatchlist();
