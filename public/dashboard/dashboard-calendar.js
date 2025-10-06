// public/dashboard/dashboard-calendar.js
// -------------------------------------------------------------
// Cash-Flow Calendar (relocated from Budgeting page)
// Now fetches real per-day net (income - expense) via daily-cashflow function.
// -------------------------------------------------------------

import { auth } from '../api/firebase.js';

let CURRENT = new Date();
let DAY_DATA = {}; // cache for current month

const els = {
  monthLabel: document.getElementById('dashboard-month-label'),
  grid: document.getElementById('dashboard-calendar-grid'),
  prev: document.getElementById('dashboard-prev-month'),
  next: document.getElementById('dashboard-next-month'),
  loading: document.getElementById('calendar-loading'),
  empty: document.getElementById('calendar-empty'),
  summaryNet: document.getElementById('calendar-summary-net'),
  summaryIncome: document.getElementById('calendar-summary-income'),
  summaryExpense: document.getElementById('calendar-summary-expense'),
};

async function waitForAuthUser(timeoutMs = 8000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const to = setTimeout(()=>reject(new Error('auth-timeout')), timeoutMs);
    const unsub = auth.onAuthStateChanged(u => {
      if (u) {
        clearTimeout(to); unsub(); resolve(u);
      }
    });
  }).catch(()=>null);
}

async function fetchMonthData(date, attempt = 0) {
  if (els.loading) els.loading.textContent = 'Loading…';
  const ym = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  let token = null;
  try {
    const user = await waitForAuthUser();
    token = await user?.getIdToken?.();
  } catch {}
  try {
    const resp = await fetch('/.netlify/functions/daily-cashflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ month: ym })
    });
    if (resp.status === 401 && attempt < 2) {
      // force token refresh once
      try { await auth.currentUser?.getIdToken?.(true); } catch {}
      return fetchMonthData(date, attempt + 1);
    }
    const json = await resp.json();
    if (json.ok) {
      DAY_DATA = json.days || {};
      if (els.loading) els.loading.textContent = '';
      if (els.empty) els.empty.classList.toggle('hidden', Object.keys(DAY_DATA).length !== 0);
      updateSummary();
    } else {
      DAY_DATA = {};
      if (els.loading) els.loading.textContent = 'Error';
      if (els.empty) els.empty.classList.add('hidden');
      updateSummary();
    }
  } catch (e) {
    DAY_DATA = {};
    if (els.loading) els.loading.textContent = 'Error';
    updateSummary();
  }
}

function valueScale(net, info = {}) {
  const income = Number(info.income || 0);
  const expense = Number(info.expense || 0);
  const maxMagnitude = Math.max(1, Math.abs(net), income, expense);
  const intensity = Math.min(1, maxMagnitude / 650);

  if (net > 0) {
    const start = `rgba(90, 232, 185, ${0.32 + intensity * 0.32})`;
    const end = `rgba(34, 75, 58, ${0.42 + intensity * 0.18})`;
    return `linear-gradient(145deg, ${start}, ${end})`;
  }
  if (net < 0) {
    const start = `rgba(255, 146, 164, ${0.38 + intensity * 0.32})`;
    const end = `rgba(61, 23, 36, ${0.46 + intensity * 0.18})`;
    return `linear-gradient(150deg, ${start}, ${end})`;
  }

  if (income || expense) {
    const blend = income && expense ? income / (income + expense) : 0.5;
    const pos = `rgba(102, 200, 255, ${0.28 + blend * 0.3})`;
    const neg = `rgba(255, 160, 120, ${0.24 + (1 - blend) * 0.3})`;
    return `linear-gradient(135deg, ${pos}, ${neg})`;
  }
  return 'linear-gradient(145deg, rgba(30,32,44,0.55), rgba(18,20,28,0.62))';
}

