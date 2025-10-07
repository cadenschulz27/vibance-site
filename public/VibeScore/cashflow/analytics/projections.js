// analytics/projections.js
// Generates forward-looking runway projections and trendlines.

/**
 * Builds a projection model from the historical snapshots.
 * @param {object} profile
 * @returns {{ runwayDays: number, burnoutDate: string|null, trend: Array<object> }}
 */
export function buildProjections(profile = {}) {
  const trailing = Array.isArray(profile.trailing) ? profile.trailing : [];
  const current = profile.currentMonth || {};
  const cashOnHand = Number(profile.cashOnHand) || 0;

  const burnRate = estimateBurnRate(trailing, current);
  const runwayDays = calculateRunwayDays(cashOnHand, burnRate);
  const burnoutDate = computeBurnoutDate(runwayDays);

  return {
    runwayDays,
    burnoutDate,
    trend: buildTrendSeries(trailing, current),
  };
}

function estimateBurnRate(trailing, current) {
  if (trailing.length < 3) {
    return Math.max(0, Number(current.expense) || 0);
  }
  const expenses = trailing.map((snap) => Number(snap.expense) || 0);
  const smoothed = exponentialSmoothing(expenses, 0.35);
  return Math.max(0, smoothed.at(-1) || expenses.at(-1) || 0);
}

function calculateRunwayDays(cashOnHand, monthlyBurn) {
  if (monthlyBurn <= 0) return 365;
  const daily = monthlyBurn / 30;
  if (daily <= 0) return 365;
  return Math.round(Math.max(0, cashOnHand / daily));
}

function computeBurnoutDate(runwayDays) {
  if (!Number.isFinite(runwayDays) || runwayDays <= 0) return null;
  const now = new Date();
  now.setDate(now.getDate() + runwayDays);
  return now.toISOString();
}

function buildTrendSeries(trailing, current) {
  const series = trailing.map((snap) => ({
    monthKey: snap.monthKey,
    label: snap.label,
    income: Number(snap.income) || 0,
    expense: Number(snap.expense) || 0,
    surplus: Number(snap.surplus) || ((Number(snap.income) || 0) - (Number(snap.expense) || 0)),
  }));
  if (current && current.monthKey) {
    series.push({
      monthKey: current.monthKey,
      label: current.label || current.monthKey,
      income: Number(current.income) || 0,
      expense: Number(current.expense) || 0,
      surplus: Number(current.surplus) || ((Number(current.income) || 0) - (Number(current.expense) || 0)),
    });
  }
  return series;
}

function exponentialSmoothing(values, alpha = 0.3) {
  if (!values.length) return [];
  const smoothed = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    const next = (alpha * values[i]) + ((1 - alpha) * smoothed[i - 1]);
    smoothed.push(next);
  }
  return smoothed;
}
