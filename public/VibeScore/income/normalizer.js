/**
 * @file VibeScore/income/normalizer.js
 * @description Normalizes heterogeneous income documents into the structure expected by the scoring engine.
 */

import { INCOME_STREAM_KEYS } from './constants.js';
import { safeNumber, percentToUnit } from './metrics.js';

const streamKeyByHint = (hint = '') => {
  const value = String(hint || '').toLowerCase();
  if (!value) return 'otherIncome';
  if (value.includes('salary') || value.includes('primary') || value.includes('job') || value.includes('w2')) return 'primaryIncome';
  if (value.includes('bonus') || value.includes('equity')) return 'bonusIncome';
  if (value.includes('commission')) return 'commissionIncome';
  if (value.includes('passive') || value.includes('dividend')) return 'passiveIncome';
  if (value.includes('rental') || value.includes('property')) return 'rentalIncome';
  if (value.includes('side') || value.includes('gig') || value.includes('freelance')) return 'sideIncome';
  if (value.includes('additional') || value.includes('secondary')) return 'additionalIncome';
  return 'otherIncome';
};

const coerceBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(trimmed)) return true;
    if (['false', 'no', 'n', '0'].includes(trimmed)) return false;
  }
  return Boolean(value);
};

const pickFirstNumber = (source, keys, fallback = undefined) => {
  for (const key of keys) {
    if (key in source) {
      const value = safeNumber(source[key], NaN);
      if (!Number.isNaN(value)) return value;
    }
  }
  return fallback;
};

const pickFirstString = (source, keys, fallback = undefined) => {
  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null) {
      const value = String(source[key]).trim();
      if (value.length) return value;
    }
  }
  return fallback;
};

const youthIncomeSourceToStreamKey = (source) => {
  const value = String(source || '').toLowerCase();
  switch (value) {
    case 'part-time-job':
      return 'primaryIncome';
    case 'gigs':
    case 'gig':
      return 'sideIncome';
    case 'allowance':
      return 'additionalIncome';
    case 'gifts':
      return 'otherIncome';
    default:
      return 'additionalIncome';
  }
};

const youthIncomeSourceToEmploymentType = (source, hasIncome = false) => {
  if (!hasIncome) return 'unemployed';
  const value = String(source || '').toLowerCase();
  switch (value) {
    case 'part-time-job':
      return 'part-time';
    case 'gigs':
    case 'gig':
      return 'gig';
    case 'allowance':
      return 'part-time';
    case 'gifts':
      return 'gig';
    default:
      return 'part-time';
  }
};

const youthIncomeFrequencyToReliability = (frequency) => {
  const value = String(frequency || '').toLowerCase();
  switch (value) {
    case 'weekly':
    case 'biweekly':
      return 'high';
    case 'monthly':
      return 'medium';
    case 'occasionally':
    default:
      return 'low';
  }
};

const youthSavingsContributionRate = (frequency) => {
  const value = String(frequency || '').toLowerCase();
  switch (value) {
    case 'weekly':
      return 0.45;
    case 'biweekly':
      return 0.35;
    case 'monthly':
      return 0.25;
    case 'rarely':
      return 0.1;
    case 'never':
      return 0.02;
    default:
      return 0.15;
  }
};

const isYouthProfile = (raw = {}, normalizedAge = NaN) => {
  if (Number.isFinite(normalizedAge) && normalizedAge <= 17) {
    return true;
  }
  if (raw && typeof raw === 'object') {
    if (Object.prototype.hasOwnProperty.call(raw, 'youthHasIncome')) return true;
    if (Object.prototype.hasOwnProperty.call(raw, 'youthTypicalMonthlyIncome')) return true;
  }
  const fallbackAge = safeNumber(raw?.age ?? raw?.ageYears ?? raw?.profile?.age, NaN);
  return Number.isFinite(fallbackAge) && fallbackAge <= 17;
};

const appendOrMergeStream = (streams, entry) => {
  if (!entry || typeof entry !== 'object') return streams;
  const amount = safeNumber(entry.amount ?? entry.total ?? entry.value, NaN);
  if (!Number.isFinite(amount) || amount <= 0) return streams;
  const type = INCOME_STREAM_KEYS.includes(entry.type) ? entry.type : youthIncomeSourceToStreamKey(entry.type);
  const category = entry.category || entry.label || type || 'Income';
  const existingIndex = streams.findIndex((item) => item.type === type && item.category === category);
  if (existingIndex >= 0) {
    streams[existingIndex].amount += amount;
  } else {
    streams.push({ type, category, amount });
  }
  return streams;
};

