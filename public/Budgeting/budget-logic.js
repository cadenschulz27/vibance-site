// public/Budgeting/budget-logic.js
// --------------------------------------------------------------------
// Vibance • Budget Calendar / Tabs Controller
// - Handles tab switching between Budget view & Calendar view
// - Renders a simple month grid with placeholder spend amounts
// - Keeps style consistent with Expenses / Social tabs
// --------------------------------------------------------------------

// Calendar moved to dashboard; file now only handles budget progress rendering

// -------------------- Budget Rollups --------------------
import { auth, db } from '../api/firebase.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { monthlyKey } from '../shared/period.js';

const budgetEls = {
  progressContainer: document.getElementById('budget-progress'),
};

// Placeholder static budgets (could later load from Firestore user settings)
const CATEGORY_BUDGETS = {
  Groceries: 500,
  Food: 300,
  Travel: 400,
  Income: 0, // income tracked but not budget capped here
  Uncategorized: 200,
};

async function fetchCurrentMonthRollups() {
  const user = auth.currentUser; if (!user) return [];
  const key = monthlyKey(new Date());
  const col = collection(db, 'users', user.uid, 'rollups');
  // monthly docs stored as <key>_<category>
  // Firestore does not support prefix query natively; we fetch all and filter client-side (expected small set)
  const snap = await getDocs(col);
  const out = [];
  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.periodKey === key) out.push({ id: docSnap.id, ...data });
  });
  return out;
}

function renderBudgetProgress(rollups) {
  if (!budgetEls.progressContainer) return;
  budgetEls.progressContainer.innerHTML='';
  // Aggregate expense totals per category
  const byCat = {};
  for (const r of rollups) {
    const cat = r.categoryId || 'Uncategorized';
    const exp = Number(r.expenseTotal || 0);
    byCat[cat] = (byCat[cat] || 0) + exp;
  }
  const cats = Object.keys(byCat).sort();
  if (!cats.length) {
    const empty = document.createElement('div');
    empty.className='text-sm opacity-60';
    empty.textContent='No spending yet this period.';
    budgetEls.progressContainer.appendChild(empty);
    return;
  }
  cats.forEach(cat => {
    const spent = byCat[cat];
    const budget = CATEGORY_BUDGETS[cat] || CATEGORY_BUDGETS.Uncategorized || 0;
    const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const row = document.createElement('div');
    row.className='budget-row mb-3';
    const label = document.createElement('div');
    label.className='flex justify-between text-xs mb-1';
    label.innerHTML = `<span>${cat}</span><span>${fmt(spent)}${budget? ' / '+fmt(budget): ''}</span>`;
    const barWrap = document.createElement('div');
    barWrap.className='h-2 w-full bg-gray-700 rounded overflow-hidden';
    const bar = document.createElement('div');
    bar.className='h-full bg-[var(--neon)] transition-all duration-300';
    bar.style.width = pct+'%';
    if (budget && spent > budget) {
      bar.classList.remove('bg-[var(--neon)]');
      bar.classList.add('bg-red-500');
      bar.style.width='100%';
    }
    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    budgetEls.progressContainer.appendChild(row);
  });
}

function fmt(v){return '$'+(Number(v||0).toFixed(2));}

async function refreshBudgetProgress() {
  try {
    const rollups = await fetchCurrentMonthRollups();
    renderBudgetProgress(rollups);
  } catch (e) {
    console.warn('[Budget] progress refresh failed', e);
  }
}

// -------------------- Wiring --------------------
function wire() { /* tabs removed */ }

// -------------------- Init --------------------
document.addEventListener('DOMContentLoaded',()=>{
  wire();
  refreshBudgetProgress();
  try {
    window.addEventListener('transactions:changed', (e) => {
      if (e?.detail?.tx) {
        clearTimeout(window.__budgetRefreshTimer);
        window.__budgetRefreshTimer = setTimeout(()=>refreshBudgetProgress(), 300);
      }
    });
  } catch {}
});
