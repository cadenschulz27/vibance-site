/**
 * @file VibeScore/income/factors.js
 * @description Factor-level scoring functions that assess specific dimensions of income quality.
 */

import {
  BONUS_RELIABILITY_ADJUSTMENT,
  DEFAULT_OPTIONS,
  EMPLOYMENT_TYPE_BASE,
  HIRING_TREND_ADJUSTMENT,
  INDUSTRY_RISK_ADJUSTMENT,
  SKILL_DEMAND_BASE
} from './constants.js';
import {
  clampScore,
  extractStreams,
  logistic,
  percentToUnit,
  ratioScore,
  saturate,
  safeNumber
} from './metrics.js';

const flag = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const resolveYouthStatus = (data, context) => {
  const ageYears = Number.isFinite(context?.age?.years) ? context.age.years : NaN;
  if (Number.isFinite(ageYears) && ageYears <= 17) return true;
  return Object.prototype.hasOwnProperty.call(data || {}, 'youthHasIncome') ||
    Object.prototype.hasOwnProperty.call(data || {}, 'youthTypicalMonthlyIncome');
};

const youthBalanceFrequencyScore = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'daily':
      return 1;
    case 'few-days':
      return 0.85;
    case 'weekly':
      return 0.7;
    case 'monthly':
      return 0.45;
    case 'rarely':
      return 0.2;
    default:
      return 0.45;
  }
};

const youthSpendingApproachWeight = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'plan-ahead':
      return 0.85;
    case 'mix':
      return 0.55;
    case 'as-needed':
      return 0.25;
    default:
      return 0.5;
  }
};

const youthConfidenceWeight = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'very-confident':
      return 0.9;
    case 'somewhat-confident':
      return 0.65;
    case 'not-yet-confident':
      return 0.35;
    default:
      return 0.55;
  }
};

const youthIncomeFrequencyMomentum = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'weekly':
      return 6;
    case 'biweekly':
      return 5;
    case 'monthly':
      return 3;
    case 'occasionally':
      return -5;
    default:
      return 0;
  }
};

const youthSavingsContributionBoost = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'weekly':
      return 6;
    case 'monthly':
      return 4;
    case 'rarely':
      return 1;
    case 'never':
      return -6;
    default:
      return 2;
  }
};

const youthSavingsLocationBonus = (value) => {
  const normalized = String(value || '').toLowerCase();
  switch (normalized) {
    case 'bank':
      return 6;
    case 'cash':
      return 2;
    case 'other':
      return 1;
    default:
      return 0;
  }
};

const normalizeEmploymentType = (type) => {
  if (!type) return 'contract';
  const normalized = String(type).toLowerCase();
  if (EMPLOYMENT_TYPE_BASE[normalized] !== undefined) return normalized;
  if (normalized.includes('self')) return 'business-owner';
  if (normalized.includes('owner')) return 'business-owner';
  if (normalized.includes('contract') || normalized.includes('freelance')) return 'contract';
  if (normalized.includes('gig')) return 'gig';
  if (normalized.includes('part')) return 'part-time';
  if (normalized.includes('full')) return 'full-time';
  if (normalized.includes('w2') || normalized.includes('salary')) return 'w2';
  return 'contract';
};

const normalizeRiskLabel = (value) => {
  if (!value) return 'moderate';
  const normalized = String(value).toLowerCase();
  if (INDUSTRY_RISK_ADJUSTMENT[normalized] !== undefined) return normalized;
  if (normalized.includes('very')) {
    if (normalized.includes('low')) return 'very-low';
    if (normalized.includes('high')) return 'very-high';
  }
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('elev')) return 'elevated';
  return 'moderate';
};

const normalizeReliability = (value) => {
  if (!value) return 'medium';
  const normalized = String(value).toLowerCase();
  if (BONUS_RELIABILITY_ADJUSTMENT[normalized] !== undefined) return normalized;
  if (normalized.includes('consis')) return 'high';
  if (normalized.includes('rare')) return 'low';
  if (normalized.includes('none')) return 'none';
  return 'medium';
};

