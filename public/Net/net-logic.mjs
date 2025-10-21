// Shared Net Insight analytics helpers

function formatCurrency(
  value,
  {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    notation = 'standard',
    withSign = false,
  } = {},
) {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits,
      maximumFractionDigits,
      notation,
    });
    const formatted = formatter.format(value || 0);
    if (!withSign) return formatted;
    if (value > 0) return `+${formatted}`;
    return formatted;
  } catch (error) {
    const num = Number(value) || 0;
    const digits = Number.isFinite(maximumFractionDigits) ? maximumFractionDigits : 0;
    const formatted = `$${num.toFixed(digits)}`;
    if (!withSign) return formatted;
    if (num > 0) return `+${formatted}`;
    return formatted;
  }
}

function formatPercent(value, digits = 1, { withSign = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  const formatted = `${pct.toFixed(Math.max(0, digits))}%`;
  if (!withSign) return formatted;
  if (pct > 0) return `+${formatted}`;
  if (pct === 0) return formatted;
  return `-${Math.abs(pct).toFixed(Math.max(0, digits))}%`;
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function computeStats(rows, categoryTotals) {
  const totals = rows.reduce((acc, row) => {
    acc.income += row.income;
    acc.expense += row.expense;
    acc.net += row.net;
    return acc;
  }, { income: 0, expense: 0, net: 0 });

  const current = rows[rows.length - 1] || { label: '', income: 0, expense: 0, net: 0 };
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  
  // Core metrics
  const netChange = previous ? current.net - previous.net : null;
  const netChangePct = previous && previous.net !== 0 ? (current.net - previous.net) / Math.abs(previous.net) : null;
  const expenseChange = previous ? current.expense - previous.expense : null;
  const incomeChange = previous ? current.income - previous.income : null;
  
  // Averages
  const avgNet = rows.length ? totals.net / rows.length : 0;
  const avgIncome = rows.length ? totals.income / rows.length : 0;
  const avgExpense = rows.length ? totals.expense / rows.length : 0;

  // Standard deviations for volatility
  const netStdDev = rows.length > 1
    ? Math.sqrt(rows.reduce((acc, row) => acc + ((row.net - avgNet) ** 2), 0) / rows.length)
    : 0;
  const incomeStdDev = rows.length > 1
    ? Math.sqrt(rows.reduce((acc, row) => acc + ((row.income - avgIncome) ** 2), 0) / rows.length)
    : 0;
  const expenseStdDev = rows.length > 1
    ? Math.sqrt(rows.reduce((acc, row) => acc + ((row.expense - avgExpense) ** 2), 0) / rows.length)
    : 0;

  // Volatility coefficients (normalized)
  const incomeVolatility = avgIncome > 0 ? incomeStdDev / avgIncome : 0;
  const expenseVolatility = avgExpense > 0 ? expenseStdDev / avgExpense : 0;

  // Streak and positive month tracking
  let positiveStreak = 0;
  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    if (rows[idx].net >= 0) positiveStreak += 1;
    else break;
  }
  let positiveMonths = 0;
  rows.forEach((row) => { if (row.net >= 0) positiveMonths += 1; });

  // Highest/lowest months
  let highestIncomeMonth = null;
  let lowestIncomeMonth = null;
  let highestExpenseMonth = null;
  let lowestExpenseMonth = null;
  let highestNetMonth = null;
  let lowestNetMonth = null;
  
  rows.forEach((row) => {
    if (!highestIncomeMonth || row.income > highestIncomeMonth.value) {
      highestIncomeMonth = { label: row.label, value: row.income };
    }
    if (!lowestIncomeMonth || row.income < lowestIncomeMonth.value) {
      lowestIncomeMonth = { label: row.label, value: row.income };
    }
    if (!highestExpenseMonth || row.expense > highestExpenseMonth.value) {
      highestExpenseMonth = { label: row.label, value: row.expense };
    }
    if (!lowestExpenseMonth || row.expense < lowestExpenseMonth.value) {
      lowestExpenseMonth = { label: row.label, value: row.expense };
    }
    if (!highestNetMonth || row.net > highestNetMonth.value) {
      highestNetMonth = { label: row.label, value: row.net };
    }
    if (!lowestNetMonth || row.net < lowestNetMonth.value) {
      lowestNetMonth = { label: row.label, value: row.net };
    }
  });

  // Financial ratios
  let incomeToExpenseRatio = null;
  if (current.expense === 0 && current.income > 0) incomeToExpenseRatio = Infinity;
  else if (current.expense > 0) incomeToExpenseRatio = current.income / current.expense;

  // Net margin: net income as % of total income
  const netMargin = totals.income > 0 ? totals.net / totals.income : null;
  
  // Savings rate: what % of income is left after expenses
  const savingsRate = totals.income > 0 ? totals.net / totals.income : null;
  
  // Expense ratio: what % of income goes to expenses
  const expenseRatio = totals.income > 0 ? totals.expense / totals.income : null;

  // Categories analysis
  const categories = Array.from(categoryTotals.entries()).map(([name, values]) => ({
    name,
    income: values.income,
    expense: values.expense,
    net: values.income - values.expense,
  }));
  const topExpenses = categories.filter((c) => c.expense > 0).sort((a, b) => b.expense - a.expense);
  const topIncomes = categories.filter((c) => c.income > 0).sort((a, b) => b.income - a.income);

  // Largest expense category as % of total
  const largestExpensePct = topExpenses.length && totals.expense > 0 
    ? topExpenses[0].expense / totals.expense 
    : 0;

  // Consistency score (inverse of volatility, 0-100)
  const maxVolatility = Math.max(incomeVolatility, expenseVolatility);
  const consistencyScore = Math.max(0, Math.min(100, 100 - (maxVolatility * 100)));

  return {
    totals,
    current,
    previous,
    netChange,
    netChangePct,
    incomeChange,
    expenseChange,
    avgNet,
    avgIncome,
    avgExpense,
    netStdDev,
    incomeStdDev,
    expenseStdDev,
    incomeVolatility,
    expenseVolatility,
    consistencyScore,
    incomeToExpenseRatio,
    netMargin,
    savingsRate,
    expenseRatio,
    positiveStreak,
    positiveMonths,
    highestIncomeMonth,
    lowestIncomeMonth,
    highestExpenseMonth,
    lowestExpenseMonth,
    highestNetMonth,
    lowestNetMonth,
    topExpenses,
    topIncomes,
    largestExpensePct,
  };
}

function composeNarrative(stats, rows, rangeMonths, preferences = {}) {
  const prefs = {
    summary: preferences.summary !== false,
    momentum: preferences.momentum !== false,
    forecasts: preferences.forecasts !== false,
    expenses: preferences.expenses !== false,
    income: preferences.income !== false,
    volatility: preferences.volatility !== false,
    actions: preferences.actions !== false,
  };

  const rangeLabel = `${rangeMonths} ${pluralize('month', rangeMonths)}`;
  if (!rows.length || (stats.totals.income === 0 && stats.totals.expense === 0)) {
    return `Connect your income and expenses to unlock a ${rangeLabel} money narrative.`;
  }

  const parts = [];
  const currentLabel = stats.current.label || 'This month';
  const netMagnitude = Math.abs(stats.current.net);
  if (prefs.summary) {
    if (netMagnitude > 1) {
      const netWord = stats.current.net >= 0 ? 'surplus' : 'shortfall';
      parts.push(`${currentLabel} closed with a ${netWord} of ${formatCurrency(stats.current.net, { maximumFractionDigits: 0 })}.`);
    } else {
      parts.push(`${currentLabel} ended nearly even on cash flow.`);
    }
  }

  if (prefs.momentum) {
    if (stats.netChange !== null && Math.abs(stats.netChange) > 1 && stats.previous) {
      const direction = stats.netChange > 0 ? 'improved' : 'softened';
      parts.push(`That ${direction} by ${formatCurrency(stats.netChange, { maximumFractionDigits: 0, withSign: true })} versus ${stats.previous.label}.`);
    } else if (rows.length > 1) {
      parts.push(`Performance is steady across the ${rangeLabel} window.`);
    }
  }

  if (prefs.expenses && stats.topExpenses?.length) {
    const topCategory = stats.topExpenses[0];
    const share = stats.totals.expense > 0 ? topCategory.expense / stats.totals.expense : 0;
    if (share >= 0.15) {
      parts.push(`${topCategory.name} accounts for ${formatPercent(share, share > 0.3 ? 0 : 1)} of your spending.`);
    }
  }

  if (prefs.income && stats.topIncomes?.length) {
    const topIncome = stats.topIncomes[0];
    const share = stats.totals.income > 0 ? topIncome.income / stats.totals.income : 0;
    if (share >= 0.12) {
      parts.push(`${topIncome.name} brings in ${formatPercent(share, share > 0.35 ? 0 : 1)} of income during this stretch.`);
    }
  }

  if (prefs.momentum) {
    if (stats.positiveStreak >= 3) {
      parts.push(`You’ve kept a surplus streak going for ${stats.positiveStreak} ${pluralize('month', stats.positiveStreak)}.`);
    } else if (stats.current.net < 0 && stats.positiveStreak === 0) {
      parts.push('Focus on a surplus next month to rebuild momentum.');
    } else if (stats.positiveMonths > 0) {
      parts.push(`${stats.positiveMonths}/${rows.length} ${pluralize('month', rows.length)} finished in the green.`);
    }
  }

  if (prefs.summary && stats.avgNet && Math.abs(stats.avgNet) > 1) {
    parts.push(`Average net across the range is ${formatCurrency(stats.avgNet, { maximumFractionDigits: 0, withSign: true })}.`);
  }

  if (prefs.volatility && stats.netStdDev > 0) {
    const consistency = stats.consistencyScore;
    if (consistency > 80) {
      parts.push('Income and expense patterns are highly consistent—easy to budget.');
    } else if (consistency > 60) {
      parts.push('Moderate variability in cash flow; plan for swings.');
    } else if (consistency < 40) {
      parts.push('High cash flow volatility detected—set larger emergency buffers.');
    }
  }

  if (prefs.actions && stats.topExpenses?.length) {
    const focusCategory = stats.topExpenses[0];
    if (stats.largestExpensePct > 0.25) {
      parts.push(`${focusCategory.name} is ${formatPercent(stats.largestExpensePct, 0)} of spending—consider reducing this category.`);
    }
  }

  if (parts.length === 0) {
    return 'Personalize your insight filters to bring the narrative back to life.';
  }

  if (parts.length === 1) {
    parts.push('We’ll surface more patterns as additional months roll in.');
  }

  return parts.join(' ');
}

function buildInsights(stats, rows) {
  if (!stats || !rows?.length) return [];

  const insights = [];
  const current = stats.current || {};

  if (current.label) {
    insights.push({
      title: current.net >= 0 ? 'Net surplus locked in' : 'Net shortfall spotted',
      body: `${current.label} closed ${formatCurrency(current.net, { maximumFractionDigits: 0, withSign: true })}, with ${formatCurrency(current.income, { maximumFractionDigits: 0 })} in income and ${formatCurrency(current.expense, { maximumFractionDigits: 0 })} in outflows.`,
      tone: current.net >= 0 ? 'positive' : 'warning',
      kind: 'summary',
    });
  }

  if (stats.netChange !== null && Math.abs(stats.netChange) > 1) {
    insights.push({
      title: stats.netChange > 0 ? 'Momentum improving' : 'Momentum softening',
      body: `${current.label} net ${stats.netChange > 0 ? 'improved' : 'declined'} by ${formatCurrency(stats.netChange, { maximumFractionDigits: 0, withSign: true })} versus ${stats.previous?.label || 'last month'}.`,
      tone: stats.netChange > 0 ? 'positive' : 'warning',
      kind: 'momentum',
    });
  }

  if (stats.expenseChange !== null && Math.abs(stats.expenseChange) > 1) {
    insights.push({
      title: stats.expenseChange > 0 ? 'Spending heating up' : 'Spending cooling',
      body: `Expenses ${stats.expenseChange > 0 ? 'rose' : 'fell'} ${formatCurrency(stats.expenseChange, { maximumFractionDigits: 0, withSign: true })} compared with ${stats.previous?.label || 'last month'}.`,
      tone: stats.expenseChange > 0 ? 'warning' : 'positive',
      kind: 'expenses',
    });
  }

  if (stats.topExpenses?.length) {
    const top = stats.topExpenses[0];
    const share = stats.totals.expense > 0 ? top.expense / stats.totals.expense : 0;
    insights.push({
      title: 'Dominant spend category',
      body: `${top.name} accounts for ${formatPercent(share, share > 0.2 ? 0 : 1)} of expenses across the range.`,
      tone: share > 0.35 ? 'warning' : 'caution',
      kind: 'expenses',
    });
  }

  if (stats.incomeToExpenseRatio !== null) {
    const ratioTone = stats.incomeToExpenseRatio >= 1 ? 'positive' : 'warning';
    const ratioLabel = stats.incomeToExpenseRatio === Infinity ? '∞' : `${stats.incomeToExpenseRatio.toFixed(stats.incomeToExpenseRatio >= 10 ? 0 : 2)}x`;
    insights.push({
      title: 'Income to expense ratio',
      body: `Current month is running at ${ratioLabel}, with a savings rate of ${stats.savingsRate !== null ? formatPercent(stats.savingsRate, stats.savingsRate > 0.25 ? 0 : 1) : '—'}.`,
      tone: ratioTone,
      kind: 'summary',
    });
  } else {
    insights.push({
      title: 'Log more activity',
      body: 'Capture new transactions to see how income stacks against spending.',
      tone: 'caution',
      kind: 'summary',
    });
  }

  if (stats.positiveStreak >= 3) {
    insights.push({
      title: 'Positive streak in progress',
      body: `${stats.positiveStreak} straight ${pluralize('month', stats.positiveStreak)} finished in the green. Keep the cadence going.`,
      tone: 'positive',
      kind: 'momentum',
    });
  } else if (stats.positiveStreak === 0 && current.net < 0) {
    insights.push({
      title: 'Reset opportunity',
      body: 'Your streak reset this month. Target a surplus next cycle to rebuild momentum.',
      tone: 'caution',
      kind: 'momentum',
    });
  }

  // Consistency insights
  if (stats.consistencyScore !== undefined) {
    if (stats.consistencyScore > 80) {
      insights.push({
        title: 'Highly predictable cash flow',
        body: 'Your income and expenses are consistent. This makes budgeting easier and more reliable.',
        tone: 'positive',
        kind: 'volatility',
      });
    } else if (stats.consistencyScore < 40) {
      insights.push({
        title: 'Variable cash flow detected',
        body: 'Income or expenses swing significantly month-to-month. Keep a larger emergency fund.',
        tone: 'warning',
        kind: 'volatility',
      });
    }
  }

  if (stats.avgExpense > 0) {
    const expenseDelta = current.expense - stats.avgExpense;
    if (expenseDelta / stats.avgExpense >= 0.2 && expenseDelta > stats.expenseStdDev) {
      insights.push({
        title: 'Expense spike detected',
        body: `Spending ran ${formatCurrency(expenseDelta, { maximumFractionDigits: 0, withSign: true })} above your ${rows.length}-month average. Consider dialing back discretionary categories next cycle.`,
        tone: 'warning',
        kind: 'expenses',
      });
    }
  }

  if (stats.avgIncome > 0) {
    const incomeDelta = current.income - stats.avgIncome;
    if ((incomeDelta / stats.avgIncome) <= -0.15 && Math.abs(incomeDelta) > stats.incomeStdDev * 0.8) {
      insights.push({
        title: 'Income dipped',
        body: `Latest income landed ${formatCurrency(Math.abs(incomeDelta), { maximumFractionDigits: 0 })} below your ${rows.length}-month rhythm. Confirm recurring sources are still syncing.`,
        tone: 'caution',
        kind: 'income',
      });
    }
  }

  if (stats.netStdDev > 0 && stats.netStdDev >= Math.max(200, Math.abs(stats.avgNet) * 0.6)) {
    insights.push({
      title: 'Volatile cash swings',
      body: `Net flow is whipsawing with a typical swing of ${formatCurrency(stats.netStdDev, { maximumFractionDigits: 0 })}. Build a larger buffer or tighten category limits to smooth volatility.`,
      tone: 'caution',
      kind: 'volatility',
    });
  } else if (stats.netStdDev > 0 && stats.netStdDev <= Math.max(100, Math.abs(stats.avgNet) * 0.25)) {
    insights.push({
      title: 'Consistent cadence',
      body: `Net flow variance stays near ${formatCurrency(stats.netStdDev, { maximumFractionDigits: 0 })}, signalling dependable month-to-month performance.`,
      tone: 'positive',
      kind: 'volatility',
    });
  }

  if (stats.topExpenses?.length) {
    const focusCategory = stats.topExpenses[0];
    if (focusCategory && focusCategory.expense > 0) {
      insights.push({
        title: 'Action suggestion',
        body: `Set a guardrail for ${focusCategory.name} by capping next month’s spend near ${formatCurrency(focusCategory.expense * 0.9, { maximumFractionDigits: 0 })}. Pair it with an alert so you’re notified early.`,
        tone: 'caution',
        kind: 'actions',
      });
    }
  }

  if (stats.highestExpenseMonth && stats.highestExpenseMonth.value > 0 && stats.highestExpenseMonth.label !== current.label) {
    insights.push({
      title: 'Watch historical high spend',
      body: `${stats.highestExpenseMonth.label} still holds the peak spend at ${formatCurrency(stats.highestExpenseMonth.value, { maximumFractionDigits: 0 })}.`,
      tone: 'caution',
      kind: 'expenses',
    });
  }

  return insights;
}

export {
  formatCurrency,
  formatPercent,
  pluralize,
  computeStats,
  composeNarrative,
  buildInsights,
};

export default {
  formatCurrency,
  formatPercent,
  pluralize,
  computeStats,
  composeNarrative,
  buildInsights,
};

if (typeof module !== 'undefined') {
  module.exports = {
    formatCurrency,
    formatPercent,
    pluralize,
    computeStats,
    composeNarrative,
    buildInsights,
  };
}
