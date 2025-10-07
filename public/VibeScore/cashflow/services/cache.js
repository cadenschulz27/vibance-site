// services/cache.js
// Lightweight caching layer for cash-flow snapshots.

const STORAGE_KEY = 'vb_cashflow_snapshot_v1';

export function readCachedSnapshot(uid) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(buildKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[cashflow] failed to read cache', error);
    return null;
  }
}

export function writeCachedSnapshot(uid, snapshot) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(buildKey(uid), JSON.stringify({
      snapshot,
      storedAt: Date.now(),
    }));
  } catch (error) {
    console.warn('[cashflow] failed to persist cache', error);
  }
}

export function clearCachedSnapshot(uid) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(buildKey(uid));
  } catch (error) {
    console.warn('[cashflow] failed to clear cache', error);
  }
}

function buildKey(uid) {
  return `${STORAGE_KEY}:${uid || 'anonymous'}`;
}
