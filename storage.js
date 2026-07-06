// Shared watchlist storage — backed by /api/watchlist (Vercel + Upstash
// Redis) so the phone edit page and the glasses app, which run in separate
// browser contexts, see the same state. There is no window.storage bridge
// in the real Meta Wearables toolkit (confirmed against the actual SDK) —
// it uses plain localStorage per-device, which can't sync across surfaces
// on its own. localStorage here is only a last-resort offline fallback if
// the network call fails; it is NOT synced across devices in that case.

async function storageGet(key) {
  try {
    const res = await fetch('/api/watchlist');
    if (!res.ok) throw new Error(`watchlist ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.watchlist ?? null;
  } catch (e) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }
}

async function storageSet(key, value) {
  try {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchlist: value }),
    });
    if (!res.ok) throw new Error(`watchlist ${res.status}`);
    localStorage.setItem(key, JSON.stringify(value)); // offline fallback cache
    return true;
  } catch (e) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
    return false;
  }
}
