/**
 * @file VibeScore/income/constants.js
 * @description Constants, lookup tables, and shared configuration used by the advanced income scoring engine.
 */

export const INCOME_STREAM_KEYS = Object.freeze([
  'primaryIncome',
  'additionalIncome',
  'bonusIncome',
  'commissionIncome',
  'passiveIncome',
  'rentalIncome',
  'sideIncome',
  'otherIncome'
]);

export const INCOME_WEIGHTS = Object.freeze({
  earningPower: 0.25,
  expenseCoverage: 0.17,
  stability: 0.18,
  diversity: 0.12,
  momentum: 0.12,
  resilience: 0.10,
  opportunity: 0.06
});

export const MAX_PENALTY = 28;

export const DEFAULT_OPTIONS = Object.freeze({
  baselineMonthlyIncome: 6500,
  strongIncomeCap: 14500,
  essentialExpenseFallbackRatio: 0.65,
  expenseFallbackRatio: 0.82,
  desiredSavingsRate: 0.20,
  idealEmergencyMonths: 6,
  maxStreamsConsidered: 6
});

export const EMPLOYMENT_TYPE_BASE = Object.freeze({
  'w2': 84,
  'salaried': 84,
  'full-time': 80,
  'part-time': 60,
  'contract': 58,
  'consultant': 60,
  'freelance': 55,
  'business-owner': 66,
  'entrepreneur': 64,
  'gig': 48,
  'seasonal': 42,
  'unemployed': 0
});

export const INDUSTRY_RISK_ADJUSTMENT = Object.freeze({
  'very-low': 6,
  low: 3,
  moderate: 0,
  elevated: -8,
  high: -14,
  'very-high': -20
});

export const BONUS_RELIABILITY_ADJUSTMENT = Object.freeze({
  high: 6,
  medium: 2,
  low: -4,
  none: -8
});

export const HIRING_TREND_ADJUSTMENT = Object.freeze({
  expanding: 10,
  steady: 4,
  neutral: 0,
  cooling: -6,
  contracting: -12
});

export const SKILL_DEMAND_BASE = Object.freeze({
  scarce: 88,
  strong: 76,
  balanced: 64,
  saturated: 48,
  declining: 38
});

export const DATA_IMPORTANCE_WEIGHTS = Object.freeze({
  totalIncome: 1,
  averageMonthlyExpenses: 0.7,
  employmentType: 0.6,
  tenureMonths: 0.5,
  incomeHistory: 0.5,
  savingsRate: 0.4,
  emergencyFundMonths: 0.4,
  industryRisk: 0.3
});
