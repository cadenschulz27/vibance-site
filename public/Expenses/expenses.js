// public/Expenses/expenses.js
// ----------------------------------------------------
// Expenses page controller
//  - Syncs recent transactions from Plaid via Netlify function
//  - Loads transactions from Firestore and renders a filterable table
//  - Inline category editing (saved to Firestore)
//  - Totals, pagination, CSV export
// ----------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc, setDoc,
  query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// -------------------- Config --------------------
const PER_ITEM_LIMIT = 500;    // how many tx to fetch per item from Firestore
const PAGE_SIZE = 25;
const AUTO_FIRST_SYNC = true;  // set false to disable auto-sync on first load
const COMMON_CATEGORIES = [
  'Groceries','Dining','Shopping','Rent/Mortgage','Utilities','Insurance','Transport','Travel',
  'Health','Subscriptions','Entertainment','Education','Gifts','Fees','Taxes','Transfer',
  'Salary','Refund','Investment','Interest','Other'
];

// -------------------- DOM --------------------
const els = {
  syncAll: document.getElementById('sync-all-expenses'),

  account: document.getElementById('account-filter'),
  start: document.getElementById('start-date'),
  end: document.getElementById('end-date'),
  search: document.getElementById('search-input'),
  minAmt: document.getElementById('min-amount'),
  maxAmt: document.getElementById('max-amount'),
  category: document.getElementById('category-filter'),
  reset: document.getElementById('reset-filters'),
  exportBtn: document.getElementById('export-csv'),

  count: document.getElementById('tx-count'),
  incomeTotal: document.getElementById('totals-income'),
  expenseTotal: document.getElementById('totals-expense'),
  netTotal: document.getElementById('totals-net'),

  empty: document.getElementById('tx-empty'),
  tbody: document.getElementById('tx-table-body'),

  prev: document.getElementById('pagination-prev'),
  next: document.getElementById('pagination-next'),
  pageLabel: document.getElementById('pagination-label'),

  toast: document.getElementById('toast'),
};

// -------------------- State --------------------
let UID = null;
let ALL_ITEMS = [];
let ALL_TX = [];
let FILTERED = [];
let PAGE = 1;

// -------------------- Utils --------------------
function parseLocalDateEpoch(str) {
  if (!str) return 0;
  if (typeof str !== 'string') {
    const d = (typeof str?.toDate === 'function') ? str.toDate() : new Date(str);
    const t = d?.getTime?.() ?? NaN;
    return Number.isNaN(t) ? 0 : t;
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mon = Number(m[2]) - 1, day = Number(m[3]);
    return new Date(y, mon, day, 0, 0, 0, 0).getTime();
  }
  const t = Date.parse(str);
  return Number.isNaN(t) ? 0 : t;
}

function toEpoch(d) {
  return parseLocalDateEpoch(d);
}

function formatLocalDate(epoch) {
  const dt = new Date(epoch || 0);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

function toast(msg) {
  if (!els.toast) { console.log('[toast]', msg); return; }
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0','pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.remove('opacity-100');
    els.toast.classList.add('opacity-0','pointer-events-none');
  }, 2000);
}

function setBtnBusy(btn, text, busy = true) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = text || 'Working…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || 'Done';
  }
}

function fmtMoney(n, currency = 'USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
}
function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g,' '); }
function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