const normalizeHiringTrend = (value) => {
  if (!value) return 'neutral';
  const normalized = String(value).toLowerCase();
  if (HIRING_TREND_ADJUSTMENT[normalized] !== undefined) return normalized;
  if (normalized.includes('expan') || normalized.includes('rapid')) return 'expanding';
  if (normalized.includes('contract') || normalized.includes('shrink')) return 'contracting';
  if (normalized.includes('cool') || normalized.includes('slow')) return 'cooling';
  if (normalized.includes('steady')) return 'steady';
  return 'neutral';
};

const normalizeSkillDemand = (value) => {
  if (!value) return 'balanced';
  const normalized = String(value).toLowerCase();
  if (SKILL_DEMAND_BASE[normalized] !== undefined) return normalized;
  if (normalized.includes('high') || normalized.includes('in-demand')) return 'strong';
  if (normalized.includes('scarce')) return 'scarce';
  if (normalized.includes('low') || normalized.includes('declin')) return 'declining';
  return 'balanced';
};

export const computeEarningPowerFactor = (data, context) => {
  const { adjustedIncome, options, ageTargets, age } = context;
  const config = options ?? DEFAULT_OPTIONS;
  const strongIncomeCap = config.strongIncomeCap ?? DEFAULT_OPTIONS.strongIncomeCap;
  const baselineMonthlyIncome = config.baselineMonthlyIncome ?? DEFAULT_OPTIONS.baselineMonthlyIncome;

  const normalized = saturate(adjustedIncome, strongIncomeCap);
  const baselineLiftRaw = adjustedIncome / Math.max(1, baselineMonthlyIncome);
  const baselineComponent = Math.max(0, Math.min(1, baselineLiftRaw));
  const baselineLift = Math.min(1.1, Math.max(0, baselineLiftRaw));

  const expectation = ageTargets?.expectation || null;
  let alignmentRatio = null;
  let alignmentComponent = baselineComponent;
  if (expectation && expectation.monthlyMid > 0) {
    alignmentRatio = adjustedIncome / expectation.monthlyMid;
    const bounded = Math.max(0, alignmentRatio);
    alignmentComponent = Math.min(1.1, bounded);
  }

  const blended = (0.55 * normalized) + (0.25 * baselineComponent) + (0.20 * alignmentComponent);
  const score = clampScore(blended * 100);
  return {
    id: 'earningPower',
    label: 'Earning Power',
    score,
    details: {
      adjustedIncome,
      baselineMonthlyIncome,
      strongIncomeCap,
      normalized,
      baselineLift,
      alignmentComponent,
      ageAlignment: alignmentRatio,
      ageExpectation: expectation,
      ageYears: age?.years ?? null
    }
  };
};

export const computeExpenseCoverageFactor = (data, context) => {
  const { totalIncome, options } = context;
  const { essentialExpenseFallbackRatio, expenseFallbackRatio } = options ?? DEFAULT_OPTIONS;
  const reportedExpenses = safeNumber(data.averageMonthlyExpenses, 0);
  const essentialExpenses = safeNumber(
    data.essentialExpenses,
    reportedExpenses > 0 ? reportedExpenses * essentialExpenseFallbackRatio : totalIncome * 0.55
  );
  const totalExpenses = reportedExpenses > 0 ? reportedExpenses : totalIncome * expenseFallbackRatio;
  const coverageRatio = totalExpenses <= 0 ? 0 : totalIncome / totalExpenses;
  const bufferRatio = essentialExpenses <= 0 ? 0 : Math.max(0, totalIncome - essentialExpenses) / essentialExpenses;
  const coverageComponent = ratioScore(coverageRatio, 1.25, 0.4) / 100;
  const bufferComponent = logistic(bufferRatio, 0.4, 5);
  let score = clampScore((coverageComponent * 60 + bufferComponent * 40));
  const details = {
    totalIncome,
    totalExpenses,
    essentialExpenses,
    coverageRatio,
    bufferRatio
  };

  if (resolveYouthStatus(data, context)) {
    let youthAdjust = 0;
    youthAdjust += (youthSpendingApproachWeight(data.youthSpendingApproach) - 0.5) * 22;
    if (flag(data.youthTracksSpending ?? data.youthTracksSpendingFlag)) youthAdjust += 4;
    if (flag(data.youthPaysRecurringExpenses)) youthAdjust += 3;
    if (flag(data.youthRanOutOfMoney ?? data.youthRanOutOfMoneyRecently)) youthAdjust -= 6;
    const guardianSupport = flag(data.youthGetsGuardianHelp ?? data.youthHasGuardianSupport) ? 1.5 : 0;
    youthAdjust += guardianSupport;
    score = clampScore(score + youthAdjust);
    details.youthAdjust = youthAdjust;
  }

  return {
    id: 'expenseCoverage',
    label: 'Expense Coverage',
    score,
    details
  };
};

