// --- Sync Button Animation & Loading State ---

if (els.syncAll) {
  els.syncAll.addEventListener('click', async () => {
    setSyncButtonLoading(true);
    try {
      // Simulate sync delay (replace with actual sync logic)
      await new Promise(r => setTimeout(r, 2000));
      toast('Sync complete!');
    } catch (e) {
      toast('Sync failed.');
    }
    setSyncButtonLoading(false);
  });
}
// public/Income/income.js
// ----------------------------------------------------
// Income page controller
//  - Syncs recent transactions from Plaid via Netlify function
//  - Loads transactions from Firestore and renders a filterable table
//  - Totals, pagination, CSV export
//  - Filters to INCOME only (amount < 0 in Plaid polarity)
// ----------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc, setDoc, addDoc,
  query, orderBy, limit, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PER_ITEM_LIMIT = 500;
const PAGE_SIZE = 25;
const AUTO_FIRST_SYNC = true;

const els = {
  syncAll: document.getElementById('sync-all-income'),
  manualOpen: document.getElementById('open-manual-income'),
  manualModal: document.getElementById('income-manual-modal'),
  manualOverlay: document.getElementById('income-manual-overlay'),
  manualClose: document.getElementById('income-manual-close'),
  manualForm: document.getElementById('income-manual-form'),
  manualError: document.getElementById('income-manual-error'),
  manualDate: document.getElementById('income-manual-date'),
  manualName: document.getElementById('income-manual-name'),
  manualAmount: document.getElementById('income-manual-amount'),
  manualCategory: document.getElementById('income-manual-category'),
  manualNotes: document.getElementById('income-manual-notes'),
  manualArchive: document.getElementById('income-manual-archive'),
  account: document.getElementById('account-filter'),
  start: document.getElementById('start-date'),
  end: document.getElementById('end-date'),
  search: document.getElementById('search-input'),
  minAmt: document.getElementById('min-amount'),
  maxAmt: document.getElementById('max-amount'),
  reset: document.getElementById('reset-filters'),
  exportBtn: document.getElementById('export-csv'),
  saveFilterBtn: document.getElementById('save-filter'),
  savedFilterSelect: document.getElementById('saved-filter-select'),
  presetThisMonth: document.getElementById('preset-this-month'),
  presetLastMonth: document.getElementById('preset-last-month'),
  presetYTD: document.getElementById('preset-ytd'),
  preset90d: document.getElementById('preset-90d'),
  presetSelect: document.getElementById('preset-select'),

  count: document.getElementById('tx-count'),
  incomeTotal: document.getElementById('totals-income'),
  empty: document.getElementById('tx-empty'),
  tbody: document.getElementById('tx-table-body'),
  prev: document.getElementById('pagination-prev'),
  next: document.getElementById('pagination-next'),
  pageLabel: document.getElementById('pagination-label'),
  toast: document.getElementById('toast'),
  archiveToggle: document.getElementById('toggle-income-archive'),
  archiveIndicator: document.getElementById('income-archive-indicator'),
};

let UID = null;
let ALL_ITEMS = [];
let ALL_TX = [];
let FILTERED = [];
let PAGE = 1;
let VIEW_ARCHIVE = false;
let OVERRIDES = new Map();
let manualMode = 'create';
let editingRecord = null;
let editingOriginal = null;

function parseLocalDateEpoch(str) {
  if (!str) return 0;
  if (typeof str !== 'string') {
    const d = (typeof str?.toDate === 'function') ? str.toDate() : new Date(str);
    const t = d?.getTime?.() ?? NaN;
    return Number.isNaN(t) ? 0 : t;
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
  const t = Date.parse(str);
  return Number.isNaN(t) ? 0 : t;
}
function formatLocalDate(epoch) { const dt = new Date(epoch || 0); return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(); }
function fmtMoney(n, currency = 'USD') { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); } catch { return `$${(n||0).toFixed(2)}`; } }
function escapeHtml(s) { return (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g,' '); }
function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function toast(msg) { if (!els.toast) return console.log('[toast]', msg); els.toast.textContent = msg; els.toast.classList.remove('opacity-0','pointer-events-none'); els.toast.classList.add('opacity-100'); setTimeout(()=>{ els.toast.classList.add('opacity-0','pointer-events-none'); }, 2000); }

function setBtnBusy(btn, text, busy = true) {
  const label = btn.querySelector('.sync-btn-label');
  if (!btn) return;
  if (busy) {
    btn.classList.add('syncing');
    btn.setAttribute('aria-busy', 'true');
    if (label) label.textContent = 'Syncing...';
  } else {
    btn.classList.remove('syncing');
    btn.removeAttribute('aria-busy');
    if (label) label.textContent = 'Sync All';
  }
}

function showManualError(message) {
  if (!els.manualError) return;
  if (!message) {
    els.manualError.textContent = '';
    els.manualError.classList.add('hidden');
  } else {
    els.manualError.textContent = message;
    els.manualError.classList.remove('hidden');
  }
}

