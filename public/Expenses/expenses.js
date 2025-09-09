// public/Expenses/expenses.js
// ----------------------------------------------------
// Expenses controller:
//  - Loads transactions from users/{uid}/plaid_items/{itemId}/transactions
//  - Filters: account, date range, text search, amount range, category
//  - Inline category editing (saved to Firestore)
//  - Totals + pagination + CSV export
//
// Requirements:
//   - ../api/firebase.js must export { auth, db }
//   - Firestore structure created by your Plaid Netlify function
//   - DOM elements (adjust IDs as needed):
//       #account-filter          <select>
//       #start-date              <input type="date">
//       #end-date                <input type="date">
//       #search-input            <input type="text">
//       #min-amount              <input type="number">
//       #max-amount              <input type="number">
//       #category-filter         <select or input>
//       #reset-filters           <button>
//       #export-csv              <button>
//       #tx-count                <span>
//       #totals-income           <span>
//       #totals-expense          <span>
//       #totals-net              <span>
//       #tx-empty                <div> (empty state)
//       #tx-table-body           <tbody> for rows
//       #pagination-prev         <button>
//       #pagination-next         <button>
//       #pagination-label        <span>
//
// Notes:
//   - This loads up to PER_ITEM_LIMIT transactions per item (default 400) and
//     filters/paginates client-side. For very large datasets, consider
//     server-side aggregation or cursor-based Firestore pagination.
// ----------------------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc, setDoc, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// -------------------- Config --------------------
const PER_ITEM_LIMIT = 400;     // max records to pull per plaid item
const PAGE_SIZE = 25;           // rows per page
const COMMON_CATEGORIES = [
  'Groceries','Dining','Shopping','Rent/Mortgage','Utilities','Insurance','Transport','Travel',
  'Health','Subscriptions','Entertainment','Education','Gifts','Fees','Taxes','Transfer',
  'Salary','Refund','Investment','Interest','Other'
];

// -------------------- DOM --------------------
const els = {
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
};

// -------------------- State --------------------
let ALL_ITEMS = [];        // [{ id, institution_name }]
let ALL_TX = [];           // flattened raw list
let FILTERED = [];         // filtered list
let PAGE = 1;

// -------------------- Utils --------------------
function fmtMoney(n, currency='USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function parseAmt(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function toEpoch(d) {
  if (!d) return 0;
  if (typeof d?.toDate === 'function') return d.toDate().getTime();
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}
function safeStr(v){ return (v ?? '').toString().toLowerCase(); }
function dedupe(arr, key){ const s=new Set(); return arr.filter(x=>!s.has(x[key]) && s.add(x[key]) ); }

// -------------------- Firestore IO --------------------
async function listPlaidItems(uid) {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    out.push({
      id: d.id,
      institution_name: data.institution_name || data.institution || 'Unknown'
    });
  });
  return out;
}

async function fetchItemTransactions(uid, itemId, perItemLimit = PER_ITEM_LIMIT) {
  // We assume 'date' field exists as ISO-like string. We order desc and slice.
  const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
  const qTx = query(txRef, orderBy('date', 'desc'), limit(perItemLimit));
  const snap = await getDocs(qTx);
  const rows = [];
  snap.forEach(docSnap => {
    const d = docSnap.data() || {};
    const dateStr = d.date || d.authorized_date || d.posted_at || d.timestamp || null;
    const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
    rows.push({
      id: docSnap.id,
      itemId,
      date: dateStr,
      _epoch: toEpoch(dateStr),
      name: d.name || d.merchant_name || d.description || 'Transaction',
      amount: Number.isFinite(amount) ? amount : 0,
      isoCurrency: d.iso_currency_code || d.currency || 'USD',
      pending: !!d.pending,
      categoryAuto: Array.isArray(d.category) ? d.category.join(' / ') : (d.category || ''),
      categoryUser: d.categoryUser || '', // our user override
      merchant: d.merchant_name || '',
      raw: d,
    });
  });
  return rows;
}

async function saveCategory(uid, itemId, txId, categoryUser) {
  const txRef = doc(db, 'users', uid, 'plaid_items', itemId, 'transactions', txId);
  // Merge to avoid clobbering other fields written by sync
  await setDoc(txRef, { categoryUser: categoryUser || '' }, { merge: true });
}

// -------------------- Data load --------------------
async function loadAll(uid) {
  ALL_ITEMS = await listPlaidItems(uid);
  // Populate account filter
  if (els.account) {
    els.account.innerHTML = '<option value="">All accounts</option>' +
      ALL_ITEMS.map(it => `<option value="${it.id}">${escapeHtml(it.institution_name)}</option>`).join('');
  }

  // Fetch transactions for each item
  let all = [];
  for (const it of ALL_ITEMS) {
    const rows = await fetchItemTransactions(uid, it.id);
    // Attach institution for display
    rows.forEach(r => r.institution_name = it.institution_name);
    all = all.concat(rows);
  }
  // Sort by date desc
  all.sort((a,b) => b._epoch - a._epoch);

  ALL_TX = all;
  applyFilters(); // will render
}