export const computeStabilityFactor = (data, context) => {
  const employmentType = normalizeEmploymentType(data.employmentType || data.jobType);
  const industryRisk = normalizeRiskLabel(data.industryRisk || data.volatility);
  const base = EMPLOYMENT_TYPE_BASE[employmentType] ?? 55;
  const tenureMonths = Math.max(0, safeNumber(data.tenureMonths, 0));
  const tenureBoost = Math.min(24, tenureMonths * 0.9);
  const volatilityAdjust = INDUSTRY_RISK_ADJUSTMENT[industryRisk] ?? 0;
  const payFrequency = String(data.payFrequency || '').toLowerCase();
  const payAdjust = payFrequency.includes('weekly') ? 6 : payFrequency.includes('bi') ? 4 : payFrequency.includes('semi') ? 2 : payFrequency.includes('irregular') ? -6 : 0;
  const layoffHistory = Math.max(0, safeNumber(data.layoffHistory, 0));
  const layoffAdjust = -Math.min(10, layoffHistory * 3);
  const benefitCoverage = percentToUnit(data.employerBenefitCoverage, 0.5);
  const benefitAdjust = benefitCoverage * 10;
  const reliability = normalizeReliability(data.bonusReliability || data.variablePayReliability);
  const reliabilityAdjust = BONUS_RELIABILITY_ADJUSTMENT[reliability] ?? 0;
  const insurance = percentToUnit(data.incomeInsuranceCoverage, 0);
  const insuranceAdjust = insurance * 8;

  let score = clampScore(base + tenureBoost + volatilityAdjust + payAdjust + layoffAdjust + benefitAdjust + reliabilityAdjust + insuranceAdjust);
  const details = {
    employmentType,
    industryRisk,
    tenureMonths,
    volatilityAdjust,
    payAdjust,
    layoffHistory,
    benefitCoverage,
    reliability,
    insuranceCoverage: insurance
  };

  if (resolveYouthStatus(data, context)) {
    let youthAdjust = 0;
    const balanceDiscipline = youthBalanceFrequencyScore(data.youthBalanceCheckFrequency);
    youthAdjust += (balanceDiscipline - 0.45) * 14;
    if (flag(data.youthHasCheckingAccount)) youthAdjust += 4;
    if (flag(data.youthHasSavingsAccount)) youthAdjust += 5;
    if (flag(data.youthHasDebitCard)) youthAdjust += 2;
    if (flag(data.youthUsesMoneyApps)) youthAdjust += 1.5;
    if (flag(data.youthHeldPartTimeJob)) youthAdjust += 3;
    if (!flag(data.youthHasIncome)) youthAdjust -= 10;
    if (flag(data.youthGetsGuardianHelp ?? data.youthHasGuardianSupport)) youthAdjust += 2;
    score = clampScore(score + youthAdjust);
    details.youthAdjust = youthAdjust;
  }

  return {
    id: 'stability',
    label: 'Income Stability',
    score,
    details
  };
};

