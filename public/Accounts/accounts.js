// public/Accounts/accounts.js
// -----------------------------------------------------------------------------
// Linked accounts hub: lists Plaid items, enables nickname editing, displays
// richer per-item analytics, and orchestrates sync/unlink flows.
// -----------------------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const els = {
  list: document.getElementById('accounts-list'),
  linkBtn: document.getElementById('link-account-btn'),
  empty: document.getElementById('empty-state'),
  toast: document.getElementById('toast'),
};

let CURRENT_UID = null;
const accountMetricsCache = new Map();
const DAY_MS = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

const toDate = (input) => {
  if (!input) return null;
  if (typeof input?.toDate === 'function') {
    const d = input.toDate();
    return Number.isNaN(d?.getTime()) ? null : d;
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value) => {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const fmtRelative = (value) => {
  const d = toDate(value);
  if (!d) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'moments ago';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} yr${years !== 1 ? 's' : ''} ago`;
};

const formatCurrency = (value, currency = 'USD') => {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
};

const escapeHtml = (str = '') => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const computeInitials = (value = '') => {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatIdentifier = (value, keep = 5) => {
  if (!value) return '—';
  const str = String(value);
  if (str.length <= keep * 2) return str;
  return `${str.slice(0, keep)}…${str.slice(-keep)}`;
};

const setBtnBusy = (btn, busyText = 'Working…', isBusy = true) => {
  if (!btn) return;
  if (isBusy) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || 'Done';
  }
};

const showToast = (msg) => {
  if (!els.toast) {
    console.log('[Toast]', msg);
    return;
  }
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.remove('opacity-100');
    els.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2200);
};

const getIdToken = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken(true);
};

const callPlaidFn = async (payload) => {
  const idToken = await getIdToken();
  const res = await fetch('/.netlify/functions/plaid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) ${text || ''}`.trim());
  }
  try { return JSON.parse(text || '{}'); } catch { return {}; }
};

// -----------------------------------------------------------------------------
// Plaid Link bootstrap
// -----------------------------------------------------------------------------

let plaidScriptLoaded = false;
const ensurePlaidLinkLoaded = () => new Promise((resolve, reject) => {
  if (window.Plaid) return resolve();
  if (plaidScriptLoaded) {
    const timer = setInterval(() => {
      if (window.Plaid) {
        clearInterval(timer);
        resolve();
      }
    }, 60);
    setTimeout(() => {
      clearInterval(timer);
      if (!window.Plaid) reject(new Error('Plaid Link failed to load.'));
    }, 8000);
    return;
  }
  plaidScriptLoaded = true;
  const script = document.createElement('script');
  script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
  script.async = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Unable to load Plaid Link script.'));
  document.head.appendChild(script);
});

// -----------------------------------------------------------------------------
// Rendering helpers
// -----------------------------------------------------------------------------

const renderEmptyState = (show) => {
  if (!els.empty) return;
  els.empty.classList.toggle('hidden', !show);
};

