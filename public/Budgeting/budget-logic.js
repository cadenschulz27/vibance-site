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
});
