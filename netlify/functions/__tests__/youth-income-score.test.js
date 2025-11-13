const { execFileSync } = require('node:child_process');
const path = require('node:path');

const runnerPath = path.resolve(__dirname, '../../..', 'scripts', 'evaluate-income-score.mjs');

const runScore = (data, options = {}) => {
  const payload = Buffer.from(JSON.stringify({ data, options })).toString('base64url');
  const output = execFileSync('node', ['--experimental-vm-modules', runnerPath, payload], {
    encoding: 'utf8'
  });
  return JSON.parse(output);
};

describe('advanced income score — youth coverage', () => {
  const baseYouthProfile = Object.freeze({
    age: 15,
    youthHasIncome: true,
    youthPrimaryIncomeSource: 'part-time-job',
    youthIncomeFrequency: 'biweekly',
    youthTypicalMonthlyIncome: 420,
    youthHeldPartTimeJob: true,
    youthHasCheckingAccount: true,
    youthHasSavingsAccount: true,
    youthHasDebitCard: true,
    youthUsesMoneyApps: true,
    youthBalanceCheckFrequency: 'few-days',
    youthHasCurrentSavings: true,
    youthSavingsAmount: 650,
    youthSavingsLocation: 'bank',
    youthSavingsContributionFrequency: 'monthly',
    youthHasSavingsGoal: true,
    youthPrimarySpendingCategory: 'transportation',
    youthWeeklySpendingAmount: 60,
    youthPaysRecurringExpenses: true,
    youthRanOutOfMoney: false,
    youthSpendingApproach: 'plan-ahead',
    youthTracksSpending: true,
    youthHasEmergencyBuffer: true,
    youthGetsGuardianHelp: true,
    youthSharesMoneyWithOthers: true,
    youthMoneyConfidence: 'very-confident'
  });

  const stressedYouthProfile = Object.freeze({
    age: 16,
    youthHasIncome: true,
    youthPrimaryIncomeSource: 'allowance',
    youthIncomeFrequency: 'occasionally',
    youthTypicalMonthlyIncome: 120,
    youthHeldPartTimeJob: false,
    youthHasCheckingAccount: false,
    youthHasSavingsAccount: false,
    youthHasDebitCard: false,
    youthUsesMoneyApps: false,
    youthBalanceCheckFrequency: 'rarely',
    youthHasCurrentSavings: false,
    youthSavingsAmount: 20,
    youthSavingsLocation: 'cash',
    youthSavingsContributionFrequency: 'never',
    youthHasSavingsGoal: false,
    youthPrimarySpendingCategory: 'entertainment',
    youthWeeklySpendingAmount: 90,
    youthPaysRecurringExpenses: false,
    youthRanOutOfMoney: true,
    youthSpendingApproach: 'as-needed',
    youthTracksSpending: false,
    youthHasEmergencyBuffer: false,
    youthGetsGuardianHelp: false,
    youthSharesMoneyWithOthers: false,
    youthMoneyConfidence: 'not-yet-confident'
  });

  test('youth profile converts questionnaire answers into income inputs', () => {
    const result = runScore(baseYouthProfile);

    expect(result.totalIncome).toBeCloseTo(420, 2);
    expect(result.breakdown.resilience.score).toBeGreaterThan(55);
    expect(result.penalty.total).toBeLessThan(8);
    expect(result.breakdown.stability.score).toBeGreaterThan(60);
    expect(result.questionnaire.weight).toBeCloseTo(0.85, 2);
    expect(result.questionnaire.contribution).toBeLessThanOrEqual(85);
    expect(result.plaid.available).toBe(false);
    expect(result.plaid.contribution).toBe(0);
    expect(result.score).toBeCloseTo(result.questionnaire.contribution, 5);
  });

  test('youth scoring penalizes weak habits compared to engaged profile', () => {
    const supportive = runScore(baseYouthProfile);
    const struggling = runScore(stressedYouthProfile);

    expect(supportive.score).toBeGreaterThan(struggling.score + 18);
    expect(supportive.breakdown.resilience.score).toBeGreaterThan(struggling.breakdown.resilience.score + 15);
    expect(struggling.penalty.total).toBeGreaterThan(supportive.penalty.total);
    expect(struggling.plaid.available).toBe(false);
    expect(struggling.plaid.contribution).toBe(0);
    expect(supportive.questionnaire.contribution).toBeLessThanOrEqual(85);
    expect(struggling.questionnaire.contribution).toBeLessThanOrEqual(85);
  });
});
