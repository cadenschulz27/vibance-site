import { normalizeLedgerEvents } from '../data/transformations.js';

describe('cashflow data normalization', () => {
  test('fills defaults and derives surplus', () => {
    const raw = {
      currentMonth: {
        monthKey: '2025-09',
        income: 5000,
        expense: 4200,
      },
      trailing: [
        { monthKey: '2025-08', income: 4800, expense: 4100 },
      ],
      cashOnHand: 8000,
    };

    const result = normalizeLedgerEvents(raw);
    expect(result.currentMonth.surplus).toBe(800);
    expect(result.trailing).toHaveLength(1);
    expect(result.savingsBufferDays).toBeGreaterThan(0);
  });
});
