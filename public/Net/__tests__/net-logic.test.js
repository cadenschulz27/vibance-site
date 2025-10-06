describe('Net Insight logic helpers', () => {
  let formatCurrency;
  let formatPercent;
  let pluralize;
  let computeStats;
  let composeNarrative;
  let buildInsights;

  let rows;
  let categoryTotals;
  let stats;

  beforeAll(async () => {
    const logic = await import('../net-logic.mjs');
    ({
      formatCurrency,
      formatPercent,
      pluralize,
      computeStats,
      composeNarrative,
      buildInsights,
    } = logic);

    rows = [
      { label: 'March 2025', income: 4200, expense: 3000, net: 1200 },
      { label: 'April 2025', income: 4300, expense: 2900, net: 1400 },
      { label: 'May 2025', income: 3300, expense: 4200, net: -900 },
    ];

    categoryTotals = new Map([
      ['Salary', { income: 10800, expense: 0 }],
      ['Consulting', { income: 1000, expense: 0 }],
      ['Rent', { income: 0, expense: 4800 }],
      ['Dining', { income: 0, expense: 1800 }],
      ['Travel', { income: 0, expense: 1400 }],
      ['Utilities', { income: 0, expense: 1100 }],
      ['Subscriptions', { income: 0, expense: 1000 }],
    ]);

    stats = computeStats(rows, categoryTotals);
  });

  test('computeStats summarizes rollups with forecast and volatility metrics', () => {
    expect(stats.totals).toEqual({ income: 11800, expense: 10100, net: 1700 });
    expect(stats.netChange).toBe(-2300);
    expect(stats.expenseChange).toBe(1300);
    expect(stats.incomeChange).toBe(-1000);
    expect(stats.avgIncome).toBeCloseTo(3933.33, 2);
    expect(stats.avgExpense).toBeCloseTo(3366.67, 2);
    expect(stats.ratio).toBeCloseTo(0.7857, 3);
    expect(stats.netMargin).toBeCloseTo(0.144, 3);
    expect(stats.netStdDev).toBeGreaterThan(1000);
    expect(stats.projectedNet).toBeLessThan(-1500);
    expect(stats.positiveStreak).toBe(0);
    expect(stats.positiveMonths).toBe(2);
    expect(stats.highestExpenseMonth).toEqual({ label: 'May 2025', value: 4200 });
    expect(stats.topExpenses[0].name).toBe('Rent');
    expect(stats.topIncomes[0].name).toBe('Salary');
  });

  test('composeNarrative produces a contextual story', () => {
    const narrative = composeNarrative(stats, rows, 3);
    expect(typeof narrative).toBe('string');
    expect(narrative).toContain('shortfall');
    expect(narrative).toContain('May 2025');
    expect(narrative).toContain('Rent');
  });

  test('buildInsights emits categorized guidance', () => {
    const insights = buildInsights(stats, rows);
    const titles = insights.map((item) => item.title);
    const kinds = Array.from(new Set(insights.map((item) => item.kind)));

    expect(titles).toEqual(expect.arrayContaining([
      'Net shortfall spotted',
      'Momentum softening',
      'Spending heating up',
      'Next month outlook',
      'Expense spike detected',
      'Income dipped',
      'Volatile cash swings',
      'Action suggestion',
    ]));

    expect(kinds).toEqual(expect.arrayContaining([
      'summary',
      'momentum',
      'forecasts',
      'expenses',
      'income',
      'volatility',
      'actions',
    ]));

    insights.forEach((item) => {
      expect(item).toHaveProperty('body');
      expect(['positive', 'warning', 'caution', 'neutral']).toContain(item.tone);
    });
  });

  test('formatting helpers behave consistently', () => {
    expect(formatCurrency(1234.56)).toBe('$1,235');
    expect(formatCurrency(-987, { withSign: true })).toBe('-$987');
  expect(formatPercent(0.256, 1, { withSign: true })).toBe('+25.6%');
  expect(formatPercent(-0.125, 0, { withSign: true })).toBe('-13%');
    expect(pluralize('month', 1)).toBe('month');
    expect(pluralize('month', 4)).toBe('months');
  });
});