const accountCardTemplate = (item) => {
  const displayName = item.nickname?.trim() || item.institution_name || 'Unnamed connection';
  const initials = computeInitials(displayName);
  const accountCount = Array.isArray(item.accounts) ? item.accounts.length : 0;
  const subtitlePieces = [item.institution_name || 'Unknown institution'];
  if (accountCount) subtitlePieces.push(`${accountCount} account${accountCount === 1 ? '' : 's'}`);
  const subtitle = subtitlePieces.join(' • ');
  const lastSyncedDisplay = item.last_synced ? `${fmtDate(item.last_synced)}${fmtRelative(item.last_synced) ? ` • ${fmtRelative(item.last_synced)}` : ''}` : 'Not synced yet';
  const linkedDisplay = item.linked_at ? `${fmtDate(item.linked_at)}${fmtRelative(item.linked_at) ? ` • ${fmtRelative(item.linked_at)}` : ''}` : '—';
  const linkSession = formatIdentifier(item.link_session_id, 6);
  const institutionId = formatIdentifier(item.institution_id, 6);
  const itemIdShort = formatIdentifier(item.itemId, 6);

  return `
    <div class="account-card group overflow-hidden rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-neutral-900/60 via-neutral-900/40 to-neutral-950/60 backdrop-blur-xl p-6 md:p-8 transition hover:border-neutral-700/70" data-item-id="${escapeHtml(item.itemId)}">
      <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div class="flex flex-col gap-4">
          <div class="flex items-start gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-400/15 via-transparent to-transparent text-lg font-semibold text-emerald-100 shadow-[0_18px_38px_-24px_rgba(16,185,129,0.6)]" data-field="avatar-initials">
              ${escapeHtml(initials)}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2" data-section="nickname-display">
                <span class="truncate text-lg font-semibold text-white" data-field="display-name">${escapeHtml(displayName)}</span>
                <span class="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.35em] text-emerald-200">Connected</span>
              </div>
              <form data-form="nickname" class="hidden w-full max-w-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <input data-input="nickname" type="text" maxlength="48" class="w-48 flex-1 rounded-xl border border-neutral-700/70 bg-neutral-900/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/70" placeholder="Nickname this account" value="${escapeHtml(item.nickname || '')}" />
                  <button type="submit" data-action="save-nickname" class="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-400">Save</button>
                  <button type="button" data-action="cancel-nickname" class="rounded-full border border-neutral-700/70 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500">Cancel</button>
                </div>
              </form>
              <div class="mt-1 text-sm text-neutral-400" data-field="subtitle">${escapeHtml(subtitle)}</div>
              <div class="text-xs text-neutral-500">
                Last synced <span data-field="last-synced">${escapeHtml(lastSyncedDisplay)}</span>
                <span class="mx-1 text-neutral-700">•</span>
                Linked <span data-field="linked-at">${escapeHtml(linkedDisplay)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 md:justify-end">
          <button class="rounded-full border border-neutral-700/70 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-300 transition hover:border-neutral-500/70 hover:text-white" data-action="edit-nickname">Edit name</button>
          <button class="rounded-full bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-black shadow-[0_18px_38px_-20px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400" data-action="sync">Sync now</button>
          <button class="rounded-full border border-neutral-700/70 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:border-red-400/60 hover:text-red-300" data-action="unlink">Unlink</button>
          <button class="flex items-center gap-1 rounded-full border border-neutral-700/60 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500/70 hover:text-white" data-action="toggle" aria-expanded="false">
            <span>Details</span>
            <svg class="h-4 w-4 transition-transform" data-icon="chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div class="account-card__details hidden border-t border-neutral-800/50 pt-6" data-section="details">
        <div class="grid gap-5 lg:grid-cols-12">
          <section class="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5 lg:col-span-4">
            <h3 class="text-sm font-semibold text-white">Overview</h3>
            <dl class="mt-4 grid gap-2 text-sm text-neutral-300">
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-500">Institution</dt>
                <dd class="font-medium text-neutral-100" data-field="institution-name">${escapeHtml(item.institution_name || 'Unknown')}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-500">Institution ID</dt>
                <dd class="font-mono text-xs text-neutral-500" data-field="institution-id" title="${escapeHtml(item.institution_id || '—')}">${escapeHtml(institutionId)}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-500">Item ID</dt>
                <dd class="font-mono text-xs text-neutral-500" data-field="item-id" title="${escapeHtml(item.itemId)}">${escapeHtml(itemIdShort)}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-500">Link session</dt>
                <dd class="font-mono text-xs text-neutral-500" data-field="link-session" title="${escapeHtml(item.link_session_id || '—')}">${escapeHtml(linkSession)}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-neutral-500">Accounts connected</dt>
                <dd class="font-medium text-neutral-100" data-field="account-count">${accountCount}</dd>
              </div>
            </dl>
          </section>

          <section class="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5 lg:col-span-4">
            <h3 class="text-sm font-semibold text-white">Recent activity</h3>
            <div class="mt-4 space-y-3 text-sm" data-field="metrics-container">
              <div class="flex items-center gap-2 text-neutral-500" data-field="metrics-loading">
                <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                  <circle class="opacity-30" cx="12" cy="12" r="10"></circle>
                  <path class="opacity-70" d="M4 12a8 8 0 018-8"></path>
                </svg>
                <span>Crunching latest transactions…</span>
              </div>
              <div class="hidden space-y-3" data-field="metrics-body">
                <div class="flex justify-between"><span class="text-neutral-500">Transactions stored</span><span data-field="transaction-count">—</span></div>
                <div class="flex justify-between"><span class="text-neutral-500">Last transaction</span><span data-field="latest-transaction">—</span></div>
                <div class="flex justify-between"><span class="text-neutral-500">30-day spending</span><span data-field="spend-30">—</span></div>
                <div class="flex justify-between"><span class="text-neutral-500">30-day inflows</span><span data-field="income-30">—</span></div>
                <div class="text-xs text-neutral-500" data-field="top-categories">Top categories: —</div>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5 lg:col-span-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">Accounts &amp; routing</h3>
              <span class="text-xs uppercase tracking-[0.35em] text-neutral-500">Plaid</span>
            </div>
            <div class="mt-4 grid gap-3" data-field="accounts-grid"></div>
          </section>
        </div>
      </div>
    </div>
  `;
};

