// D-pad navigable glasses app — screen/focus architecture copied from the
// real toolkit's create-webapp template (arrow keys move focus with
// wrap-around, Enter activates, Escape goes back). Data comes from the
// existing ../data.js, ../scoring.js, ../storage.js — this file only owns
// screens/rendering/focus, matching the real hardware's D-pad-only input
// model (no touch/mouse — confirmed against display-guidelines.md in the
// cloned toolkit repo).
//
// The Add Ticker screen uses a plain <input> (see vanilla-patterns.md's
// "Form Screen" pattern) rather than anything custom — the glasses OS
// attaches its own text-entry modality (Neural Band handwriting, dictation,
// etc.) to any focused HTML text input, the same way a phone's keyboard
// appears for a focused <input> in a mobile browser. There's no separate
// JS API for it.

(function () {
  'use strict';

  var STORAGE_KEY = 'mrbd:watchlist';
  var REFRESH_MS = 20000;

  var state = {
    currentScreen: 'home',
    screenHistory: [],
    watchlist: [],   // [{ symbol, muted }]
    rawCache: {},    // symbol -> { quote, articles }
    display: [],     // derived per render
    currentIdx: null,
    tick: 0,
  };

  var screens = {};

  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function (s) {
      if (s.id) screens[s.id] = s;
    });
  }

  // ==================== NAVIGATION ====================
  function navigateTo(screenId, options) {
    options = options || {};
    var addToHistory = options.addToHistory !== false;
    if (addToHistory && state.currentScreen) state.screenHistory.push(state.currentScreen);

    Object.values(screens).forEach(function (s) { s.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  // ==================== FOCUS MANAGEMENT ====================
  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  function moveFocus(direction) {
    var container = screens[state.currentScreen];
    if (!container) return;
    var focusables = Array.from(container.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (focusables.length === 0) return;

    var idx = focusables.indexOf(document.activeElement);
    if (idx === -1) { focusFirst(container); return; }

    var nextIdx;
    if (direction === 'up' || direction === 'left') {
      nextIdx = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      nextIdx = idx < focusables.length - 1 ? idx + 1 : 0;
    }
    focusables[nextIdx].focus();
    focusables[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ==================== DATA ====================
  function setLoading(isLoading) {
    document.getElementById('loading').classList.toggle('hidden', !isLoading);
  }

  async function loadWatchlist() {
    var saved = await storageGet(STORAGE_KEY);
    state.watchlist = saved ?? DEFAULT_TICKERS.map(function (symbol) { return { symbol: symbol, muted: false }; });
  }

  async function refreshData() {
    await Promise.all(state.watchlist.map(async function (w) {
      var quote = await fetchQuote(w.symbol, state.tick);
      var articles = await fetchHeadlines(w.symbol, state.tick);
      state.rawCache[w.symbol] = { quote: quote, articles: articles };
    }));
  }

  function buildDisplay() {
    state.display = state.watchlist.map(function (w) {
      var cached = state.rawCache[w.symbol];
      if (!cached) {
        return { symbol: w.symbol, muted: w.muted, price: '—', changePct: 0, up: true, headline: 'Loading…', tag: null, articles: [] };
      }
      var ranked = rankArticles(cached.articles, cached.quote.changePct);
      return {
        symbol: w.symbol,
        muted: w.muted,
        price: cached.quote.price,
        changePct: cached.quote.changePct,
        up: cached.quote.changePct >= 0,
        headline: ranked[0] ? ranked[0].text : '',
        tag: !w.muted && shouldTagCatalyst(ranked) ? 'CATALYST' : null,
        articles: ranked,
      };
    });
  }

  // ==================== RENDER ====================
  function renderHome() {
    var container = document.getElementById('tickerList');
    container.innerHTML = '';
    if (state.display.length === 0) {
      container.innerHTML = '<div class="empty-state">Watchlist is empty.</div>';
      return;
    }
    state.display.forEach(function (d, i) {
      var el = document.createElement('div');
      el.className = 'list-item focusable' + (d.muted ? ' is-muted' : '');
      el.tabIndex = 0;
      el.dataset.action = 'open-detail';
      el.dataset.idx = i;
      el.innerHTML =
        '<div class="list-item-content">' +
          '<div class="list-item-title">' + d.symbol + '</div>' +
          '<div class="list-item-meta">' + (d.muted ? 'Muted' : escapeHtml(d.headline)) + '</div>' +
        '</div>' +
        '<div class="list-item-stats">' +
          '<div class="list-item-price">' + d.price + '</div>' +
          '<div class="list-item-change ' + (d.up ? 'change-up' : 'change-down') + '">' + (d.up ? '+' : '') + d.changePct + '%</div>' +
        '</div>' +
        (d.tag ? '<span class="badge">' + d.tag + '</span>' : '');
      container.appendChild(el);
    });
  }

  function formatAge(minutesAgo) {
    if (minutesAgo < 60) return minutesAgo + 'm ago';
    if (minutesAgo < 1440) return Math.round(minutesAgo / 60) + 'h ago';
    return Math.round(minutesAgo / 1440) + 'd ago';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderDetail() {
    var d = state.display[state.currentIdx];
    document.getElementById('detail-ticker').textContent = d.symbol + '  ' + d.price;
    var changeEl = document.getElementById('detail-change');
    changeEl.textContent = (d.up ? '+' : '') + d.changePct + '%';
    changeEl.style.color = d.up ? 'var(--green)' : 'var(--red)';

    var list = document.getElementById('articleList');
    list.innerHTML = d.articles.map(function (a) {
      return '<div class="article' + (a.top ? ' top' : '') + '">' +
        '<div class="article-meta"><span class="article-source">' + escapeHtml(a.source) + '</span>' +
        '<span class="article-time">' + formatAge(a.minutesAgo) + '</span></div>' +
        '<div class="article-text">' + escapeHtml(a.text) + '</div></div>';
    }).join('') || '<div class="empty-state">No headlines.</div>';

    var muteBtn = document.getElementById('mute-btn');
    muteBtn.textContent = d.muted ? 'Unmute' : 'Mute';
    muteBtn.classList.toggle('muted-state', d.muted);
  }

  // ==================== ACTIONS ====================
  async function saveWatchlist() {
    await storageSet(STORAGE_KEY, state.watchlist);
  }

  function handleAction(action, element) {
    switch (action) {
      case 'back':
        navigateBack();
        break;
      case 'open-detail':
        state.currentIdx = parseInt(element.dataset.idx, 10);
        renderDetail();
        navigateTo('detail');
        break;
      case 'toggle-mute':
        state.watchlist[state.currentIdx].muted = !state.watchlist[state.currentIdx].muted;
        buildDisplay();
        renderDetail();
        renderHome();
        saveWatchlist();
        break;
      case 'remove-ticker':
        state.watchlist.splice(state.currentIdx, 1);
        state.currentIdx = null;
        buildDisplay();
        renderHome();
        saveWatchlist();
        navigateBack();
        break;
      case 'go-add-ticker': {
        var input = document.getElementById('new-ticker-input');
        input.value = '';
        document.getElementById('add-ticker-hint').textContent = '';
        navigateTo('add-ticker');
        break;
      }
      case 'save-ticker':
        addTicker();
        break;
    }
  }

  async function addTicker() {
    var input = document.getElementById('new-ticker-input');
    var hint = document.getElementById('add-ticker-hint');
    var raw = input.value.trim().toUpperCase();
    if (!raw) return;
    if (state.watchlist.some(function (w) { return w.symbol === raw; })) {
      hint.textContent = raw + ' is already on your watchlist.';
      return;
    }
    hint.textContent = 'Adding ' + raw + '…';
    try {
      state.watchlist.push({ symbol: raw, muted: false });
      var quote = await fetchQuote(raw, state.tick);
      var articles = await fetchHeadlines(raw, state.tick);
      state.rawCache[raw] = { quote: quote, articles: articles };
      buildDisplay();
      renderHome();
      await saveWatchlist();
      navigateBack();
    } catch (e) {
      state.watchlist.pop();
      hint.textContent = 'Could not add ' + raw + ': ' + e.message;
    }
  }

  // ==================== EVENTS ====================
  function setupEvents() {
    document.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, actionEl);
    });

    document.addEventListener('keydown', function (e) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

      // While a text field is focused, only Enter/Escape are intercepted —
      // everything else (typing, and whatever native input modality the
      // glasses OS attaches to a focused <input> — dictation, handwriting
      // via the Neural Band, etc.) is left to the browser/OS to handle.
      if (isInput && e.key !== 'Enter' && e.key !== 'Escape') return;

      switch (e.key) {
        case 'ArrowUp': moveFocus('up'); e.preventDefault(); break;
        case 'ArrowDown': moveFocus('down'); e.preventDefault(); break;
        case 'ArrowLeft': moveFocus('left'); e.preventDefault(); break;
        case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
        case 'Enter':
          if (isInput) {
            var submitAction = active.dataset.submitAction;
            if (submitAction) handleAction(submitAction, active);
          } else if (active && active.classList.contains('focusable')) {
            active.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== INIT ====================
  async function init() {
    collectScreens();
    setupEvents();
    setLoading(true);
    await loadWatchlist();
    await refreshData();
    buildDisplay();
    setLoading(false);
    renderHome();
    navigateTo('home', { addToHistory: false });

    setInterval(async function () {
      state.tick += 1;
      await refreshData();
      buildDisplay();
      renderHome();
      if (state.currentScreen === 'detail') renderDetail();
    }, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