const applyYouthNormalization = (raw = {}, normalized = {}) => {
  const hasIncome = coerceBoolean(raw.youthHasIncome);
  const monthlyIncome = safeNumber(raw.youthTypicalMonthlyIncome, NaN);
  const positiveIncome = Number.isFinite(monthlyIncome) && monthlyIncome > 0;
  if (positiveIncome) {
    const streamKey = youthIncomeSourceToStreamKey(raw.youthPrimaryIncomeSource);
    normalized[streamKey] = safeNumber(normalized[streamKey], 0) + monthlyIncome;

    const updatedStreams = Array.isArray(normalized.incomeStreams)
      ? normalized.incomeStreams.map((entry) => ({
        type: entry?.type ?? entry?.key,
        category: entry?.category ?? entry?.label ?? entry?.type ?? 'Income',
        amount: safeNumber(entry?.amount ?? entry?.value ?? entry?.total, NaN)
      })).filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
      : [];

    const youthEntry = {
      type: streamKey,
      category: raw.youthPrimaryIncomeSource || 'Youth income',
      amount: monthlyIncome
    };

    appendOrMergeStream(updatedStreams, youthEntry);

    normalized.incomeStreams = updatedStreams;
    normalized.streams = updatedStreams;
  }

  INCOME_STREAM_KEYS.forEach((key) => {
    normalized[key] = Math.max(0, safeNumber(normalized[key], 0));
  });

  const totalIncome = INCOME_STREAM_KEYS.reduce((sum, key) => sum + normalized[key], 0);
  if (totalIncome > 0) {
    normalized.totalMonthlyIncome = totalIncome;
    normalized.monthlyIncomeTotal = totalIncome;
    normalized.grossMonthlyIncome = totalIncome;
  }

  const weeklySpending = safeNumber(raw.youthWeeklySpendingAmount, NaN);
  const monthlySpending = Number.isFinite(weeklySpending) ? Math.max(0, weeklySpending * 4.333) : NaN;
  if (Number.isFinite(monthlySpending)) {
    normalized.averageMonthlyExpenses = monthlySpending;
    const essentialShare = coerceBoolean(raw.youthPaysRecurringExpenses) ? 0.6 : 0.42;
    normalized.essentialExpenses = Math.max(0, monthlySpending * essentialShare);
  } else if (!Number.isFinite(normalized.averageMonthlyExpenses) && totalIncome > 0) {
    normalized.averageMonthlyExpenses = totalIncome * 0.45;
    normalized.essentialExpenses = normalized.averageMonthlyExpenses * 0.5;
  }

  const contributionRate = youthSavingsContributionRate(raw.youthSavingsContributionFrequency);
  const savingsAmount = safeNumber(raw.youthSavingsAmount, NaN);
  const hasSavings = coerceBoolean(raw.youthHasCurrentSavings);
  let savingsRate = contributionRate;
  if (hasSavings && Number.isFinite(savingsAmount) && totalIncome > 0) {
    const assumedMonths = hasIncome ? 6 : 8;
    const ratio = Math.min(0.95, savingsAmount / Math.max(1, totalIncome * Math.max(1, assumedMonths)));
    savingsRate = Math.max(savingsRate, ratio);
  }
  if (!hasSavings) {
    savingsRate = Math.min(savingsRate, 0.05);
  }
  if (Number.isFinite(savingsRate)) {
    normalized.savingsRate = Math.max(0, Math.min(0.95, savingsRate));
  }

  let emergencyMonths = safeNumber(normalized.emergencyFundMonths, NaN);
  if (hasSavings && Number.isFinite(savingsAmount) && Number.isFinite(monthlySpending) && monthlySpending > 0) {
    emergencyMonths = Math.max(emergencyMonths || 0, savingsAmount / monthlySpending);
  } else if (coerceBoolean(raw.youthHasEmergencyBuffer)) {
    emergencyMonths = Math.max(emergencyMonths || 0, 1);
  }
  if (Number.isFinite(emergencyMonths)) {
    normalized.emergencyFundMonths = Math.max(0, emergencyMonths);
  }

  const employmentType = youthIncomeSourceToEmploymentType(raw.youthPrimaryIncomeSource, hasIncome || positiveIncome);
  if (employmentType) {
    normalized.employmentType = employmentType;
  }

  const reliability = youthIncomeFrequencyToReliability(raw.youthIncomeFrequency);
  if (reliability) {
    normalized.bonusReliability = reliability;
  }

  const tenureBaseline = coerceBoolean(raw.youthHeldPartTimeJob) ? 8 : (hasIncome || positiveIncome) ? 4 : 0;
  if (tenureBaseline > 0) {
    const currentTenure = safeNumber(normalized.tenureMonths, 0);
    normalized.tenureMonths = Math.max(currentTenure, tenureBaseline);
  }

  if (!Number.isFinite(safeNumber(normalized.debtToIncome, NaN))) {
    normalized.debtToIncome = 0;
  }

  if (raw.youthSavingsLocation) {
    normalized.youthSavingsLocation = raw.youthSavingsLocation;
  }

  normalized.youthHasGuardianSupport = coerceBoolean(raw.youthGetsGuardianHelp);
  normalized.youthRanOutOfMoneyRecently = coerceBoolean(raw.youthRanOutOfMoney);
  normalized.youthTracksSpendingFlag = coerceBoolean(raw.youthTracksSpending);
  normalized.youthHasEmergencyBufferFlag = coerceBoolean(raw.youthHasEmergencyBuffer);
  normalized.youthSharesMoneyFlag = coerceBoolean(raw.youthSharesMoneyWithOthers);
  normalized.youthHasSavingsGoalFlag = coerceBoolean(raw.youthHasSavingsGoal);
};