const updateLastSynced = (cardEl, value) => {
  const display = cardEl.querySelector('[data-field="last-synced"]');
  if (!display) return;
  if (!value) {
    display.textContent = 'Not synced yet';
    return;
  }
  const formatted = fmtDate(value);
  const relative = fmtRelative(value);
  display.textContent = relative ? `${formatted} • ${relative}` : formatted;
};

const setSyncingState = (cardEl, isSyncing) => {
  const syncBtn = cardEl.querySelector('[data-action="sync"]');
  const unlinkBtn = cardEl.querySelector('[data-action="unlink"]');
  setBtnBusy(syncBtn, 'Syncing…', isSyncing);
  if (unlinkBtn) unlinkBtn.disabled = !!isSyncing;
};

const renderAccountsList = (cardEl, accounts = []) => {
  const container = cardEl.querySelector('[data-field="accounts-grid"]');
  const countEl = cardEl.querySelector('[data-field="account-count"]');
  if (countEl) countEl.textContent = Array.isArray(accounts) ? accounts.length : 0;
  if (!container) return;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    container.innerHTML = '<p class="text-sm text-neutral-500">Plaid did not return account-level metadata for this connection.</p>';
    return;
  }
  const markup = accounts.map((account) => {
    const label = account.name || account.official_name || 'Account';
    const typeLine = [account.type, account.subtype].filter(Boolean).join(' • ');
    const mask = account.mask ? `••${account.mask}` : '—';
    const status = account.verification_status ? account.verification_status.replace(/_/g, ' ') : null;
    return `
      <div class="rounded-xl border border-neutral-800/70 bg-neutral-900/70 p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-medium text-neutral-100">${escapeHtml(label)}</div>
            <div class="text-xs text-neutral-500">${escapeHtml(typeLine || 'Type unavailable')}</div>
          </div>
          <div class="text-xs font-mono text-neutral-500">${escapeHtml(mask)}</div>
        </div>
        ${status ? `<div class="mt-2 text-xs text-neutral-500">Status: ${escapeHtml(status)}</div>` : ''}
      </div>
    `;
  }).join('');
  container.innerHTML = markup;
};

const setDetailsLoading = (cardEl, isLoading) => {
  const loading = cardEl.querySelector('[data-field="metrics-loading"]');
  const body = cardEl.querySelector('[data-field="metrics-body"]');
  if (loading) loading.classList.toggle('hidden', !isLoading);
  if (body) body.classList.toggle('hidden', isLoading);
};

const renderMetrics = (cardEl, metrics) => {
  const countEl = cardEl.querySelector('[data-field="transaction-count"]');
  const latestEl = cardEl.querySelector('[data-field="latest-transaction"]');
  const spendEl = cardEl.querySelector('[data-field="spend-30"]');
  const incomeEl = cardEl.querySelector('[data-field="income-30"]');
  const catsEl = cardEl.querySelector('[data-field="top-categories"]');
  if (!countEl || !latestEl || !spendEl || !incomeEl || !catsEl) return;

  if (!metrics || metrics.total === 0) {
    countEl.textContent = '0';
    latestEl.textContent = 'No transactions yet';
    spendEl.textContent = formatCurrency(0);
    incomeEl.textContent = formatCurrency(0);
    catsEl.textContent = 'Top categories: No activity yet';
    return;
  }

  countEl.textContent = metrics.total.toLocaleString();
  latestEl.textContent = metrics.lastTransaction ? `${fmtDate(metrics.lastTransaction)}${fmtRelative(metrics.lastTransaction) ? ` • ${fmtRelative(metrics.lastTransaction)}` : ''}` : '—';
  spendEl.textContent = formatCurrency(metrics.spend30 || 0);
  incomeEl.textContent = formatCurrency(metrics.income30 || 0);
  catsEl.textContent = metrics.topCategories && metrics.topCategories.length
    ? `Top categories: ${metrics.topCategories.map((c) => `${escapeHtml(c.name)} (${c.count})`).join(', ')}`
    : 'Top categories: —';
};

