// public/Net/net.js
// Advanced net insight analytics for Vibance dashboard

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  formatCurrency,
  formatPercent,
  pluralize,
  computeStats,
  composeNarrative,
  buildInsights,
} from './net-logic.mjs';

const els = {
  range: document.getElementById('range-select'),
  netValue: document.getElementById('stat-net-current'),
  netChangePill: document.getElementById('stat-net-change-pill'),
  netChangeText: document.getElementById('stat-net-change'),
  netChangePct: document.getElementById('stat-net-change-pct'),
  netAverage: document.getElementById('stat-net-average'),
  incomeTotal: document.getElementById('stat-income-total'),
  incomeAverage: document.getElementById('stat-income-average'),
  expenseTotal: document.getElementById('stat-expense-total'),
  expenseAverage: document.getElementById('stat-expense-average'),
  netMargin: document.getElementById('stat-net-margin'),
  ratio: document.getElementById('stat-ratio'),
  streak: document.getElementById('stat-streak'),
  chartTrack: document.querySelector('#chart-bars .chart-track'),
  timeline: document.getElementById('timeline-list'),
  categoryExpenses: document.getElementById('category-expense-list'),
  categoryIncome: document.getElementById('category-income-list'),
  insights: document.getElementById('insights-list'),
  main: document.getElementById('net-main'),
  empty: document.getElementById('net-empty'),
  heroSubtitle: document.getElementById('hero-subtitle'),
  backBtn: document.getElementById('net-back'),
  backLabel: document.querySelector('#net-back span'),
  prefsToggle: document.getElementById('insight-prefs-toggle'),
  prefsPanel: document.getElementById('insight-prefs-panel'),
  prefsForm: document.getElementById('insight-prefs-form'),
};

const rangeLabelNodes = document.querySelectorAll('[data-range-label]');
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

let UID = null;
let currentRange = Number(els.range?.value || 6);
let loadToken = 0;

const defaultInsightToggles = {
  summary: true,
  momentum: true,
  forecasts: true,
  expenses: true,
  income: true,
  volatility: true,
  actions: true,
};

const defaultInsightSettings = {
  insightCount: 4,
};

const cachedInsightPrefs = readInsightPrefsCache();
let insightPrefs = normalizeInsightPrefs(cachedInsightPrefs);
let lastStats = null;
let lastRows = [];
let prefSaveTimer = null;

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildMonthKeys(count) {
  const months = [];
  const anchor = new Date();
  anchor.setDate(1);
  anchor.setHours(0, 0, 0, 0);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - offset);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function clampInsightCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultInsightSettings.insightCount;
  return Math.min(6, Math.max(2, Math.round(num)));
}

function normalizeInsightPrefs(input = {}) {
  const normalized = {
    ...defaultInsightToggles,
    ...defaultInsightSettings,
  };

  Object.keys(defaultInsightToggles).forEach((key) => {
    if (typeof input[key] === 'boolean') {
      normalized[key] = input[key];
    }
  });

  if (input && Object.prototype.hasOwnProperty.call(input, 'insightCount')) {
    normalized.insightCount = clampInsightCount(input.insightCount);
  }

  return normalized;
}

function readInsightPrefsCache() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem('vb_net_insight_prefs');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeInsightPrefs(parsed);
  } catch (error) {
    console.warn('[Net] failed to read insight prefs cache', error);
    return {};
  }
}

function writeInsightPrefsCache(prefs) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('vb_net_insight_prefs', JSON.stringify(prefs));
  } catch (error) {
    console.warn('[Net] failed to write insight prefs cache', error);
  }
}

function getInsightPrefDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'netInsight');
}