export const computeDiversityFactor = (data, context) => {
  const streams = extractStreams(data).slice(0, context.options.maxStreamsConsidered);
  if (!streams.length) {
    return {
      id: 'diversity',
      label: 'Income Diversity',
      score: 0,
      details: { streamCount: 0, herfindahl: 1, passiveShare: 0 }
    };
  }
  const total = streams.reduce((sum, stream) => sum + stream.amount, 0);
  const herfindahl = streams.reduce((sum, stream) => {
    const share = stream.amount / total;
    return sum + share * share;
  }, 0);
  const streamCount = streams.length;
  const passiveKeys = ['passiveIncome', 'rentalIncome', 'dividendIncome'];
  const passiveIncome = streams
    .filter((stream) => passiveKeys.includes(stream.key))
    .reduce((sum, stream) => sum + stream.amount, 0);
  const passiveShare = total > 0 ? passiveIncome / total : 0;

  const concentrationScore = streamCount === 1 ? 0 : (1 - herfindahl) / (1 - 1 / streamCount);
  const passiveComponent = Math.min(1, passiveShare * 1.4);
  const score = clampScore((concentrationScore * 70) + (passiveComponent * 30));
  return {
    id: 'diversity',
    label: 'Income Diversity',
    score,
    details: {
      streamCount,
      herfindahl,
      passiveShare
    }
  };
};

export const computeMomentumFactor = (data, context) => {
  const { history } = context;
  if (!history || history.count === 0) {
    let score = 48;
    const details = {
      slope: 0,
      slopePercent: 0,
      rSquared: 0,
      volatility: 0,
      recentChangePct: 0
    };

    if (resolveYouthStatus(data, context)) {
      let youthAdjust = youthIncomeFrequencyMomentum(data.youthIncomeFrequency) * 0.6;
      if (flag(data.youthHasSavingsGoal ?? data.youthHasSavingsGoalFlag)) youthAdjust += 3;
      if (flag(data.youthUsesMoneyApps)) youthAdjust += 1.5;
      if (flag(data.youthRanOutOfMoney ?? data.youthRanOutOfMoneyRecently)) youthAdjust -= 3;
      const approach = youthSpendingApproachWeight(data.youthSpendingApproach);
      youthAdjust += (approach - 0.5) * 8;
      score = clampScore(score + youthAdjust);
      details.youthAdjust = youthAdjust;
    }

    return {
      id: 'momentum',
      label: 'Trajectory',
      score,
      details
    };
  }
  const slopeComponent = clampScore(history.slopePercent * 180 + 50, 0, 100);
  const r2Component = clampScore(history.rSquared * 40 + 40, 0, 100);
  const volatilityPenalty = Math.min(35, history.volatility * 60);
  const recentMomentum = clampScore(history.recentChangePct * 140 + 50, 0, 100);
  let score = clampScore((slopeComponent * 0.35 + r2Component * 0.25 + recentMomentum * 0.25) - volatilityPenalty * 0.35);
  const details = {
    slope: history.slope,
    slopePercent: history.slopePercent,
    rSquared: history.rSquared,
    volatility: history.volatility,
    recentChangePct: history.recentChangePct
  };

  if (resolveYouthStatus(data, context)) {
    let youthAdjust = youthIncomeFrequencyMomentum(data.youthIncomeFrequency);
    if (flag(data.youthHasSavingsGoal ?? data.youthHasSavingsGoalFlag)) youthAdjust += 3;
    const contributionFrequency = String(data.youthSavingsContributionFrequency || '').toLowerCase();
    if (['weekly', 'monthly', 'biweekly'].includes(contributionFrequency)) youthAdjust += 2;
    if (flag(data.youthUsesMoneyApps)) youthAdjust += 1.5;
    if (flag(data.youthRanOutOfMoney ?? data.youthRanOutOfMoneyRecently)) youthAdjust -= 4;
    if (youthSpendingApproachWeight(data.youthSpendingApproach) > 0.75) youthAdjust += 2;
    score = clampScore(score + youthAdjust);
    details.youthAdjust = youthAdjust;
  }

  return {
    id: 'momentum',
    label: 'Income Momentum',
    score,
    details
  };
};