const enrichStreamsFromArray = (streams = [], normalized) => {
  let primaryAssigned = normalized.primaryIncome > 0;
  let additionalBuffer = 0;

  streams.forEach((entry, index) => {
    const amount = safeNumber(entry?.amount ?? entry?.monthlyAmount ?? entry?.value ?? entry?.total, NaN);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const hint = entry?.type ?? entry?.category ?? entry?.label ?? entry?.name ?? `stream-${index}`;
    const key = streamKeyByHint(hint);
    if (!primaryAssigned && key === 'primaryIncome') {
      normalized.primaryIncome = (normalized.primaryIncome || 0) + amount;
      primaryAssigned = true;
      return;
    }
    if (INCOME_STREAM_KEYS.includes(key)) {
      normalized[key] = (normalized[key] || 0) + amount;
    } else {
      additionalBuffer += amount;
    }
  });

  if (additionalBuffer > 0) {
    normalized.additionalIncome = (normalized.additionalIncome || 0) + additionalBuffer;
  }
};

const deriveHistory = (raw = {}) => {
  const candidates = [raw.incomeHistory, raw.incomeTimeline, raw.history, raw.monthlyIncomeHistory];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate
        .map((entry) => ({
          month: entry?.month ?? entry?.date ?? entry?.label ?? entry?.period,
          amount: safeNumber(entry?.amount ?? entry?.value ?? entry?.total ?? entry?.income, NaN)
        }))
        .filter((entry) => entry.month && Number.isFinite(entry.amount));
    }
  }
  return [];
};