async function loadInsightPreferences(uid) {
  if (!uid) return;
  try {
    const snap = await getDoc(getInsightPrefDoc(uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      insightPrefs = normalizeInsightPrefs({ ...insightPrefs, ...data });
      writeInsightPrefsCache(insightPrefs);
    }
  } catch (error) {
    console.warn('[Net] failed to load insight prefs', error);
  }
  syncPreferenceForm();
  if (lastStats) {
    renderInsights(lastStats, lastRows);
  }
}

async function persistInsightPreferences() {
  if (!UID) return;
  try {
    await setDoc(getInsightPrefDoc(UID), {
      ...insightPrefs,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (error) {
    console.warn('[Net] failed to persist insight prefs', error);
  }
}

function schedulePreferenceSave() {
  writeInsightPrefsCache(insightPrefs);
  if (!UID) return;
  if (prefSaveTimer) clearTimeout(prefSaveTimer);
  prefSaveTimer = setTimeout(() => {
    prefSaveTimer = null;
    persistInsightPreferences();
  }, 400);
}

function updateInsightDensityIndicator(value = clampInsightCount(insightPrefs.insightCount)) {
  if (!els.prefsForm) return;
  const indicator = els.prefsForm.querySelector('[data-insight-count]');
  if (indicator) {
    indicator.textContent = `${value} ${pluralize('card', value)}`;
  }
}

function syncPreferenceForm() {
  if (!els.prefsForm) return;
  const inputs = els.prefsForm.querySelectorAll('input[data-pref]');
  inputs.forEach((input) => {
    const prefKey = input.dataset.pref;
    if (!prefKey) return;
    if (prefKey === 'insightCount') {
      const nextValue = clampInsightCount(insightPrefs.insightCount);
      if (input.value !== String(nextValue)) input.value = String(nextValue);
    } else if (prefKey in defaultInsightToggles) {
      input.checked = insightPrefs[prefKey] !== false;
    }
  });
  updateInsightDensityIndicator();
}

function updateRangeLabels(rangeMonths) {
  const label = `${rangeMonths} ${pluralize('month', rangeMonths)}`;
  rangeLabelNodes.forEach((node) => {
    node.textContent = label;
  });
}

function applyTrendPill(delta) {
  if (!els.netChangePill) return;
  const pill = els.netChangePill;
  pill.classList.remove('trend-pill--up', 'trend-pill--down', 'trend-pill--flat');
  if (!pill.classList.contains('trend-pill')) pill.classList.add('trend-pill');
  const icon = pill.querySelector('[data-icon="trend"]');
  if (delta === null || delta === undefined) {
    pill.classList.add('trend-pill--flat');
    if (icon) icon.style.transform = 'rotate(0deg)';
    return;
  }
  if (delta > 0) {
    pill.classList.add('trend-pill--up');
    if (icon) icon.style.transform = 'rotate(0deg)';
    return;
  }
  if (delta < 0) {
    pill.classList.add('trend-pill--down');
    if (icon) icon.style.transform = 'rotate(180deg)';
    return;
  }
  pill.classList.add('trend-pill--flat');
  if (icon) icon.style.transform = 'rotate(0deg)';
}

async function fetchRollupWindow(uid, monthKeys) {
  const rollupRef = collection(db, 'users', uid, 'rollups');
  const monthSet = new Set(monthKeys);
  const startKey = monthKeys[0];
  const endKey = monthKeys[monthKeys.length - 1];

  let snap;
  try {
    snap = await getDocs(query(
      rollupRef,
      orderBy('periodKey'),
      where('periodKey', '>=', startKey),
      where('periodKey', '<=', endKey),
    ));
  } catch (primaryError) {
    console.warn('[Net] rollup range query fell back:', primaryError);
    try {
      snap = await getDocs(query(rollupRef, orderBy('periodKey')));
    } catch (secondaryError) {
      console.warn('[Net] secondary rollup query fallback:', secondaryError);
      snap = await getDocs(rollupRef);
    }
  }

  const monthData = {};
  monthKeys.forEach((key) => {
    monthData[key] = { income: 0, expense: 0 };
  });
  const categoryTotals = new Map();

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const periodKey = data.periodKey || (docSnap.id.split('_')[0] || '');
    if (!monthSet.has(periodKey)) return;
    const income = Math.max(0, safeNumber(data.incomeTotal, 0));
    const expense = Math.max(0, safeNumber(data.expenseTotal, 0));
    monthData[periodKey].income += income;
    monthData[periodKey].expense += expense;

    const categoryId = data.categoryId || docSnap.id.split('_').slice(1).join('_') || 'Uncategorized';
    const entry = categoryTotals.get(categoryId) || { income: 0, expense: 0 };
    entry.income += income;
    entry.expense += expense;
    categoryTotals.set(categoryId, entry);
  });

  return { monthData, categoryTotals };
}

function clearVisuals() {
  if (els.chartTrack) els.chartTrack.innerHTML = '';
  if (els.timeline) els.timeline.innerHTML = '';
  if (els.categoryExpenses) els.categoryExpenses.innerHTML = '';
  if (els.categoryIncome) els.categoryIncome.innerHTML = '';
  if (els.insights) els.insights.innerHTML = '';
}

function setupPreferencesUI() {
  const toggle = els.prefsToggle;
  const panel = els.prefsPanel;
  const form = els.prefsForm;
  if (!toggle || !panel) return;

  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'insight-prefs-panel');
  panel.dataset.open = panel.dataset.open || 'false';

  const openPanel = () => {
    panel.classList.remove('hidden');
    panel.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
  };

  const closePanel = () => {
    panel.classList.add('hidden');
    panel.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    const isOpen = panel.dataset.open === 'true';
    if (isOpen) closePanel();
    else openPanel();
  });

  document.addEventListener('click', (event) => {
    if (panel.dataset.open !== 'true') return;
    if (panel.contains(event.target) || toggle.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.dataset.open === 'true') {
      closePanel();
      toggle.focus();
    }
  });

  if (form) {
    const densityInput = form.querySelector('input[data-pref="insightCount"]');
    if (densityInput) {
      const initialValue = clampInsightCount(insightPrefs.insightCount);
      densityInput.value = String(initialValue);
      updateInsightDensityIndicator(initialValue);
      densityInput.addEventListener('input', (event) => {
        const nextValue = clampInsightCount(event.target.value);
        updateInsightDensityIndicator(nextValue);
      });
    }

    form.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const prefKey = target.dataset.pref;
      if (!prefKey) return;

      if (prefKey === 'insightCount') {
        const nextValue = clampInsightCount(target.value);
        insightPrefs.insightCount = nextValue;
        target.value = String(nextValue);
        updateInsightDensityIndicator(nextValue);
        schedulePreferenceSave();
        renderInsights(lastStats, lastRows);
        return;
      }

      if (!(prefKey in defaultInsightToggles)) return;
      insightPrefs[prefKey] = target.checked;
      schedulePreferenceSave();
      renderInsights(lastStats, lastRows);
    });
  }

  syncPreferenceForm();
}