function resetManualForm() {
  if (!els.manualForm) return;
  els.manualForm.reset();
  const today = new Date().toISOString().slice(0, 10);
  if (els.manualDate) els.manualDate.value = today;
  if (els.manualCategory) els.manualCategory.value = '';
  showManualError('');
}

let manualKeyHandler = null;

function overrideKey(itemId, txId) {
  return `${itemId}__${txId}`;
}

function applyOverrideToIncomeRow(row, override) {
  if (!override) return;
  if (override.name) row.name = override.name;
  if (override.date) {
    row.date = override.date;
    row._epoch = parseLocalDateEpoch(override.date);
  }
  if (typeof override.amount === 'number' && !Number.isNaN(override.amount)) {
    row.amount = -Math.abs(override.amount);
  }
  if (override.category) row.categoryUser = override.category;
  if (override.notes) row.notes = override.notes;
  row.isoCurrency = override.currency || row.isoCurrency;
  row.archived = !!override.archived;
  row.override = true;
  row.overrideDocId = override.id;
  row.overrideCreatedAt = override.createdAt || null;
  row.overrideUpdatedAt = override.updatedAt || null;
}

function openManualModal(record = null) {
  if (!els.manualModal) return;

  manualMode = record ? 'edit' : 'create';
  editingRecord = record ? { ...record } : null;
  editingOriginal = record ? { ...record } : null;
  resetManualForm();

  const titleEl = document.getElementById('income-manual-title');
  const subtitleEl = document.getElementById('income-manual-subtitle');
  const submitBtn = document.getElementById('income-manual-submit');

  if (manualMode === 'edit') {
    const isManual = !!record?.manual;
    const isArchived = !!record?.archived;
    if (titleEl) titleEl.textContent = isManual ? 'Edit manual income' : 'Edit income';
    if (subtitleEl) subtitleEl.textContent = isManual
      ? 'Update this manual inflow or move it to the archive.'
      : 'Adjust the synced transaction or hide it from your active totals.';
    if (submitBtn) {
      submitBtn.textContent = 'Save changes';
      submitBtn.dataset.prevText = 'Save changes';
    }

    if (els.manualName) els.manualName.value = record?.name || '';
    if (els.manualAmount) {
      const amountVal = Math.abs(Number(record?.amount || 0));
      els.manualAmount.value = amountVal ? amountVal.toFixed(2) : '';
    }
    if (els.manualDate) {
      const iso = (record?.date && record.date.length >= 10) ? record.date.slice(0, 10)
        : (record?._epoch ? new Date(record._epoch).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
      els.manualDate.value = iso;
    }
    if (els.manualCategory) els.manualCategory.value = record?.categoryUser || record?.categoryAuto || '';
    if (els.manualNotes) els.manualNotes.value = record?.notes || '';

    if (els.manualArchive) {
      els.manualArchive.classList.remove('hidden');
      els.manualArchive.textContent = isArchived ? 'Restore income' : 'Archive income';
    }
  } else {
    if (titleEl) titleEl.textContent = 'Record manual income';
    if (subtitleEl) subtitleEl.textContent = 'Capture extra deposits or earnings to keep income totals accurate.';
    if (submitBtn) {
      submitBtn.textContent = 'Save income';
      submitBtn.dataset.prevText = 'Save income';
    }
    if (els.manualArchive) els.manualArchive.classList.add('hidden');
  }

  els.manualModal.classList.add('vb-modal--open');
  els.manualModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  manualKeyHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeManualModal();
    }
  };
  document.addEventListener('keydown', manualKeyHandler, true);
  setTimeout(() => { els.manualName?.focus(); }, 20);
}

function closeManualModal() {
  if (!els.manualModal) return;
  els.manualModal.classList.remove('vb-modal--open');
  els.manualModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  manualMode = 'create';
  editingRecord = null;
  editingOriginal = null;
  showManualError('');
  els.manualArchive?.classList.add('hidden');
  if (manualKeyHandler) {
    document.removeEventListener('keydown', manualKeyHandler, true);
    manualKeyHandler = null;
  }
}

// ...existing code...

// ...existing code...

