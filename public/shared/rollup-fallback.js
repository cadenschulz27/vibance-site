// public/shared/rollup-fallback.js
// -----------------------------------------------------------------------------
// Fallback utilities to derive monthly rollups directly from transaction data.
// Used when server-side rollups have not been generated yet so that linked
// accounts and manual entries still power analytics experiences (Income score,
// Net Insight, etc.).
// -----------------------------------------------------------------------------

import { db } from '../api/firebase.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeUniversal } from './transactions.js';

const PER_ITEM_LIMIT = 500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes to avoid hammering Firestore

const FALLBACK_CACHE = new Map();

function setCache(key, payload) {
  FALLBACK_CACHE.set(key, { payload, timestamp: Date.now() });
}

function getCache(key) {
  const cached = FALLBACK_CACHE.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    FALLBACK_CACHE.delete(key);
    return null;
  }
  return cached.payload;
}

function buildRecentMonthKeys(count = 12) {
  const result = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push(key);
  }
  return result;
}

function monthKeyFromDate(input) {
  if (!input) return null;
  const date = (input instanceof Date) ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function earliestMonthStart(monthKeys) {
  if (!monthKeys || !monthKeys.length) return new Date(0);
  const last = monthKeys[monthKeys.length - 1];
  const [year, month] = last.split('-').map((part) => Number(part) || 0);
  return new Date(year, Math.max(0, month - 1), 1, 0, 0, 0, 0);
}

async function loadPlaidItems(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'plaid_items'));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
}

async function loadTransactionOverrides(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'transaction_overrides'));
  const map = new Map();
  snap.forEach((docSnap) => {
    map.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() || {}) });
  });
  return map;
}

async function loadManualEntries(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'manual_entries'));
  const entries = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const type = data.type || 'expense';
    const canonical = normalizeUniversal({
      id: docSnap.id,
      itemId: 'manual',
      type,
      amount: type === 'income' ? -Math.abs(Number(data.amount || 0)) : Math.abs(Number(data.amount || 0)),
      date: data.date || null,
      name: data.name || data.description || (type === 'income' ? 'Manual income' : 'Manual expense'),
      categoryUser: data.category || '',
      isoCurrency: data.currency || 'USD',
      archived: !!data.archived,
      notes: data.notes || '',
      manual: true,
      raw: data,
    }, type);
    if (canonical) entries.push(canonical);
  });
  return entries;
}

function applyOverrideToRow(baseRow, override) {
  if (!override) return baseRow;
  const row = { ...baseRow, override: true };
  if (override.name) row.name = override.name;
  if (override.notes) row.notes = override.notes;
  if (override.category) row.categoryUser = override.category;
  if (override.currency) row.isoCurrency = override.currency;
  if (override.date) row.date = override.date;
  if (typeof override.archived === 'boolean') row.archived = override.archived;

  if (Number.isFinite(override.amount)) {
    const value = Math.abs(Number(override.amount));
    if ((override.type || row.type) === 'income') {
      row.amount = -value;
    } else {
      row.amount = value;
    }
  }

  if (override.type === 'income' || override.type === 'expense') {
    row.type = override.type;
  }

  return row;
}

async function loadPlaidTransactions(uid, items, overridesMap, monthKeys) {
  const rows = [];
  const earliest = earliestMonthStart(monthKeys);
  const monthSet = new Set(monthKeys);

  for (const item of items) {
    const txRef = collection(db, 'users', uid, 'plaid_items', item.id, 'transactions');
    let snap;
    try {
      snap = await getDocs(query(txRef, orderBy('date', 'desc'), limit(PER_ITEM_LIMIT)));
    } catch (primaryError) {
      console.warn('[rollup-fallback] primary query failed, using unbounded fetch', primaryError);
      snap = await getDocs(txRef);
    }

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const dateStr = data.date || data.authorized_date || data.posted_at || data.timestamp || null;
      const monthKey = monthKeyFromDate(dateStr);
      if (!monthKey) return;
  if (!monthSet.has(monthKey) && new Date(dateStr) < earliest) return;

      const baseRow = {
        id: docSnap.id,
        itemId: item.id,
        type: Number(data.amount || 0) < 0 ? 'income' : 'expense',
        amount: Number(data.amount || 0),
        date: dateStr,
        name: data.name || data.merchant_name || 'Transaction',
        merchant: data.merchant_name || '',
        categoryAuto: Array.isArray(data.category) ? data.category.join(' / ') : (data.personal_finance_category?.primary || ''),
        categoryUser: data.categoryUser || '',
        isoCurrency: data.iso_currency_code || data.currency || 'USD',
        pending: !!data.pending,
        archived: false,
        notes: '',
        raw: data,
      };

      const overrideKey = `${item.id}__${docSnap.id}`;
      const rowWithOverride = applyOverrideToRow(baseRow, overridesMap.get(overrideKey));
      const canonical = normalizeUniversal(rowWithOverride, rowWithOverride.type);
      if (!canonical) return;
      if (canonical.archived) return;

      const month = monthKeyFromDate(canonical.date);
      if (!month || !monthSet.has(month)) return;
      rows.push(canonical);
    });
  }

  return rows;
}

export async function computeMonthlyRollupsFromTransactions(uid, { months = 12 } = {}) {
  if (!uid) return { monthSummaries: [], categoryTotals: new Map(), source: 'transactions' };
  const monthKeys = buildRecentMonthKeys(months);
  const monthSet = new Set(monthKeys);
  const cacheKey = `${uid}:${months}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const [items, overridesMap, manualEntries] = await Promise.all([
      loadPlaidItems(uid),
      loadTransactionOverrides(uid),
      loadManualEntries(uid)
    ]);

    const plaidRows = await loadPlaidTransactions(uid, items, overridesMap, monthKeys);
    const allRows = plaidRows.concat(
      manualEntries.filter((entry) => monthSet.has(monthKeyFromDate(entry.date)))
    );

    const monthTotals = new Map();
    monthKeys.forEach((key) => {
      monthTotals.set(key, { income: 0, expense: 0 });
    });

    const categoryTotals = new Map();

    allRows.forEach((tx) => {
      const month = monthKeyFromDate(tx.date);
      if (!month || !monthTotals.has(month)) return;
      const record = monthTotals.get(month);
      const amount = Math.abs(Number(tx.amount || 0)) || 0;
      if (!amount) return;

      if (tx.type === 'income') {
        record.income += amount;
      } else {
        record.expense += amount;
      }

      monthTotals.set(month, record);

      const category = tx.categoryUser || tx.categoryAuto || 'Uncategorized';
      const catEntry = categoryTotals.get(category) || { income: 0, expense: 0 };
      if (tx.type === 'income') {
        catEntry.income += amount;
      } else {
        catEntry.expense += amount;
      }
      categoryTotals.set(category, catEntry);
    });

    const monthSummaries = monthKeys.map((key) => {
      const entry = monthTotals.get(key) || { income: 0, expense: 0 };
      return {
        month: key,
        incomeTotal: entry.income,
        expenseTotal: entry.expense,
      };
    });

    const payload = { monthSummaries, categoryTotals, source: 'transactions' };
    setCache(cacheKey, payload);
    return payload;
  } catch (error) {
    console.warn('[rollup-fallback] failed to compute fallback rollups', error);
    return { monthSummaries: [], categoryTotals: new Map(), source: 'transactions', error };
  }
}

export { buildRecentMonthKeys };

export default computeMonthlyRollupsFromTransactions;
