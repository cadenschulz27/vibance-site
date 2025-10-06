// public/shared/transactions.js
// ------------------------------------------------------------
// Unified transaction helpers (expenses + income + manual + overrides)
// Provides:
//  - Canonical schema normalization
//  - Fetch utilities (current simple version: per-page modules still fetch raw; later we consolidate)
//  - CRUD helpers for manual entries & overrides
//  - Event dispatch so Budgeting / Dashboard can react without tight coupling
//  - Lightweight in-memory subscription system
//
// Canonical Transaction Object Shape (all amounts positive):
// {
//   id, itemId, type: 'expense'|'income', amount, rawAmount,
//   isoCurrency, date, epoch, name, merchant,
//   categoryUser, categoryAuto, notes,
//   pending, archived, manual, override,
//   institution, source: 'plaid'|'manual'|'override',
//   createdAt, updatedAt, _raw (optional reference)
// }
// ------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  collection, doc, setDoc, addDoc, deleteDoc, Timestamp,
  getDocs, getDoc, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// -------------- Internal state & events --------------
const listeners = new Set();

export function subscribeTransactions(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event, tx) {
  const detail = { event, tx };
  try { window.dispatchEvent(new CustomEvent('transactions:changed', { detail })); } catch {}
  listeners.forEach(fn => {
    try { fn(detail); } catch (e) { console.warn('transactions listener error', e); }
  });
}

// -------------- Rollup Delta Emission --------------
async function sendRollupDeltas(deltas) {
  try {
    const user = auth.currentUser; if (!user) return;
    if (!Array.isArray(deltas) || !deltas.length) return;
    const token = await user.getIdToken?.();
    await fetch('/.netlify/functions/rollup-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify({ userId: user.uid, deltas })
    }).catch(() => {});
  } catch (e) { /* silent */ }
}

function makeDeltaFromTx(op, prevTx, nextTx) {
  // Convert canonical tx -> rollup delta entry structure
  const base = (tx) => {
    if (!tx) return null;
    const amount = Math.abs(Number(tx.amount || 0)) || 0;
    const effectiveAmount = tx.archived ? 0 : amount;
    const category = (tx.categoryUser || tx.categoryAuto || tx.category || 'Uncategorized') || 'Uncategorized';
    const type = tx.type === 'income' ? 'income' : 'expense';
    const rawDate = (tx.date || (typeof tx._epoch === 'number' && Number.isFinite(tx._epoch)
      ? new Date(tx._epoch).toISOString().slice(0, 10)
      : ''));
    const date = (rawDate && rawDate.length >= 10) ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return {
      type,
      amount: effectiveAmount,
      category,
      date,
    };
  };
  if (op === 'add') return { op: 'add', ...base(nextTx) };
  if (op === 'delete') return { op: 'delete', ...base(prevTx) };
  if (op === 'update') return { op: 'update', prev: base(prevTx), next: base(nextTx) };
  return null;
}