const updateNicknameUI = (cardEl, nickname, institutionName) => {
  const display = cardEl.querySelector('[data-field="display-name"]');
  const subtitle = cardEl.querySelector('[data-field="subtitle"]');
  const input = cardEl.querySelector('[data-input="nickname"]');
  const initialsEl = cardEl.querySelector('[data-field="avatar-initials"]');
  const accounts = cardEl.dataset.accountsCount ? Number(cardEl.dataset.accountsCount) : null;
  const fallback = institutionName || 'Unnamed connection';
  const displayName = nickname?.trim() || fallback;

  if (display) display.textContent = displayName;
  if (input) input.value = nickname || '';
  if (initialsEl) initialsEl.textContent = computeInitials(displayName);
  if (subtitle) {
    const subtitlePieces = [institutionName || 'Unknown institution'];
    if (Number.isFinite(accounts) && accounts > 0) subtitlePieces.push(`${accounts} account${accounts === 1 ? '' : 's'}`);
    subtitle.textContent = subtitlePieces.join(' • ');
  }
  cardEl.dataset.nickname = nickname || '';
};

const toggleNicknameEdit = (cardEl, show) => {
  const view = cardEl.querySelector('[data-section="nickname-display"]');
  const form = cardEl.querySelector('[data-form="nickname"]');
  if (!view || !form) return;
  view.classList.toggle('hidden', show);
  form.classList.toggle('hidden', !show);
  if (show) {
    const input = form.querySelector('[data-input="nickname"]');
    requestAnimationFrame(() => input?.focus());
  }
};

// -----------------------------------------------------------------------------
// Firestore data access
// -----------------------------------------------------------------------------

const fetchItems = async (uid) => {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const items = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    items.push({
      itemId: docSnap.id,
      institution_name: data.institution_name || data.institution || 'Unknown',
      institution_id: data.institution_id || null,
      last_synced: data.last_synced || null,
      linked_at: data.linked_at || null,
      nickname: data.nickname || '',
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      link_session_id: data.link_session_id || null,
    });
  });
  return items;
};

const refreshFromFirestore = async (cardEl) => {
  try {
    if (!CURRENT_UID) return;
    const itemId = cardEl?.dataset?.itemId;
    if (!itemId) return;
    const snap = await getDoc(doc(db, 'users', CURRENT_UID, 'plaid_items', itemId));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    if (data.last_synced) updateLastSynced(cardEl, data.last_synced);
    if (data.nickname !== undefined) updateNicknameUI(cardEl, data.nickname, data.institution_name || cardEl.dataset.institutionName || '');
    if (Array.isArray(data.accounts)) {
      cardEl.dataset.accountsCount = data.accounts.length;
      renderAccountsList(cardEl, data.accounts);
    }
  } catch (error) {
    console.warn('refreshFromFirestore failed', error);
  }
};

// -----------------------------------------------------------------------------
// Metrics + analytics helpers
// -----------------------------------------------------------------------------

const analyzeTransactionsSnapshot = (snap) => {
  if (!snap || snap.empty) {
    return { total: 0, lastTransaction: null, spend30: 0, income30: 0, topCategories: [] };
  }

  let total = 0;
  let lastTransaction = null;
  let spend30 = 0;
  let income30 = 0;
  const categories = new Map();
  const cutoff = Date.now() - 30 * DAY_MS;

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const dateValue = data.date || data.authorized_date || data.posted_at || data.timestamp;
    const txDate = toDate(dateValue);
    if (txDate && (!lastTransaction || txDate > lastTransaction)) {
      lastTransaction = txDate;
    }

    const amount = Number(data.amount);
    if (Number.isNaN(amount)) {
      total += 1;
      return;
    }

    if (txDate && txDate.getTime() >= cutoff) {
      if (amount < 0) income30 += Math.abs(amount);
      else spend30 += amount;
    }

    const categoryPath = Array.isArray(data.category) && data.category.length
      ? data.category[data.category.length - 1]
      : (data.personal_finance_category?.primary || 'Uncategorized');
    categories.set(categoryPath, (categories.get(categoryPath) || 0) + 1);
    total += 1;
  });

  const topCategories = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return { total, lastTransaction, spend30, income30, topCategories };
};

const loadAccountMetrics = async (uid, itemId) => {
  const cacheKey = `${uid}:${itemId}`;
  if (accountMetricsCache.has(cacheKey)) return accountMetricsCache.get(cacheKey);

  const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
  const q = query(txRef, orderBy('date', 'desc'), limit(500));
  const snap = await getDocs(q);
  const metrics = analyzeTransactionsSnapshot(snap);
  accountMetricsCache.set(cacheKey, metrics);
  return metrics;
};

