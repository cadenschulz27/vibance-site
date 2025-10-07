// analytics/factors.js
// Translates analytic outputs into UI-friendly factor descriptions.

const FACTOR_META = {
  surplus: {
    label: 'Surplus Quality',
    description: 'How efficiently income converts into surplus each month.',
    icon: 'mdi:arrow-up-circle',
  },
  volatility: {
    label: 'Stability',
    description: 'Consistency of month-to-month cash flow swings.',
    icon: 'mdi:pulse',
  },
  runway: {
    label: 'Runway',
    description: 'Days of cushion at current burn rate.',
    icon: 'mdi:calendar-clock',
  },
  goals: {
    label: 'Goal Fuel',
    description: 'Allocation momentum toward savings priorities.',
    icon: 'mdi:target',
  },
};

/**
 * @param {{ score: number, factors: Record<string, number> }} report
 * @returns {Array<object>}
 */
export function buildFactorBreakdown(report = {}) {
  const factors = report.factors || {};
  return Object.keys(FACTOR_META).map((key) => {
    const meta = FACTOR_META[key];
    const value = clamp(Math.round(factors[key] ?? 0), 0, 100);
    return {
      key,
      value,
      ...meta,
    };
  });
}

/**
 * Builds data for a radar chart or similar multi-dimensional viz.
 * @param {{ score: number, factors: Record<string, number> }} report
 * @returns {{ labels: string[], datasets: Array<{ label: string, data: number[] }> }}
 */
export function buildRadarDataset(report = {}) {
  const breakdown = buildFactorBreakdown(report);
  return {
    labels: breakdown.map((item) => item.label),
    datasets: [
      {
        label: 'Cash Flow Profile',
        data: breakdown.map((item) => item.value),
      },
    ],
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
