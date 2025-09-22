// public/Budgeting/budget-logic.js
// --------------------------------------------------------------------
// Vibance • Budget Calendar / Tabs Controller
// - Handles tab switching between Budget view & Calendar view
// - Renders a simple month grid with placeholder spend amounts
// - Keeps style consistent with Expenses / Social tabs
// --------------------------------------------------------------------

const els = {
  tabBudget: document.getElementById('tab-budget'),
  tabCalendar: document.getElementById('tab-calendar'),
  viewBudget: document.getElementById('view-budget'),
  viewCalendar: document.getElementById('view-calendar'),
  monthLabel: document.getElementById('month-label'),
  calGrid: document.getElementById('calendar-grid'),
  prev: document.getElementById('prev-month'),
  next: document.getElementById('next-month'),
};

let CURRENT = new Date();

// -------------------- Tabs --------------------
function switchTab(tab) {
  els.tabBudget?.classList.remove('active');
  els.tabCalendar?.classList.remove('active');
  els.viewBudget?.classList.add('hidden');
  els.viewCalendar?.classList.add('hidden');

  if (tab === 'budget') {
    els.tabBudget?.classList.add('active');
    els.viewBudget?.classList.remove('hidden');
  } else {
    els.tabCalendar?.classList.add('active');
    els.viewCalendar?.classList.remove('hidden');
    renderCalendar(CURRENT);
  }
}

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

// -------------------- Calendar --------------------
function renderCalendar(baseDate) {
  if (!els.calGrid) return;
  els.calGrid.innerHTML = '';

  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const lastDate = new Date(y, m+1, 0).getDate();

  const label = `${baseDate.toLocaleString('default',{month:'long'})} ${y}`;
  if (els.monthLabel) els.monthLabel.textContent = label;

  // filler cells before
  for (let i=0;i<startDay;i++) {
    const empty = document.createElement('div');
    empty.className='calendar-day opacity-30';
    els.calGrid.appendChild(empty);
  }

  // days
  for (let d=1; d<=lastDate; d++) {
    const cell=document.createElement('div');
    cell.className='calendar-day';
    const dt=new Date(y,m,d);
    const today=new Date();
    if (dt.toDateString()===today.toDateString()) {
      cell.classList.add('ring-2','ring-[var(--neon)]');
    }
    const date=document.createElement('div');
    date.className='date';
    date.textContent=d;
    cell.appendChild(date);

    // Placeholder amount (demo)
    const amt=document.createElement('div');
    amt.className='amount muted';
    if (Math.random()>0.75) {
      const val=Math.round(Math.random()*80)-40;
      amt.textContent=(val<0?'-':'+')+'$'+Math.abs(val);
      amt.classList.remove('muted');
      amt.classList.add(val<0?'amount-negative':'amount-positive');
    }
    cell.appendChild(amt);

    els.calGrid.appendChild(cell);
  }
}

// -------------------- Wiring --------------------
function wire() {
  els.tabBudget?.addEventListener('click',()=>switchTab('budget'));
  els.tabCalendar?.addEventListener('click',()=>switchTab('calendar'));
  els.prev?.addEventListener('click',()=>{CURRENT=new Date(CURRENT.getFullYear(),CURRENT.getMonth()-1,1);renderCalendar(CURRENT);});
  els.next?.addEventListener('click',()=>{CURRENT=new Date(CURRENT.getFullYear(),CURRENT.getMonth()+1,1);renderCalendar(CURRENT);});
}

// -------------------- Init --------------------
document.addEventListener('DOMContentLoaded',()=>{
  wire();
  switchTab('budget'); // default
  refreshBudgetProgress();
  // Listen for transaction changes (future: aggregate + refresh budget UI)
  try {
    window.addEventListener('transactions:changed', (e) => {
      // Placeholder: in future we will recompute active budget progress.
      // For now simply log to verify wiring.
      // Recompute progress after a small debounce to batch rapid changes
      if (e?.detail?.tx) {
        clearTimeout(window.__budgetRefreshTimer);
        window.__budgetRefreshTimer = setTimeout(()=>refreshBudgetProgress(), 300);
      }
    });
  } catch {}
});
