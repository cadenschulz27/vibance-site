// services/preferences.js
// Handles persistence of user-configurable cash-flow settings.

const DEFAULT_PREFERENCES = {
  insightDensity: 4,
  alertsEnabled: true,
  scenarioIds: ['base', 'income_boost', 'expense_trim'],
};

const STORAGE_KEY = 'vb_cashflow_prefs_v1';

export function readPreferences(uid) {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
    const raw = localStorage.getItem(buildKey(uid));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return normalizePreferences(parsed);
  } catch (error) {
    console.warn('[cashflow] failed to read prefs', error);
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(uid, prefs) {
  try {
    if (typeof localStorage === 'undefined') return;
    const normalized = normalizePreferences(prefs);
    localStorage.setItem(buildKey(uid), JSON.stringify(normalized));
  } catch (error) {
    console.warn('[cashflow] failed to write prefs', error);
  }
}

function normalizePreferences(input = {}) {
  return {
    ...DEFAULT_PREFERENCES,
    ...input,
    insightDensity: clamp(Number(input.insightDensity) || DEFAULT_PREFERENCES.insightDensity, 2, 6),
  };
}

function buildKey(uid) {
  return `${STORAGE_KEY}:${uid || 'anonymous'}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