// -------------------- Filters + Render --------------------
function readFilters() {
  const account = els.account?.value || '';
  const start = els.start?.value ? new Date(els.start.value).getTime() : null;
  const end = els.end?.value ? new Date(els.end.value).getTime() : null;
  const q = safeStr(els.search?.value || '');
  const cat = safeStr(els.category?.value || '');
  const minAmt = parseAmt(els.minAmt?.value);
  const maxAmt = parseAmt(els.maxAmt?.value);
  return { account, start, end, q, cat, minAmt, maxAmt };
}

function applyFilters() {
  const { account, start, end, q, cat, minAmt, maxAmt } = readFilters();

  let out = ALL_TX;

  if (account) out = out.filter(r => r.itemId === account);
  if (start) out = out.filter(r => r._epoch && r._epoch >= start);
  if (end)   out = out.filter(r => r._epoch && r._epoch <= (end + 24*3600*1000 - 1)); // inclusive end-date
  if (q) {
    out = out.filter(r => {
      const hay = `${safeStr(r.name)} ${safeStr(r.merchant)} ${safeStr(r.categoryAuto)} ${safeStr(r.categoryUser)} ${safeStr(r.institution_name)}`;
      return hay.includes(q);
    });
  }
  if (cat) {
    out = out.filter(r => safeStr(r.categoryUser || r.categoryAuto).includes(cat));
  }
  if (minAmt != null) out = out.filter(r => r.amount >= minAmt);
  if (maxAmt != null) out = out.filter(r => r.amount <= maxAmt);

  FILTERED = out;
  PAGE = 1;
  render();
}

function paginate(list, page, pageSize) {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

function render() {
  // counts & totals
  const totalCount = FILTERED.length;
  const income = FILTERED.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const expense = FILTERED.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const net = income - expense;

  if (els.count) els.count.textContent = `${totalCount} row${totalCount === 1 ? '' : 's'}`;
  if (els.incomeTotal) els.incomeTotal.textContent = fmtMoney(income);
  if (els.expenseTotal) els.expenseTotal.textContent = fmtMoney(expense);
  if (els.netTotal) els.netTotal.textContent = fmtMoney(net);

  // empty state
  if (els.empty) els.empty.style.display = totalCount ? 'none' : '';

  // table
  if (els.tbody) {
    els.tbody.innerHTML = '';
    const pageRows = paginate(FILTERED, PAGE, PAGE_SIZE);
    for (const r of pageRows) {
      els.tbody.appendChild(renderRow(r));
    }
  }

  // pagination label
  if (els.pageLabel) {
    const first = Math.min(1 + (PAGE - 1) * PAGE_SIZE, totalCount || 0);
    const last = Math.min(PAGE * PAGE_SIZE, totalCount || 0);
    els.pageLabel.textContent = totalCount ? `${first}-${last} of ${totalCount}` : '0 of 0';
  }

  // buttons
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
    <td class="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">${escapeHtml(fmtDate(r._epoch) || '')}</td>
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

  // wire up save button + Enter/blur save
  const input = tr.querySelector('.cat-input');
  const saveBtn = tr.querySelector('.save-cat');
  const doSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const newCat = input.value.trim();
    // Update state
    r.categoryUser = newCat;
    await saveCategory(user.uid, r.itemId, r.id, newCat);
    // Optional: visual feedback
    saveBtn.textContent = 'Saved';
    saveBtn.disabled = true;
    setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 800);
  };
  saveBtn.addEventListener('click', doSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave().catch(console.error);
  });
  input.addEventListener('blur', () => {
    // Auto-save on blur (optional; comment out if you prefer manual)
    if (input.dataset.last !== input.value) {
      doSave().catch(console.error);
    }
    input.dataset.last = input.value;
  });

  return tr;
}

function fmtDate(epoch) {
  if (!epoch) return '';
  const d = new Date(epoch);
  return d.toLocaleDateString();
}

function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g,' '); }

// -------------------- CSV Export --------------------
function toCSV(rows) {
  const headers = ['Date','Name','Amount','Currency','Account','Merchant','Category'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const line = [
      new Date(r._epoch || 0).toISOString().slice(0,10),
      csvCell(r.name),
      csvCell(r.amount),
      csvCell(r.isoCurrency),
      csvCell(r.institution_name),
      csvCell(r.merchant || ''),
      csvCell(r.categoryUser || r.categoryAuto || '')
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------- Wiring --------------------
function wireFilters() {
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

  els.prev?.addEventListener('click', () => {
    if (PAGE > 1) {
      PAGE--;
      render();
    }
  });
  els.next?.addEventListener('click', () => {
    const total = FILTERED.length;
    if (PAGE * PAGE_SIZE < total) {
      PAGE++;
      render();
    }
  });

  // Inject datalist of common categories if a text input
  if (els.category && els.category.tagName.toLowerCase() === 'input') {
    ensureCategoryDatalist();
  }
}
function ensureCategoryDatalist() {
  if (document.getElementById('category-list')) return;
  const dl = document.createElement('datalist');
  dl.id = 'category-list';
  dl.innerHTML = COMMON_CATEGORIES.map(c => `<option value="${escapeAttr(c)}"></option>`).join('');
  document.body.appendChild(dl);
}

// Simple debounce
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// -------------------- Init --------------------
function init() {
  wireFilters();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // auth-check.js likely handles redirect; just no-op
      return;
    }
    try {
      await loadAll(user.uid);
    } catch (e) {
      console.error('Failed to load expenses', e);
      if (els.empty) els.empty.style.display = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
