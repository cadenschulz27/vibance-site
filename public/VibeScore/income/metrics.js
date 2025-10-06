/**
 * @file VibeScore/income/metrics.js
 * @description Mathematical helpers and statistical utilities used by the income scoring engine.
 */

import { INCOME_STREAM_KEYS } from './constants.js';

export const clampScore = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const percentToUnit = (value, fallback = 0) => {
  const num = safeNumber(value, fallback);
  if (num > 1.5) return num / 100;
  return num;
};

export const saturate = (value, pivot) => {
  const pivotSafe = Math.max(1, pivot || 1);
  const numerator = Math.max(0, safeNumber(value, 0));
  return 1 - Math.exp(-numerator / pivotSafe);
};

export const logistic = (value, midpoint, steepness = 1) => {
  const v = safeNumber(value, 0);
  const k = Math.max(0.0001, Math.abs(steepness));
  return 1 / (1 + Math.exp(-k * (v - midpoint)));
};

export const ratioScore = (ratio, sweetSpot = 1.25, tolerance = 0.35) => {
  const normalized = safeNumber(ratio, 0);
  if (normalized <= 0) return 0;
  const lowerBound = Math.max(0.01, sweetSpot - tolerance);
  const upperBound = sweetSpot + tolerance;
  if (normalized <= lowerBound) {
    return logistic(normalized, lowerBound, 6) * 60;
  }
  if (normalized >= upperBound) {
    return logistic(upperBound - normalized, 0, 6) * 60;
  }
  const proximity = 1 - Math.abs(normalized - sweetSpot) / tolerance;
  return clampScore(65 + proximity * 35);
};

export const sumIncomeStreams = (data = {}) => {
  return INCOME_STREAM_KEYS.reduce((total, key) => {
    const amount = Math.max(0, safeNumber(data[key], 0));
    return total + amount;
  }, 0);
};

export const extractStreams = (data = {}) => {
  const streams = INCOME_STREAM_KEYS
    .map((key) => ({ key, amount: Math.max(0, safeNumber(data[key], 0)) }))
    .filter((entry) => entry.amount > 0);
  return streams;
};

export const herfindahlIndex = (streams) => {
  if (!streams || !streams.length) return 1;
  const total = streams.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return 1;
  return streams.reduce((sum, item) => {
    const share = item.amount / total;
    return sum + share * share;
  }, 0);
};

export const coefficientOfVariation = (values = []) => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / Math.abs(mean);
};

export const movingAverage = (values = [], window = 3) => {
  if (!values.length) return 0;
  const slice = values.slice(-Math.max(1, Math.min(window, values.length)));
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
};

const monthToIndex = (monthLabel) => {
  const date = new Date(monthLabel);
  if (Number.isNaN(date.getTime())) return null;
  const base = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  return base;
};

export const analyzeIncomeHistory = (history = []) => {
  if (!Array.isArray(history) || !history.length) {
    return {
      count: 0,
      mean: 0,
      slope: 0,
      slopePercent: 0,
      rSquared: 0,
      volatility: 0,
      lastAmount: 0,
      recentChangePct: 0,
      coverageMonths: 0
    };
  }

  const cleaned = history
    .map((entry) => ({
      amount: safeNumber(entry.amount ?? entry.value ?? entry.total, NaN),
      month: entry.month || entry.date || entry.label
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.month);

  if (!cleaned.length) {
    return {
      count: 0,
      mean: 0,
      slope: 0,
      slopePercent: 0,
      rSquared: 0,
      volatility: 0,
      lastAmount: 0,
      recentChangePct: 0,
      coverageMonths: 0
    };
  }

  const points = cleaned
    .map((entry) => ({
      t: monthToIndex(entry.month),
      amount: entry.amount
    }))
    .filter((entry) => entry.t !== null)
    .sort((a, b) => a.t - b.t);

  const uniquePoints = points.filter((point, index, arr) => {
    if (index === 0) return true;
    return point.t !== arr[index - 1].t;
  });

  const count = uniquePoints.length;
  if (count === 0) {
    return {
      count: 0,
      mean: 0,
      slope: 0,
      slopePercent: 0,
      rSquared: 0,
      volatility: 0,
      lastAmount: 0,
      recentChangePct: 0,
      coverageMonths: 0
    };
  }

  const baseline = uniquePoints[0].t;
  const xs = uniquePoints.map((point) => (point.t - baseline) / (1000 * 60 * 60 * 24 * 30));
  const ys = uniquePoints.map((point) => point.amount);

  const sumX = xs.reduce((sum, x) => sum + x, 0);
  const sumY = ys.reduce((sum, y) => sum + y, 0);
  const sumXY = xs.reduce((sum, x, idx) => sum + x * ys[idx], 0);
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
  const meanY = sumY / count;

  const denominator = count * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;

  const fitted = xs.map((x) => intercept + slope * x);
  const residualSumSquares = ys.reduce((sum, y, idx) => {
    const error = y - fitted[idx];
    return sum + error * error;
  }, 0);
  const totalSumSquares = ys.reduce((sum, y) => {
    const diff = y - meanY;
    return sum + diff * diff;
  }, 0);

  const rSquared = totalSumSquares === 0 ? 0 : clampScore(1 - residualSumSquares / totalSumSquares, 0, 1);
  const volatility = coefficientOfVariation(ys);
  const lastAmount = ys[ys.length - 1];
  const coverageMonths = Math.max(1, Math.round(xs[xs.length - 1] - xs[0] + 1));

  let recentChangePct = 0;
  if (ys.length >= 3) {
    const recent = movingAverage(ys.slice(-3));
    const prior = movingAverage(ys.slice(-6, -3));
    if (prior > 0) {
      recentChangePct = (recent - prior) / prior;
    }
  }

  const slopePercent = meanY === 0 ? 0 : slope / meanY;

  return {
    count,
    mean: meanY,
    slope,
    slopePercent,
    rSquared,
    volatility,
    lastAmount,
    recentChangePct,
    coverageMonths
  };
};

export const dataPresenceScore = (data = {}, weights = {}) => {
  const entries = Object.entries(weights);
  if (!entries.length) return { score: 0, missing: [] };
  let available = 0;
  let total = 0;
  const missing = [];

  entries.forEach(([key, weight]) => {
    total += weight;
    const value = data[key];
    const hasValue = value !== undefined && value !== null && value !== '' && !Number.isNaN(value);
    if (hasValue) {
      available += weight;
    } else {
      missing.push(key);
    }
  });

  if (total === 0) return { score: 0, missing };
  return { score: clampScore((available / total) * 100), missing };
};