const hydrateDetails = async (cardEl, { force = false } = {}) => {
  if (!CURRENT_UID) return;
  if (!force && cardEl.dataset.detailsLoaded === 'true') return;
  setDetailsLoading(cardEl, true);
  try {
    const metrics = await loadAccountMetrics(CURRENT_UID, cardEl.dataset.itemId);
    renderMetrics(cardEl, metrics);
  } catch (error) {
    console.error('Unable to load account metrics', error);
    renderMetrics(cardEl, null);
  } finally {
    setDetailsLoading(cardEl, false);
    cardEl.dataset.detailsLoaded = 'true';
  }
};

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

const openPlaidLink = async () => {
  await ensurePlaidLinkLoaded();
  const { link_token } = await callPlaidFn({ action: 'create_link_token' });

  return new Promise((resolve, reject) => {
    const handler = window.Plaid.create({
      token: link_token,
      onSuccess: async (public_token, metadata) => {
        try {
          await callPlaidFn({ action: 'exchange_public_token', public_token, metadata });
          resolve(metadata);
        } catch (error) {
          reject(error);
        }
      },
      onExit: (err) => {
        if (err) reject(err);
        else reject(new Error('Link flow closed'));
      },
    });
    handler.open();
  });
};

const persistNickname = async (itemId, nickname) => {
  if (!CURRENT_UID) throw new Error('Not signed in');
  const ref = doc(db, 'users', CURRENT_UID, 'plaid_items', itemId);
  await setDoc(ref, {
    nickname: nickname || null,
    nickname_updated_at: serverTimestamp(),
  }, { merge: true });
};

const syncItem = async (cardEl) => {
  const itemId = cardEl.dataset.itemId;
  setSyncingState(cardEl, true);
  try {
    const result = await callPlaidFn({ action: 'sync_transactions', item_id: itemId });
    await refreshFromFirestore(cardEl);
    accountMetricsCache.delete(`${CURRENT_UID}:${itemId}`);
    if (!cardEl.querySelector('[data-section="details"]').classList.contains('hidden')) {
      cardEl.dataset.detailsLoaded = '';
      await hydrateDetails(cardEl, { force: true });
    } else {
      cardEl.dataset.detailsLoaded = '';
    }
    showToast(`Synced ✓ Added: ${result.added ?? 0} • Updated: ${result.modified ?? 0} • Removed: ${result.removed ?? 0}`);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Sync failed');
  } finally {
    setSyncingState(cardEl, false);
  }
};

const unlinkItem = async (cardEl) => {
  const itemId = cardEl.dataset.itemId;
  if (!window.confirm('Unlink this account? You can relink later.')) return;

  const unlinkBtn = cardEl.querySelector('[data-action="unlink"]');
  setBtnBusy(unlinkBtn, 'Unlinking…', true);
  try {
    await callPlaidFn({ action: 'unlink_item', item_id: itemId });
    if (CURRENT_UID) {
      await deleteDoc(doc(db, 'users', CURRENT_UID, 'plaid_items', itemId)).catch(() => {});
    }
    cardEl.remove();
    if (!els.list.querySelector('.account-card')) renderEmptyState(true);
    showToast('Account unlinked.');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Unlink failed');
  } finally {
    setBtnBusy(unlinkBtn, '', false);
  }
};

// -----------------------------------------------------------------------------
// Card wiring
// -----------------------------------------------------------------------------