function showEmpty(rangeMonths) {
  updateRangeLabels(rangeMonths);
  if (els.main) els.main.classList.add('hidden');
  if (els.empty) els.empty.classList.remove('hidden');
  lastStats = null;
  lastRows = [];
  if (els.netValue) els.netValue.textContent = '—';
  if (els.netAverage) els.netAverage.textContent = '—';
  if (els.netChangeText) els.netChangeText.textContent = '—';
  if (els.netChangePct) els.netChangePct.textContent = 'Awaiting comparison';
  if (els.incomeTotal) els.incomeTotal.textContent = '—';
  if (els.incomeAverage) els.incomeAverage.textContent = '—';
  if (els.expenseTotal) els.expenseTotal.textContent = '—';
  if (els.expenseAverage) els.expenseAverage.textContent = '—';
  if (els.netMargin) els.netMargin.textContent = '—';
  if (els.ratio) els.ratio.textContent = '—';
  if (els.streak) els.streak.textContent = 'No activity yet';
  if (els.heroSubtitle) {
    const label = `${rangeMonths} ${pluralize('month', rangeMonths)}`;
    els.heroSubtitle.textContent = `When transactions arrive, we’ll narrate your last ${label}.`;
  }
  applyTrendPill(null);
  clearVisuals();
}

function showMain() {
  if (els.empty) els.empty.classList.add('hidden');
  if (els.main) els.main.classList.remove('hidden');
}

