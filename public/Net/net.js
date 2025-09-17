// public/Net/net.js
// Simple monthly income vs expense bars from Plaid-backed transactions

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PER_ITEM_LIMIT = 600; // a few months worth

const els = {
  range: document.getElementById('range-select'),
  bars: document.getElementById('bars'),
  summary: document.getElementById('summary'),
  backBtn: document.getElementById('net-back'),
  backLabel: document.querySelector('#net-back span'),
};

let UID = null;

function yyyymm(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(ym) {
  const parts = (ym || '').split('-');
  const y = Number(parts[0] || '0');
  const m = Number(parts[1] || '1');
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

async function listItems(uid) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'plaid_items'), orderBy('institution_name')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
}
async function fetchTx(uid, itemId) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'plaid_items', itemId, 'transactions'), orderBy('date', 'desc'), limit(PER_ITEM_LIMIT)));
  return snap.docs.map(d => (d.data() || {}));
}

async function loadMonthly(rangeMonths) {
  const items = await listItems(UID);
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - (rangeMonths - 1), 1);
  const agg = {}; // ym -> { income, expense }

  for (const it of items) {
    const all = await fetchTx(UID, it.id);
    for (const x of all) {
      const d = new Date(x.date);
      if (!(d instanceof Date) || isNaN(d.getTime())) continue;
      if (d < cutoff) continue;
      const ym = yyyymm(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!agg[ym]) agg[ym] = { income: 0, expense: 0 };
      const amt = Number(x.amount || 0);
      if (amt < 0) agg[ym].income += Math.abs(amt);
      else agg[ym].expense += amt;
    }
  }

  const months = Object.keys(agg).sort();
  const rows = months.map(m => ({ ym: m, income: agg[m].income, expense: agg[m].expense }));
  render(rows);
}

function render(rows) {
  els.bars.innerHTML = '';
  let totIncome = 0, totExpense = 0;
  rows.forEach(r => { totIncome += r.income; totExpense += r.expense; });
  const max = Math.max(1, ...rows.map(r => Math.max(r.income, r.expense)));

  rows.forEach(r => {
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-neutral-800 p-3';

    const label = document.createElement('div');
    label.className = 'text-sm text-neutral-400';
    label.textContent = monthLabel(r.ym);
    card.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'mt-2 grid grid-cols-2 gap-2 items-end';

    const incWrap = document.createElement('div');
    const incBox = document.createElement('div');
    incBox.className = 'h-28 bg-neutral-900 border border-neutral-800 rounded-xl flex items-end';
    const incBar = document.createElement('div');
    incBar.className = 'w-full bg-emerald-500/70 rounded-b-xl';
    incBar.style.height = Math.round((r.income / max) * 100) + '%';
    incBox.appendChild(incBar);
    incWrap.appendChild(incBox);
    const incLbl = document.createElement('div'); incLbl.className = 'mt-1 text-xs text-neutral-300'; incLbl.textContent = 'Income'; incWrap.appendChild(incLbl);

    const expWrap = document.createElement('div');
    const expBox = document.createElement('div');
    expBox.className = 'h-28 bg-neutral-900 border border-neutral-800 rounded-xl flex items-end';
    const expBar = document.createElement('div');
    expBar.className = 'w-full bg-red-500/70 rounded-b-xl';
    expBar.style.height = Math.round((r.expense / max) * 100) + '%';
    expBox.appendChild(expBar);
    expWrap.appendChild(expBox);
    const expLbl = document.createElement('div'); expLbl.className = 'mt-1 text-xs text-neutral-300'; expLbl.textContent = 'Expenses'; expWrap.appendChild(expLbl);

    wrap.appendChild(incWrap);
    wrap.appendChild(expWrap);
    card.appendChild(wrap);
    els.bars.appendChild(card);
  });

  const net = totIncome - totExpense;
  els.summary.textContent = 'Total income ' + fmt(totIncome) + ' • Total expenses ' + fmt(totExpense) + ' • Net ' + fmt(net);
}

function fmt(n) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n); } catch { return '$' + (n || 0).toFixed(2); } }

function init() {
  if (els.backBtn) {
    const params = new URLSearchParams(location.search);
    const fromParam = (params.get('from') || '').toLowerCase();
    const fallback = fromParam === 'income' ? '/Income/income.html' : '/Expenses/expenses.html';
    const ref = document.referrer || '';
    const refLower = ref.toLowerCase();
    const cameFromKnown = /\/income\//.test(refLower) || /\/expenses\//.test(refLower);

    if (els.backLabel) {
      els.backLabel.textContent = fromParam === 'income' ? 'Back to Income' : 'Back to Expenses';
    }

    els.backBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (cameFromKnown && history.length > 1) {
        history.back();
      } else {
        location.href = fallback;
      }
    });
  }

  els.range?.addEventListener('change', () => {
    if (UID) loadMonthly(Number(els.range.value)).catch(console.error);
  });
  onAuthStateChanged(auth, async (u) => {
    if (!u) return;
    UID = u.uid;
    const months = Number(els.range?.value || 6);
    await loadMonthly(months);
  });
}

document.addEventListener('DOMContentLoaded', init);