// -------------------- Firestore & Functions --------------------
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return await user.getIdToken(true);
}
async function callPlaidFn(payload) {
  const token = await getIdToken();
  const res = await fetch('/.netlify/functions/plaid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Plaid function failed (${res.status}) ${text}`);
  }
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

async function listPlaidItems(uid) {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const out = [];
  snap.forEach(d => {
    const x = d.data() || {};
    out.push({
      id: d.id,
      institution_name: x.institution_name || x.institution || 'Unknown',
      last_synced: x.last_synced || null
    });
  });
  return out;
}

async function syncAllItems(uid) {
  const items = await listPlaidItems(uid);
  if (!items.length) return { added: 0, modified: 0, removed: 0, count: 0 };

  let added = 0, modified = 0, removed = 0, count = 0;
  for (const it of items) {
    try {
      const res = await callPlaidFn({ action: 'sync_transactions', item_id: it.id });
      added += res?.addedCount || 0;
      modified += res?.modifiedCount || 0;
      removed += res?.removedCount || 0;
      count++;
    } catch (e) {
      console.error('Sync failed for item', it.id, e);
    }
  }
  return { added, modified, removed, count };
}

async function fetchItemTransactions(uid, itemId, perItemLimit = PER_ITEM_LIMIT) {
  const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
  const qTx = query(txRef, orderBy('date', 'desc'), limit(perItemLimit));
  const snap = await getDocs(qTx);
  const rows = [];
  snap.forEach(docSnap => {
    const d = docSnap.data() || {};
    const dateStr = d.date || d.authorized_date || d.posted_at || d.timestamp || null;
    const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
    const epoch = toEpoch(dateStr);
    rows.push({
      id: docSnap.id,
      itemId,
      date: dateStr,
      _epoch: epoch,
      name: d.name || d.merchant_name || d.description || 'Transaction',
      amount: Number.isFinite(amount) ? amount : 0,
      isoCurrency: d.iso_currency_code || d.currency || 'USD',
      pending: !!d.pending,
      categoryAuto: Array.isArray(d.category) ? d.category.join(' / ') : (d.category || ''),
      categoryUser: d.categoryUser || '',
      merchant: d.merchant_name || '',
      raw: d,
    });
  });
  return rows;
}

async function saveCategory(uid, itemId, txId, categoryUser) {
  const txRef = doc(db, 'users', uid, 'plaid_items', itemId, 'transactions', txId);
  await setDoc(txRef, { categoryUser: categoryUser || '' }, { merge: true });
}

// -------------------- Load & Render --------------------
async function loadAllTransactions(uid) {
  ALL_ITEMS = await listPlaidItems(uid);
  if (els.account) {
    els.account.innerHTML =
      '<option value="">All accounts</option>' +
      ALL_ITEMS.map(it => `<option value="${it.id}">${escapeHtml(it.institution_name)}</option>`).join('');
  }

  let all = [];
  for (const it of ALL_ITEMS) {
    const rows = await fetchItemTransactions(uid, it.id);
    rows.forEach(r => r.institution_name = it.institution_name);
    all = all.concat(rows);
  }
  all.sort((a, b) => b._epoch - a._epoch);
  ALL_TX = all;
  applyFilters();
}

function readFilters() {
  const account = els.account?.value || '';
  const start = els.start?.value ? parseLocalDateEpoch(els.start.value) : null;
  const end = els.end?.value ? parseLocalDateEpoch(els.end.value) : null;
  const q = (els.search?.value || '').toLowerCase();
  const cat = (els.category?.value || '').toLowerCase();
  const minAmt = els.minAmt?.value === '' ? null : Number(els.minAmt.value);
  const maxAmt = els.maxAmt?.value === '' ? null : Number(els.maxAmt.value);
  return { account, start, end, q, cat, minAmt, maxAmt };
}

function applyFilters() {
  const { account, start, end, q, cat, minAmt, maxAmt } = readFilters();
  let out = ALL_TX;

  if (account) out = out.filter(r => r.itemId === account);
  if (start != null) out = out.filter(r => r._epoch && r._epoch >= start);
  if (end != null) {
    const endOfDay = end + (24*3600*1000 - 1);
    out = out.filter(r => r._epoch && r._epoch <= endOfDay);
  }
  if (q) {
    out = out.filter(r => {
      const hay = `${(r.name||'').toLowerCase()} ${(r.merchant||'').toLowerCase()} ${(r.categoryAuto||'').toLowerCase()} ${(r.categoryUser||'').toLowerCase()} ${(r.institution_name||'').toLowerCase()}`;
      return hay.includes(q);
    });
  }
  if (cat) {
    out = out.filter(r => ((r.categoryUser || r.categoryAuto || '') + '').toLowerCase().includes(cat));
  }
  if (minAmt != null && !Number.isNaN(minAmt)) out = out.filter(r => r.amount >= minAmt);
  if (maxAmt != null && !Number.isNaN(maxAmt)) out = out.filter(r => r.amount <= maxAmt);

  // Expenses tab: show only outflows (positive amounts in Plaid polarity)
  out = out.filter(r => r.amount > 0);

  FILTERED = out;
  PAGE = 1;
  render();
}

function paginate(list, page, size) {
  const start = (page - 1) * size;
  return list.slice(start, start + size);
}

function render() {
  const totalCount = FILTERED.length;
  const income = 0;
  const expense = FILTERED.reduce((s, r) => s + r.amount, 0);
  const net = -expense;

  if (els.count) els.count.textContent = `${totalCount} row${totalCount === 1 ? '' : 's'}`;
  if (els.incomeTotal) els.incomeTotal.textContent = fmtMoney(income);
  if (els.expenseTotal) els.expenseTotal.textContent = fmtMoney(expense);
  if (els.netTotal) els.netTotal.textContent = fmtMoney(net);

  if (els.empty) els.empty.style.display = totalCount ? 'none' : '';

  if (els.tbody) {
    els.tbody.innerHTML = '';
    const rows = paginate(FILTERED, PAGE, PAGE_SIZE);
    for (const r of rows) {
      els.tbody.appendChild(renderRow(r));
    }
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
  const amountCls = r.amount < 0 ? 'text-emerald-400' : 'text-red-400';
  const categoryText = r.categoryUser || r.categoryAuto || '';

  tr.innerHTML = `
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(r.institution_name || '')}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(formatLocalDate(r._epoch))}</td>
    <td class="px-4 py-3 text-sm font-medium text-neutral-100">${escapeHtml(r.name || '')}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm ${amountCls} text-right">${escapeHtml(fmtMoney(Math.abs(r.amount), r.isoCurrency))}</td>
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(r.merchant || '')}</td>
    <td class="px-4 py-3 text-sm">
      <div class="flex items-center gap-2">
        <input type="text" class="cat-input bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm w-44"
               value="${escapeAttr(categoryText)}" placeholder="Category…" list="category-list"/>
        <button class="save-cat px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Save</button>
      </div>
    </td>
  `;

  const input = tr.querySelector('.cat-input');
  const saveBtn = tr.querySelector('.save-cat');
  const doSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const newCat = input.value.trim();
    r.categoryUser = newCat;
    await saveCategory(user.uid, r.itemId, r.id, newCat);
    saveBtn.textContent = 'Saved';
    saveBtn.disabled = true;
    setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 700);
  };
  saveBtn.addEventListener('click', () => doSave().catch(console.error));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave().catch(console.error); });
  input.addEventListener('blur', () => { if (input.dataset.last !== input.value) doSave().catch(console.error); input.dataset.last = input.value; });

  return tr;
}

