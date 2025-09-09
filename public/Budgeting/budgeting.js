// public/Budgeting/budgeting.js
// ----------------------------------------------------
// Budgeting controller
//   - Manages monthly category budgets
//   - Computes spending from synced Plaid transactions
//   - CRUD for categories, progress bars, totals, CSV export
//
// Firestore structure (created on demand):
//   users/{uid}/budgets/{YYYY-MM} (doc)  -> { month: 'YYYY-MM', createdAt: Timestamp }
//     categories (subcollection)
//       {categoryId} -> { name: string, amount: number }
//
// Transactions source (written by your Plaid sync function):
//   users/{uid}/plaid_items/{itemId}/transactions/{txId}
//   Fields read: amount (number), date (ISO), categoryUser (string), category (array|string), merchant_name/name
//
// Requirements:
//   - ../api/firebase.js must export { auth, db }
//   - DOM elements (adjust IDs as needed):
//       #month-select
//       #add-name, #add-amount, #add-btn
//       #cat-list (container), rows injected dynamically
//       #totals-budgeted, #totals-spent, #totals-remaining
//       #export-csv
//       #empty-state (optional)
// ----------------------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// -------------------- DOM --------------------
const els = {
  month: document.getElementById('month-select'),

  addName: document.getElementById('add-name'),
  addAmount: document.getElementById('add-amount'),
  addBtn: document.getElementById('add-btn'),

  list: document.getElementById('cat-list'),
  empty: document.getElementById('empty-state'),

  totalBudgeted: document.getElementById('totals-budgeted'),
  totalSpent: document.getElementById('totals-spent'),
  totalRemaining: document.getElementById('totals-remaining'),

  exportCsv: document.getElementById('export-csv'),
  toast: document.getElementById('toast'), // optional
};

// -------------------- State --------------------
let UID = null;
let CURRENT_MONTH = yyyyMm(new Date()); // 'YYYY-MM'
let CATEGORIES = []; // [{id,name,amount}]
let SPENT = {};      // { name: number }
let TOTALS = { budgeted: 0, spent: 0, remaining: 0 };

// -------------------- Utils --------------------
function yyyyMm(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}
function money(n, currency='USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toast(msg) {
  if (!els.toast) { console.log('[toast]', msg); return; }
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0','pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.remove('opacity-100');
    els.toast.classList.add('opacity-0','pointer-events-none');
  }, 1800);
}
function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// -------------------- Firestore: Budgets --------------------
function monthDocRef(uid, ym) {
  return doc(db, 'users', uid, 'budgets', ym);
}
function monthCatsCol(uid, ym) {
  return collection(db, 'users', uid, 'budgets', ym, 'categories');
}

async function ensureMonthDoc(uid, ym) {
  const ref = monthDocRef(uid, ym);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { month: ym, createdAt: serverTimestamp() }, { merge: true });
  }
}

async function loadCategories(uid, ym) {
  await ensureMonthDoc(uid, ym);
  const snap = await getDocs(query(monthCatsCol(uid, ym), orderBy('name')));
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    out.push({ id: d.id, name: data.name || 'Unnamed', amount: num(data.amount) });
  });
  return out;
}

async function createCategory(uid, ym, name, amount) {
  await ensureMonthDoc(uid, ym);
  const res = await addDoc(monthCatsCol(uid, ym), { name: name.trim(), amount: num(amount) });
  return res.id;
}
async function updateCategory(uid, ym, id, patch) {
  const ref = doc(db, 'users', uid, 'budgets', ym, 'categories', id);
  await setDoc(ref, { ...patch }, { merge: true });
}
async function removeCategory(uid, ym, id) {
  const ref = doc(db, 'users', uid, 'budgets', ym, 'categories', id);
  await deleteDoc(ref);
}

