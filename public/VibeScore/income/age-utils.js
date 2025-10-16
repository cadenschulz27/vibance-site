/**
 * @file VibeScore/income/age-utils.js
 * @description Helper utilities for deriving age metadata and age-based income expectations.
 */

import { AGE_INCOME_EXPECTATIONS } from './constants.js';
import { safeNumber } from './metrics.js';

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getTime());
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        const candidate = new Date(y, m - 1, d);
        if (!Number.isNaN(candidate.getTime())) return candidate;
      }
    }
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value > 1e12) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
      return null;
    }
    if (value > 1e9) {
      const date = new Date(value * 1000);
      if (!Number.isNaN(date.getTime())) return date;
      return null;
    }
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return new Date(date.getTime());
      }
    }
    if (Object.prototype.hasOwnProperty.call(value, 'seconds')) {
      const seconds = safeNumber(value.seconds, NaN);
      const nanos = safeNumber(value.nanoseconds ?? value.nanos, 0);
      if (Number.isFinite(seconds)) {
        const date = new Date(seconds * 1000 + nanos / 1e6);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(value, 'year') &&
      Object.prototype.hasOwnProperty.call(value, 'month') &&
      Object.prototype.hasOwnProperty.call(value, 'day')
    ) {
      const y = safeNumber(value.year, NaN);
      const m = safeNumber(value.month, NaN);
      const d = safeNumber(value.day, NaN);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        const date = new Date(y, m - 1, d);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
  }
  return null;
};

const computeAgeFromDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return NaN;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
};

export const computeAgeFromBirthday = (value) => {
  const date = normalizeDate(value);
  if (!date) return NaN;
  const age = computeAgeFromDate(date);
  return Number.isFinite(age) ? Math.max(0, Math.min(130, age)) : NaN;
};

export const extractAgeFromUserData = (userData = {}) => {
  const numberCandidates = [
    userData?.age,
    userData?.profile?.age,
    userData?.demographics?.age,
    userData?.income?.age,
    userData?.income?.ageYears,
    userData?.income?.profile?.age,
    userData?.income?.profile?.ageYears,
    userData?.personal?.age,
    userData?.basics?.age
  ];

  for (const candidate of numberCandidates) {
    const value = safeNumber(candidate, NaN);
    if (Number.isFinite(value) && value >= 0) {
      const bounded = Math.max(0, Math.min(130, Math.round(value)));
      return {
        age: bounded,
        source: 'explicit'
      };
    }
  }

  const birthdayCandidates = [
    userData?.birthday,
    userData?.profile?.birthday,
    userData?.demographics?.birthday,
    userData?.demographics?.birthdate,
    userData?.income?.profile?.birthday,
    userData?.personal?.birthday,
    userData?.basics?.birthday,
    userData?.onboarding?.birthday
  ];

  for (const candidate of birthdayCandidates) {
    const date = normalizeDate(candidate);
    if (!date) continue;
    const age = computeAgeFromDate(date);
    if (!Number.isFinite(age) || age < 0) continue;
    const bounded = Math.max(0, Math.min(130, Math.round(age)));
    const birthdayISO = date.toISOString().slice(0, 10);
    return {
      age: bounded,
      birthday: birthdayISO,
      birthdayDate: date,
      source: 'birthday'
    };
  }

  return null;
};

const resolveRange = (age) => {
  if (!Number.isFinite(age) || age < 0) return null;
  return AGE_INCOME_EXPECTATIONS.find((range) => {
    const minOk = age >= range.min;
    const maxLimit = range.max ?? Number.POSITIVE_INFINITY;
    return minOk && age <= maxLimit;
  }) || null;
};

export const getAgeExpectationForAge = (age) => {
  const range = resolveRange(age);
  if (!range) return null;

  const annualMin = safeNumber(range.annualMin, 0);
  const annualMaxRaw = safeNumber(range.annualMax, annualMin);
  const annualMax = Math.max(annualMin, annualMaxRaw);
  const annualMid = safeNumber(range.annualMid, (annualMin + annualMax) / 2);

  return {
    ...range,
    annualMin,
    annualMax,
    annualMid,
    monthlyMin: annualMin / 12,
    monthlyMax: annualMax / 12,
    monthlyMid: annualMid / 12
  };
};

export const deriveAgeIncomeTargets = (age, defaults = {}) => {
  const fallbackBaseline = safeNumber(defaults.baselineMonthlyIncome, 6500);
  const fallbackCap = safeNumber(defaults.strongIncomeCap, 14500);
  const expectation = getAgeExpectationForAge(age);

  if (!expectation) {
    return {
      baselineMonthlyIncome: fallbackBaseline,
      strongIncomeCap: fallbackCap,
      expectation: null
    };
  }

  const baseline = Math.max(1, expectation.monthlyMid || fallbackBaseline);
  const capCandidate = expectation.monthlyMax > 0 ? expectation.monthlyMax : expectation.monthlyMid * 1.4;
  const strongIncomeCap = Math.max(capCandidate, baseline * 1.1);

  return {
    baselineMonthlyIncome: baseline,
    strongIncomeCap: strongIncomeCap > 0 ? strongIncomeCap : fallbackCap,
    expectation
  };
};

export const injectAgeMetadata = (target, ageDetails, expectation, monthlyIncome = null) => {
  if (!target || typeof target !== 'object') return target;
  const ageYears = ageDetails?.age;
  if (Number.isFinite(ageYears)) {
    target.age = ageYears;
    target.ageYears = ageYears;
  }
  if (ageDetails?.birthday && !target.ageBirthday) {
    target.ageBirthday = ageDetails.birthday;
  }
  if (ageDetails?.source) {
    target.ageSource = ageDetails.source;
  }
  if (expectation) {
    target.ageBracket = expectation.label;
    target.ageIncomeExpectedAnnualMin = expectation.annualMin;
    target.ageIncomeExpectedAnnualMax = expectation.annualMax;
    target.ageIncomeExpectedAnnualMid = expectation.annualMid;
    target.ageIncomeExpectedMonthly = expectation.monthlyMid;
    target.ageIncomeExpectedMonthlyMin = expectation.monthlyMin;
    target.ageIncomeExpectedMonthlyMax = expectation.monthlyMax;
  }
  if (Number.isFinite(monthlyIncome) && expectation && expectation.monthlyMid > 0) {
    target.ageIncomeAlignmentRatio = monthlyIncome / expectation.monthlyMid;
  }
  return target;
};