const attachAccountCardHandlers = (cardEl) => {
  const syncBtn = cardEl.querySelector('[data-action="sync"]');
  const unlinkBtn = cardEl.querySelector('[data-action="unlink"]');
  const toggleBtn = cardEl.querySelector('[data-action="toggle"]');
  const editBtn = cardEl.querySelector('[data-action="edit-nickname"]');
  const cancelBtn = cardEl.querySelector('[data-action="cancel-nickname"]');
  const nicknameForm = cardEl.querySelector('[data-form="nickname"]');

  syncBtn?.addEventListener('click', () => syncItem(cardEl));
  unlinkBtn?.addEventListener('click', () => unlinkItem(cardEl));

  toggleBtn?.addEventListener('click', async () => {
    const details = cardEl.querySelector('[data-section="details"]');
    const chevron = toggleBtn.querySelector('[data-icon="chevron"]');
    const isOpen = !details.classList.contains('hidden');
    if (isOpen) {
      details.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      chevron?.classList.remove('rotate-180');
    } else {
      details.classList.remove('hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
      chevron?.classList.add('rotate-180');
      await hydrateDetails(cardEl);
    }
  });

  editBtn?.addEventListener('click', () => {
    toggleNicknameEdit(cardEl, true);
    const input = cardEl.querySelector('[data-input="nickname"]');
    if (input) input.value = cardEl.dataset.nickname || '';
  });

  cancelBtn?.addEventListener('click', () => {
    toggleNicknameEdit(cardEl, false);
    const input = cardEl.querySelector('[data-input="nickname"]');
    if (input) input.value = cardEl.dataset.nickname || '';
  });

  nicknameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = nicknameForm.querySelector('[data-action="save-nickname"]');
    const input = nicknameForm.querySelector('[data-input="nickname"]');
    const value = input?.value?.trim() || '';
    setBtnBusy(saveBtn, 'Saving…', true);
    try {
      await persistNickname(cardEl.dataset.itemId, value);
      updateNicknameUI(cardEl, value, cardEl.dataset.institutionName || '');
      toggleNicknameEdit(cardEl, false);
      showToast('Nickname updated');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Unable to save nickname');
    } finally {
      setBtnBusy(saveBtn, '', false);
    }
  });

  const lastSyncedText = cardEl.querySelector('[data-field="last-synced"]')?.textContent?.toLowerCase();
  if (!lastSyncedText || lastSyncedText.includes('not synced')) {
    setTimeout(() => syncBtn?.click(), 600);
  }
};

const hydrateCardStatic = (cardEl, item) => {
  cardEl.dataset.institutionName = item.institution_name || 'Unknown institution';
  cardEl.dataset.accountsCount = Array.isArray(item.accounts) ? item.accounts.length : 0;
  cardEl.dataset.nickname = item.nickname || '';
  cardEl.dataset.detailsLoaded = '';
  updateNicknameUI(cardEl, item.nickname, item.institution_name || '');
  updateLastSynced(cardEl, item.last_synced || null);
  const linkedEl = cardEl.querySelector('[data-field="linked-at"]');
  if (linkedEl) linkedEl.textContent = item.linked_at ? `${fmtDate(item.linked_at)}${fmtRelative(item.linked_at) ? ` • ${fmtRelative(item.linked_at)}` : ''}` : '—';
  const instName = cardEl.querySelector('[data-field="institution-name"]');
  if (instName) instName.textContent = item.institution_name || 'Unknown';
  const instId = cardEl.querySelector('[data-field="institution-id"]');
  if (instId) instId.textContent = formatIdentifier(item.institution_id, 6);
  const itemId = cardEl.querySelector('[data-field="item-id"]');
  if (itemId) itemId.textContent = formatIdentifier(item.itemId, 6);
  const linkSession = cardEl.querySelector('[data-field="link-session"]');
  if (linkSession) linkSession.textContent = formatIdentifier(item.link_session_id, 6);
  renderAccountsList(cardEl, item.accounts || []);
  setDetailsLoading(cardEl, true);
};

// -----------------------------------------------------------------------------
// Rendering list
// -----------------------------------------------------------------------------

const renderList = async (uid) => {
  if (!els.list) {
    console.error('Missing #accounts-list element');
    showToast('Unable to find accounts container');
    return;
  }

  els.list.innerHTML = '';
  accountMetricsCache.clear();
  const items = await fetchItems(uid);
  if (!items.length) {
    renderEmptyState(true);
    return;
  }
  renderEmptyState(false);

  items.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = accountCardTemplate(item).trim();
    const cardEl = wrapper.firstElementChild;
    if (!cardEl) return;
    els.list.appendChild(cardEl);
    hydrateCardStatic(cardEl, item);
    attachAccountCardHandlers(cardEl);
  });
};

// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

const wireLinkButton = () => {
  if (!els.linkBtn) return;
  els.linkBtn.addEventListener('click', async () => {
    setBtnBusy(els.linkBtn, 'Opening Plaid…', true);
    try {
      await openPlaidLink();
      showToast('Account linked! Loading…');
      if (CURRENT_UID) await renderList(CURRENT_UID);
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Linking failed');
    } finally {
      setBtnBusy(els.linkBtn, '', false);
    }
  });
};

const init = () => {
  wireLinkButton();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      CURRENT_UID = null;
      els.list.innerHTML = '';
      renderEmptyState(true);
      return;
    }
    CURRENT_UID = user.uid;
    try {
      await renderList(user.uid);
    } catch (error) {
      console.error(error);
      showToast('Failed to load accounts');
    }
  });
};

document.addEventListener('DOMContentLoaded', init);