// -------------------- Firestore: Transactions --------------------
// Pull recent transactions for the selected month across all plaid items.
async function listItemIds(uid) {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const ids = [];
  snap.forEach(d => ids.push(d.id));
  return ids;
}
async function fetchMonthTransactions(uid, ym, perItemLimit = 1200) {
  const { start, end } = monthRange(ym);
  const all = [];
  const itemIds = await listItemIds(uid);

  for (const itemId of itemIds) {
    const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
    // We don't have a month index, so we order desc and slice generously; we’ll filter by date.
    const snap = await getDocs(query(txRef, orderBy('date','desc'), limit(perItemLimit)));
    snap.forEach(s => {
      const d = s.data() || {};
      const dateStr = d.date || d.authorized_date || d.posted_at || d.timestamp || null;
      const dt = dateStr ? new Date(dateStr) : null;
      const ts = dt && !Number.isNaN(dt.getTime()) ? dt : null;
      if (!ts || ts < start || ts > end) return;

      const amt = typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0;
      const userCat = (d.categoryUser ?? '').toString().trim();
      const autoCat = Array.isArray(d.category) ? d.category.join(' / ')
                      : (d.category ?? '').toString();
      const cat = userCat || autoCat || 'Uncategorized';

      all.push({
        id: s.id,
        date: dateStr,
        amount: amt,
        category: cat,
        name: d.name || d.merchant_name || d.description || 'Transaction',
        raw: d,
      });
    });
  }

  return all;
}

// -------------------- Budget Math --------------------
function computeSpentByCategory(transactions) {
  const map = {};
  for (const t of transactions) {
    // Convention: positive amounts = expense, negative = income/refund
    const spend = t.amount > 0 ? t.amount : 0;
    const key = (t.category || 'Uncategorized').toString();
    map[key] = (map[key] || 0) + spend;
  }
  return map;
}

function computeTotals(categories, spentMap) {
  const budgeted = categories.reduce((s, c) => s + num(c.amount), 0);
  const spent = categories.reduce((s, c) => s + (spentMap[c.name] || 0), 0);
  const remaining = budgeted - spent;
  return { budgeted, spent, remaining };
}

// -------------------- Render --------------------
function progressClass(pct) {
  if (pct < 60) return 'bg-emerald-600';
  if (pct < 90) return 'bg-amber-500';
  return 'bg-red-500';
}