function renderHighlights(rows, stats, rangeMonths) {
  updateRangeLabels(rangeMonths);
  if (els.netValue) {
    els.netValue.textContent = formatCurrency(stats.current.net, { maximumFractionDigits: 0 });
  }
  if (els.netChangeText) {
    const deltaText = stats.netChange !== null
      ? formatCurrency(stats.netChange, { maximumFractionDigits: 0, withSign: true })
      : '—';
    els.netChangeText.textContent = deltaText;
  }
  if (els.netChangePct) {
    if (stats.netChangePct !== null) {
      const reference = stats.previous?.label || 'prior month';
      els.netChangePct.textContent = `${formatPercent(stats.netChangePct, 1, { withSign: true })} vs ${reference}`;
    } else {
      els.netChangePct.textContent = 'Awaiting comparison';
    }
  }
  applyTrendPill(stats.netChange);

  if (els.netAverage) {
    els.netAverage.textContent = formatCurrency(stats.avgNet, { maximumFractionDigits: 0 });
  }
  if (els.incomeTotal) {
    els.incomeTotal.textContent = formatCurrency(stats.totals.income, { maximumFractionDigits: 0 });
  }
  if (els.incomeAverage) {
    els.incomeAverage.textContent = formatCurrency(stats.avgIncome, { maximumFractionDigits: 0 });
  }
  if (els.expenseTotal) {
    els.expenseTotal.textContent = formatCurrency(stats.totals.expense, { maximumFractionDigits: 0 });
  }
  if (els.expenseAverage) {
    els.expenseAverage.textContent = formatCurrency(stats.avgExpense, { maximumFractionDigits: 0 });
  }
  if (els.netMargin) {
    els.netMargin.textContent = stats.netMargin !== null ? formatPercent(stats.netMargin, stats.netMargin > 0.25 ? 0 : 1) : '—';
  }
  if (els.ratio) {
    if (stats.ratio === Infinity) els.ratio.textContent = '∞';
    else if (stats.ratio !== null) els.ratio.textContent = `${stats.ratio.toFixed(stats.ratio >= 10 ? 0 : 2)}x`;
    else els.ratio.textContent = '—';
  }
  if (els.heroSubtitle) {
    els.heroSubtitle.textContent = composeNarrative(stats, rows, rangeMonths, insightPrefs);
  }
  if (els.streak) {
    if (stats.positiveStreak > 0) {
      els.streak.textContent = `${stats.positiveStreak} ${pluralize('month', stats.positiveStreak)} positive`;
    } else if (stats.positiveMonths > 0) {
      els.streak.textContent = `${stats.positiveMonths}/${rows.length} months finished positive`;
    } else {
      els.streak.textContent = 'No positive months yet';
    }
  }
}