async function getIdToken() { const u = auth.currentUser; if (!u) throw new Error('Not signed in'); return u.getIdToken(true); }
async function callPlaidFn(payload) {
  const token = await getIdToken();
  const res = await fetch('/.netlify/functions/plaid', { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Plaid function failed (${res.status}) ${text}`);
  try { return JSON.parse(text); } catch { return { ok: true }; }
}
async function listPlaidItems(uid) { const ref = collection(db, 'users', uid, 'plaid_items'); const snap = await getDocs(query(ref, orderBy('institution_name'))); return snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })); }
async function syncAllItems(uid) {
  const items = await listPlaidItems(uid);
  let added=0, modified=0, removed=0, count=0;
  for (const it of items) {
    const res = await callPlaidFn({ action: 'sync_transactions', item_id: it.id });
    added += Number(res?.added || 0); modified += Number(res?.modified || 0); removed += Number(res?.removed || 0); count++;
  }
  return { added, modified, removed, count };
}
async function fetchItemTransactions(uid, itemId, perItemLimit = PER_ITEM_LIMIT) {
  const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
  const snap = await getDocs(query(txRef, orderBy('date', 'desc'), limit(perItemLimit)));
  const rows = [];
  snap.docs.forEach(d => {
    const x = d.data() || {};
    rows.push({
      id: d.id,
      itemId,
      name: x.name || x.merchant_name || 'Transaction',
      merchant: x.merchant_name || '',
      amount: Number(x.amount || 0),
      isoCurrency: x.iso_currency_code || 'USD',
      pending: !!x.pending,
      _epoch: parseLocalDateEpoch(x.date),
      categoryAuto: (Array.isArray(x.category) ? x.category.join(' / ') : (x.personal_finance_category?.primary || '')) || '',
      categoryUser: x.categoryUser || '',
  raw: x,
    });
  });
  return rows;
}

async function fetchManualTransactions(uid, type = 'income') {
  try {
    const baseRef = collection(db, 'users', uid, 'manual_entries');
    const qManual = query(baseRef, orderBy('createdAt', 'desc'), limit(PER_ITEM_LIMIT));
    const snap = await getDocs(qManual);
    const rows = [];
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if ((data.type || 'income') !== type) return;
      const iso = data.date || new Date().toISOString().slice(0, 10);
      const epoch = parseLocalDateEpoch(iso);
      const rawAmount = Number(data.amount || 0);
      const amount = -Math.abs(rawAmount);
      rows.push({
        id: docSnap.id,
        itemId: 'manual',
        institution_name: data.account || 'Manual entry',
        _epoch: epoch,
        name: data.name || data.description || 'Manual income',
        amount,
        isoCurrency: data.currency || 'USD',
        pending: false,
        merchant: '',
        categoryAuto: '',
        categoryUser: data.category || '',
        raw: data,
        manual: true,
        archived: !!data.archived,
        notes: data.notes || '',
      });
    });
    return rows;
  } catch (err) {
    console.error('Failed to load manual income', err);
    return [];
  }
}

async function fetchOverrides(uid, type = 'income') {
  try {
    const ref = collection(db, 'users', uid, 'transaction_overrides');
    const snap = await getDocs(ref);
    const rows = [];
    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if ((data.type || 'income') !== type) return;
      const id = docSnap.id || '';
      if (!id.includes('__')) return;
      const [itemId, txId] = id.split('__');
      if (!itemId || !txId) return;
      const amount = Number(data.amount);
      rows.push({
        id,
        itemId,
        txId,
        name: data.name || '',
        amount: Number.isFinite(amount) ? Math.abs(amount) : null,
        date: data.date || '',
        category: data.category || '',
        notes: data.notes || '',
        archived: !!data.archived,
        currency: data.currency || 'USD',
        updatedAt: data.updatedAt || null,
        createdAt: data.createdAt || null,
      });
    });
    return rows;
  } catch (err) {
    console.error('Failed to load income overrides', err);
    return [];
  }
}

async function loadAllTransactions(uid) {
  ALL_ITEMS = await listPlaidItems(uid);
  if (els.account) {
    els.account.innerHTML = '<option value="">All accounts</option>' + ALL_ITEMS.map(it => `<option value="${it.id}">${escapeHtml(it.institution_name)}</option>`).join('');
    const manualOpt = document.createElement('option');
    manualOpt.value = 'manual';
    manualOpt.textContent = 'Manual entries';
    els.account.appendChild(manualOpt);
  }
  let all = [];
  for (const it of ALL_ITEMS) {
    const rows = await fetchItemTransactions(uid, it.id);
    rows.forEach(r => r.institution_name = it.institution_name);
    all = all.concat(rows);
  }
  // Detect likely income transactions (deposits/credits) and flag them
  try {
    const incomeRe = /deposit|payroll|paycheck|direct deposit|salary|refund|interest|ach credit|credited|deposit -|deposit:|payroll deposit|paycheck/i;
    all = all.map(r => {
      r.isLikelyIncome = false;
      try {
        const txt = `${r.name||''} ${r.merchant||''} ${r.categoryAuto||''} ${r.categoryUser||''}`.toLowerCase();
        if (incomeRe.test(txt)) r.isLikelyIncome = true;
        // Plaid may include metadata indicating a credit; check common fields
        const raw = r.raw || {};
        const txnType = (raw.transaction_type || '').toString().toLowerCase();
        if (txnType.includes('credit') || (raw.payment_meta && Object.values(raw.payment_meta).join(' ').toLowerCase().includes('credit'))) r.isLikelyIncome = true;
        // Some banks use positive amounts for inflows; detect amount polarity heuristically
        if (!r.isLikelyIncome && Number(r.amount) > 0 && /(deposit|credit|payroll|direct)/i.test(txt)) r.isLikelyIncome = true;
      } catch (e) { /* ignore */ }
      return r;
    });
  } catch (e) { console.warn('Income detection failed', e); }
  const manual = await fetchManualTransactions(uid, 'income');
  all = all.concat(manual);
  const overrides = await fetchOverrides(uid, 'income');
  OVERRIDES = new Map(overrides.map(o => [overrideKey(o.itemId, o.txId), o]));
  all.forEach(row => {
    if (typeof row.archived !== 'boolean') row.archived = false;
    if (typeof row.notes !== 'string') row.notes = '';
    row.override = !!row.override;
    row.manual = !!row.manual;
    if (!row.manual) {
      const key = overrideKey(row.itemId, row.id);
      const override = OVERRIDES.get(key);
      if (override) {
        applyOverrideToIncomeRow(row, override);
        row.notes = override.notes || row.notes;
      }
    }
  });
  all.sort((a,b) => b._epoch - a._epoch);
  ALL_TX = all;
  applyFilters();
}

function readFilters() {
  const account = els.account?.value || '';
  const start = els.start?.value ? parseLocalDateEpoch(els.start.value) : null;
  const end = els.end?.value ? parseLocalDateEpoch(els.end.value) : null;
  const q = (els.search?.value || '').toLowerCase();
  const minAmt = els.minAmt?.value === '' ? null : Number(els.minAmt.value);
  const maxAmt = els.maxAmt?.value === '' ? null : Number(els.maxAmt.value);
  return { account, start, end, q, minAmt, maxAmt };
}

async function loadSavedFilters(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'filters'));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const filters = data.filters || {};
    if (els.savedFilterSelect) {
      els.savedFilterSelect.innerHTML = '<option value="">—</option>' + Object.keys(filters).map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join('');
    }
    return filters;
  } catch { return {}; }
}

async function saveCurrentFilter(uid) {
  const name = prompt('Save filter as:');
  if (!name) return;
  const f = readFilters();
  const patch = { };
  patch[`filters.${name}`] = { type: 'both', ...f };
  await setDoc(doc(db, 'users', uid, 'settings', 'filters'), patch, { merge: true });
  await loadSavedFilters(uid);
  toast('Saved');
}

async function applySavedFilter(uid, name) {
  if (!name) return;
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'filters'));
  const data = snap.exists() ? (snap.data() || {}) : {};
  const f = (data.filters || {})[name];
  if (!f) return;
  if (els.account) els.account.value = f.account || '';
  if (els.start) els.start.value = f.start || '';
  if (els.end) els.end.value = f.end || '';
  if (els.search) els.search.value = f.q || '';
  if (els.minAmt) els.minAmt.value = (f.minAmt ?? '') === null ? '' : (f.minAmt ?? '');
  if (els.maxAmt) els.maxAmt.value = (f.maxAmt ?? '') === null ? '' : (f.maxAmt ?? '');
  applyFilters();
}

function setDateInputs(startStr, endStr) {
  if (els.start) els.start.value = startStr || '';
  if (els.end) els.end.value = endStr || '';
}
function yyyy_mm_dd(d) { return d.toISOString().slice(0,10); }
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }
async function applyPreset(preset) {
  const now = new Date();
  if (preset === 'this') {
    setDateInputs(yyyy_mm_dd(firstOfMonth(now)), yyyy_mm_dd(lastOfMonth(now)));
  } else if (preset === 'last') {
    const d = new Date(now.getFullYear(), now.getMonth()-1, 1);
    setDateInputs(yyyy_mm_dd(d), yyyy_mm_dd(lastOfMonth(d)));
  } else if (preset === 'ytd') {
    const start = new Date(now.getFullYear(), 0, 1);
    setDateInputs(yyyy_mm_dd(start), yyyy_mm_dd(now));
  } else if (preset === '90d') {
    const start = new Date(now.getTime() - 89*24*3600*1000);
    setDateInputs(yyyy_mm_dd(start), yyyy_mm_dd(now));
  }
  setActivePreset(preset);
  if (UID) {
    try { await setDoc(doc(db, 'users', UID, 'settings', 'filters'), { presets: { income: preset } }, { merge: true }); } catch {}
  }
  applyFilters();
}

function setActivePreset(name) {
  const map = {
    'this': els.presetThisMonth,
    'last': els.presetLastMonth,
    'ytd': els.presetYTD,
    '90d': els.preset90d,
  };
  Object.entries(map).forEach(([k, btn]) => {
    if (!btn) return;
    btn.classList.toggle('border-[var(--neon)]', k === name);
    btn.setAttribute('aria-pressed', String(k === name));
  });
}

function updatePresetActiveFromDates() {
  const now = new Date();
  const ymd = (d)=> d.toISOString().slice(0,10);
  const startStr = els.start?.value || '';
  const endStr = els.end?.value || '';
  let active = '';
  if (startStr && endStr) {
    if (startStr === ymd(firstOfMonth(now)) && endStr === ymd(lastOfMonth(now))) active = 'this';
    else {
      const last = new Date(now.getFullYear(), now.getMonth()-1, 1);
      if (startStr === ymd(last) && endStr === ymd(lastOfMonth(last))) active = 'last';
      else if (startStr === ymd(new Date(now.getFullYear(),0,1)) && endStr === ymd(now)) active = 'ytd';
      else {
        const past90 = new Date(now.getTime() - 89*24*3600*1000);
        if (startStr === ymd(past90) && endStr === ymd(now)) active = '90d';
      }
    }
  }
  setActivePreset(active);
}

function applyFilters() {
  const { account, start, end, q, minAmt, maxAmt } = readFilters();
  let out = ALL_TX;
  if (account) out = out.filter(r => r.itemId === account);
  if (start != null) out = out.filter(r => r._epoch && r._epoch >= start);
  if (end != null) out = out.filter(r => r._epoch && r._epoch <= end + (24*3600*1000 - 1));
  if (q) out = out.filter(r => `${(r.name||'').toLowerCase()} ${(r.merchant||'').toLowerCase()} ${(r.categoryAuto||'').toLowerCase()} ${(r.categoryUser||'').toLowerCase()} ${(r.institution_name||'').toLowerCase()}`.includes(q));
  if (minAmt != null && !Number.isNaN(minAmt)) out = out.filter(r => Math.abs(r.amount) >= minAmt);
  if (maxAmt != null && !Number.isNaN(maxAmt)) out = out.filter(r => Math.abs(r.amount) <= maxAmt);
  // Income: include inflows (negative amounts) OR transactions detected as likely income
  out = out.filter(r => (typeof r.amount === 'number' && r.amount < 0) || r.isLikelyIncome === true);
  if (VIEW_ARCHIVE) out = out.filter(r => r.archived);
  else out = out.filter(r => !r.archived);
  FILTERED = out;
  PAGE = 1;
  render();
}

function paginate(list, page, size) { const start = (page - 1) * size; return list.slice(start, start + size); }

function render() {
  const totalCount = FILTERED.length;
  const income = FILTERED.reduce((s, r) => s + Math.abs(r.amount), 0);
  if (els.count) els.count.textContent = `${totalCount} row${totalCount === 1 ? '' : 's'}`;
  if (els.incomeTotal) els.incomeTotal.textContent = fmtMoney(income);
  if (els.empty) els.empty.style.display = totalCount ? 'none' : '';
  if (els.tbody) {
    els.tbody.innerHTML = '';
    const rows = paginate(FILTERED, PAGE, PAGE_SIZE);
    for (const r of rows) els.tbody.appendChild(renderRow(r));
  }
  // Update date-range label chip
  const chip = document.getElementById('date-range-label');
  if (chip) {
    const now = new Date();
    const startStr = els.start?.value || '';
    const endStr = els.end?.value || '';
    let label = '';
    const ymd = (d)=> d.toISOString().slice(0,10);
    const firstOf = (d)=> new Date(d.getFullYear(), d.getMonth(), 1);
    const lastOf = (d)=> new Date(d.getFullYear(), d.getMonth()+1, 0);
    if (startStr && endStr) {
      if (startStr === ymd(firstOf(now)) && endStr === ymd(lastOf(now))) label = 'This month';
      else {
        const last = new Date(now.getFullYear(), now.getMonth()-1, 1);
        if (startStr === ymd(last) && endStr === ymd(lastOf(last))) label = 'Last month';
      }
    }
    chip.textContent = label;
    chip.classList.toggle('hidden', !label);
  }
  if (els.pageLabel) {
    const first = Math.min(1 + (PAGE - 1) * PAGE_SIZE, totalCount || 0);
    const last = Math.min(PAGE * PAGE_SIZE, totalCount || 0);
    els.pageLabel.textContent = totalCount ? `${first}-${last} of ${totalCount}` : '0 of 0';
  }
  if (els.prev) els.prev.disabled = PAGE <= 1;
  if (els.next) els.next.disabled = PAGE * PAGE_SIZE >= totalCount;

  // Category donut (income only)
  try {
    const donut = document.getElementById('inc-cat-donut');
    const legend = document.getElementById('inc-cat-legend');
    if (donut && legend) {
      const agg = {};
      for (const r of FILTERED) {
        const cat = (r.categoryUser || r.categoryAuto || 'Uncategorized');
        agg[cat] = (agg[cat] || 0) + Math.abs(Number(r.amount || 0));
      }
      const entries = Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const total = entries.reduce((s, [,v]) => s+v, 0) || 1;
      const colors = ['#10b981','#3b82f6','#8b5cf6','#eab308','#ec4899','#f59e0b','#14b8a6','#ef4444'];
      let acc = 0; const stops = entries.map(([k,v],i)=>{ const pct=v/total*100; const s=acc; acc+=pct; return `${colors[i%colors.length]} ${s.toFixed(1)}% ${acc.toFixed(1)}%`; });
      donut.style.background = `conic-gradient(${stops.join(',')})`;
      legend.innerHTML = entries.map(([k,v],i)=>`<div class=\"flex items-center gap-2\"><span class=\"inline-block h-3 w-3 rounded\" style=\"background:${colors[i%colors.length]}\"></span><span>${(k||'')}</span><span class=\"ml-auto text-neutral-400\">${(new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'})).format(v)}</span></div>`).join('');
    }
  } catch {}
}

