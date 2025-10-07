import { buildProjections } from '../analytics/projections.js';

const profileFixture = {
  currentMonth: {
    monthKey: '2025-09',
    income: 6000,
    expense: 4200,
    surplus: 1800,
  },
  trailing: [
    { monthKey: '2025-08', income: 5800, expense: 4300 },
    { monthKey: '2025-07', income: 5600, expense: 4100 },
    { monthKey: '2025-06', income: 5500, expense: 4000 },
  ],
  cashOnHand: 10000,
};

describe('cashflow projections', () => {
  test('returns runway estimate and trend', () => {
    const result = buildProjections(profileFixture);
    expect(result.runwayDays).toBeGreaterThan(0);
    expect(Array.isArray(result.trend)).toBe(true);
    expect(result.trend.length).toBeGreaterThan(0);
  });
});
