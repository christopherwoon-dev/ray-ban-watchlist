// Wires data.js (mock quotes/headlines) + scoring.js (catalyst ranking) +
// storage.js (shared state) into the two-surface UI from index.html.

const STORAGE_KEY = 'mrbd:watchlist';
const REFRESH_MS = 20000;
const HOLD_MS = 550;

let watchlist = []; // [{ symbol, muted }]
let tick = 0;
let rawCache = {};  // symbol -> { quote: {price,changePct}, articles: [...] } — avoids re-fetching on every mute/remove
let display = [];   // built each render: [{ symbol, muted, price, changePct, up, headline, tag, articles }]

const phoneList = document.getElementById('phoneList');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const gestureBar = document.getElementById('gestureBar');
const tickerInput = document.getElementById('tickerInput');
const addBtn = document.getElementById('addBtn');
const syncNote = document.getElementById('syncNote');
const clock = document.getElementById('clock');

function tickClock() {
  clock.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

async function loadWatchlist() {
  const saved = await storageGet(STORAGE_KEY);
  watchlist = saved ?? DEFAULT_TICKERS.map((symbol) => ({ symbol, muted: false }));
  await refreshData(watchlist.map((w) => w.symbol));
  buildDisplay();
  renderBoth();
}

async function saveWatchlist() {
  const ok = await storageSet(STORAGE_KEY, watchlist);
  syncNote.textContent = ok ? 'synced to glasses' : 'save failed — session only';
  setTimeout(() => { syncNote.textContent = ''; }, 1400);
}

// Fetches quote + headlines for the given symbols and populates rawCache.
// Network calls only happen here — muting/removing a ticker just re-derives
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
  display = watchlist.map(({ symbol, muted }) => {
    const cached = rawCache[symbol];
    if (!cached) return { symbol, muted, price: '—', changePct: 0, up: true, headline: 'Loading…', tag: null, articles: [] };
    const ranked = rankArticles(cached.articles, cached.quote.changePct);
    return {
      symbol,
      muted,
      price: cached.quote.price,
      changePct: cached.quote.changePct,
      up: cached.quote.changePct >= 0,
      headline: ranked[0]?.text ?? '',
      tag: !muted && shouldTagCatalyst(ranked) ? 'CATALYST' : null,
      articles: ranked,
    };
  });
}

function renderBoth() {
  renderPhone();
  renderList();
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
      renderBoth();
    });
  });
}

function attachHoldToMute(el, idx) {
  let timer = null;
  const start = () => { timer = setTimeout(() => toggleMute(idx), HOLD_MS); };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
}

function toggleMute(idx) {
  watchlist[idx].muted = !watchlist[idx].muted;
  buildDisplay();
  saveWatchlist();
  renderList();
}

function renderList() {
  listView.innerHTML = '';
  if (display.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lens-empty';
    empty.textContent = 'Watchlist empty — add tickers from your phone.';
    listView.appendChild(empty);
    return;
  }
  display.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'lens-card' + (d.muted ? ' muted' : '');
    card.innerHTML = `
      <div class="left">
        <div class="ticker">${d.symbol}</div>
        <div class="headline">${d.muted ? 'Muted' : d.headline}</div>
      </div>
      <div class="right">
        <div class="price">${d.price}</div>
        <div class="change ${d.up ? 'up' : 'down'}">${d.up ? '+' : ''}${d.changePct}%</div>
        ${d.tag ? `<div class="lens-tag">${d.tag}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openDetail(i));
    attachHoldToMute(card, i);
    listView.appendChild(card);
  });
}

function formatAge(minutesAgo) {
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  if (minutesAgo < 1440) return `${Math.round(minutesAgo / 60)}h ago`;
  return `${Math.round(minutesAgo / 1440)}d ago`;
}

function openDetail(i) {
  const d = display[i];
  detailView.innerHTML = `
    <div class="detail-header"><div class="back-btn" id="backBtn">← back</div></div>
    <div class="detail-ticker-row">
      <div class="detail-ticker">${d.symbol}</div>
      <div class="detail-price">${d.price}</div>
      <div class="detail-change" style="color:${d.up ? 'var(--green)' : 'var(--red)'}">${d.up ? '+' : ''}${d.changePct}%</div>
    </div>
    <div class="article-list">
      ${d.articles.map((a) => `
        <div class="article ${a.top ? 'top' : ''}">
          <div class="article-meta">
            <div class="article-source">${a.top ? '<span class="rank-badge">TOP</span>' : ''}${a.source}</div>
            <div class="article-time">${formatAge(a.minutesAgo)}</div>
          </div>
          <div class="article-text">${a.text}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', closeDetail);
  listView.classList.add('hidden');
  detailView.classList.add('active');
  gestureBar.innerHTML = `<span>◐ swipe — scroll</span><span><b>tap</b> — back</span><span>hold — mute</span>`;
}

function closeDetail() {
  listView.classList.remove('hidden');
  detailView.classList.remove('active');
  gestureBar.innerHTML = `<span>◐ swipe — scroll</span><span><b>tap</b> — expand</span><span>hold — mute</span>`;
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
  renderBoth();
}

setInterval(async () => {
  tick += 1;
  await refreshData(watchlist.map((w) => w.symbol));
  buildDisplay();
  renderBoth();
}, REFRESH_MS);

setInterval(tickClock, 1000);
tickClock();
loadWatchlist();
