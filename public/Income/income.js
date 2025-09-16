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
  collection, getDocs, doc, getDoc, setDoc,
  query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PER_ITEM_LIMIT = 500;
const PAGE_SIZE = 25;
const AUTO_FIRST_SYNC = true;

const els = {
  syncAll: document.getElementById('sync-all-income'),
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
};

let UID = null;
let ALL_ITEMS = [];
let ALL_TX = [];
let FILTERED = [];
let PAGE = 1;

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
    });
  });
  return rows;
}

async function loadAllTransactions(uid) {
  ALL_ITEMS = await listPlaidItems(uid);
  if (els.account) {
    els.account.innerHTML = '<option value="">All accounts</option>' + ALL_ITEMS.map(it => `<option value="${it.id}">${escapeHtml(it.institution_name)}</option>`).join('');
  }
  let all = [];
  for (const it of ALL_ITEMS) {
    const rows = await fetchItemTransactions(uid, it.id);
    rows.forEach(r => r.institution_name = it.institution_name);
    all = all.concat(rows);
  }
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
function applyPreset(preset) {
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
  // Income: only inflows (negative amounts in Plaid polarity)
  out = out.filter(r => r.amount < 0);
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
}

function renderRow(r) {
  const tr = document.createElement('tr');
  tr.className = 'border-b border-neutral-800 hover:bg-neutral-900';
  const amountCls = 'text-emerald-400';
  const categoryText = r.categoryUser || r.categoryAuto || '';
  tr.innerHTML = `
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(r.institution_name || '')}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(formatLocalDate(r._epoch))}</td>
    <td class="px-4 py-3 text-sm font-medium text-neutral-100">${escapeHtml(r.name || '')}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm ${amountCls} text-right">${escapeHtml(fmtMoney(Math.abs(r.amount), r.isoCurrency))}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${r.merchant ? `<a class=\"hover:underline\" href=\"/Merchants/merchant.html?name=${encodeURIComponent(r.merchant)}\">${escapeHtml(r.merchant)}</a>` : ''}</td>
    <td class="px-4 py-3 text-sm">${escapeHtml(categoryText)}</td>
    <td class="px-4 py-3 whitespace-nowrap text-xs text-neutral-400">${r.pending ? 'Pending' : 'Posted'}</td>
  `;
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
  els.syncAll?.addEventListener('click', async () => {
    if (!UID) return;
    els.syncAll.disabled = true; els.syncAll.textContent = 'Syncing…';
    try { const { added, modified, removed, count } = await syncAllItems(UID); toast(`Synced ${count} account${count===1?'':'s'}  +${added} • ~${modified} • –${removed}`); await loadAllTransactions(UID); }
    catch (e) { console.error(e); toast('Sync failed'); }
    finally { els.syncAll.disabled = false; els.syncAll.textContent = 'Sync all'; }
  });
}

function init() {
  wireUI();
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; UID = user.uid;
    try {
      if (AUTO_FIRST_SYNC) { if (els.syncAll) { els.syncAll.disabled = true; els.syncAll.textContent = 'Syncing…'; } try { await syncAllItems(UID); } catch(e){ console.warn('Auto first sync failed', e); } finally { if (els.syncAll) { els.syncAll.disabled = false; els.syncAll.textContent = 'Sync all'; } } }
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