function renderChart(rows) {
  if (!els.chartTrack) return;
  els.chartTrack.innerHTML = '';
  const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));
  rows.forEach((row) => {
    const col = document.createElement('div');
    col.className = 'chart-col';

    const month = document.createElement('span');
    month.className = 'text-xs text-slate-300/70';
    month.textContent = row.label;
    col.appendChild(month);

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    const incomeBar = document.createElement('div');
    incomeBar.className = 'chart-bar chart-bar--income';
    const incomeHeight = row.income > 0 ? Math.min(100, Math.max(6, (row.income / maxValue) * 100)) : 0;
    incomeBar.style.height = `${incomeHeight}%`;
    bars.appendChild(incomeBar);

    const expenseBar = document.createElement('div');
    expenseBar.className = 'chart-bar chart-bar--expense';
    const expenseHeight = row.expense > 0 ? Math.min(100, Math.max(6, (row.expense / maxValue) * 100)) : 0;
    expenseBar.style.height = `${expenseHeight}%`;
    bars.appendChild(expenseBar);

    col.appendChild(bars);

    const net = document.createElement('div');
    net.className = `chart-net ${row.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;
    const notation = Math.abs(row.net) >= 1000 ? 'compact' : 'standard';
    const digits = notation === 'compact' ? 1 : 0;
    net.textContent = formatCurrency(row.net, { maximumFractionDigits: digits, notation, withSign: true });
    col.appendChild(net);

    els.chartTrack.appendChild(col);
  });
}

function renderTimeline(rows, stats) {
  if (!els.timeline) return;
  els.timeline.innerHTML = '';
  const reversed = [...rows].reverse();
  const maxAbsNet = Math.max(1, ...rows.map((row) => Math.abs(row.net)));

  reversed.forEach((row, index) => {
    const li = document.createElement('li');
    li.className = 'timeline-row';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-3';

    const title = document.createElement('div');
    title.innerHTML = `
      <p class="text-sm font-semibold text-slate-200/90">${row.label}</p>
      <p class="text-xs text-slate-400/70">Income ${formatCurrency(row.income, { maximumFractionDigits: 0 })} • Expenses ${formatCurrency(row.expense, { maximumFractionDigits: 0 })}</p>
    `.trim();
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.className = `text-sm font-semibold ${row.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;
    badge.textContent = formatCurrency(row.net, { maximumFractionDigits: 0, withSign: true });
    header.appendChild(badge);

    li.appendChild(header);

    const prev = index < reversed.length - 1 ? reversed[index + 1] : null;
    if (prev) {
      const delta = row.net - prev.net;
      const detail = document.createElement('div');
      detail.className = 'text-xs text-slate-400/70';
      if (delta === 0) {
        detail.textContent = 'Net even with the prior month.';
      } else {
        const direction = delta > 0 ? 'improved' : 'softened';
        detail.textContent = `${row.net >= 0 ? 'Surplus' : 'Shortfall'} ${direction} by ${formatCurrency(delta, { maximumFractionDigits: 0, withSign: true })} vs ${prev.label}.`;
      }
      li.appendChild(detail);
    }

    const progress = document.createElement('div');
    progress.className = 'timeline-progress';
    const fill = document.createElement('span');
    const scale = Math.max(0, Math.min(1, Math.abs(row.net) / maxAbsNet));
    fill.style.transform = `scaleX(${scale})`;
    if (row.net < 0) {
      fill.style.background = 'linear-gradient(90deg, rgba(248,113,113,0.55), rgba(248,113,113,0.78))';
    }
    progress.appendChild(fill);
    li.appendChild(progress);

    els.timeline.appendChild(li);
  });
}