export const computeResilienceFactor = (data, context) => {
  const savingsRate = percentToUnit(data.savingsRate ?? data.monthlySavingsRate, 0);
  const dti = percentToUnit(data.debtToIncome ?? data.dtiRatio ?? data.debtToIncomeRatio, 0);
  const emergencyMonths = safeNumber(data.emergencyFundMonths ?? data.safetyNetMonths, 0);
  const options = context.options ?? DEFAULT_OPTIONS;
  const savingsComponent = Math.min(1, savingsRate / Math.max(0.05, options.desiredSavingsRate)) * 45;
  const emergencyComponent = Math.min(1, emergencyMonths / Math.max(1, options.idealEmergencyMonths)) * 35;
  const dtiComponent = clampScore((1 - Math.min(0.65, dti)) * 25, 0, 25);
  const insuranceComponent = percentToUnit(data.incomeProtectionCoverage || data.disabilityCoverage, 0) * 8;
  let score = clampScore(savingsComponent + emergencyComponent + dtiComponent + insuranceComponent);
  const details = {
    savingsRate,
    emergencyMonths,
    dti,
    insuranceComponent
  };

  if (resolveYouthStatus(data, context)) {
    let youthAdjust = 0;
    if (!flag(data.youthHasCurrentSavings)) youthAdjust -= 12;
    if (flag(data.youthHasEmergencyBuffer ?? data.youthHasEmergencyBufferFlag)) youthAdjust += 6;
    youthAdjust += youthSavingsLocationBonus(data.youthSavingsLocation);
    youthAdjust += youthSavingsContributionBoost(data.youthSavingsContributionFrequency);
    if (flag(data.youthGetsGuardianHelp ?? data.youthHasGuardianSupport)) youthAdjust += 2;
    if (flag(data.youthHasSavingsGoal ?? data.youthHasSavingsGoalFlag)) youthAdjust += 3;
    score = clampScore(score + youthAdjust);
    details.youthAdjust = youthAdjust;
  }

  return {
    id: 'resilience',
    label: 'Shock Resilience',
    score,
    details
  };
};

export const computeOpportunityFactor = (data, context) => {
  const skillDemand = normalizeSkillDemand(data.skillDemand || data.marketDemand);
  const demandBase = SKILL_DEMAND_BASE[skillDemand] ?? 60;
  const promotionPipeline = Math.min(2, Math.max(0, safeNumber(data.promotionPipeline, 0)));
  const promotionBoost = promotionPipeline * 8;
  const upskillingMomentum = percentToUnit(data.credentialMomentum || data.upskillingProgress, 0);
  const credentialBoost = upskillingMomentum * 14;
  const hiringTrend = normalizeHiringTrend(data.industryHiringTrend || data.marketTrend);
  const hiringBoost = HIRING_TREND_ADJUSTMENT[hiringTrend] ?? 0;
  const satisfaction = percentToUnit(data.roleSatisfaction, 0.6);
  const satisfactionBoost = satisfaction * 6;
  let score = clampScore(demandBase + promotionBoost + credentialBoost + hiringBoost + satisfactionBoost);
  const details = {
    skillDemand,
    promotionPipeline,
    upskillingMomentum,
    hiringTrend,
    satisfaction
  };

  if (resolveYouthStatus(data, context)) {
    let youthAdjust = 0;
    youthAdjust += (youthConfidenceWeight(data.youthMoneyConfidence) - 0.55) * 18;
    if (flag(data.youthHasSavingsGoal ?? data.youthHasSavingsGoalFlag)) youthAdjust += 4;
    youthAdjust += (youthSpendingApproachWeight(data.youthSpendingApproach) - 0.5) * 10;
    if (flag(data.youthTracksSpending ?? data.youthTracksSpendingFlag)) youthAdjust += 2;
    if (flag(data.youthSharesMoneyWithOthers ?? data.youthSharesMoneyFlag)) youthAdjust += 1;
    score = clampScore(score + youthAdjust);
    details.youthAdjust = youthAdjust;
  }

  return {
    id: 'opportunity',
    label: 'Future Opportunity',
    score,
    details
  };
};

