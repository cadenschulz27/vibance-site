/**
 * @file VibeScore/income/data-loader.js
 * @description Aggregates transactional rollup data from existing app tabs into
 *              the advanced income scoring engine input schema.
 */

import { db } from '../../api/firebase.js';
import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { INCOME_STREAM_KEYS } from './constants.js';
import { safeNumber } from './metrics.js';

const ESSENTIAL_EXPENSE_KEYWORDS = [
  'rent',
  'mortgage',
  'housing',
  'utility',
  'electric',
  'water',
  'insurance',
  'grocer',
  'transport',
  'gas',
  'fuel',
  'car payment',
  'loan',
  'medical',
  'health',
  'childcare',
  'tuition',
  'phone',
  'internet'
];

const STREAM_CLASSIFIERS = [
  { key: 'bonusIncome', patterns: ['bonus', 'equity', 'rsu', 'stock grant', 'incentive'] },
  { key: 'commissionIncome', patterns: ['commission', 'sales commission', 'spiff'] },
  { key: 'passiveIncome', patterns: ['dividend', 'interest', 'royalty', 'passive', 'staking'] },
  { key: 'rentalIncome', patterns: ['rental', 'rent income', 'airbnb', 'lease'] },
  { key: 'sideIncome', patterns: ['side', 'freelance', 'consult', 'gig', 'etsy', 'shop', 'contract'] },
  { key: 'otherIncome', patterns: ['gift', 'rebate', 'refund', 'misc', 'other'] }
];

const monthKeyToDate = (key) => {
  if (typeof key !== 'string') return new Date(NaN);
  const [year, month] = key.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return new Date(NaN);
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
};

const latestMonths = (count = 12) => {
  const out = [];
  const anchor = new Date();
  anchor.setDate(1);
  anchor.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - i);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(label);
  }
  return out;
};

const classifyIncomeCategory = (category, { isPrimary = false } = {}) => {
  const lower = String(category || '').toLowerCase();
  if (!lower) {
    return isPrimary ? 'primaryIncome' : 'additionalIncome';
  }
  for (const entry of STREAM_CLASSIFIERS) {
    if (entry.patterns.some((pattern) => lower.includes(pattern))) {
      return entry.key;
    }
  }
  return isPrimary ? 'primaryIncome' : 'additionalIncome';
};

const ensurePrimaryAssignment = (entries) => {
  const assigned = entries.some((entry) => entry.key === 'primaryIncome');
  if (!assigned && entries.length) {
    entries[0].key = 'primaryIncome';
  }
  return entries;
};

