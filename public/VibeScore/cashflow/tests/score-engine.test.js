import { buildScoreReport, computeFactorScores } from '../analytics/score-engine.js';

const profileFixture = {
  currentMonth: {
    monthKey: '2025-09',
    income: 6000,
    expense: 4000,
    surplus: 2000,
    fixedExpense: 2500,
    variableExpense: 1500,
    goals: [
      { name: 'Emergency Fund', progressPct: 80, allocation: 400, target: 12000 },
      { name: 'Vacation', progressPct: 40, allocation: 200, target: 3000 },
    ],
  },
  trailing: [
    { monthKey: '2025-08', income: 5800, expense: 4100 },
    { monthKey: '2025-07', income: 5600, expense: 3900 },
    { monthKey: '2025-06', income: 5400, expense: 4200 },
  ],
  cashOnHand: 12000,
};

describe('cashflow score engine', () => {
  test('computes factor scores within expected range', () => {
    const factors = computeFactorScores(profileFixture);
    Object.values(factors).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    });
  });

  test('builds composite score and diagnostics', () => {
    const report = buildScoreReport(profileFixture);
    expect(report.score).toBeGreaterThan(0);
    expect(report.factors).toHaveProperty('surplus');
    expect(report.diagnostics).toHaveProperty('factorRanks');
  });
});
