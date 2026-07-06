// Shared watchlist storage. Uses the Meta Wearables Device Access Toolkit's
// window.storage bridge when present (so phone and glasses read/write the
// same state); falls back to localStorage for plain-browser testing.

async function storageGet(key) {
  if (window.storage && typeof window.storage.get === 'function') {
    try {
      const result = await window.storage.get(key, false);
      return result ? JSON.parse(result.value) : null;
    } catch (e) {
      return null;
    }
  }
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

async function storageSet(key, value) {
  if (window.storage && typeof window.storage.set === 'function') {
    try {
      await window.storage.set(key, JSON.stringify(value), false);
      return true;
    } catch (e) {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
