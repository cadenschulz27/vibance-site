// data/transformations.js
// Converts raw cash-flow documents into the canonical structure used by analytics/UI.

/**
 * Normalize arbitrary ledger events into a structured cash-flow profile.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeLedgerEvents(raw = {}) {
  const trailing = Array.isArray(raw.trailing)
    ? raw.trailing.map(applyDefaultsToSnapshot)
    : [];

  const currentMonth = applyDefaultsToSnapshot(raw.currentMonth);

  return {
    trailing,
    currentMonth,
    upcomingBills: Array.isArray(raw.upcomingBills) ? raw.upcomingBills : [],
    cashOnHand: Number(raw.cashOnHand) || 0,
    savingsBufferDays: Number(raw.savingsBufferDays) || estimateRunwayDays(currentMonth, raw.cashOnHand),
  };
}

function applyDefaultsToSnapshot(snapshot = {}) {
  const income = Number(snapshot.income) || 0;
  const expense = Number(snapshot.expense) || 0;
  const surplus = Number.isFinite(snapshot.surplus) ? snapshot.surplus : income - expense;

  return {
    monthKey: snapshot.monthKey || 'unknown',
    label: snapshot.label || snapshot.monthKey || 'Unknown',
    income,
    expense,
    surplus,
    fixedExpense: Number(snapshot.fixedExpense) || 0,
    variableExpense: Number(snapshot.variableExpense) || Math.max(0, expense - (Number(snapshot.fixedExpense) || 0)),
    goals: Array.isArray(snapshot.goals) ? snapshot.goals : [],
  };
}

function estimateRunwayDays(currentMonth, cashOnHand = 0) {
  const dailyBurn = currentMonth?.expense ? currentMonth.expense / 30 : 0;
  if (dailyBurn <= 0) return Number.isFinite(cashOnHand) ? 180 : 0;
  return clamp(Math.round(cashOnHand / dailyBurn), 0, 365);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