const deriveTenureMonths = (raw = {}) => {
  const direct = safeNumber(raw.tenureMonths, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const years = safeNumber(raw.tenureYears, NaN);
  if (Number.isFinite(years)) return Math.max(0, years * 12);
  const startDateString = pickFirstString(raw, ['employmentStartDate', 'roleStartDate'], null);
  if (startDateString) {
    const start = new Date(startDateString);
    if (!Number.isNaN(start.getTime())) {
      const now = Date.now();
      const months = Math.max(0, (now - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
      return Math.round(months);
    }
  }
  return 0;
};

export const normalizeIncomeData = (rawData = {}) => {
  const normalized = { ...rawData };

  INCOME_STREAM_KEYS.forEach((key) => {
    normalized[key] = safeNumber(rawData[key], 0);
  });

  const aggregateIncome = pickFirstNumber(rawData, [
    'totalMonthlyIncome',
    'monthlyIncomeTotal',
    'grossMonthlyIncome',
    'monthlyNetIncome',
    'netMonthlyIncome',
    'incomePerMonth'
  ], null);
  if (aggregateIncome && aggregateIncome > 0) {
    if (!normalized.primaryIncome) {
      normalized.primaryIncome = aggregateIncome;
    } else if (normalized.primaryIncome < aggregateIncome) {
      const remainder = Math.max(0, aggregateIncome - normalized.primaryIncome);
      normalized.additionalIncome = (normalized.additionalIncome || 0) + remainder;
    }
  }

  const streamCollections = [rawData.incomeStreams, rawData.streams, rawData.sources];
  streamCollections.forEach((collection) => {
    if (Array.isArray(collection) && collection.length) {
      enrichStreamsFromArray(collection, normalized);
    }
  });

  const reportedExpenses = pickFirstNumber(rawData, ['averageMonthlyExpenses', 'monthlyExpenses', 'expensesMonthly', 'spending'], NaN);
  if (Number.isFinite(reportedExpenses)) {
    normalized.averageMonthlyExpenses = reportedExpenses;
  }

  const essentialExpenses = pickFirstNumber(rawData, ['essentialExpenses', 'fixedExpenses', 'coreExpenses'], NaN);
  if (Number.isFinite(essentialExpenses)) {
    normalized.essentialExpenses = essentialExpenses;
  }

  const savingsRate = pickFirstNumber(rawData, ['savingsRate', 'monthlySavingsRate', 'savingRate', 'savingsPercent'], NaN);
  if (Number.isFinite(savingsRate)) {
    normalized.savingsRate = percentToUnit(savingsRate, savingsRate);
  }

  const emergencyMonths = pickFirstNumber(rawData, ['emergencyFundMonths', 'safetyNetMonths', 'monthsOfExpenses', 'emergencyMonths'], NaN);
  if (Number.isFinite(emergencyMonths)) {
    normalized.emergencyFundMonths = emergencyMonths;
  }

  const employmentType = pickFirstString(rawData, ['employmentType', 'jobType', 'roleType', 'workType']);
  if (employmentType) normalized.employmentType = employmentType;

  const industryRisk = pickFirstString(rawData, ['industryRisk', 'industryVolatility', 'volatilityLevel']);
  if (industryRisk) normalized.industryRisk = industryRisk;

  const variableReliability = pickFirstString(rawData, ['bonusReliability', 'variablePayReliability', 'variablePayConsistency']);
  if (variableReliability) normalized.bonusReliability = variableReliability;

  const hiringTrend = pickFirstString(rawData, ['industryHiringTrend', 'marketTrend']);
  if (hiringTrend) normalized.industryHiringTrend = hiringTrend;

  const skillDemand = pickFirstString(rawData, ['skillDemand', 'marketDemand', 'talentDemand']);
  if (skillDemand) normalized.skillDemand = skillDemand;

  const savingsContribution = pickFirstNumber(rawData, ['promotionPipeline', 'promotionReadiness', 'promotionProbability'], NaN);
  if (Number.isFinite(savingsContribution)) normalized.promotionPipeline = savingsContribution;

  const upskilling = pickFirstNumber(rawData, ['upskillingProgress', 'credentialMomentum', 'trainingProgress'], NaN);
  if (Number.isFinite(upskilling)) normalized.upskillingProgress = percentToUnit(upskilling, upskilling);

  const satisfaction = pickFirstNumber(rawData, ['roleSatisfaction', 'jobSatisfaction', 'workSatisfaction'], NaN);
  if (Number.isFinite(satisfaction)) normalized.roleSatisfaction = percentToUnit(satisfaction, satisfaction);

  const regionCost = pickFirstNumber(rawData, ['regionCostIndex', 'costOfLivingIndex', 'metroCostIndex'], NaN);
  if (Number.isFinite(regionCost)) normalized.regionCostIndex = regionCost;

  const debtToIncome = pickFirstNumber(rawData, ['debtToIncome', 'debtToIncomeRatio', 'dti', 'dtiRatio'], NaN);
  if (Number.isFinite(debtToIncome)) normalized.debtToIncome = percentToUnit(debtToIncome, debtToIncome);

  const insuranceCoverage = pickFirstNumber(rawData, ['incomeProtectionCoverage', 'disabilityCoverage', 'incomeInsuranceCoverage'], NaN);
  if (Number.isFinite(insuranceCoverage)) normalized.incomeProtectionCoverage = percentToUnit(insuranceCoverage, insuranceCoverage);

  normalized.tenureMonths = deriveTenureMonths(rawData);
  normalized.layoffHistory = safeNumber(rawData.layoffHistory ?? rawData.layoffCount, 0);

  normalized.upcomingContractRenewal = coerceBoolean(rawData.upcomingContractRenewal);
  normalized.plannedMajorExpense = coerceBoolean(rawData.plannedMajorExpense ?? rawData.largeExpensePlanned);

  const unemployment = pickFirstNumber(rawData, ['regionalUnemploymentRate', 'unemploymentRate', 'localUnemployment'], NaN);
  if (Number.isFinite(unemployment)) normalized.regionalUnemploymentRate = percentToUnit(unemployment, unemployment);

  const history = deriveHistory(rawData);
  if (history.length) normalized.incomeHistory = history;

  const ageYears = pickFirstNumber(rawData, ['ageYears', 'age', 'ageInYears'], NaN);
  if (Number.isFinite(ageYears)) normalized.age = ageYears;

  const ageBracket = pickFirstString(rawData, ['ageBracket', 'ageRange', 'ageBand']);
  if (ageBracket) normalized.ageBracket = ageBracket;

  const ageExpectedMonthly = pickFirstNumber(rawData, ['ageIncomeExpectedMonthly', 'ageExpectedMonthlyIncome', 'ageMonthlyExpected'], NaN);
  if (Number.isFinite(ageExpectedMonthly)) normalized.ageIncomeExpectedMonthly = ageExpectedMonthly;

  const ageAlignment = pickFirstNumber(rawData, ['ageIncomeAlignmentRatio', 'ageIncomeAlignment'], NaN);
  if (Number.isFinite(ageAlignment)) normalized.ageIncomeAlignmentRatio = ageAlignment;

  if (isYouthProfile(rawData, normalized.age)) {
    applyYouthNormalization(rawData, normalized);
  }

  return normalized;
};

export default normalizeIncomeData;