function renderCategoryList(listEl, entries, total, type) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!entries.length || total <= 0) {
    const empty = document.createElement('li');
    empty.className = 'text-sm text-slate-400/60';
    empty.textContent = type === 'income' ? 'No income sources recorded.' : 'No spending captured.';
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'category-pill';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-3';

    const label = document.createElement('span');
    label.className = 'text-sm text-slate-200/90';
    label.textContent = entry.name;
    header.appendChild(label);

    const amount = document.createElement('strong');
    amount.className = `text-sm ${type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`;
    const value = type === 'income' ? entry.income : entry.expense;
    amount.textContent = formatCurrency(value, { maximumFractionDigits: 0 });
    header.appendChild(amount);

    li.appendChild(header);

    const share = total > 0 ? value / total : 0;
    const shareLabel = document.createElement('span');
    shareLabel.className = 'text-xs text-slate-400/70';
    shareLabel.textContent = `${formatPercent(share, share > 0.2 ? 0 : 1)} of ${type === 'income' ? 'income' : 'spend'}`;
    li.appendChild(shareLabel);

    const track = document.createElement('div');
    track.className = `progress-track${type === 'income' ? ' progress-track--income' : ''}`;
    const fill = document.createElement('span');
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, share))})`;
    track.appendChild(fill);
    li.appendChild(track);

    listEl.appendChild(li);
  });
}

function renderCategories(stats) {
  renderCategoryList(
    els.categoryExpenses,
    stats.topExpenses.slice(0, 5),
    stats.totals.expense,
    'expense',
  );
  renderCategoryList(
    els.categoryIncome,
    stats.topIncomes.slice(0, 5),
    stats.totals.income,
    'income',
  );
}

function createInsightCard({ title, body, tone = 'neutral' }) {
  const card = document.createElement('article');
  card.className = 'insight-card';
  if (tone !== 'neutral') card.dataset.tone = tone;
  const heading = document.createElement('h3');
  heading.className = 'text-sm font-semibold text-white';
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.className = 'text-sm leading-relaxed text-slate-300/75';
  paragraph.textContent = body;
  card.append(heading, paragraph);
  return card;
}

function renderInsights(stats, rows) {
  if (!els.insights) return;
  els.insights.innerHTML = '';

  const allInsights = buildInsights(stats, rows);
  const hadGeneratedContent = allInsights.length > 0;
  const filtered = allInsights.filter((insight) => {
    if (!insight.kind) return true;
    return insightPrefs[insight.kind] !== false;
  });

  const unique = [];
  const seen = new Set();
  filtered.forEach((insight) => {
    if (!insight.title || seen.has(insight.title)) return;
    seen.add(insight.title);
    unique.push(insight);
  });

  const maxCards = clampInsightCount(insightPrefs.insightCount);
  let items;
  if (unique.length) {
    items = unique.slice(0, maxCards);
  } else if (hadGeneratedContent) {
    items = [{
      title: 'Personalize your feed',
      body: 'All insight types are currently hidden. Toggle categories back on using the Personalize button.',
      tone: 'neutral',
    }];
  } else {
    items = [{
      title: 'Sync accounts to unlock insights',
      body: 'Once income and expenses begin flowing, Vibance will surface tailored guidance automatically.',
      tone: 'neutral',
    }];
  }

  items.forEach((insight) => {
    els.insights.appendChild(createInsightCard(insight));
  });
}

async function loadRange(rangeMonths) {
  if (!UID) return;
  const token = ++loadToken;
  updateRangeLabels(rangeMonths);
  try {
    const monthKeys = buildMonthKeys(rangeMonths);
    const { monthData, categoryTotals } = await fetchRollupWindow(UID, monthKeys);
    if (token !== loadToken) return;

    const rows = monthKeys.map((key) => {
      const data = monthData[key] || { income: 0, expense: 0 };
      const [year, month] = key.split('-').map((part) => Number(part) || 0);
      const label = monthFormatter.format(new Date(year, Math.max(0, month - 1), 1));
      const income = data.income || 0;
      const expense = data.expense || 0;
      return {
        key,
        label,
        income,
        expense,
        net: income - expense,
      };
    });

    const hasData = rows.some((row) => row.income > 0 || row.expense > 0);
    if (!hasData) {
      showEmpty(rangeMonths);
      return;
    }

    const stats = computeStats(rows, categoryTotals);
    lastStats = stats;
    lastRows = rows;
    showMain();
    renderHighlights(rows, stats, rangeMonths);
    renderChart(rows);
    renderTimeline(rows, stats);
    renderCategories(stats);
    renderInsights(stats, rows);
  } catch (error) {
    console.error('[Net] failed to load range', error);
    showEmpty(rangeMonths);
  }
}

function handleBackButton() {
  if (!els.backBtn) return;
  const params = new URLSearchParams(location.search);
  const fromParam = (params.get('from') || '').toLowerCase();
  const fallback = fromParam === 'income' ? '/Income/income.html' : '/Expenses/expenses.html';
  const ref = document.referrer || '';
  const cameFromKnown = /\/income\//i.test(ref) || /\/expenses\//i.test(ref);

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

function init() {
  handleBackButton();
  setupPreferencesUI();
  updateRangeLabels(currentRange);

  els.range?.addEventListener('change', (event) => {
    const next = Number(event.target.value) || 6;
    currentRange = next;
    if (UID) loadRange(next);
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      UID = null;
      insightPrefs = normalizeInsightPrefs({ ...defaultInsightToggles, ...defaultInsightSettings, ...readInsightPrefsCache() });
      syncPreferenceForm();
      if (els.prefsPanel) {
        els.prefsPanel.classList.add('hidden');
        els.prefsPanel.dataset.open = 'false';
      }
      if (els.prefsToggle) {
        els.prefsToggle.setAttribute('aria-expanded', 'false');
      }
      showEmpty(currentRange);
      return;
    }
    UID = user.uid;
    insightPrefs = normalizeInsightPrefs({ ...defaultInsightToggles, ...defaultInsightSettings, ...readInsightPrefsCache() });
    syncPreferenceForm();
    await loadInsightPreferences(UID);
    await loadRange(currentRange);
  });
}

document.addEventListener('DOMContentLoaded', init);