function renderList() {
  if (!els.list) return;
  els.list.innerHTML = '';

  if (!CATEGORIES.length) {
    if (els.empty) els.empty.style.display = '';
    else els.list.innerHTML = `<div class="text-neutral-400 text-sm">No categories yet. Add one above.</div>`;
    renderTotals();
    return;
  }
  if (els.empty) els.empty.style.display = 'none';

  for (const c of CATEGORIES) {
    const spent = SPENT[c.name] || 0;
    const remaining = num(c.amount) - spent;
    const pct = num(c.amount) > 0 ? Math.min(100, Math.round((spent / num(c.amount)) * 100)) : 0;

    const row = document.createElement('div');
    row.className = 'rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 md:p-5 mb-3';
    row.dataset.id = c.id;

    row.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <input type="text" class="cat-name bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm font-semibold w-48"
                   value="${escapeHtml(c.name)}" />
            <span class="text-xs text-neutral-500">Month: ${escapeHtml(CURRENT_MONTH)}</span>
          </div>
          <div class="mt-2 text-sm text-neutral-300">
            Budget: <input type="number" step="0.01" class="cat-amount bg-neutral-800 border border-neutral-700 rounded px-2 py-1 w-28"
                           value="${escapeHtml(String(num(c.amount)))}" />
            <span class="ml-3">Spent: <span class="${spent > num(c.amount) ? 'text-red-400' : 'text-neutral-200'}">${money(spent)}</span></span>
            <span class="ml-3">Remaining: <span class="${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}">${money(remaining)}</span></span>
          </div>
          <div class="mt-3 h-2 rounded bg-neutral-800 overflow-hidden">
            <div class="h-2 ${progressClass(pct)}" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="flex-shrink-0 flex flex-col items-end gap-2">
          <button class="save px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs">Save</button>
          <button class="delete px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-xs">Delete</button>
        </div>
      </div>
    `;

    // Wire: Save & Delete
    const saveBtn = row.querySelector('.save');
    const delBtn = row.querySelector('.delete');
    const nameInput = row.querySelector('.cat-name');
    const amtInput = row.querySelector('.cat-amount');

    saveBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim() || 'Unnamed';
      const newAmt = num(amtInput.value);
      await updateCategory(UID, CURRENT_MONTH, c.id, { name: newName, amount: newAmt });
      c.name = newName;
      c.amount = newAmt;
      toast('Saved');
      // Recompute totals and re-render header totals
      renderTotals();
    });

    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this category?')) return;
      await removeCategory(UID, CURRENT_MONTH, c.id);
      CATEGORIES = CATEGORIES.filter(x => x.id !== c.id);
      renderList();
      renderTotals();
      toast('Deleted');
    });

    // Save on Enter in inputs
    const saveOnEnter = (e) => { if (e.key === 'Enter') saveBtn.click(); };
    nameInput.addEventListener('keydown', saveOnEnter);
    amtInput.addEventListener('keydown', saveOnEnter);

    els.list.appendChild(row);
  }

  renderTotals();
}

function renderTotals() {
  TOTALS = computeTotals(CATEGORIES, SPENT);
  if (els.totalBudgeted) els.totalBudgeted.textContent = money(TOTALS.budgeted);
  if (els.totalSpent) els.totalSpent.textContent = money(TOTALS.spent);
  if (els.totalRemaining) {
    els.totalRemaining.textContent = money(TOTALS.remaining);
    els.totalRemaining.className = `font-semibold ${TOTALS.remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`;
  }
}

// -------------------- CSV Export --------------------
function buildCsv() {
  const headers = ['Month','Category','Budgeted','Spent','Remaining'];
  const lines = [headers.join(',')];
  for (const c of CATEGORIES) {
    const spent = SPENT[c.name] || 0;
    const remaining = num(c.amount) - spent;
    const row = [
      CURRENT_MONTH,
      csvCell(c.name),
      csvCell(num(c.amount)),
      csvCell(spent),
      csvCell(remaining),
    ].join(',');
    lines.push(row);
  }
  // Totals row
  lines.push(['', 'TOTAL', TOTALS.budgeted, TOTALS.spent, TOTALS.remaining].join(','));
  return lines.join('\n');
}
function csvCell(v) {
  const s = (v ?? '').toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------- Load Flow --------------------
async function refreshAll() {
  // 1) Load categories
  CATEGORIES = await loadCategories(UID, CURRENT_MONTH);

  // 2) Load month transactions and aggregate spending
  const tx = await fetchMonthTransactions(UID, CURRENT_MONTH);
  SPENT = computeSpentByCategory(tx);

  // 3) Render
  renderList();
}

function populateMonthSelect() {
  if (!els.month) return;
  // Provide a rolling 18 months (past 12, current, next 5)
  const now = new Date();
  const options = [];
  for (let offset = -12; offset <= 5; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const ym = yyyyMm(d);
    options.push(ym);
  }
  els.month.innerHTML = options.map(ym =>
    `<option value="${ym}" ${ym === CURRENT_MONTH ? 'selected' : ''}>${ym}</option>`
  ).join('');
}

// -------------------- Wiring --------------------
function wire() {
  els.addBtn?.addEventListener('click', async () => {
    const name = (els.addName?.value || '').trim();
    const amount = num(els.addAmount?.value);
    if (!name) { toast('Enter a name'); return; }

    const id = await createCategory(UID, CURRENT_MONTH, name, amount);
    CATEGORIES.push({ id, name, amount });
    els.addName.value = '';
    els.addAmount.value = '';
    renderList();
    toast('Added');
  });

  els.month?.addEventListener('change', async () => {
    CURRENT_MONTH = els.month.value;
    await refreshAll();
    toast(`Switched to ${CURRENT_MONTH}`);
  });

  els.exportCsv?.addEventListener('click', () => {
    const csv = buildCsv();
    download(`budget_${CURRENT_MONTH}.csv`, csv);
  });
}

// -------------------- Init --------------------
function init() {
  populateMonthSelect();
  wire();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check.js likely handles redirects
    UID = user.uid;
    try {
      await refreshAll();
    } catch (e) {
      console.error('Budgeting load failed', e);
      if (els.empty) els.empty.style.display = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