function renderRow(r) {
  const tr = document.createElement('tr');
  tr.className = 'border-b border-neutral-800 hover:bg-neutral-900';

  const badges = [];
  if (r.manual) badges.push('<span class="vb-badge vb-badge--manual">Manual</span>');
  if (!r.manual && r.override) badges.push('<span class="vb-badge vb-badge--edit">Edited</span>');
  if (r.archived) badges.push('<span class="vb-badge vb-badge--archived">Archived</span>');
  const badgeHtml = badges.length ? `<div class="mt-1 flex flex-wrap gap-1">${badges.join('')}</div>` : '';
  const accountHtml = `<div class="flex flex-col gap-1"><span>${escapeHtml(r.institution_name || '')}</span>${badgeHtml}</div>`;

  const amountCls = 'text-emerald-400';
  const categoryText = r.categoryUser || r.categoryAuto || '';
  const merchantHtml = r.merchant
    ? `<a class="hover:underline" href="/Merchants/merchant.html?name=${encodeURIComponent(r.merchant)}">${escapeHtml(r.merchant)}</a>`
    : '';
  const notesHtml = r.notes ? `<div class="text-xs text-neutral-500 mt-1">${escapeHtml(r.notes)}</div>` : '';
  const statusText = r.pending ? 'Pending' : 'Posted';

  tr.innerHTML = `
    <td class="px-4 py-3 align-top text-sm text-neutral-300">${accountHtml}</td>
    <td class="px-4 py-3 align-top whitespace-nowrap text-sm text-neutral-300">${escapeHtml(formatLocalDate(r._epoch))}</td>
    <td class="px-4 py-3 align-top text-sm font-medium text-neutral-100">${escapeHtml(r.name || '')}${notesHtml}</td>
    <td class="px-4 py-3 align-top whitespace-nowrap text-sm ${amountCls} text-right">${escapeHtml(fmtMoney(Math.abs(r.amount), r.isoCurrency))}</td>
    <td class="px-4 py-3 align-top whitespace-nowrap text-sm text-neutral-300">${merchantHtml}</td>
    <td class="px-4 py-3 align-top text-sm text-neutral-300">${escapeHtml(categoryText)}</td>
    <td class="px-4 py-3 align-top whitespace-nowrap text-xs text-neutral-400">${statusText}</td>
    <td class="px-4 py-3 align-top text-right">
      <button class="btn-edit px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-900">Edit</button>
    </td>
  `;

  const editBtn = tr.querySelector('.btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => openManualModal({ ...r }));
  }

  return tr;
}

