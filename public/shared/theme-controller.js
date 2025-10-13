// public/shared/theme-controller.js
// Centralized theme management for Vibance. Handles light/dark toggling,
// persistence, and notification hooks for UI components.

const STORAGE_KEY = 'vb_theme';
const THEME_LINK_ID = 'vb-theme-link';
const THEME_CSS_PATH = '/shared/theme.css';
const THEME_TRANSITION_CLASS = 'vb-theme-transitioning';
const THEME_TRANSITION_DURATION = 420;

export const VALID_THEMES = new Set(['light', 'dark']);

let currentTheme = 'dark';
let initialized = false;
let transitionTimer = null;
const listeners = new Set();

function ensureThemeStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(THEME_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = THEME_LINK_ID;
  link.rel = 'stylesheet';
  link.href = THEME_CSS_PATH;
  document.head.appendChild(link);
}

function systemPreference() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch (error) {
    console.warn('[theme] unable to read system preference', error);
    return 'dark';
  }
}

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.has(stored)) return stored;
  } catch (error) {
    console.warn('[theme] unable to read stored theme', error);
  }
  return systemPreference();
}

export function getCurrentTheme() {
  return currentTheme;
}

export function onThemeChange(callback, { immediate = false } = {}) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  listeners.add(callback);
  if (immediate) {
    try {
      callback(currentTheme);
    } catch (error) {
      console.error('[theme] listener threw during immediate invocation', error);
    }
  }
  return () => {
    listeners.delete(callback);
  };
}

function notify(theme) {
  listeners.forEach((listener) => {
    try {
      listener(theme);
    } catch (error) {
      console.error('[theme] listener error', error);
    }
  });
}

function queueTransition() {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  const { body } = document;
  if (!body) return;
  body.classList.add(THEME_TRANSITION_CLASS);
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    body.classList.remove(THEME_TRANSITION_CLASS);
    transitionTimer = null;
  }, THEME_TRANSITION_DURATION);
}

export function applyTheme(theme, { persist = true, suppressTransition = false } = {}) {
  if (typeof document === 'undefined') return currentTheme;
  ensureThemeStyles();
  const next = VALID_THEMES.has(theme) ? theme : 'dark';
  const isChanged = !initialized || next !== currentTheme;
  currentTheme = next;
  document.documentElement.setAttribute('data-theme', next);
  if (document.body) document.body.setAttribute('data-theme', next);
  document.documentElement.style.setProperty('color-scheme', next === 'light' ? 'light' : 'dark');
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      console.warn('[theme] unable to store theme', error);
    }
  }
  initialized = true;
  if (isChanged && !suppressTransition) queueTransition();
  if (isChanged) {
    notify(next);
    document.dispatchEvent(new CustomEvent('vb-theme-change', { detail: { theme: next } }));
  }
  return next;
}

export function toggleTheme(options = {}) {
  const next = currentTheme === 'light' ? 'dark' : 'light';
  return applyTheme(next, options);
}

export function initTheme() {
  ensureThemeStyles();
  const stored = getStoredTheme();
  return applyTheme(stored, { persist: false, suppressTransition: true });
}

// Auto-initialize on module load to avoid flash of incorrect theme.
if (typeof document !== 'undefined') {
  initTheme();
}

export default {
  initTheme,
  applyTheme,
  toggleTheme,
  getStoredTheme,
  getCurrentTheme,
  onThemeChange,
};
