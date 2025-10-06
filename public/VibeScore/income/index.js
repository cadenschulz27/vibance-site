/**
 * @file VibeScore/income/index.js
 * @description Public entry point for the advanced income scoring engine.
 */

import { computeIncomeScore } from './score-engine.js';
import { normalizeIncomeData } from './normalizer.js';

export const calculateAdvancedIncomeScore = (data = {}, options = {}) => {
  const normalized = normalizeIncomeData(data);
  return computeIncomeScore(normalized, options);
};

export default calculateAdvancedIncomeScore;
