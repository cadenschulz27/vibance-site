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
  const { adjustedIncome, options } = context;
  const { strongIncomeCap, baselineMonthlyIncome } = options ?? DEFAULT_OPTIONS;
  const normalized = saturate(adjustedIncome, strongIncomeCap);
  const baselineLift = Math.min(1.1, adjustedIncome / Math.max(1, baselineMonthlyIncome));
  const score = clampScore((0.65 * normalized + 0.35 * Math.min(1, baselineLift)) * 100);
  return {
    id: 'earningPower',
    label: 'Earning Power',
    score,
    details: {
      adjustedIncome,
      baselineMonthlyIncome,
      strongIncomeCap,
      normalized,
      baselineLift
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
  const score = clampScore((coverageComponent * 60 + bufferComponent * 40));
  return {
    id: 'expenseCoverage',
    label: 'Expense Coverage',
    score,
    details: {
      totalIncome,
      totalExpenses,
      essentialExpenses,
      coverageRatio,
      bufferRatio
    }
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

  const score = clampScore(base + tenureBoost + volatilityAdjust + payAdjust + layoffAdjust + benefitAdjust + reliabilityAdjust + insuranceAdjust);
  return {
    id: 'stability',
    label: 'Income Stability',
    score,
    details: {
      employmentType,
      industryRisk,
      tenureMonths,
      volatilityAdjust,
      payAdjust,
      layoffHistory,
      benefitCoverage,
      reliability,
      insuranceCoverage: insurance
    }
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
    return {
      id: 'momentum',
      label: 'Trajectory',
      score: 48,
      details: {
        slope: 0,
        slopePercent: 0,
        rSquared: 0,
        volatility: 0,
        recentChangePct: 0
      }
    };
  }
  const slopeComponent = clampScore(history.slopePercent * 180 + 50, 0, 100);
  const r2Component = clampScore(history.rSquared * 40 + 40, 0, 100);
  const volatilityPenalty = Math.min(35, history.volatility * 60);
  const recentMomentum = clampScore(history.recentChangePct * 140 + 50, 0, 100);
  const score = clampScore((slopeComponent * 0.35 + r2Component * 0.25 + recentMomentum * 0.25) - volatilityPenalty * 0.35);
  return {
    id: 'momentum',
    label: 'Income Momentum',
    score,
    details: {
      slope: history.slope,
      slopePercent: history.slopePercent,
      rSquared: history.rSquared,
      volatility: history.volatility,
      recentChangePct: history.recentChangePct
    }
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
  const score = clampScore(savingsComponent + emergencyComponent + dtiComponent + insuranceComponent);
  return {
    id: 'resilience',
    label: 'Shock Resilience',
    score,
    details: {
      savingsRate,
      emergencyMonths,
      dti,
      insuranceComponent
    }
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
  const score = clampScore(demandBase + promotionBoost + credentialBoost + hiringBoost + satisfactionBoost);
  return {
    id: 'opportunity',
    label: 'Future Opportunity',
    score,
    details: {
      skillDemand,
      promotionPipeline,
      upskillingMomentum,
      hiringTrend,
      satisfaction
    }
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

  return items;
};