// -------------------- CSV Export --------------------
function toCSV(rows) {
  const headers = ['Date','Name','Amount','Currency','Account','Merchant','Category','Pending'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = [
      new Date(r._epoch || 0).toISOString().slice(0,10),
      csvCell(r.name),
      csvCell(r.amount),
      csvCell(r.isoCurrency),
      csvCell(r.institution_name),
      csvCell(r.merchant || ''),
      csvCell(r.categoryUser || r.categoryAuto || ''),
      csvCell(r.pending ? 'true' : 'false'),
    ].join(',');
    lines.push(line);
  }
  return lines.join('\n');
}
function csvCell(v) {
  const s = (v ?? '').toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------- Wiring --------------------
function ensureCategoryDatalist() {
  if (document.getElementById('category-list')) return;
  const dl = document.createElement('datalist');
  dl.id = 'category-list';
  dl.innerHTML = COMMON_CATEGORIES.map(c => `<option value="${escapeAttr(c)}"></option>`).join('');
  document.body.appendChild(dl);
}

function wireUI() {
  const rerun = () => applyFilters();
  els.account?.addEventListener('change', rerun);
  els.start?.addEventListener('change', rerun);
  els.end?.addEventListener('change', rerun);
  els.search?.addEventListener('input', debounce(rerun, 200));
  els.minAmt?.addEventListener('input', debounce(rerun, 200));
  els.maxAmt?.addEventListener('input', debounce(rerun, 200));
  els.category?.addEventListener('input', debounce(rerun, 200));
  els.reset?.addEventListener('click', () => {
    if (els.account) els.account.value = '';
    if (els.start) els.start.value = '';
    if (els.end) els.end.value = '';
    if (els.search) els.search.value = '';
    if (els.minAmt) els.minAmt.value = '';
    if (els.maxAmt) els.maxAmt.value = '';
    if (els.category) els.category.value = '';
    applyFilters();
  });

  els.exportBtn?.addEventListener('click', () => {
    const csv = toCSV(FILTERED);
    const today = new Date().toISOString().slice(0,10);
    download(`expenses_${today}.csv`, csv);
  });

  els.prev?.addEventListener('click', () => { if (PAGE > 1) { PAGE--; render(); } });
  els.next?.addEventListener('click', () => {
    const total = FILTERED.length;
    if (PAGE * PAGE_SIZE < total) { PAGE++; render(); }
  });

  ensureCategoryDatalist();

  els.syncAll?.addEventListener('click', async () => {
    if (!UID) return;
    setBtnBusy(els.syncAll, 'Syncing…', true);
    try {
      const { added, modified, removed, count } = await syncAllItems(UID);
      toast(`Synced ${count} account${count===1?'':'s'}  +${added} • ~${modified} • –${removed}`);
      await loadAllTransactions(UID);
    } catch (e) {
      console.error(e);
      toast('Sync failed');
    } finally {
      setBtnBusy(els.syncAll, '', false);
    }
  });
}

// -------------------- Init --------------------
function init() {
  wireUI();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    UID = user.uid;

    try {
      if (AUTO_FIRST_SYNC) {
        if (els.syncAll) setBtnBusy(els.syncAll, 'Syncing…', true);
        try {
          await syncAllItems(UID);
        } catch (e) {
          console.warn('Auto first sync failed', e);
        } finally {
          if (els.syncAll) setBtnBusy(els.syncAll, '', false);
        }
      }

      await loadAllTransactions(UID);
      toast('Transactions loaded');
    } catch (e) {
      console.error('Expenses init failed', e);
      if (els.empty) els.empty.style.display = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