const isEssentialCategory = (category) => {
  const lower = String(category || '').toLowerCase();
  if (!lower) return false;
  return ESSENTIAL_EXPENSE_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const coerceBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
    if (['false', 'no', '0', 'n'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const pickNumber = (source, keys) => {
  if (!source || !keys) return NaN;
  for (const key of keys) {
    const value = safeNumber(source[key], NaN);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
};

const computeEmergencyFundMonths = (userData, avgExpenses) => {
  const explicit = pickNumber(userData?.emergencyFund, ['currentMonths', 'current', 'months']);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const incomeFields = [
    userData?.income,
    userData?.savings,
    userData?.cashFlow,
    userData?.profile
  ];
  for (const scope of incomeFields) {
    const fallback = pickNumber(scope, ['emergencyFundMonths', 'monthsOfExpenses', 'safetyNetMonths']);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }

  const liquidBalances = [
    pickNumber(userData?.savings, ['totalLiquidSavings', 'liquidBalance', 'cashReserves']),
    pickNumber(userData?.cashFlow, ['cashOnHand']),
    pickNumber(userData?.assets, ['cash'])
  ].find((val) => Number.isFinite(val) && val > 0);

  if (Number.isFinite(liquidBalances) && liquidBalances > 0 && avgExpenses > 0) {
    return liquidBalances / avgExpenses;
  }
  return 0;
};

const computeDebtToIncome = (userData) => {
  const direct = pickNumber(userData?.debt, ['debtToIncomeRatio', 'dtiRatio', 'dti']);
  if (Number.isFinite(direct) && direct > 0) {
    return direct > 1.5 ? direct / 100 : direct;
  }
  const incomeScope = userData?.income || {};
  const fallback = pickNumber(incomeScope, ['debtToIncome']);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback > 1.5 ? fallback / 100 : fallback;
  }
  return 0;
};

const computeRegionCostIndex = (userData) => {
  const direct = pickNumber(userData?.income, ['regionCostIndex', 'costOfLivingIndex']);
  if (Number.isFinite(direct)) return direct;
  const profile = pickNumber(userData?.profile, ['regionCostIndex', 'costOfLivingIndex']);
  if (Number.isFinite(profile)) return profile;
  const location = pickNumber(userData?.location, ['costIndex']);
  if (Number.isFinite(location)) return location;
  return 100;
};

const deriveEmploymentType = (userData, primaryCategory) => {
  const explicit = userData?.income?.employmentType || userData?.profile?.employmentType;
  if (explicit) return explicit;
  const lower = String(primaryCategory || '').toLowerCase();
  if (!lower) return 'w2';
  if (lower.includes('contract') || lower.includes('consult')) return 'contract';
  if (lower.includes('freelance') || lower.includes('gig')) return 'gig';
  if (lower.includes('self') || lower.includes('business') || lower.includes('llc')) return 'business-owner';
  return 'w2';
};

const deriveTenureMonths = (userData, history) => {
  const explicit = pickNumber(userData?.income, ['tenureMonths']);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const career = pickNumber(userData?.career, ['tenureMonths']);
  if (Number.isFinite(career) && career >= 0) return career;
  const positiveMonths = (history || []).filter((entry) => safeNumber(entry.amount, 0) > 0).length;
  return positiveMonths;
};

const buildIncomeStreams = (categoryTotals, monthsCount, primaryCategory) => {
  const entries = Array.from(categoryTotals.entries())
    .map(([category, total]) => ({
      category,
      total,
      key: classifyIncomeCategory(category, { isPrimary: category === primaryCategory })
    }))
    .sort((a, b) => b.total - a.total);

  ensurePrimaryAssignment(entries);

  const streamTotals = INCOME_STREAM_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  const streamEntries = [];
  entries.forEach((entry) => {
    const average = entry.total / Math.max(1, monthsCount);
    if (average <= 0) return;
    const key = INCOME_STREAM_KEYS.includes(entry.key) ? entry.key : 'additionalIncome';
    streamTotals[key] += average;
    streamEntries.push({
      type: key,
      category: entry.category,
      amount: average
    });
  });

  return { streamTotals, streamEntries };
};

const buildIncomeHistory = (monthlySummaries) => monthlySummaries.map((entry) => ({
  month: `${entry.month}-01`,
  amount: safeNumber(entry.incomeTotal, 0)
}));

export const loadIncomeDataFromTabs = async (uid, userData = {}) => {
  if (!uid) return null;

  const months = latestMonths(12);
  const monthSet = new Set(months);

  const summariesSnap = await getDocs(collection(db, 'users', uid, 'rollup_summaries'));
  const monthlySummaries = [];
  summariesSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const month = docSnap.id || data.periodKey;
    if (!month || !monthSet.has(month)) return;
    monthlySummaries.push({
      month,
      incomeTotal: safeNumber(data.incomeTotal, 0),
      expenseTotal: safeNumber(data.expenseTotal, 0)
    });
  });

  if (!monthlySummaries.length) {
    return null;
  }

  monthlySummaries.sort((a, b) => monthKeyToDate(a.month) - monthKeyToDate(b.month));
  const monthsCount = monthlySummaries.length;

  const incomeSum = monthlySummaries.reduce((sum, entry) => sum + safeNumber(entry.incomeTotal, 0), 0);
  const expenseSum = monthlySummaries.reduce((sum, entry) => sum + safeNumber(entry.expenseTotal, 0), 0);
  const avgIncome = incomeSum / monthsCount;
  const avgExpenses = expenseSum / monthsCount;
  const savingsRate = avgIncome > 0 ? Math.max(0, (avgIncome - avgExpenses) / avgIncome) : 0;
  const history = buildIncomeHistory(monthlySummaries);

  const relevantMonths = new Set(monthlySummaries.map((entry) => entry.month));
  const rollupsSnap = await getDocs(collection(db, 'users', uid, 'rollups'));
  const categoryTotals = new Map();
  let essentialExpenseTotal = 0;

  rollupsSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const periodKey = data.periodKey || docSnap.id.split('_')[0];
    if (!relevantMonths.has(periodKey)) return;
    const category = data.categoryId || docSnap.id.split('_').slice(1).join('_') || 'Uncategorized';
    const incomeAmount = safeNumber(data.incomeTotal, 0);
    const expenseAmount = safeNumber(data.expenseTotal, 0);
    if (incomeAmount > 0) {
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + incomeAmount);
    }
    if (expenseAmount > 0 && isEssentialCategory(category)) {
      essentialExpenseTotal += expenseAmount;
    }
  });

  const primaryCategory = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])?.[0]?.[0] || null;

  const { streamTotals, streamEntries } = buildIncomeStreams(categoryTotals, monthsCount, primaryCategory);
  const emergencyFundMonths = computeEmergencyFundMonths(userData, avgExpenses);

  return {
    ...streamTotals,
    incomeStreams: streamEntries,
    streams: streamEntries,
    totalMonthlyIncome: avgIncome,
    monthlyIncomeTotal: avgIncome,
    grossMonthlyIncome: avgIncome,
    averageMonthlyExpenses: avgExpenses,
    essentialExpenses: essentialExpenseTotal > 0 ? (essentialExpenseTotal / Math.max(1, monthsCount)) : undefined,
    savingsRate,
    monthlySavingsRate: savingsRate,
    incomeHistory: history,
    tenureMonths: deriveTenureMonths(userData, history),
    employmentType: deriveEmploymentType(userData, primaryCategory),
    bonusReliability: userData?.income?.bonusReliability,
    industryRisk: userData?.income?.industryRisk,
    industryHiringTrend: userData?.career?.industryHiringTrend || userData?.income?.industryHiringTrend,
    skillDemand: userData?.career?.skillDemand || userData?.income?.skillDemand,
    promotionPipeline: safeNumber(userData?.career?.promotionPipeline ?? userData?.income?.promotionPipeline, 0),
    upskillingProgress: safeNumber(userData?.career?.upskillingProgress ?? userData?.income?.upskillingProgress, 0),
    roleSatisfaction: safeNumber(userData?.career?.roleSatisfaction ?? userData?.income?.roleSatisfaction, 0),
    regionCostIndex: computeRegionCostIndex(userData),
    layoffHistory: safeNumber(userData?.career?.layoffHistory ?? userData?.income?.layoffHistory, 0),
    upcomingContractRenewal: coerceBoolean(userData?.income?.upcomingContractRenewal ?? userData?.career?.upcomingContractRenewal),
    plannedMajorExpense: coerceBoolean(userData?.cashFlow?.plannedMajorExpense ?? userData?.budgeting?.plannedMajorExpense ?? userData?.income?.plannedMajorExpense),
    incomeProtectionCoverage: safeNumber(userData?.insurance?.incomeProtectionCoverage ?? userData?.income?.incomeProtectionCoverage, NaN),
    emergencyFundMonths,
    debtToIncome: computeDebtToIncome(userData),
    regionalUnemploymentRate: safeNumber(userData?.economy?.regionalUnemploymentRate ?? userData?.income?.regionalUnemploymentRate, NaN),
    averageMonthlySurplus: avgIncome - avgExpenses
  };
};

export default loadIncomeDataFromTabs;