function toCSV(rows) {
  const headers = ['Date','Name','Amount','Currency','Account','Merchant','Category','Pending'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = [ new Date(r._epoch||0).toISOString().slice(0,10), csvCell(r.name), csvCell(Math.abs(r.amount)), csvCell(r.isoCurrency), csvCell(r.institution_name), csvCell(r.merchant||''), csvCell(r.categoryUser||r.categoryAuto||''), csvCell(r.pending?'true':'false') ].join(',');
    lines.push(line);
  }
  return lines.join('\n');
}
function csvCell(v) { const s = (v ?? '').toString(); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function download(filename, text) { const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }

function wireUI() {
  const rerun = () => applyFilters();
  els.account?.addEventListener('change', rerun);
  els.start?.addEventListener('change', rerun);
  els.end?.addEventListener('change', rerun);
  els.search?.addEventListener('input', debounce(rerun, 200));
  els.minAmt?.addEventListener('input', debounce(rerun, 200));
  els.maxAmt?.addEventListener('input', debounce(rerun, 200));
  els.reset?.addEventListener('click', () => {
    if (els.account) els.account.value = '';
    if (els.start) els.start.value = '';
    if (els.end) els.end.value = '';
    if (els.search) els.search.value = '';
    if (els.minAmt) els.minAmt.value = '';
    if (els.maxAmt) els.maxAmt.value = '';
    applyFilters();
  });
  els.exportBtn?.addEventListener('click', () => { const csv = toCSV(FILTERED); const today = new Date().toISOString().slice(0,10); download(`income_${today}.csv`, csv); });
  els.saveFilterBtn?.addEventListener('click', () => { if (UID) saveCurrentFilter(UID).catch(console.error); });
  els.savedFilterSelect?.addEventListener('change', () => { if (UID) applySavedFilter(UID, els.savedFilterSelect.value).catch(console.error); });
  els.presetThisMonth?.addEventListener('click', () => applyPreset('this'));
  els.presetLastMonth?.addEventListener('click', () => applyPreset('last'));
  els.presetYTD?.addEventListener('click', () => applyPreset('ytd'));
  els.preset90d?.addEventListener('click', () => applyPreset('90d'));
  els.start?.addEventListener('change', updatePresetActiveFromDates);
  els.end?.addEventListener('change', updatePresetActiveFromDates);
  els.presetSelect?.addEventListener('change', () => {
    const v = els.presetSelect.value;
    if (!v) return;
  if (v === 'custom') { localStorage.removeItem('vb_income_preset'); setActivePreset(''); return; }
    localStorage.setItem('vb_income_preset', v);
    applyPreset(v);
  });
  els.prev?.addEventListener('click', () => { if (PAGE > 1) { PAGE--; render(); } });
  els.next?.addEventListener('click', () => { const total = FILTERED.length; if (PAGE * PAGE_SIZE < total) { PAGE++; render(); } });
  els.syncAll?.setAttribute('title', 'Sync accounts');
  els.syncAll?.setAttribute('aria-label', 'Sync accounts');
  els.syncAll.classList.add('sync-btn');
  if (els.syncAll && !els.syncAll.querySelector('.sync-icon')) els.syncAll.innerHTML = '<img src="/images/sync-icon.svg" alt="Sync" class="sync-icon">';
  els.syncAll?.addEventListener('click', async () => {
    if (!UID) return;
    setBtnBusy(els.syncAll, true);
    try {
      const { added, modified, removed, count } = await syncAllItems(UID);
      toast(`Synced ${count} account${count===1?'':'s'}  +${added} ~${modified} -${removed}`);
      await loadAllTransactions(UID);
    } catch (e) {
      console.error(e);
      toast('Sync failed');
    } finally {
      setBtnBusy(els.syncAll, false);
    }
    try {
      const { added, modified, removed, count } = await syncAllItems(UID);
  toast(`Synced ${count} account${count===1?'':'s'}  +${added} ~${modified} -${removed}`);
      await loadAllTransactions(UID);
    } catch (e) {
      console.error(e);
      toast('Sync failed');
    } finally {
      setBtnBusy(els.syncAll, false);
    }
  });

  els.manualOpen?.addEventListener('click', () => openManualModal());
  els.manualClose?.addEventListener('click', () => closeManualModal());
  els.manualOverlay?.addEventListener('click', () => closeManualModal());
  els.manualForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!UID) {
      showManualError('Sign in to add manual income.');
      return;
    }
    const name = (els.manualName?.value || '').trim();
    const amountVal = parseFloat(els.manualAmount?.value || '');
    const dateVal = els.manualDate?.value || '';
    const categoryVal = (els.manualCategory?.value || '').trim();
    const notesVal = (els.manualNotes?.value || '').trim();

    if (!name) { showManualError('Enter a description for the income.'); els.manualName?.focus(); return; }
    if (!Number.isFinite(amountVal) || amountVal <= 0) { showManualError('Enter a positive amount.'); els.manualAmount?.focus(); return; }
    if (!dateVal) { showManualError('Select a date for the income.'); els.manualDate?.focus(); return; }

    showManualError('');
    const submitBtn = document.getElementById('income-manual-submit');
    if (submitBtn) submitBtn.dataset.prevText = manualMode === 'create' ? 'Save income' : 'Save changes';
    setBtnBusy(submitBtn, manualMode === 'create' ? 'Recording…' : 'Saving…', true);
    try {
      const normalizedAmount = Number(Math.abs(amountVal).toFixed(2));
      if (manualMode === 'create') {
        const payload = {
          type: 'income',
          name,
          amount: normalizedAmount,
          date: dateVal,
          category: categoryVal,
          notes: notesVal,
          currency: 'USD',
          archived: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          account: 'Manual entry',
        };
        await addDoc(collection(db, 'users', UID, 'manual_entries'), payload);
        closeManualModal();
        toast('Income recorded');
      } else if (editingRecord?.manual) {
        const ref = doc(db, 'users', UID, 'manual_entries', editingRecord.id);
        await setDoc(ref, {
          name,
          amount: normalizedAmount,
          date: dateVal,
          category: categoryVal,
          notes: notesVal,
          archived: !!editingRecord.archived,
          updatedAt: Timestamp.now(),
        }, { merge: true });
        closeManualModal();
        toast('Income updated');
      } else if (editingRecord) {
        const key = overrideKey(editingRecord.itemId, editingRecord.id);
        const ref = doc(db, 'users', UID, 'transaction_overrides', key);
        const payload = {
          type: 'income',
          name,
          amount: normalizedAmount,
          date: dateVal,
          category: categoryVal,
          notes: notesVal,
          currency: 'USD',
          archived: !!editingRecord.archived,
          updatedAt: Timestamp.now(),
        };
        if (!editingRecord.override) {
          payload.createdAt = Timestamp.now();
          if (!payload.category) payload.category = editingOriginal?.categoryUser || editingOriginal?.categoryAuto || '';
          if (!payload.name) payload.name = editingOriginal?.name || '';
          if (!payload.date) payload.date = editingOriginal?.date || (editingOriginal?._epoch ? new Date(editingOriginal._epoch).toISOString().slice(0, 10) : dateVal);
          if (!payload.notes) payload.notes = editingOriginal?.notes || '';
          if (!Number.isFinite(payload.amount) || !payload.amount) payload.amount = Math.abs(Number(editingOriginal?.amount || 0));
          payload.currency = editingOriginal?.isoCurrency || payload.currency;
        }
        await setDoc(ref, payload, { merge: true });
        closeManualModal();
        toast('Income updated');
      }
      await loadAllTransactions(UID);
    } catch (error) {
      console.error('Manual income failed', error);
      showManualError('Could not save income. Please try again.');
    } finally {
      setBtnBusy(submitBtn, '', false);
    }
  });

  els.manualArchive?.addEventListener('click', async () => {
    if (!UID || !editingRecord) return;
    const newArchived = !editingRecord.archived;
    const archiveBtn = els.manualArchive;
    if (!archiveBtn) return;
    archiveBtn.disabled = true;
    archiveBtn.textContent = newArchived ? 'Archiving…' : 'Restoring…';
    try {
      if (editingRecord.manual) {
        const ref = doc(db, 'users', UID, 'manual_entries', editingRecord.id);
        await setDoc(ref, { archived: newArchived, updatedAt: Timestamp.now() }, { merge: true });
      } else {
        const key = overrideKey(editingRecord.itemId, editingRecord.id);
        const ref = doc(db, 'users', UID, 'transaction_overrides', key);
        const payload = {
          type: 'income',
          archived: newArchived,
          updatedAt: Timestamp.now(),
        };
        if (!editingRecord.override) {
          payload.createdAt = Timestamp.now();
          payload.name = editingOriginal?.name || '';
          payload.amount = Math.abs(Number(editingOriginal?.amount || 0));
          payload.date = editingOriginal?.date || (editingOriginal?._epoch ? new Date(editingOriginal._epoch).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
          payload.category = editingOriginal?.categoryUser || editingOriginal?.categoryAuto || '';
          payload.notes = editingOriginal?.notes || '';
          payload.currency = editingOriginal?.isoCurrency || 'USD';
        }
        await setDoc(ref, payload, { merge: true });
      }
      closeManualModal();
      toast(newArchived ? 'Income archived' : 'Income restored');
      await loadAllTransactions(UID);
    } catch (error) {
      console.error('Archive toggle failed', error);
      showManualError('Unable to update archive state.');
      archiveBtn.disabled = false;
      archiveBtn.textContent = newArchived ? 'Archive income' : 'Restore income';
      return;
    }
  });

  els.archiveToggle?.addEventListener('click', () => {
    VIEW_ARCHIVE = !VIEW_ARCHIVE;
    if (els.archiveToggle) {
      els.archiveToggle.textContent = VIEW_ARCHIVE ? 'Back to income' : 'View archive';
      els.archiveToggle.setAttribute('aria-pressed', String(VIEW_ARCHIVE));
    }
    if (els.archiveIndicator) {
      els.archiveIndicator.classList.toggle('hidden', !VIEW_ARCHIVE);
      els.archiveIndicator.textContent = VIEW_ARCHIVE ? 'Viewing archived income' : '';
    }
    applyFilters();
  });
}

