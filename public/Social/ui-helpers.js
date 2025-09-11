// public/Social/ui-helpers.js
// ------------------------------------------------------------
// Vibance • Social UI helpers (tiny, dependency-free)
// - Exports named ESM functions
// - Also attaches to window.VB for legacy/global access
// ------------------------------------------------------------

/* ---------------------------- Text & Dates ---------------------------- */
export function titleCase(s = '') {
  return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

export function fmtTime(tsOrDate) {
  const d = tsOrDate?.toDate
    ? tsOrDate.toDate()
    : (tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate || 0));
  if (Number.isNaN(d.getTime())) return 'Just now';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function escapeAttr(s) {
  return escapeHtml(s).replace(/\n/g, ' ');
}

/* ------------------------------- Money ------------------------------- */
export function money(n, currency = 'USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/* -------------------------- DOM mini-helpers ------------------------- */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function setBusy(btn, text = 'Working…', busy = true) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevText = btn.textContent ?? '';
    btn.disabled = true;
    btn.textContent = text;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText ?? btn.textContent ?? 'Done';
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 200) {
  let last = 0, tid = null, lastArgs;
  return (...args) => {
    const now = Date.now();
    lastArgs = args;
    const run = () => { last = now; tid = null; fn(...lastArgs); };
    if (now - last >= ms) run();
    else if (!tid) tid = setTimeout(run, ms - (now - last));
  };
}

/* ------------------------------- Toast ------------------------------- */
export function toast(msg, { id = 'toast', duration = 1600 } = {}) {
  const el = document.getElementById(id);
  if (!el) return console.log('[toast]', msg);
  el.textContent = msg;
  el.classList.remove('opacity-0', 'pointer-events-none');
  el.classList.add('opacity-100');
  window.clearTimeout(el._hideTid);
  el._hideTid = window.setTimeout(() => {
    el.classList.add('opacity-0', 'pointer-events-none');
  }, duration);
}

/* --------------------------- Popover handling ------------------------ */
export function openPopover(triggerEl, popoverEl) {
  if (!popoverEl) return;
  document.querySelectorAll('.post-menu-popover').forEach(m => {
    if (m !== popoverEl) m.classList.add('hidden');
  });
  popoverEl.classList.remove('hidden');

  const esc = (e) => {
    if (e.key === 'Escape') {
      close();
    }
  };
  const outside = (e) => {
    if (!popoverEl.contains(e.target) && e.target !== triggerEl) close();
  };
  function close() {
    popoverEl.classList.add('hidden');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', esc, true);
  }

  document.addEventListener('click', outside, true);
  document.addEventListener('keydown', esc, true);
  return close;
}

/* --------------------------- URL / Query util ------------------------ */
export function qparam(name, url = window.location.href) {
  try { return new URL(url).searchParams.get(name); }
  catch { return null; }
}

/* --------------------------- File name helper ------------------------ */
export function safeFileName(name = '') {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || `file_${Date.now()}`;
}

/* ------------------------------ Globals ------------------------------ */
// Expose to window.VB for legacy access without imports
(function attachGlobals() {
  const api = {
    titleCase, fmtTime, escapeHtml, escapeAttr,
    money, qs, qsa, setBusy, debounce, throttle,
    toast, openPopover, qparam, safeFileName,
  };
  window.VB = Object.freeze({ ...(window.VB || {}), ...api });
})();
