// analytics/score-engine.js
// Produces the master Cash Flow Score and supporting diagnostics.

/**
 * @param {object} profile - Normalized cash-flow profile from data/transformations.
 * @returns {{ score: number, factors: Record<string, number>, diagnostics: object }}
 */
export function buildScoreReport(profile = {}) {
  const factors = computeFactorScores(profile);
  const weights = {
    surplus: 0.4,
    volatility: 0.2,
    runway: 0.25,
    goals: 0.15,
  };

  const score = Object.entries(weights).reduce((total, [key, weight]) => total + (factors[key] * weight), 0);

  return {
    score: Math.round(score),
    factors,
    diagnostics: deriveDiagnostics(profile, factors),
  };
}

export function computeFactorScores(profile = {}) {
  const trailing = Array.isArray(profile.trailing) ? profile.trailing : [];
  const current = profile.currentMonth || {};
  const cashOnHand = Number(profile.cashOnHand) || 0;

  const surplusRatio = calculateSurplusRatio(current);
  const surplusScore = scaleSurplusRatio(surplusRatio);

  const volatility = calculateVolatility(trailing);
  const volatilityScore = scaleVolatility(volatility);

  const runway = calculateRunwayDays({ cashOnHand, trailing, current });
  const runwayScore = scaleRunway(runway);

  const goalsScore = scaleGoalsProgress(current.goals || []);

  return {
    surplus: surplusScore,
    volatility: volatilityScore,
    runway: runwayScore,
    goals: goalsScore,
  };
}

function calculateSurplusRatio(snapshot = {}) {
  const income = Number(snapshot.income) || 0;
  const expense = Number(snapshot.expense) || 0;
  if (income <= 0) return 0;
  return (income - expense) / income;
}

function scaleSurplusRatio(ratio) {
  if (!Number.isFinite(ratio)) return 0;
  const capped = clamp(ratio, -0.5, 0.6); // allow mild negative to penalize deficits
  return normalizeScore((capped + 0.5) / 1.1); // maps [-0.5, 0.6] -> [0, 1]
}

function calculateVolatility(trailing) {
  if (!trailing.length) return 0;
  const nets = trailing.map((snap) => (Number(snap.income) || 0) - (Number(snap.expense) || 0));
  const average = nets.reduce((sum, val) => sum + val, 0) / nets.length;
  const variance = nets.reduce((sum, val) => sum + ((val - average) ** 2), 0) / nets.length;
  return Math.sqrt(variance);
}

function scaleVolatility(stdDev) {
  if (!Number.isFinite(stdDev)) return 50;
  if (stdDev <= 200) return 90;
  if (stdDev <= 500) return 70;
  if (stdDev <= 1000) return 55;
  if (stdDev <= 1500) return 45;
  return 30;
}

function calculateRunwayDays({ cashOnHand, trailing, current }) {
  const expense = Number(current.expense) || averageExpense(trailing) || 0;
  if (expense <= 0) return 365;
  const dailyBurn = expense / 30;
  if (dailyBurn <= 0) return 365;
  return Math.max(0, Math.round(cashOnHand / dailyBurn));
}

function averageExpense(trailing) {
  if (!trailing?.length) return 0;
  const total = trailing.reduce((sum, snap) => sum + (Number(snap.expense) || 0), 0);
  return total / trailing.length;
}

function scaleRunway(days) {
  if (!Number.isFinite(days)) return 0;
  if (days >= 180) return 95;
  if (days >= 90) return 85;
  if (days >= 60) return 70;
  if (days >= 30) return 55;
  if (days >= 14) return 40;
  return 20;
}

function scaleGoalsProgress(goals) {
  if (!Array.isArray(goals) || !goals.length) return 40; // default baseline
  const totalWeight = goals.reduce((sum, goal) => sum + (Number(goal.target) || 0), 0) || 1;
  const weightedProgress = goals.reduce((sum, goal) => {
    const allocation = Number(goal.allocation) || 0;
    const progress = Number(goal.progressPct) || 0;
    const weight = (Number(goal.target) || 0) / totalWeight;
    return sum + (progress * weight) + (allocation * 0.01);
  }, 0);
  return clamp(Math.round(weightedProgress), 0, 100);
}

function deriveDiagnostics(profile, factors) {
  return {
    trailingMonths: Array.isArray(profile.trailing) ? profile.trailing.length : 0,
    largestExpenseMonth: findLargestExpenseMonth(profile.trailing || []),
    factorRanks: rankFactors(factors),
    latestSnapshot: profile.currentMonth || null,
    trend: buildTrendSeries(profile),
  };
}

function findLargestExpenseMonth(trailing) {
  if (!trailing.length) return null;
  return trailing.reduce((max, snap) => (snap.expense > (max?.expense || 0) ? snap : max), null);
}

function buildTrendSeries(profile) {
  const trailing = Array.isArray(profile.trailing) ? profile.trailing : [];
  const series = trailing.map((snap) => ({
    monthKey: snap.monthKey,
    label: snap.label || snap.monthKey,
    income: Number(snap.income) || 0,
    expense: Number(snap.expense) || 0,
    surplus: Number.isFinite(snap.surplus) ? snap.surplus : ((Number(snap.income) || 0) - (Number(snap.expense) || 0)),
  }));
  if (profile.currentMonth) {
    const current = profile.currentMonth;
    series.push({
      monthKey: current.monthKey,
      label: current.label || current.monthKey,
      income: Number(current.income) || 0,
      expense: Number(current.expense) || 0,
      surplus: Number.isFinite(current.surplus) ? current.surplus : ((Number(current.income) || 0) - (Number(current.expense) || 0)),
    });
  }
  return series;
}

function rankFactors(factors) {
  return Object.entries(factors)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => ({ key, value }));
}

function normalizeScore(value) {
  return clamp(Math.round(value * 100), 0, 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