// -------------- Normalization --------------
function parseLocalDateEpoch(str) {
  if (!str) return 0;
  if (typeof str !== 'string') {
    const d = (typeof str?.toDate === 'function') ? str.toDate() : new Date(str);
    const t = d?.getTime?.() ?? NaN; return Number.isNaN(t) ? 0 : t;
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
  const t = Date.parse(str); return Number.isNaN(t) ? 0 : t;
}

// Accepts raw expense (positive amount) row from expenses page
export function normalizeExpenseRow(row) {
  if (!row) return null;
  const epoch = typeof row._epoch === 'number' ? row._epoch : parseLocalDateEpoch(row.date);
  const amount = Math.abs(Number(row.amount || 0)) || 0;
  return {
    id: row.id,
    itemId: row.itemId || 'unknown',
    type: 'expense',
    amount,
    rawAmount: row.amount,
    isoCurrency: row.isoCurrency || 'USD',
    date: (row.date || (epoch ? new Date(epoch).toISOString().slice(0,10) : '')),
    epoch,
    name: row.name || 'Transaction',
    merchant: row.merchant || '',
    categoryUser: row.categoryUser || row.category || '',
    categoryAuto: row.categoryAuto || '',
    notes: row.notes || '',
    pending: !!row.pending,
    archived: !!row.archived,
    manual: !!row.manual,
    override: !!row.override,
    institution: row.institution_name || row.institution || '',
    source: row.manual ? 'manual' : (row.override ? 'override' : 'plaid'),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    _raw: row,
  };
}

// Accepts raw income row (currently negative amount) from income page
export function normalizeIncomeRow(row) {
  if (!row) return null;
  const epoch = typeof row._epoch === 'number' ? row._epoch : parseLocalDateEpoch(row.date);
  const abs = Math.abs(Number(row.amount || 0)) || 0;
  return {
    id: row.id,
    itemId: row.itemId || 'unknown',
    type: 'income',
    amount: abs, // canonical positive
    rawAmount: row.amount,
    isoCurrency: row.isoCurrency || 'USD',
    date: (row.date || (epoch ? new Date(epoch).toISOString().slice(0,10) : '')),
    epoch,
    name: row.name || 'Income',
    merchant: row.merchant || '',
    categoryUser: row.categoryUser || row.category || '',
    categoryAuto: row.categoryAuto || '',
    notes: row.notes || '',
    pending: !!row.pending,
    archived: !!row.archived,
    manual: !!row.manual,
    override: !!row.override,
    institution: row.institution_name || row.institution || '',
    source: row.manual ? 'manual' : (row.override ? 'override' : 'plaid'),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    _raw: row,
  };
}

export function normalizeUniversal(row, inferredType) {
  if (!row) return null;
  if (row.type === 'expense' || inferredType === 'expense') return normalizeExpenseRow(row);
  if (row.type === 'income' || inferredType === 'income') return normalizeIncomeRow(row);
  // Heuristic: negative raw => income, else expense
  const amt = Number(row.amount || 0);
  return amt < 0 ? normalizeIncomeRow(row) : normalizeExpenseRow(row);
}

// -------------- CRUD: Manual Entries --------------
export async function createManualTransaction({ type, name, amount, date, category, notes, currency = 'USD' }) {
  const user = auth.currentUser; if (!user) throw new Error('Not signed in');
  if (type !== 'expense' && type !== 'income') throw new Error('Invalid type');
  const normalizedAmount = Math.abs(Number(amount || 0));
  if (!normalizedAmount) throw new Error('Amount required');
  const iso = (date || new Date().toISOString().slice(0,10)).slice(0,10);
  const payload = {
    type,
    name: name || (type === 'expense' ? 'Manual expense' : 'Manual income'),
    amount: normalizedAmount,
    date: iso,
    category: category || '',
    notes: notes || '',
    currency,
    archived: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    account: 'Manual entry'
  };
  const ref = await addDoc(collection(db, 'users', user.uid, 'manual_entries'), payload);
  const tx = normalizeUniversal({ id: ref.id, itemId: 'manual', manual: true, ...payload }, type);
  emit('created', tx);
  // Rollup delta (add)
  sendRollupDeltas([ makeDeltaFromTx('add', null, tx) ]);
  return tx;
}

export async function updateManualTransaction(id, { name, amount, date, category, notes, archived }) {
  const user = auth.currentUser; if (!user) throw new Error('Not signed in');
  const ref = doc(db, 'users', user.uid, 'manual_entries', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Manual transaction not found');
  const current = snap.data() || {};
  const prev = normalizeUniversal({ id, itemId: 'manual', manual: true, ...current }, current.type || 'expense');
  const patch = { updatedAt: Timestamp.now() };
  if (name != null) patch.name = name;
  if (amount != null) patch.amount = Math.abs(Number(amount));
  if (date != null) patch.date = date.slice(0,10);
  if (category != null) patch.category = category;
  if (notes != null) patch.notes = notes;
  if (archived != null) patch.archived = !!archived;
  await setDoc(ref, patch, { merge: true });
  const merged = { ...current, ...patch };
  const next = normalizeUniversal({ id, itemId: 'manual', manual: true, ...merged }, merged.type || 'expense');
  emit('updated', next);
  // Rollup delta (update)
  sendRollupDeltas([ makeDeltaFromTx('update', prev, next) ]);
  return next;
}

export async function deleteManualTransaction(id) {
  const user = auth.currentUser; if (!user) throw new Error('Not signed in');
  const ref = doc(db, 'users', user.uid, 'manual_entries', id);
  const snap = await getDoc(ref);
  let prevTx = null;
  if (snap.exists()) {
    const data = snap.data() || {};
    prevTx = normalizeUniversal({ id, itemId: 'manual', manual: true, ...data }, data.type || 'expense');
  }
  await deleteDoc(ref);
  emit('deleted', { id, itemId: 'manual' });
  if (prevTx) sendRollupDeltas([ makeDeltaFromTx('delete', prevTx, null) ]);
}

// -------------- CRUD: Overrides (edit plaid tx) --------------
export async function upsertOverride({ itemId, txId, type, name, amount, date, category, notes, archived, currency = 'USD', original }) {
  const user = auth.currentUser; if (!user) throw new Error('Not signed in');
  if (!itemId || !txId) throw new Error('Missing itemId/txId');
  const key = `${itemId}__${txId}`;
  const overrideRef = doc(db, 'users', user.uid, 'transaction_overrides', key);
  const existingSnap = await getDoc(overrideRef);
  const base = {
    type: type || 'expense',
    name: name || '',
    amount: amount != null ? Math.abs(Number(amount)) : undefined,
    date: date ? date.slice(0,10) : undefined,
    category: category || '',
    notes: notes || '',
    currency,
    archived: !!archived,
    updatedAt: Timestamp.now(),
  };
  const creating = !existingSnap.exists();
  if (creating && original && !original.override) {
    base.createdAt = Timestamp.now();
    if (!base.name) base.name = original.name || '';
    if (base.amount == null) base.amount = Math.abs(Number(original.amount || 0));
    if (!base.date) base.date = original.date || (original._epoch ? new Date(original._epoch).toISOString().slice(0,10) : new Date().toISOString().slice(0,10));
    if (!base.category) base.category = original.categoryUser || original.categoryAuto || '';
    if (!base.notes) base.notes = original.notes || '';
    if (!base.currency) base.currency = original.isoCurrency || 'USD';
  }
  // Remove undefined fields before merge
  Object.keys(base).forEach(k => base[k] === undefined && delete base[k]);
  await setDoc(overrideRef, base, { merge: true });
  const prev = existingSnap.exists() ? normalizeUniversal({
    id: txId,
    itemId,
    manual: false,
    override: true,
    archived: existingSnap.data().archived,
    amount: existingSnap.data().amount,
    date: existingSnap.data().date,
    name: existingSnap.data().name,
    categoryUser: existingSnap.data().category,
    notes: existingSnap.data().notes,
    isoCurrency: existingSnap.data().currency,
    type: existingSnap.data().type,
  }, existingSnap.data().type) : (creating && original ? normalizeUniversal(original, original.type) : null);

  const tx = normalizeUniversal({
    id: txId,
    itemId,
    manual: false,
    override: true,
    archived: base.archived,
    amount: base.amount,
    date: base.date,
    name: base.name,
    categoryUser: base.category,
    notes: base.notes,
    isoCurrency: base.currency,
    type: base.type,
  }, base.type);
  emit('updated', tx);
  // Rollup delta (update path always; if creating override prev is original tx)
  if (prev) sendRollupDeltas([ makeDeltaFromTx('update', prev, tx) ]);
  return tx;
}

// -------------- Query helpers (basic) --------------
// NOTE: Currently manual + overrides are in separate collections. This helper only gathers manual entries;
// plaid transactions remain fetched by existing pages until we consolidate.
export async function listManualTransactions({ type, limitCount = 500 } = {}) {
  const user = auth.currentUser; if (!user) throw new Error('Not signed in');
  const baseRef = collection(db, 'users', user.uid, 'manual_entries');
  const qParts = [orderBy('createdAt', 'desc')];
  let qRef = query(baseRef, ...qParts);
  const snap = await getDocs(qRef);
  const out = [];
  snap.forEach(d => {
    const data = d.data() || {};
    if (type && (data.type || 'expense') !== type) return;
    out.push(normalizeUniversal({ id: d.id, itemId: 'manual', manual: true, ...data }, data.type));
  });
  return out.slice(0, limitCount);
}

// Convenience: derive aggregate totals per category for a given list (already normalized)
export function aggregateByCategory(list) {
  const agg = {};
  for (const tx of list) {
    const key = tx.categoryUser || tx.categoryAuto || 'Uncategorized';
    const sign = tx.type === 'income' ? 1 : -1; // if consumer wants net effect
    if (!agg[key]) agg[key] = { income: 0, expense: 0, net: 0 };
    if (tx.type === 'income') agg[key].income += tx.amount; else agg[key].expense += tx.amount;
    agg[key].net += sign * tx.amount;
  }
  return agg;
}

// Simple projection: given list + now date -> { expensePace, incomePace, projectedExpense, projectedIncome }
export function projectPeriod(list, periodStart, periodEnd) {
  const startEpoch = typeof periodStart === 'number' ? periodStart : new Date(periodStart).getTime();
  const endEpoch = typeof periodEnd === 'number' ? periodEnd : new Date(periodEnd).getTime();
  const now = Date.now();
  const elapsedDays = Math.max(1, Math.min(Math.floor((now - startEpoch) / 86400000) + 1, 1000));
  const totalDays = Math.max(1, Math.floor((endEpoch - startEpoch) / 86400000) + 1);
  let exp = 0, inc = 0;
  list.forEach(tx => { if (tx.type === 'expense') exp += tx.amount; else inc += tx.amount; });
  const expensePace = exp / elapsedDays;
  const incomePace = inc / elapsedDays;
  return {
    expensePace,
    incomePace,
    projectedExpense: expensePace * totalDays,
    projectedIncome: incomePace * totalDays,
    daysElapsed: elapsedDays,
    totalDays,
  };
}

// -------------- Utilities --------------
export function isExpense(tx) { return tx?.type === 'expense'; }
export function isIncome(tx) { return tx?.type === 'income'; }

// Format helper for UI modules (optional)
export function fmtCurrency(n, currency = 'USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
}

// -------------- Future Extensions --------------
// TODO (later phases): integrate plaid transaction fetch & override injection here, plus rollup caching.

export default {
  subscribeTransactions,
  normalizeExpenseRow,
  normalizeIncomeRow,
  normalizeUniversal,
  createManualTransaction,
  updateManualTransaction,
  deleteManualTransaction,
  upsertOverride,
  listManualTransactions,
  aggregateByCategory,
  projectPeriod,
  isExpense,
  isIncome,
  fmtCurrency,
};