function renderCalendar(baseDate) {
  if (!els.grid) return;
  els.grid.innerHTML = '';
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const label = `${baseDate.toLocaleString('default', { month: 'long' })} ${y}`;
  if (els.monthLabel) els.monthLabel.textContent = label;

  let renderIndex = 0;
  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    empty.style.setProperty('--enter-index', renderIndex++);
    els.grid.appendChild(empty);
    requestAnimationFrame(() => empty.classList.add('cal-day--show'));
  }
  for (let d = 1; d <= lastDate; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.style.setProperty('--enter-index', renderIndex++);
    const dt = new Date(y, m, d);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) {
      cell.classList.add('today');
    }
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = d;
    cell.appendChild(date);

    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = DAY_DATA[iso];
    const amt = document.createElement('div');
    amt.className = 'amount';
    if (info) {
      const net = info.net;
      const sign = net > 0 ? '+' : (net < 0 ? '-' : '');
      amt.textContent = sign + '$' + Math.abs(net).toFixed(0);
      amt.classList.add(net < 0 ? 'amount-negative' : (net > 0 ? 'amount-positive' : 'muted'));
      cell.classList.add('has-data');
      if (net > 0) cell.classList.add('positive');
      else if (net < 0) cell.classList.add('negative');
      cell.style.background = valueScale(net, info);
      cell.dataset.income = info.income.toFixed(2);
      cell.dataset.expense = info.expense.toFixed(2);
      cell.dataset.net = net.toFixed(2);
    } else {
      amt.textContent = '—';
      amt.className += ' muted';
      cell.dataset.income = '0';
      cell.dataset.expense = '0';
      cell.dataset.net = '0';
    }
    cell.appendChild(amt);
    cell.addEventListener('mouseenter', () => showTooltip(cell, iso));
    cell.addEventListener('mouseleave', hideTooltip);
    els.grid.appendChild(cell);
    requestAnimationFrame(() => cell.classList.add('cal-day--show'));
  }
}

let tooltipEl = null;
function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'calendar-tooltip hidden';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function showTooltip(cell, iso) {
  const el = ensureTooltip();
  const inc = Number(cell.dataset.income || 0);
  const exp = Number(cell.dataset.expense || 0);
  const net = Number(cell.dataset.net || 0);
  el.innerHTML = `<div class='tt-date'>${iso}</div>
    <div class='tt-row'><span>Income</span><span>$${inc.toFixed(2)}</span></div>
    <div class='tt-row'><span>Expense</span><span>$${exp.toFixed(2)}</span></div>
    <div class='tt-row net'><span>Net</span><span>${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}</span></div>`;
  const r = cell.getBoundingClientRect();
  el.style.top = (window.scrollY + r.top - 8) + 'px';
  el.style.left = (window.scrollX + r.right + 8) + 'px';
  el.classList.remove('hidden');
}
function hideTooltip() { if (tooltipEl) tooltipEl.classList.add('hidden'); }

function fmtCurrency(value) {
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return formatter.format(value || 0);
}

function updateSummary() {
  if (!els.summaryNet || !els.summaryIncome || !els.summaryExpense) return;
  let income = 0, expense = 0;
  Object.values(DAY_DATA).forEach(day => {
    income += Number(day?.income || 0);
    expense += Number(day?.expense || 0);
  });
  const net = income - expense;

  els.summaryIncome.textContent = fmtCurrency(income);
  els.summaryExpense.textContent = fmtCurrency(expense);
  els.summaryNet.textContent = fmtCurrency(net);

  [els.summaryNet.parentElement, els.summaryIncome.parentElement, els.summaryExpense.parentElement].forEach(pill => {
    if (!pill) return;
    pill.classList.remove('positive', 'negative');
  });

  if (net > 0) els.summaryNet.parentElement?.classList.add('positive');
  if (net < 0) els.summaryNet.parentElement?.classList.add('negative');
}

function wire() {
  els.prev?.addEventListener('click', async () => {
    CURRENT = new Date(CURRENT.getFullYear(), CURRENT.getMonth() - 1, 1);
    await fetchMonthData(CURRENT);
    renderCalendar(CURRENT);
  });
  els.next?.addEventListener('click', async () => {
    CURRENT = new Date(CURRENT.getFullYear(), CURRENT.getMonth() + 1, 1);
    await fetchMonthData(CURRENT);
    renderCalendar(CURRENT);
  });

  try {
    window.addEventListener('transactions:changed', () => {
      fetchMonthData(CURRENT).then(() => renderCalendar(CURRENT));
    });
  } catch {}
}

document.addEventListener('DOMContentLoaded', async () => {
  wire();
  await fetchMonthData(CURRENT);
  renderCalendar(CURRENT);
});
