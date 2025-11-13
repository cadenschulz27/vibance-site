/**
 * @file VibeScore/income/score-engine.js
 * @description Aggregates factor scores into the final advanced income score with penalties and diagnostics.
 */

import {
  DATA_IMPORTANCE_WEIGHTS,
  DEFAULT_OPTIONS,
  INCOME_WEIGHTS,
  MAX_PENALTY
} from './constants.js';
import {
  clampScore,
  dataPresenceScore,
  safeNumber,
  sumIncomeStreams,
  analyzeIncomeHistory
} from './metrics.js';
import {
  computeDiversityFactor,
  computeEarningPowerFactor,
  computeExpenseCoverageFactor,
  computeMomentumFactor,
  computeOpportunityFactor,
  computePenaltyAdjustments,
  computeResilienceFactor,
  computeStabilityFactor
} from './factors.js';
import { deriveAgeIncomeTargets } from './age-utils.js';

const toContribution = (weight, score) => ({
  weight,
  score,
  contribution: weight * score
});

const QUESTIONNAIRE_WEIGHT = 0.85;
const PLAID_WEIGHT = 0.15;
const PLAID_SIGNAL_WEIGHTS = Object.freeze({
  expenseCoverage: 0.45,
  resilience: 0.35,
  momentum: 0.2
});

export const computeIncomeScore = (rawData = {}, userOptions = {}) => {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const totalIncome = sumIncomeStreams(rawData);
  const regionCostIndex = safeNumber(rawData.regionCostIndex, 100);
  const adjustedIncome = totalIncome * (100 / Math.max(1, regionCostIndex));
  const history = analyzeIncomeHistory(rawData.incomeHistory || rawData.incomeTimeline || []);
  const quality = dataPresenceScore(rawData, DATA_IMPORTANCE_WEIGHTS);

  const rawAge = safeNumber(rawData.age ?? rawData.ageYears, NaN);
  const ageYears = Number.isFinite(rawAge) ? Math.max(0, Math.round(rawAge)) : null;
  const ageTargets = deriveAgeIncomeTargets(ageYears, options);
  const effectiveOptions = {
    ...options,
    baselineMonthlyIncome: ageTargets.baselineMonthlyIncome,
    strongIncomeCap: ageTargets.strongIncomeCap
  };

  const context = {
    totalIncome,
    adjustedIncome,
    history,
    options: effectiveOptions,
    dataGaps: quality.missing,
    age: {
      years: ageYears,
      expectation: ageTargets.expectation || null
    },
    ageTargets
  };

  const factors = {
    earningPower: computeEarningPowerFactor(rawData, context),
    expenseCoverage: computeExpenseCoverageFactor(rawData, context),
    stability: computeStabilityFactor(rawData, context),
    diversity: computeDiversityFactor(rawData, context),
    momentum: computeMomentumFactor(rawData, context),
    resilience: computeResilienceFactor(rawData, context),
    opportunity: computeOpportunityFactor(rawData, context)
  };

  const weightedScore = Object.entries(INCOME_WEIGHTS).reduce((sum, [key, weight]) => {
    const factor = factors[key];
    if (!factor) return sum;
    return sum + (factor.score * weight);
  }, 0);

  const penaltyItems = computePenaltyAdjustments(rawData, context);
  const penaltyTotal = Math.min(MAX_PENALTY, penaltyItems.reduce((sum, item) => sum + item.amount, 0));
  const baseScore = clampScore(weightedScore);
  const questionnaireScore = clampScore(baseScore - penaltyTotal);

  const questionnaireContribution = Math.min(
    QUESTIONNAIRE_WEIGHT * 100,
    Math.max(0, questionnaireScore * QUESTIONNAIRE_WEIGHT)
  );

  const plaidAvailable = Boolean(rawData?.dataSources?.plaid) || (context.history?.count ?? 0) >= 3;
  const plaidWeightSum = Object.values(PLAID_SIGNAL_WEIGHTS).reduce((sum, weight) => sum + weight, 0) || 1;
  let plaidScore = 0;
  if (plaidAvailable) {
    let composite = 0;
    Object.entries(PLAID_SIGNAL_WEIGHTS).forEach(([key, weight]) => {
      const factorScore = factors[key]?.score ?? 0;
      composite += factorScore * weight;
    });
    plaidScore = clampScore(composite / plaidWeightSum);
  }
  const plaidContribution = plaidAvailable
    ? Math.min(PLAID_WEIGHT * 100, Math.max(0, plaidScore * PLAID_WEIGHT))
    : 0;

  const finalScore = clampScore(questionnaireContribution + plaidContribution);

  const breakdown = Object.entries(INCOME_WEIGHTS).reduce((acc, [key, weight]) => {
    const factor = factors[key];
    if (!factor) return acc;
    acc[key] = {
      ...factor,
      weight,
      contribution: weight * factor.score
    };
    return acc;
  }, {});

  return {
    score: finalScore,
    baseScore,
    totalIncome,
    adjustedIncome,
    regionCostIndex,
    penalty: {
      total: penaltyTotal,
      items: penaltyItems
    },
    breakdown,
    quality,
    history,
    questionnaire: {
      score: questionnaireScore,
      weight: QUESTIONNAIRE_WEIGHT,
      contribution: questionnaireContribution
    },
    plaid: {
      score: plaidScore,
      weight: PLAID_WEIGHT,
      contribution: plaidContribution,
      available: plaidAvailable,
      signals: plaidAvailable ? {
        expenseCoverage: factors.expenseCoverage.score,
        resilience: factors.resilience.score,
        momentum: factors.momentum.score
      } : null
    },
    demographics: {
      ageYears,
      ageBracket: ageTargets.expectation?.label || null,
      ageExpectation: ageTargets.expectation || null
    },
    diagnostics: {
      dataGaps: quality.missing,
      hasSufficientHistory: history.count >= 3,
      monthsMeasured: history.coverageMonths
    }
  };
};
