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
import { computeMonthlyRollupsFromTransactions } from '../../shared/rollup-fallback.js';
import { extractAgeFromUserData, getAgeExpectationForAge, injectAgeMetadata } from './age-utils.js';

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

const extractIncomeTotal = (value) => {
  if (typeof value === 'number') return safeNumber(value, 0);
  if (value && typeof value === 'object') return safeNumber(value.income, 0);
  return 0;
};

const extractExpenseTotal = (value) => {
  if (value && typeof value === 'object') return safeNumber(value.expense, 0);
  return 0;
};

const sumEssentialExpenses = (categoryTotals) => {
  if (!categoryTotals || typeof categoryTotals.forEach !== 'function') return 0;
  let total = 0;
  categoryTotals.forEach((value, category) => {
    const expense = extractExpenseTotal(value);
    if (expense > 0 && isEssentialCategory(category)) {
      total += expense;
    }
  });
  return total;
};

const buildProfileOnlyDataset = (profile = {}, userData = {}) => {
  if (!profile || typeof profile !== 'object' || !Object.keys(profile).length) return null;
  const dataset = {
    employmentType: profile.employmentType || userData?.income?.employmentType || null,
    tenureMonths: safeNumber(profile.tenureMonths ?? userData?.income?.tenureMonths, NaN),
    industryRisk: profile.industryRisk || userData?.income?.industryRisk || null,
    regionalUnemploymentRate: safeNumber(profile.regionalUnemploymentRate ?? userData?.income?.regionalUnemploymentRate, NaN),
    layoffHistory: safeNumber(profile.layoffHistory ?? userData?.career?.layoffHistory, 0),
    plannedMajorExpense: coerceBoolean(profile.plannedMajorExpense ?? userData?.cashFlow?.plannedMajorExpense),
    bonusReliability: profile.bonusReliability || userData?.income?.bonusReliability || null,
    savingsRate: safeNumber(profile.savingsRateOverride ?? userData?.income?.savingsRate ?? userData?.income?.monthlySavingsRate, NaN),
    incomeProtectionCoverage: safeNumber(profile.incomeProtectionCoverage ?? userData?.income?.incomeProtectionCoverage, NaN),
    promotionPipeline: safeNumber(profile.promotionPipeline ?? userData?.career?.promotionPipeline, NaN),
    upskillingProgress: safeNumber(profile.upskillingProgress ?? userData?.career?.upskillingProgress, NaN),
    skillDemand: profile.skillDemand || userData?.career?.skillDemand || null,
    roleSatisfaction: safeNumber(profile.roleSatisfaction ?? userData?.career?.roleSatisfaction, NaN),
    emergencyFundMonths: safeNumber(profile.emergencyFundMonths ?? userData?.emergencyFund?.currentMonths, NaN),
    upcomingContractRenewal: coerceBoolean(profile.upcomingContractRenewal ?? userData?.income?.upcomingContractRenewal),
  };

  if (!Number.isFinite(dataset.tenureMonths)) delete dataset.tenureMonths;
  if (!Number.isFinite(dataset.savingsRate)) delete dataset.savingsRate;
  if (!Number.isFinite(dataset.incomeProtectionCoverage)) delete dataset.incomeProtectionCoverage;
  if (!Number.isFinite(dataset.promotionPipeline)) delete dataset.promotionPipeline;
  if (!Number.isFinite(dataset.upskillingProgress)) delete dataset.upskillingProgress;
  if (!Number.isFinite(dataset.roleSatisfaction)) delete dataset.roleSatisfaction;
  if (!Number.isFinite(dataset.emergencyFundMonths)) delete dataset.emergencyFundMonths;
  if (!Number.isFinite(dataset.regionalUnemploymentRate)) delete dataset.regionalUnemploymentRate;

  dataset.manualProfile = { ...profile };
  return dataset;
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

const buildIncomeStreams = (categoryTotals, monthsCount) => {
  const ranked = Array.from(categoryTotals.entries())
    .map(([category, raw]) => ({
      category,
      total: extractIncomeTotal(raw)
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  const typedEntries = ranked.map((entry, index) => ({
    category: entry.category,
    total: entry.total,
    key: classifyIncomeCategory(entry.category, { isPrimary: index === 0 })
  }));

  ensurePrimaryAssignment(typedEntries);

  const streamTotals = INCOME_STREAM_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  const streamEntries = [];
  typedEntries.forEach((entry) => {
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

  const primaryCategory = typedEntries[0]?.category || null;

  return { streamTotals, streamEntries, primaryCategory };
};

const buildIncomeHistory = (monthlySummaries) => monthlySummaries.map((entry) => ({
  month: `${entry.month}-01`,
  amount: safeNumber(entry.incomeTotal, 0)
}));

export const loadIncomeDataFromTabs = async (uid, userData = {}) => {
  if (!uid) return null;

  const months = latestMonths(12);
  const monthSet = new Set(months);

  const ageDetails = extractAgeFromUserData(userData);
  const ageExpectation = Number.isFinite(ageDetails?.age) ? getAgeExpectationForAge(ageDetails.age) : null;
  const applyAgeMetadata = (payload, monthlyIncome = null) => {
    if (!payload || typeof payload !== 'object') return payload;
    return injectAgeMetadata(payload, ageDetails, ageExpectation, monthlyIncome);
  };

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

  let categoryTotals = new Map();

  if (monthlySummaries.length) {
    const relevantMonths = new Set(monthlySummaries.map((entry) => entry.month));
    const rollupsSnap = await getDocs(collection(db, 'users', uid, 'rollups'));
    rollupsSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const periodKey = data.periodKey || docSnap.id.split('_')[0];
      if (!relevantMonths.has(periodKey)) return;
      const category = data.categoryId || docSnap.id.split('_').slice(1).join('_') || 'Uncategorized';
      const incomeAmount = safeNumber(data.incomeTotal, 0);
      const expenseAmount = safeNumber(data.expenseTotal, 0);
      if (!incomeAmount && !expenseAmount) return;
      const entry = categoryTotals.get(category) || { income: 0, expense: 0 };
      if (incomeAmount > 0) entry.income += incomeAmount;
      if (expenseAmount > 0) entry.expense += expenseAmount;
      categoryTotals.set(category, entry);
    });
  }

  const hasRollupData = monthlySummaries.some((entry) => safeNumber(entry.incomeTotal, 0) > 0 || safeNumber(entry.expenseTotal, 0) > 0);

  if (!hasRollupData) {
    const fallback = await computeMonthlyRollupsFromTransactions(uid, { months: months.length });
    if (fallback && Array.isArray(fallback.monthSummaries) && fallback.monthSummaries.length) {
      monthlySummaries.length = 0;
      fallback.monthSummaries
        .filter((entry) => entry && monthSet.has(entry.month))
        .forEach((entry) => {
          monthlySummaries.push({
            month: entry.month,
            incomeTotal: safeNumber(entry.incomeTotal, 0),
            expenseTotal: safeNumber(entry.expenseTotal, 0)
          });
        });
      if (fallback.categoryTotals instanceof Map) {
        categoryTotals = fallback.categoryTotals;
      } else if (fallback.categoryTotals && typeof fallback.categoryTotals === 'object') {
        categoryTotals = new Map(Object.entries(fallback.categoryTotals));
      } else {
        categoryTotals = new Map();
      }
    }
  }

  const hasAnyData = monthlySummaries.some((entry) => safeNumber(entry.incomeTotal, 0) > 0 || safeNumber(entry.expenseTotal, 0) > 0);

  if (!hasAnyData) {
    const profileFallback = buildProfileOnlyDataset(userData?.income?.profile || {}, userData);
    if (profileFallback) {
      const combined = {
        ...(userData?.income || {}),
        ...profileFallback
      };
      applyAgeMetadata(combined);
      return combined;
    }
    const incomeFallback = userData?.income ? { ...(userData.income) } : null;
    return applyAgeMetadata(incomeFallback);
  }

  monthlySummaries.sort((a, b) => monthKeyToDate(a.month) - monthKeyToDate(b.month));
  const monthsCount = monthlySummaries.length;

  const incomeSum = monthlySummaries.reduce((sum, entry) => sum + safeNumber(entry.incomeTotal, 0), 0);
  const expenseSum = monthlySummaries.reduce((sum, entry) => sum + safeNumber(entry.expenseTotal, 0), 0);
  const avgIncome = incomeSum / Math.max(1, monthsCount);
  const avgExpenses = expenseSum / Math.max(1, monthsCount);
  const savingsRate = avgIncome > 0 ? Math.max(0, (avgIncome - avgExpenses) / avgIncome) : 0;
  const history = buildIncomeHistory(monthlySummaries);

  const { streamTotals, streamEntries, primaryCategory } = buildIncomeStreams(categoryTotals, monthsCount);
  const essentialExpenseTotal = sumEssentialExpenses(categoryTotals);
  const emergencyFundMonths = computeEmergencyFundMonths(userData, avgExpenses);

  const result = {
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

  const profileOverrides = userData?.income?.profile;
  if (profileOverrides && typeof profileOverrides === 'object') {
    Object.entries(profileOverrides).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'string' && value.trim().length === 0) return;
      if (typeof value === 'number' && Number.isNaN(value)) return;

      if (key === 'savingsRateOverride') {
        result.savingsRate = safeNumber(value, savingsRate);
        result.monthlySavingsRate = result.savingsRate;
        return;
      }

      if (key === 'updatedAt' || key === 'completedSteps' || key === 'version') return;

      result[key] = value;
    });

    result.manualProfile = {
      ...profileOverrides
    };
  }

  applyAgeMetadata(result, avgIncome);
  return result;
};

export default loadIncomeDataFromTabs;
