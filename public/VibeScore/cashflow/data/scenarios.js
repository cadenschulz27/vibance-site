// data/scenarios.js
// Generates what-if scenarios used by the cash-flow UI.

/**
 * Builds a default set of scenarios given the normalized profile.
 * @param {object} profile
 * @returns {Array<object>}
 */
export function buildScenarioSet(profile = {}) {
  const base = createBaseScenario(profile);
  const adjustments = [
    buildIncomeBoostScenario(profile, 0.05),
    buildExpenseTrimScenario(profile, 0.1),
    buildGoalAccelerationScenario(profile, 0.15),
  ];
  return [base, ...adjustments];
}

function createBaseScenario(profile) {
  return {
    id: 'base',
    label: 'Baseline',
    delta: 0,
    summary: 'Current state using the latest month and historical averages.',
    profile,
  };
}

function buildIncomeBoostScenario(profile, lift = 0.05) {
  const income = Number(profile.currentMonth?.income) || 0;
  const expense = Number(profile.currentMonth?.expense) || 0;
  const incomeDelta = income * lift;
  return {
    id: 'income_boost',
    label: `+${Math.round(lift * 100)}% income`,
    delta: incomeDelta,
    summary: 'Projects surplus with a modest income uptick.',
    projection: {
      surplus: income + incomeDelta - expense,
    },
  };
}

function buildExpenseTrimScenario(profile, trim = 0.1) {
  const expense = Number(profile.currentMonth?.expense) || 0;
  const income = Number(profile.currentMonth?.income) || 0;
  const trimmed = expense * (1 - trim);
  return {
    id: 'expense_trim',
    label: `-${Math.round(trim * 100)}% expenses`,
    delta: expense - trimmed,
    summary: 'Assesses the impact of trimming discretionary categories.',
    projection: {
      surplus: income - trimmed,
    },
  };
}

function buildGoalAccelerationScenario(profile, reallocate = 0.2) {
  const goals = Array.isArray(profile.currentMonth?.goals) ? profile.currentMonth.goals : [];
  const adjusted = goals.map((goal) => ({
    ...goal,
    allocation: goal.allocation ? goal.allocation * (1 + reallocate) : goal.allocation,
  }));
  return {
    id: 'goal_boost',
    label: '+Goals allocation',
    delta: reallocate,
    summary: 'Shows progress if savings allocations are boosted.',
    projection: {
      goals: adjusted,
    },
  };
}
