import { FIELD_VISIBILITY_RULES, REQUIRED_PROFILE_WEIGHTS } from '../public/dashboard/income-profile-constants.js';
import { dataPresenceScore } from '../public/VibeScore/income/metrics.js';

const profile = {
  birthday: '2011-05-01',
  age: 14,
  youthHasIncome: true,
  youthPrimaryIncomeSource: 'allowance',
  youthIncomeFrequency: 'weekly',
  youthTypicalMonthlyIncome: 150,
  youthHeldPartTimeJob: false,
  youthHasCheckingAccount: false,
  youthHasSavingsAccount: true,
  youthHasDebitCard: false,
  youthUsesMoneyApps: true,
  youthBalanceCheckFrequency: 'weekly',
  youthHasCurrentSavings: true,
  youthSavingsAmount: 300,
  youthSavingsLocation: 'bank',
  youthSavingsContributionFrequency: 'monthly',
  youthHasSavingsGoal: true,
  youthPrimarySpendingCategory: 'food',
  youthWeeklySpendingAmount: 25,
  youthPaysRecurringExpenses: false,
  youthRanOutOfMoney: false,
  youthSpendingApproach: 'plan-ahead',
  youthTracksSpending: true,
  youthHasEmergencyBuffer: true,
  youthGetsGuardianHelp: true,
  youthSharesMoneyWithOthers: false,
  youthMoneyConfidence: 'very-confident'
};

const weights = {};
for (const [fieldId, weight] of Object.entries(REQUIRED_PROFILE_WEIGHTS)) {
  const predicate = FIELD_VISIBILITY_RULES[fieldId];
  if (typeof predicate === 'function' && !predicate(profile)) continue;
  weights[fieldId] = weight;
}

const presence = dataPresenceScore(profile, weights);

const sortedKeys = Object.keys(weights).sort();
console.log(JSON.stringify({ presence, keys: sortedKeys }, null, 2));