function init() {
  wireUI();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; UID = user.uid;
    try {
      if (AUTO_FIRST_SYNC) { if (els.syncAll) { els.syncAll.disabled = true; els.syncAll.innerHTML = '<img src="/images/sync-icon.svg" alt="Syncing" class="sync-icon spinning">'; } try { await syncAllItems(UID); } catch(e){ console.warn('Auto first sync failed', e); } finally { if (els.syncAll) { els.syncAll.disabled = false; els.syncAll.innerHTML = '<img src="/images/sync-icon.svg" alt="Sync" class="sync-icon">'; } } }
      await loadAllTransactions(UID);
      await loadSavedFilters(UID);
      toast('Income loaded');
      let applied = false;
      try {
        const snap = await getDoc(doc(db, 'users', UID, 'settings', 'filters'));
        const data = snap.exists() ? (snap.data() || {}) : {};
        const p = data.presets && data.presets.income;
        if (p) {
          if (els.presetSelect) els.presetSelect.value = p;
          await applyPreset(p);
          applied = true;
        }
      } catch {}
      if (!applied) {
        const last = localStorage.getItem('vb_income_preset');
        if (last) {
          if (els.presetSelect) els.presetSelect.value = last;
          await applyPreset(last);
        } else { updatePresetActiveFromDates(); }
      }
    } catch (e) { console.error('Income init failed', e); if (els.empty) els.empty.style.display = ''; }
  });
}

document.addEventListener('DOMContentLoaded', init);
