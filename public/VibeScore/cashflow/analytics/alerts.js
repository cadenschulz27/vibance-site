// analytics/alerts.js
// Emits alert objects based on significant changes or thresholds.

const ALERT_DEFS = [
  {
    id: 'missed_income',
    severity: 'critical',
    test: ({ current }) => {
      const income = Number(current.income) || 0;
      return income === 0;
    },
    message: 'No income recorded this cycle—double check linked accounts.',
  },
  {
    id: 'spending_spike',
    severity: 'warn',
    test: ({ current, trailing }) => {
      if (!trailing?.length) return false;
      const avg = trailing.reduce((sum, snap) => sum + (Number(snap.expense) || 0), 0) / trailing.length;
      return Number(current.expense) > avg * 1.35;
    },
    message: 'Spending is spiking relative to historical averages.',
  },
  {
    id: 'runway_low',
    severity: 'warn',
    test: ({ projections }) => (projections?.runwayDays ?? Infinity) < 30,
    message: 'Cash runway is below one month; consider pausing discretionary spend.',
  },
  {
    id: 'burn_improving',
    severity: 'info',
    test: ({ current, trailing }) => {
      if (!trailing?.length) return false;
      const prev = trailing.at(-1);
      return Number(current.expense) < Number(prev?.expense || 0) * 0.9;
    },
    message: 'Expense burn is improving—keep reinforcing the trend.',
  },
];

/**
 * @param {object} context
 * @param {object} context.profile
 * @param {object} context.projections
 * @returns {Array<{ id: string, severity: string, message: string }>}
 */
export function evaluateAlerts({ profile = {}, projections = {} } = {}) {
  const current = profile.currentMonth || {};
  const trailing = Array.isArray(profile.trailing) ? profile.trailing : [];
  return ALERT_DEFS.filter((def) => {
    try {
      return def.test({ profile, current, trailing, projections });
    } catch (error) {
      console.warn('[cashflow] alert evaluation failed for', def.id, error);
      return false;
    }
  }).map((def) => ({
    id: def.id,
    severity: def.severity,
    message: def.message,
  }));
}