export const computePenaltyAdjustments = (data, context) => {
  const items = [];
  const unemploymentRate = percentToUnit(data.regionalUnemploymentRate ?? data.unemploymentRate, 0.04);
  if (unemploymentRate > 0.06) {
    const amount = Math.min(10, (unemploymentRate - 0.06) * 80);
    items.push({
      id: 'laborMarket',
      label: 'Local unemployment pressure',
      amount
    });
  }

  const contractRenewal = data.upcomingContractRenewal === true || String(data.upcomingContractRenewal).toLowerCase() === 'true';
  if (contractRenewal) {
    items.push({
      id: 'contractRenewal',
      label: 'Contract renewal pending',
      amount: 6
    });
  }

  const majorExpense = data.plannedMajorExpense === true || String(data.plannedMajorExpense).toLowerCase() === 'true';
  if (majorExpense) {
    items.push({
      id: 'majorExpense',
      label: 'Large planned expense',
      amount: 4
    });
  }

  const historyVolatility = context.history?.volatility ?? 0;
  if (historyVolatility > 0.55) {
    items.push({
      id: 'volatility',
      label: 'Income volatility trend',
      amount: Math.min(8, historyVolatility * 10)
    });
  }

  const dataGaps = context.dataGaps || [];
  if (dataGaps.length >= 4) {
    items.push({
      id: 'dataGaps',
      label: 'Missing key income data',
      amount: Math.min(6, dataGaps.length * 1.5)
    });
  }

  const ageExpectation = context.ageTargets?.expectation;
  const ageYears = context.age?.years;
  if (ageExpectation && Number.isFinite(ageYears)) {
    const expectedMax = ageExpectation.monthlyMax;
    const income = context.totalIncome;
    if (expectedMax > 0) {
      const ratio = income / expectedMax;
      if (ratio < 0.5) {
        const severity = Math.min(1, (0.5 - ratio) / 0.5);
        items.push({
          id: 'ageAlignmentLow',
          label: 'Income low relative to age peers',
          amount: 5 * severity
        });
      }
    }
    if (ageExpectation.monthlyMid > 0) {
      const overRatio = income / ageExpectation.monthlyMid;
      if (overRatio > 3) {
        const severity = Math.min(1, (overRatio - 3) / 4);
        items.push({
          id: 'ageAlignmentHigh',
          label: 'Income atypically high for age band',
          amount: 3 * severity
        });
      }
    }
  }

  if (resolveYouthStatus(data, context)) {
    if (flag(data.youthRanOutOfMoney ?? data.youthRanOutOfMoneyRecently)) {
      let amount = 5;
      if (flag(data.youthGetsGuardianHelp ?? data.youthHasGuardianSupport)) {
        amount = Math.max(2, amount - 2);
      }
      items.push({
        id: 'youthCashCrunch',
        label: 'Recently ran out of money',
        amount
      });
    }
    if (!flag(data.youthHasEmergencyBuffer ?? data.youthHasEmergencyBufferFlag) && !flag(data.youthHasCurrentSavings)) {
      items.push({
        id: 'youthNoBuffer',
        label: 'No savings cushion established',
        amount: 3
      });
    }
    if (youthBalanceFrequencyScore(data.youthBalanceCheckFrequency) <= 0.25) {
      items.push({
        id: 'youthRarelyChecks',
        label: 'Rarely checks balances',
        amount: 2
      });
    }
  }

  return items;
};
