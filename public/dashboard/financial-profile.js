import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { dataPresenceScore } from '../VibeScore/income/metrics.js';
import {
  REQUIRED_PROFILE_WEIGHTS,
  UNEMPLOYMENT_DATA,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_RISK_OPTIONS,
  BONUS_RELIABILITY_OPTIONS,
  SKILL_DEMAND_OPTIONS,
  INCOME_COVERAGE_OPTIONS,
  STEPS,
  US_STATE_OPTIONS,
  FIELD_VISIBILITY_RULES,
  YOUNG_ADULT_INCOME_SOURCE_OPTIONS,
  YOUNG_ADULT_INCOME_STABILITY_OPTIONS,
  BALANCE_CHECK_FREQUENCY_OPTIONS,
  SAVINGS_CONTRIBUTION_CADENCE_OPTIONS,
  EXPENSE_CATEGORY_OPTIONS,
  TRACKING_INTENSITY_OPTIONS,
  YOUNG_ADULT_CONFIDENCE_OPTIONS,
  EARLY_CAREER_INCOME_STABILITY_OPTIONS,
  CREDIT_CARD_BALANCE_OPTIONS,
  INCOME_GROWTH_EXPECTATION_OPTIONS,
  BILL_PAYMENT_RELIABILITY_OPTIONS,
  GOAL_REVIEW_FREQUENCY_OPTIONS,
  EARLY_CAREER_CONFIDENCE_OPTIONS
} from './income-profile-constants.js';
import { computeAgeFromBirthday } from '../VibeScore/income/age-utils.js';

const profileElements = {
  identityBlurb: document.getElementById('profile-identity-blurb'),
  progressMeta: document.getElementById('profile-progress-meta'),
  summarySection: document.getElementById('profile-summary-section'),
  detailsSection: document.getElementById('profile-details-section'),
  emptyState: document.getElementById('profile-empty-state'),
  emptyLaunchBtn: document.getElementById('profile-empty-launch'),
  
  // Summary cards
  completionMessage: document.getElementById('summary-completion-message'),
  completionValue: document.getElementById('summary-completion-value'),
  completionBar: document.getElementById('summary-completion-bar'),
  completionUpdated: document.getElementById('summary-completion-updated'),
  
  stabilityText: document.getElementById('summary-stability-text'),
  stabilityList: document.getElementById('summary-stability-list'),
  
  opportunityText: document.getElementById('summary-opportunity-text'),
  opportunityList: document.getElementById('summary-opportunity-list'),
  
  safetyText: document.getElementById('summary-safety-text'),
  safetyList: document.getElementById('summary-safety-list'),
  
  // Details container
  profileSections: document.getElementById('profile-sections')
};

const STATE_LABEL_MAP = (() => {
  const map = new Map();
  US_STATE_OPTIONS.forEach((option) => {
    const value = option.value;
    const label = option.label;
    if (!value) return;
    if (label) {
      map.set(label, label);
      map.set(label.toLowerCase(), label);
    }
    if (typeof value === 'string') {
      map.set(value, label);
      map.set(value.toLowerCase(), label);
    }
  });
  return map;
})();

let profileState = {
  userId: null,
  profileData: {},
  profileMeta: {}
};

const deriveActiveWeights = (profile = {}) => {
  const active = {};
  Object.entries(REQUIRED_PROFILE_WEIGHTS).forEach(([fieldId, weight]) => {
    const predicate = FIELD_VISIBILITY_RULES[fieldId];
    if (typeof predicate === 'function' && !predicate(profile)) {
      return;
    }
    active[fieldId] = weight;
  });
  return active;
};

const isFieldVisibleForProfile = (field, profile) => {
  if (!field) return false;
  const predicate = FIELD_VISIBILITY_RULES[field.id];
  if (typeof predicate === 'function') {
    try {
      return Boolean(predicate(profile));
    } catch (error) {
      console.warn('[FinancialProfile] Failed to evaluate field visibility', field.id, error);
      return false;
    }
  }
  return true;
};

const getActiveStepsForProfile = (profile = {}) => {
  const snapshot = profile || {};
  return STEPS.filter((step) => {
    if (typeof step.shouldDisplay === 'function') {
      try {
        if (!step.shouldDisplay(snapshot)) {
          return false;
        }
      } catch (error) {
        console.warn('[FinancialProfile] Failed to evaluate step visibility', step.id, error);
        return false;
      }
    }
    const fields = Array.isArray(step.fields) ? step.fields : [];
    return fields.some((field) => isFieldVisibleForProfile(field, snapshot));
  });
};

// Helper functions
function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp) {
  if (!timestamp) return 'Not updated yet';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch (e) {
    return 'Recently';
  }
}

function getProfileCompletionScore() {
  const weights = deriveActiveWeights(profileState.profileData);
  const presence = dataPresenceScore(profileState.profileData, weights) || { score: 0 };
  const raw = Number.isFinite(presence.score) ? presence.score : 0;
  return {
    raw,
    rounded: Math.round(raw)
  };
}

function getLabelForValue(value, options) {
  const option = options.find(opt => opt.value === value);
  return option ? option.label : value;
}

function getUnemploymentLabel(data) {
  if (!data || !data.state) return null;
  const stateData = UNEMPLOYMENT_DATA.find(s => s.state === data.state);
  if (!stateData) return null;
  
  const cityData = stateData.cities.find(c => c.city === data.city);
  if (cityData) {
    return `${cityData.label}, ${stateData.label}`;
  }
  return stateData.label;
}

function getUnemploymentRate(data) {
  if (!data || !data.state) return null;
  const stateData = UNEMPLOYMENT_DATA.find(s => s.state === data.state);
  if (!stateData) return null;
  
  const cityData = stateData.cities.find(c => c.city === data.city);
  return cityData ? cityData.rate : null;
}

function resolveRegionLabel(regionOrState) {
  if (!regionOrState && regionOrState !== 0) return null;
  const text = String(regionOrState).trim();
  if (!text) return null;
  const lookup = STATE_LABEL_MAP.get(text) || STATE_LABEL_MAP.get(text.toLowerCase());
  return lookup || text;
}

function formatLocation({ cityText, citySelect, regionOrState, legacyCountry }) {
  const parts = [];
  const cityCandidate = [citySelect, cityText].find((candidate) => {
    if (candidate === undefined || candidate === null) return false;
    const trimmed = String(candidate).trim();
    return trimmed.length > 0;
  });
  if (cityCandidate) {
    parts.push(String(cityCandidate).trim());
  }

  const regionLabel = resolveRegionLabel(regionOrState);
  if (regionLabel && regionLabel !== 'Outside the U.S.') {
    parts.push(regionLabel);
  }

  if (legacyCountry) {
    const countryText = String(legacyCountry).trim();
    if (countryText && !parts.some(part => part.toLowerCase() === countryText.toLowerCase())) {
      parts.push(countryText);
    }
  } else if (regionLabel === 'Outside the U.S.') {
    parts.push(regionLabel);
  }

  if (!parts.length) return null;
  return parts;
}

function normalizeTenureMonths(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' && Number.isFinite(input)) {
    const safeTotal = Math.max(0, Math.round(input));
    return {
      years: Math.floor(safeTotal / 12),
      months: safeTotal % 12,
      totalMonths: safeTotal
    };
  }
  if (typeof input === 'object') {
    const years = Number.isFinite(Number(input.years)) ? Math.max(0, Number(input.years)) : 0;
    const months = Number.isFinite(Number(input.months)) ? Math.max(0, Number(input.months)) : 0;
    return {
      years: Math.floor(years),
      months: Math.floor(months),
      totalMonths: Math.floor(years) * 12 + Math.floor(months)
    };
  }
  return null;
}

function formatTenureLabel(tenure) {
  if (!tenure || !Number.isFinite(tenure.totalMonths) || tenure.totalMonths <= 0) return null;
  const { years, months } = tenure;
  const pieces = [];
  if (years) pieces.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months) pieces.push(`${months} month${months > 1 ? 's' : ''}`);
  return pieces.join(years && months ? ' and ' : '');
}

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return USD_FORMATTER.format(number);
}

function formatYesNo(value, fallback = '—') {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return fallback;
}

function getNumericAgeValue(profile = {}) {
  const { age, birthday } = profile;
  let numericAge = Number(age);
  if (!Number.isFinite(numericAge) && birthday) {
    const derivedAge = computeAgeFromBirthday(birthday);
    if (Number.isFinite(derivedAge)) {
      numericAge = derivedAge;
    }
  }
  return Number.isFinite(numericAge) ? numericAge : null;
}

function isYoungAdultProfile(profile = {}) {
  const age = getNumericAgeValue(profile);
  if (age === null) return false;
  return age >= 18 && age <= 24;
}

function isEarlyCareerProfile(profile = {}) {
  const age = getNumericAgeValue(profile);
  if (age === null) return false;
  return age >= 25 && age <= 34;
}

// Generate identity blurb
function generateIdentityBlurb() {
  const profile = profileState.profileData || {};
  const {
    birthday,
    age,
    locationCity,
    locationState,
    locationRegion,
    locationCitySelect,
    locationCountry,
    employmentType,
    tenureMonths,
    industryRisk,
    regionalUnemploymentRate,
    unemploymentSelection,
    youngAdultHasJob,
    youngAdultPrimaryIncomeSource,
    youngAdultMonthlyIncomeAfterTax,
    youngAdultMultipleIncomeStreams,
    earlyCareerHasFullTimeIncome,
    earlyCareerMonthlyIncomeAfterTax,
    earlyCareerMultipleIncomeStreams,
    earlyCareerIncomeStability,
    earlyCareerIncomeGrowthExpectation
  } = profile;

  const fragments = [];

  const numericAge = getNumericAgeValue(profile);

  if (Number.isFinite(numericAge) && numericAge > 0) {
    fragments.push(`You're ${numericAge} years old`);
  }

  const locationParts = formatLocation({
    cityText: locationCity,
    citySelect: locationCitySelect,
    regionOrState: locationState ?? locationRegion,
    legacyCountry: locationCountry
  });
  if (locationParts && locationParts.length) {
    const locationStatement = locationParts.map((part) => escapeHtml(part)).join(', ');
    fragments.push(`Based in <strong>${locationStatement}</strong>`);
  }

  if (employmentType) {
    const employmentLabel = getLabelForValue(employmentType, EMPLOYMENT_OPTIONS) || employmentType;
    fragments.push(`Primary income comes from <strong>${escapeHtml(employmentLabel)}</strong>`);
  }

  const isYoungAdult = isYoungAdultProfile(profile);
  const isEarlyCareer = isEarlyCareerProfile(profile);
  if (isYoungAdult) {
    if (typeof youngAdultHasJob === 'boolean') {
      fragments.push(youngAdultHasJob
        ? 'You have <strong>a steady income stream</strong>'
        : 'You’re still building a consistent income stream');
    }
    if (youngAdultPrimaryIncomeSource) {
      const label = getLabelForValue(youngAdultPrimaryIncomeSource, YOUNG_ADULT_INCOME_SOURCE_OPTIONS) || youngAdultPrimaryIncomeSource;
      fragments.push(`Primary source right now is <strong>${escapeHtml(label)}</strong>`);
    }
    if (Number.isFinite(Number(youngAdultMonthlyIncomeAfterTax))) {
      const formatted = formatCurrency(youngAdultMonthlyIncomeAfterTax);
      if (formatted) {
        fragments.push(`Monthly take-home is roughly <strong>${formatted}</strong>`);
      }
    }
    if (typeof youngAdultMultipleIncomeStreams === 'boolean') {
      fragments.push(youngAdultMultipleIncomeStreams
        ? 'You’re juggling <strong>multiple income streams</strong>'
        : 'Currently focused on a single income stream');
    }
  }

  if (isEarlyCareer) {
    if (typeof earlyCareerHasFullTimeIncome === 'boolean') {
      fragments.push(earlyCareerHasFullTimeIncome
        ? 'You’ve locked in <strong>full-time income</strong>'
        : 'You’re still piecing together a consistent full-time income');
    }

    if (earlyCareerIncomeStability) {
      const label = getLabelForValue(earlyCareerIncomeStability, EARLY_CAREER_INCOME_STABILITY_OPTIONS) || earlyCareerIncomeStability;
      fragments.push(`Income feels <strong>${escapeHtml(label.toLowerCase())}</strong>`);
    }

    if (Number.isFinite(Number(earlyCareerMonthlyIncomeAfterTax))) {
      const formatted = formatCurrency(earlyCareerMonthlyIncomeAfterTax);
      if (formatted) {
        fragments.push(`Monthly take-home is around <strong>${formatted}</strong>`);
      }
    }

    if (typeof earlyCareerMultipleIncomeStreams === 'boolean') {
      fragments.push(earlyCareerMultipleIncomeStreams
        ? 'You manage <strong>multiple active income streams</strong>'
        : 'You’re focusing on one primary income stream right now');
    }

    if (earlyCareerIncomeGrowthExpectation) {
      const label = getLabelForValue(earlyCareerIncomeGrowthExpectation, INCOME_GROWTH_EXPECTATION_OPTIONS) || earlyCareerIncomeGrowthExpectation;
      fragments.push(`Outlook: <strong>${escapeHtml(label)}</strong>`);
    }
  }

  const tenure = normalizeTenureMonths(tenureMonths);
  const tenureText = formatTenureLabel(tenure);
  if (tenureText) {
    fragments.push(`You’ve held your current role for <strong>${escapeHtml(tenureText)}</strong>`);
  }

  if (industryRisk) {
    const outlook = getLabelForValue(industryRisk, INDUSTRY_RISK_OPTIONS) || industryRisk;
    fragments.push(`Your industry outlook is <strong>${escapeHtml(outlook.toLowerCase())}</strong>`);
  }

  const unemploymentRate = Number(regionalUnemploymentRate);
  const unemploymentLabel = unemploymentSelection?.cityLabel || unemploymentSelection?.stateLabel;
  if (Number.isFinite(unemploymentRate) && unemploymentRate > 0 && unemploymentLabel) {
    fragments.push(`Local unemployment in ${escapeHtml(unemploymentLabel)} sits at <strong>${unemploymentRate.toFixed(1)}%</strong>`);
  }

  if (!fragments.length) {
    return 'We’ll surface a quick summary here once you share your income details.';
  }

  return `${fragments.join('. ')}.`;
}

// Update completion card
function updateCompletionCard() {
  const completion = getProfileCompletionScore();
  const percentage = completion.rounded;
  
  if (profileElements.completionValue) {
    profileElements.completionValue.textContent = `${percentage}%`;
  }
  
  if (profileElements.completionBar) {
    profileElements.completionBar.style.width = `${percentage}%`;
  }
  
  if (profileElements.completionMessage) {
    let message = 'No responses recorded yet';
    if (percentage >= 95) {
      message = 'Profile complete';
    } else if (percentage >= 75) {
      message = 'Nearly there';
    } else if (percentage >= 50) {
      message = 'Good progress';
    } else if (percentage >= 25) {
      message = 'Getting started';
    } else if (percentage > 0) {
      message = 'Just begun';
    }
    profileElements.completionMessage.textContent = message;
  }
  
  if (profileElements.completionUpdated) {
    profileElements.completionUpdated.textContent = formatDate(profileState.profileMeta.lastUpdated);
  }
}

// Generate stability insights
function generateStabilityInsights() {
  const profile = profileState.profileData || {};
  const {
    employmentType,
    tenureMonths,
    industryRisk,
    regionalUnemploymentRate,
    unemploymentSelection,
    layoffHistory,
    upcomingContractRenewal,
    bonusReliability,
    youngAdultHasJob,
    youngAdultIncomeStability,
    youngAdultMultipleIncomeStreams,
    earlyCareerHasFullTimeIncome,
    earlyCareerIncomeStability,
    earlyCareerMultipleIncomeStreams,
    earlyCareerIncomeGrowthExpectation
  } = profile;

  const insights = [];
  const isYoungAdult = isYoungAdultProfile(profile);
  const isEarlyCareer = isEarlyCareerProfile(profile);

  if (isYoungAdult) {
    if (typeof youngAdultHasJob === 'boolean') {
      insights.push({
        label: youngAdultHasJob ? 'Consistent income source secured' : 'Still establishing steady income',
        type: youngAdultHasJob ? 'high' : 'low',
        icon: youngAdultHasJob ? '✓' : '⚠'
      });
    }

    if (youngAdultIncomeStability) {
      const label = getLabelForValue(youngAdultIncomeStability, YOUNG_ADULT_INCOME_STABILITY_OPTIONS) || youngAdultIncomeStability;
      let type = 'moderate';
      if (youngAdultIncomeStability === 'fixed') type = 'high';
      if (youngAdultIncomeStability === 'occasional') type = 'low';
      insights.push({
        label: `Income stability: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof youngAdultMultipleIncomeStreams === 'boolean') {
      insights.push({
        label: youngAdultMultipleIncomeStreams ? 'Multiple income streams active' : 'Single income stream currently',
        type: youngAdultMultipleIncomeStreams ? 'high' : 'moderate',
        icon: youngAdultMultipleIncomeStreams ? '✓' : '•'
      });
    }
  }

  if (isEarlyCareer) {
    if (typeof earlyCareerHasFullTimeIncome === 'boolean') {
      insights.push({
        label: earlyCareerHasFullTimeIncome ? 'Full-time income secured' : 'Still formalizing full-time income',
        type: earlyCareerHasFullTimeIncome ? 'high' : 'moderate',
        icon: earlyCareerHasFullTimeIncome ? '✓' : '•'
      });
    }

    if (earlyCareerIncomeStability) {
      const label = getLabelForValue(earlyCareerIncomeStability, EARLY_CAREER_INCOME_STABILITY_OPTIONS) || earlyCareerIncomeStability;
      let type = 'moderate';
      if (earlyCareerIncomeStability === 'very-stable') type = 'high';
      if (earlyCareerIncomeStability === 'unpredictable') type = 'low';
      insights.push({
        label: `Income stability: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof earlyCareerMultipleIncomeStreams === 'boolean') {
      insights.push({
        label: earlyCareerMultipleIncomeStreams ? 'Multiple income streams active' : 'Single income stream currently',
        type: earlyCareerMultipleIncomeStreams ? 'high' : 'moderate',
        icon: earlyCareerMultipleIncomeStreams ? '✓' : '•'
      });
    }

    if (earlyCareerIncomeGrowthExpectation) {
      const label = getLabelForValue(earlyCareerIncomeGrowthExpectation, INCOME_GROWTH_EXPECTATION_OPTIONS) || earlyCareerIncomeGrowthExpectation;
      let type = 'moderate';
      if (earlyCareerIncomeGrowthExpectation === 'yes') type = 'high';
      if (earlyCareerIncomeGrowthExpectation === 'no') type = 'low';
      insights.push({
        label: `Income trajectory outlook: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }
  }

  if (employmentType) {
    const label = getLabelForValue(employmentType, EMPLOYMENT_OPTIONS) || employmentType;
    const type = ['w2', 'salaried', 'full-time'].includes(employmentType) ? 'high' : ['contract', 'consultant', 'business-owner'].includes(employmentType) ? 'moderate' : 'low';
    insights.push({
      label: `Primary income: ${label}`,
      type,
      icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
    });
  }

  const tenure = normalizeTenureMonths(tenureMonths);
  if (tenure && tenure.totalMonths) {
    const pretty = formatTenureLabel(tenure) || `${tenure.totalMonths} months`;
    let type = 'moderate';
    if (tenure.totalMonths >= 24) type = 'high';
    if (tenure.totalMonths < 6) type = 'low';
    insights.push({
      label: `${pretty} tenure`,
      type,
      icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
    });
  }

  if (bonusReliability && bonusReliability !== 'none') {
    const label = getLabelForValue(bonusReliability, BONUS_RELIABILITY_OPTIONS) || bonusReliability;
    const type = bonusReliability === 'high' ? 'high' : bonusReliability === 'medium' ? 'moderate' : 'low';
    insights.push({
      label: `${label} variable pay`,
      type,
      icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
    });
  }

  if (industryRisk) {
    const label = getLabelForValue(industryRisk, INDUSTRY_RISK_OPTIONS) || industryRisk;
    const type = ['very-low', 'low'].includes(industryRisk) ? 'high' : industryRisk === 'moderate' ? 'moderate' : 'low';
    insights.push({
      label: `${label} industry outlook`,
      type,
      icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
    });
  }

  let unemploymentRateValue = Number(regionalUnemploymentRate);
  let unemploymentLocation = unemploymentSelection?.cityLabel || unemploymentSelection?.stateLabel || null;
  if ((!Number.isFinite(unemploymentRateValue) || unemploymentRateValue <= 0) && regionalUnemploymentRate && typeof regionalUnemploymentRate === 'object') {
    const legacyRate = getUnemploymentRate(regionalUnemploymentRate);
    const legacyLabel = getUnemploymentLabel(regionalUnemploymentRate);
    if (Number.isFinite(legacyRate)) unemploymentRateValue = legacyRate;
    if (legacyLabel) unemploymentLocation = legacyLabel;
  }
  if (Number.isFinite(unemploymentRateValue) && unemploymentRateValue > 0 && unemploymentLocation) {
    const type = unemploymentRateValue <= 3.5 ? 'high' : unemploymentRateValue <= 5 ? 'moderate' : 'low';
    insights.push({
      label: `${unemploymentRateValue.toFixed(1)}% unemployment in ${unemploymentLocation}`,
      type,
      icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
    });
  }

  if (layoffHistory) {
    const count = Number(layoffHistory);
    if (Number.isFinite(count) && count > 0) {
      insights.push({
        label: `${count} layoff${count > 1 ? 's' : ''} in last 5 years`,
        type: 'low',
        icon: '⚠'
      });
    }
  }

  if (upcomingContractRenewal) {
    insights.push({
      label: 'Contract renewal within 6 months',
      type: 'moderate',
      icon: '•'
    });
  }

  return insights;
}

// Generate opportunity insights
function generateOpportunityInsights() {
  const profile = profileState.profileData || {};
  const {
    promotionPipeline,
    upskillingProgress,
    skillDemand,
    roleSatisfaction,
    youngAdultUsesBudget,
    youngAdultTrackingHabit,
    youngAdultHasLeftoverMoney,
    youngAdultSetsFinancialGoals,
    youngAdultFinancialConfidence,
    youngAdultUsesBudgetApps,
    earlyCareerUsesBudget,
    earlyCareerGoalReviewCadence,
    earlyCareerSavingForMajorPurchase,
    earlyCareerHasInsuranceCoverage,
    earlyCareerFinancialConfidence
  } = profile;

  const insights = [];
  const isYoungAdult = isYoungAdultProfile(profile);
  const isEarlyCareer = isEarlyCareerProfile(profile);

  if (isYoungAdult) {
    if (typeof youngAdultUsesBudget === 'boolean') {
      insights.push({
        label: youngAdultUsesBudget ? 'Monthly budget in place' : 'No set monthly budget yet',
        type: youngAdultUsesBudget ? 'high' : 'low',
        icon: youngAdultUsesBudget ? '✓' : '⚠'
      });
    }

    if (youngAdultTrackingHabit) {
      const label = getLabelForValue(youngAdultTrackingHabit, TRACKING_INTENSITY_OPTIONS) || youngAdultTrackingHabit;
      let type = 'moderate';
      if (youngAdultTrackingHabit === 'detailed') type = 'high';
      if (youngAdultTrackingHabit === 'rarely') type = 'low';
      insights.push({
        label: `Tracking discipline: ${label}`,
        type,
        icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof youngAdultHasLeftoverMoney === 'boolean') {
      insights.push({
        label: youngAdultHasLeftoverMoney ? 'Usually ends month with surplus' : 'Often fully spends monthly income',
        type: youngAdultHasLeftoverMoney ? 'high' : 'low',
        icon: youngAdultHasLeftoverMoney ? '↑' : '⚠'
      });
    }

    if (typeof youngAdultSetsFinancialGoals === 'boolean') {
      insights.push({
        label: youngAdultSetsFinancialGoals ? 'Actively sets financial goals' : 'Goals not yet defined',
        type: youngAdultSetsFinancialGoals ? 'high' : 'moderate',
        icon: youngAdultSetsFinancialGoals ? '↑' : '•'
      });
    }

    if (youngAdultFinancialConfidence) {
      const label = getLabelForValue(youngAdultFinancialConfidence, YOUNG_ADULT_CONFIDENCE_OPTIONS) || youngAdultFinancialConfidence;
      let type = 'moderate';
      if (youngAdultFinancialConfidence === 'very-confident') type = 'high';
      if (youngAdultFinancialConfidence === 'learning') type = 'low';
      insights.push({
        label: `Confidence managing money: ${label}`,
        type,
        icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof youngAdultUsesBudgetApps === 'boolean') {
      insights.push({
        label: youngAdultUsesBudgetApps ? 'Uses budgeting/finance apps' : 'Not using finance apps yet',
        type: youngAdultUsesBudgetApps ? 'high' : 'moderate',
        icon: youngAdultUsesBudgetApps ? '↑' : '•'
      });
    }
  }

  if (isEarlyCareer) {
    if (typeof earlyCareerUsesBudget === 'boolean') {
      insights.push({
        label: earlyCareerUsesBudget ? 'Monthly budget keeps spending on track' : 'No dedicated budget in place yet',
        type: earlyCareerUsesBudget ? 'high' : 'moderate',
        icon: earlyCareerUsesBudget ? '↑' : '•'
      });
    }

    if (earlyCareerGoalReviewCadence) {
      const label = getLabelForValue(earlyCareerGoalReviewCadence, GOAL_REVIEW_FREQUENCY_OPTIONS) || earlyCareerGoalReviewCadence;
      let type = 'moderate';
      if (earlyCareerGoalReviewCadence === 'monthly') type = 'high';
      if (earlyCareerGoalReviewCadence === 'rarely') type = 'low';
      insights.push({
        label: `Goal review cadence: ${label}`,
        type,
        icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof earlyCareerSavingForMajorPurchase === 'boolean') {
      insights.push({
        label: earlyCareerSavingForMajorPurchase ? 'Active plan for a major purchase' : 'No major purchase savings yet',
        type: earlyCareerSavingForMajorPurchase ? 'high' : 'moderate',
        icon: earlyCareerSavingForMajorPurchase ? '↑' : '•'
      });
    }

    if (typeof earlyCareerHasInsuranceCoverage === 'boolean') {
      insights.push({
        label: earlyCareerHasInsuranceCoverage ? 'Insurance coverage in place' : 'Insurance coverage not set yet',
        type: earlyCareerHasInsuranceCoverage ? 'high' : 'low',
        icon: earlyCareerHasInsuranceCoverage ? '↑' : '⚠'
      });
    }

    if (earlyCareerFinancialConfidence) {
      const label = getLabelForValue(earlyCareerFinancialConfidence, EARLY_CAREER_CONFIDENCE_OPTIONS) || earlyCareerFinancialConfidence;
      let type = 'moderate';
      if (earlyCareerFinancialConfidence === 'very-confident') type = 'high';
      if (['somewhat-uneasy', 'struggling'].includes(earlyCareerFinancialConfidence)) type = 'low';
      insights.push({
        label: `Confidence managing money: ${label}`,
        type,
        icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
      });
    }
  }

  if (promotionPipeline !== undefined && promotionPipeline !== null) {
    const percentage = Number(promotionPipeline);
    if (Number.isFinite(percentage)) {
      let type = 'moderate';
      let label = `${percentage}% promotion likelihood`;
      if (percentage >= 70) {
        type = 'high';
        label = `Strong promotion odds (${percentage}%)`;
      } else if (percentage > 0 && percentage < 40) {
        type = 'low';
        label = `Low promotion likelihood (${percentage}%)`;
      }
      insights.push({
        label,
        type,
        icon: type === 'high' ? '↑' : type === 'low' ? '⚠' : '•'
      });
    }
  }

  if (upskillingProgress !== undefined && upskillingProgress !== null) {
    const percentage = Number(upskillingProgress);
    if (Number.isFinite(percentage) && percentage >= 0) {
      const type = percentage >= 50 ? 'high' : percentage > 0 ? 'moderate' : 'low';
      insights.push({
        label: `${percentage}% progress on upskilling`,
        type,
        icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
      });
    }
  }

  if (skillDemand) {
    const label = getLabelForValue(skillDemand, SKILL_DEMAND_OPTIONS) || skillDemand;
    const type = ['scarce', 'strong'].includes(skillDemand) ? 'high' : skillDemand === 'balanced' ? 'moderate' : 'low';
    insights.push({
      label: `${label} skill demand`,
      type,
      icon: type === 'high' ? '↑' : type === 'moderate' ? '•' : '⚠'
    });
  }

  if (roleSatisfaction !== undefined && roleSatisfaction !== null) {
    const percentage = Number(roleSatisfaction);
    if (Number.isFinite(percentage)) {
      let type = 'moderate';
      let label = `${percentage}% role satisfaction`;
      if (percentage >= 75) {
        type = 'high';
        label = `High satisfaction (${percentage}%)`;
      } else if (percentage < 50) {
        type = 'low';
        label = `Low satisfaction (${percentage}%)`;
      }
      insights.push({
        label,
        type,
        icon: type === 'high' ? '↑' : type === 'low' ? '⚠' : '•'
      });
    }
  }

  return insights;
}

// Generate safety net insights
function generateSafetyInsights() {
  const {
    emergencyFundMonths,
    incomeProtectionCoverage,
    savingsRateOverride,
    plannedMajorExpense,
    youngAdultDualAccounts,
    youngAdultHasCreditCard,
    youngAdultMissedPayment,
    youngAdultHasSavings,
    youngAdultSavingsAmount,
    youngAdultSavingsContributionFrequency,
    youngAdultHasEmergencyFund,
    youngAdultInvestsInAssets,
    youngAdultHasDebt,
    youngAdultStruggledWithBills,
    youngAdultBalanceCheckFrequency,
    youngAdultMonthlySpending,
    youngAdultPaysRecurringBills,
    earlyCareerDualAccounts,
    earlyCareerHasCreditCard,
    earlyCareerCreditCardBalance,
    earlyCareerPaysBalanceInFull,
    earlyCareerMonitorsCredit,
    earlyCareerHasSavings,
    earlyCareerSavingsAmount,
    earlyCareerSavingsContributionFrequency,
    earlyCareerRetirementContributor,
    earlyCareerEmergencyFundThreeMonths,
    earlyCareerHasDebt,
    earlyCareerBillPaymentReliability,
    earlyCareerTracksFixedVsDiscretionary,
    earlyCareerMonthlySpending,
    earlyCareerMainExpenseCategory
  } = profileState.profileData;

  const insights = [];
  const isYoungAdult = isYoungAdultProfile(profileState.profileData);
  const isEarlyCareer = isEarlyCareerProfile(profileState.profileData);

  if (emergencyFundMonths !== undefined && emergencyFundMonths !== null) {
    const months = Number(emergencyFundMonths);
    if (Number.isFinite(months) && months >= 0) {
      let type = 'moderate';
      let label = `${months} month${months === 1 ? '' : 's'} of runway`;
      if (months >= 6) {
        type = 'high';
        label = `Strong ${months}-month emergency fund`;
      } else if (months < 1) {
        type = 'low';
        label = 'No emergency fund set';
      } else if (months < 3) {
        type = 'low';
        label = `Thin ${months}-month cushion`;
      }
      insights.push({
        label,
        type,
        icon: type === 'high' ? '✓' : type === 'low' ? '⚠' : '•'
      });
    }
  }

  if (incomeProtectionCoverage !== undefined && incomeProtectionCoverage !== null) {
    if (Array.isArray(incomeProtectionCoverage) && incomeProtectionCoverage.length > 0) {
      const coverageTypes = incomeProtectionCoverage.map((code) => {
        switch (code) {
          case 'disability':
            return 'Disability insurance';
          case 'employer-std':
            return 'Short-term disability';
          case 'employer-ltd':
            return 'Long-term disability';
          case 'supplemental':
            return 'Supplemental coverage';
          default:
            return code;
        }
      });
      insights.push({
        label: coverageTypes.join(', '),
        type: 'high',
        icon: '✓'
      });
    } else {
      const numericCoverage = Number(incomeProtectionCoverage);
      if (Number.isFinite(numericCoverage) && numericCoverage >= 0) {
        const matched = INCOME_COVERAGE_OPTIONS.find((option) => Number(option.value) === numericCoverage);
        const label = matched ? matched.title : `${numericCoverage}% income protection`;
        const type = numericCoverage >= 60 ? 'high' : numericCoverage >= 40 ? 'moderate' : 'low';
        insights.push({
          label,
          type,
          icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
        });
      }
    }
  }

  if (savingsRateOverride !== undefined && savingsRateOverride !== null) {
    const rate = Number(savingsRateOverride);
    if (Number.isFinite(rate) && rate >= 0) {
      const type = rate >= 20 ? 'high' : rate >= 10 ? 'moderate' : rate > 0 ? 'low' : 'low';
      const icon = type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠';
      insights.push({
        label: `${rate}% of income saved`,
        type,
        icon
      });
    }
  }

  if (plannedMajorExpense) {
    insights.push({
      label: 'Major expense planned in the next 6 months',
      type: 'moderate',
      icon: '•'
    });
  }

  if (isYoungAdult) {
    if (typeof youngAdultDualAccounts === 'boolean') {
      insights.push({
        label: youngAdultDualAccounts ? 'Checking & savings accounts in place' : 'Still setting up bank accounts',
        type: youngAdultDualAccounts ? 'high' : 'moderate',
        icon: youngAdultDualAccounts ? '✓' : '•'
      });
    }

    if (typeof youngAdultHasCreditCard === 'boolean') {
      insights.push({
        label: youngAdultHasCreditCard ? 'Has personal credit access' : 'No credit card yet',
        type: youngAdultHasCreditCard ? 'high' : 'moderate',
        icon: youngAdultHasCreditCard ? '✓' : '•'
      });
    }

    if (typeof youngAdultMissedPayment === 'boolean') {
      insights.push({
        label: youngAdultMissedPayment ? 'Missed payment in the past' : 'No missed payments to date',
        type: youngAdultMissedPayment ? 'low' : 'high',
        icon: youngAdultMissedPayment ? '⚠' : '✓'
      });
    }

    if (typeof youngAdultHasSavings === 'boolean') {
      insights.push({
        label: youngAdultHasSavings ? 'Savings already building' : 'No savings accumulated yet',
        type: youngAdultHasSavings ? 'high' : 'low',
        icon: youngAdultHasSavings ? '✓' : '⚠'
      });
    }

    if (Number.isFinite(Number(youngAdultSavingsAmount))) {
      const formatted = formatCurrency(youngAdultSavingsAmount);
      if (formatted) {
        insights.push({
          label: `Savings & investments total about ${formatted}`,
          type: 'moderate',
          icon: '•'
        });
      }
    }

    if (youngAdultSavingsContributionFrequency) {
      const label = getLabelForValue(youngAdultSavingsContributionFrequency, SAVINGS_CONTRIBUTION_CADENCE_OPTIONS) || youngAdultSavingsContributionFrequency;
      let type = 'moderate';
      if (youngAdultSavingsContributionFrequency === 'weekly') type = 'high';
      if (youngAdultSavingsContributionFrequency === 'never') type = 'low';
      insights.push({
        label: `Contribution cadence: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof youngAdultHasEmergencyFund === 'boolean') {
      insights.push({
        label: youngAdultHasEmergencyFund ? 'Emergency fund set aside' : 'No emergency fund yet',
        type: youngAdultHasEmergencyFund ? 'high' : 'low',
        icon: youngAdultHasEmergencyFund ? '✓' : '⚠'
      });
    }

    if (typeof youngAdultInvestsInAssets === 'boolean') {
      insights.push({
        label: youngAdultInvestsInAssets ? 'Investing in assets already' : 'Not investing yet',
        type: youngAdultInvestsInAssets ? 'high' : 'moderate',
        icon: youngAdultInvestsInAssets ? '✓' : '•'
      });
    }

    if (typeof youngAdultHasDebt === 'boolean') {
      insights.push({
        label: youngAdultHasDebt ? 'Carrying debt right now' : 'Currently debt-free',
        type: youngAdultHasDebt ? 'moderate' : 'high',
        icon: youngAdultHasDebt ? '•' : '✓'
      });
    }

    if (typeof youngAdultStruggledWithBills === 'boolean') {
      insights.push({
        label: youngAdultStruggledWithBills ? 'Experienced bill stress before' : 'Bills have stayed current',
        type: youngAdultStruggledWithBills ? 'low' : 'high',
        icon: youngAdultStruggledWithBills ? '⚠' : '✓'
      });
    }

    if (youngAdultBalanceCheckFrequency) {
      const label = getLabelForValue(youngAdultBalanceCheckFrequency, BALANCE_CHECK_FREQUENCY_OPTIONS) || youngAdultBalanceCheckFrequency;
      let type = 'moderate';
      if (['daily', 'few-days'].includes(youngAdultBalanceCheckFrequency)) type = 'high';
      if (youngAdultBalanceCheckFrequency === 'rarely') type = 'low';
      insights.push({
        label: `Checks balances ${label.toLowerCase()}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (Number.isFinite(Number(youngAdultMonthlySpending))) {
      const formatted = formatCurrency(youngAdultMonthlySpending);
      if (formatted) {
        insights.push({
          label: `Monthly spending averages ${formatted}`,
          type: 'moderate',
          icon: '•'
        });
      }
    }

    if (typeof youngAdultPaysRecurringBills === 'boolean') {
      insights.push({
        label: youngAdultPaysRecurringBills ? 'Pays recurring bills personally' : 'Recurring bills handled by others',
        type: youngAdultPaysRecurringBills ? 'high' : 'moderate',
        icon: youngAdultPaysRecurringBills ? '✓' : '•'
      });
    }
  }

  if (isEarlyCareer) {
    if (typeof earlyCareerDualAccounts === 'boolean') {
      insights.push({
        label: earlyCareerDualAccounts ? 'Checking & savings accounts in place' : 'Still setting up core banking accounts',
        type: earlyCareerDualAccounts ? 'high' : 'moderate',
        icon: earlyCareerDualAccounts ? '✓' : '•'
      });
    }

    if (typeof earlyCareerHasCreditCard === 'boolean') {
      insights.push({
        label: earlyCareerHasCreditCard ? 'Active credit card on file' : 'No credit card access yet',
        type: earlyCareerHasCreditCard ? 'high' : 'moderate',
        icon: earlyCareerHasCreditCard ? '✓' : '•'
      });
    }

    if (earlyCareerCreditCardBalance) {
      const label = getLabelForValue(earlyCareerCreditCardBalance, CREDIT_CARD_BALANCE_OPTIONS) || earlyCareerCreditCardBalance;
      let type = 'moderate';
      if (earlyCareerCreditCardBalance === 'zero') type = 'high';
      if (earlyCareerCreditCardBalance === 'gt-1000') type = 'low';
      insights.push({
        label: `Credit card balance: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof earlyCareerPaysBalanceInFull === 'boolean') {
      insights.push({
        label: earlyCareerPaysBalanceInFull ? 'Pays credit balance in full' : 'Carries balance month-to-month',
        type: earlyCareerPaysBalanceInFull ? 'high' : 'low',
        icon: earlyCareerPaysBalanceInFull ? '✓' : '⚠'
      });
    }

    if (typeof earlyCareerMonitorsCredit === 'boolean') {
      insights.push({
        label: earlyCareerMonitorsCredit ? 'Monitoring credit health' : 'Not tracking credit score yet',
        type: earlyCareerMonitorsCredit ? 'high' : 'moderate',
        icon: earlyCareerMonitorsCredit ? '✓' : '•'
      });
    }

    if (typeof earlyCareerHasSavings === 'boolean') {
      insights.push({
        label: earlyCareerHasSavings ? 'Savings or investments established' : 'No savings accumulated yet',
        type: earlyCareerHasSavings ? 'high' : 'low',
        icon: earlyCareerHasSavings ? '✓' : '⚠'
      });
    }

    if (Number.isFinite(Number(earlyCareerSavingsAmount))) {
      const formatted = formatCurrency(earlyCareerSavingsAmount);
      if (formatted) {
        insights.push({
          label: `Savings & investments total about ${formatted}`,
          type: 'moderate',
          icon: '•'
        });
      }
    }

    if (earlyCareerSavingsContributionFrequency) {
      const label = getLabelForValue(earlyCareerSavingsContributionFrequency, SAVINGS_CONTRIBUTION_CADENCE_OPTIONS) || earlyCareerSavingsContributionFrequency;
      let type = 'moderate';
      if (earlyCareerSavingsContributionFrequency === 'weekly') type = 'high';
      if (earlyCareerSavingsContributionFrequency === 'never') type = 'low';
      insights.push({
        label: `Contribution cadence: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof earlyCareerRetirementContributor === 'boolean') {
      insights.push({
        label: earlyCareerRetirementContributor ? 'Contributing to retirement accounts' : 'Not contributing to retirement yet',
        type: earlyCareerRetirementContributor ? 'high' : 'moderate',
        icon: earlyCareerRetirementContributor ? '✓' : '•'
      });
    }

    if (typeof earlyCareerEmergencyFundThreeMonths === 'boolean') {
      insights.push({
        label: earlyCareerEmergencyFundThreeMonths ? 'Emergency fund covers 3+ months' : 'Emergency fund still below 3 months',
        type: earlyCareerEmergencyFundThreeMonths ? 'high' : 'low',
        icon: earlyCareerEmergencyFundThreeMonths ? '✓' : '⚠'
      });
    }

    if (typeof earlyCareerHasDebt === 'boolean') {
      insights.push({
        label: earlyCareerHasDebt ? 'Carrying debt obligations' : 'Currently debt-free',
        type: earlyCareerHasDebt ? 'moderate' : 'high',
        icon: earlyCareerHasDebt ? '•' : '✓'
      });
    }

    if (earlyCareerBillPaymentReliability) {
      const label = getLabelForValue(earlyCareerBillPaymentReliability, BILL_PAYMENT_RELIABILITY_OPTIONS) || earlyCareerBillPaymentReliability;
      let type = 'moderate';
      if (earlyCareerBillPaymentReliability === 'always-on-time') type = 'high';
      if (earlyCareerBillPaymentReliability === 'often-late') type = 'low';
      insights.push({
        label: `Bill payment reliability: ${label}`,
        type,
        icon: type === 'high' ? '✓' : type === 'moderate' ? '•' : '⚠'
      });
    }

    if (typeof earlyCareerTracksFixedVsDiscretionary === 'boolean') {
      insights.push({
        label: earlyCareerTracksFixedVsDiscretionary ? 'Tracks fixed vs discretionary spending' : 'Not separating fixed and discretionary costs yet',
        type: earlyCareerTracksFixedVsDiscretionary ? 'high' : 'moderate',
        icon: earlyCareerTracksFixedVsDiscretionary ? '✓' : '•'
      });
    }

    if (Number.isFinite(Number(earlyCareerMonthlySpending))) {
      const formatted = formatCurrency(earlyCareerMonthlySpending);
      if (formatted) {
        insights.push({
          label: `Monthly spending averages ${formatted}`,
          type: 'moderate',
          icon: '•'
        });
      }
    }

    if (earlyCareerMainExpenseCategory) {
      const label = getLabelForValue(earlyCareerMainExpenseCategory, EXPENSE_CATEGORY_OPTIONS) || earlyCareerMainExpenseCategory;
      insights.push({
        label: `Primary expense focus: ${label}`,
        type: 'moderate',
        icon: '•'
      });
    }
  }

  return insights;
}

// Render insight list
function renderInsightList(insights, container) {
  if (!container) return;
  
  if (insights.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const html = insights.map(insight => {
    const typeClass = insight.type === 'high' ? 'text-[var(--neon,#CCFF00)]' :
                      insight.type === 'low' ? 'text-orange-400' : 'text-neutral-400';
    
    return `
      <li class="flex items-start gap-2">
        <span class="${typeClass} text-lg leading-none" aria-hidden="true">${insight.icon}</span>
        <span class="text-neutral-300 flex-1">${escapeHtml(insight.label)}</span>
      </li>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Generate detailed profile sections
function generateDetailedSections() {
  if (!profileElements.profileSections) return;
  
  const sections = [];

  const basics = [];
  const { birthday, age, locationCity, locationCitySelect, locationState, locationRegion, locationCountry } = profileState.profileData;
  let derivedAge = Number(age);
  if (!Number.isFinite(derivedAge) && birthday) {
    const computed = computeAgeFromBirthday(birthday);
    if (Number.isFinite(computed)) derivedAge = computed;
  }
  if (Number.isFinite(derivedAge)) {
    basics.push({ label: 'Age', value: `${derivedAge}` });
  }
  const locationParts = formatLocation({
    cityText: locationCity,
    citySelect: locationCitySelect,
    regionOrState: locationState ?? locationRegion,
    legacyCountry: locationCountry
  });
  if (locationParts && locationParts.length) {
    basics.push({ label: 'Location', value: locationParts.join(', ') });
  }
  if (basics.length) {
    sections.push({ title: 'Profile basics', icon: '→', data: basics });
  }

  const incomeOverview = [];
  if (profileState.profileData.employmentType) {
    incomeOverview.push({
      label: 'Primary income',
      value: getLabelForValue(profileState.profileData.employmentType, EMPLOYMENT_OPTIONS)
    });
  }
  const normalizedTenure = normalizeTenureMonths(profileState.profileData.tenureMonths);
  if (normalizedTenure && normalizedTenure.totalMonths > 0) {
    incomeOverview.push({
      label: 'Role tenure',
      value: formatTenureLabel(normalizedTenure) || `${normalizedTenure.totalMonths} months`
    });
  }
  if (profileState.profileData.bonusReliability && profileState.profileData.bonusReliability !== 'none') {
    incomeOverview.push({
      label: 'Variable pay',
      value: getLabelForValue(profileState.profileData.bonusReliability, BONUS_RELIABILITY_OPTIONS)
    });
  }
  if (incomeOverview.length) {
    sections.push({ title: 'Income overview', icon: '→', data: incomeOverview });
  }

  const stability = [];
  if (profileState.profileData.industryRisk) {
    stability.push({
      label: 'Industry outlook',
      value: getLabelForValue(profileState.profileData.industryRisk, INDUSTRY_RISK_OPTIONS)
    });
  }
  let unemploymentRate = Number(profileState.profileData.regionalUnemploymentRate);
  let unemploymentLabel = profileState.profileData.unemploymentSelection?.cityLabel || profileState.profileData.unemploymentSelection?.stateLabel || null;
  if ((!Number.isFinite(unemploymentRate) || unemploymentRate <= 0) && profileState.profileData.regionalUnemploymentRate && typeof profileState.profileData.regionalUnemploymentRate === 'object') {
    const legacyRate = getUnemploymentRate(profileState.profileData.regionalUnemploymentRate);
    const legacyLabel = getUnemploymentLabel(profileState.profileData.regionalUnemploymentRate);
    if (Number.isFinite(legacyRate)) unemploymentRate = legacyRate;
    if (legacyLabel) unemploymentLabel = legacyLabel;
  }
  if (Number.isFinite(unemploymentRate) && unemploymentRate > 0 && unemploymentLabel) {
    stability.push({
      label: 'Local unemployment',
      value: `${unemploymentRate.toFixed(1)}% (${unemploymentLabel})`
    });
  }
  if (profileState.profileData.layoffHistory !== undefined && profileState.profileData.layoffHistory !== null) {
    stability.push({
      label: 'Layoffs (5 yrs)',
      value: Number(profileState.profileData.layoffHistory) === 0 ? 'None' : String(profileState.profileData.layoffHistory)
    });
  }
  if (profileState.profileData.upcomingContractRenewal) {
    stability.push({ label: 'Contract renewal', value: 'Within 6 months' });
  }
  if (stability.length) {
    sections.push({ title: 'Stability factors', icon: '→', data: stability });
  }

  const resilience = [];
  if (profileState.profileData.emergencyFundMonths !== undefined && profileState.profileData.emergencyFundMonths !== null) {
    const months = Number(profileState.profileData.emergencyFundMonths);
    if (Number.isFinite(months)) {
      resilience.push({
        label: 'Emergency fund',
        value: months <= 0 ? 'Not set' : `${months} month${months === 1 ? '' : 's'}`
      });
    }
  }
  if (profileState.profileData.savingsRateOverride !== undefined && profileState.profileData.savingsRateOverride !== null) {
    const rate = Number(profileState.profileData.savingsRateOverride);
    if (Number.isFinite(rate)) {
      resilience.push({ label: 'Savings rate', value: `${rate}%` });
    }
  }
  if (profileState.profileData.incomeProtectionCoverage !== undefined && profileState.profileData.incomeProtectionCoverage !== null) {
    if (Array.isArray(profileState.profileData.incomeProtectionCoverage) && profileState.profileData.incomeProtectionCoverage.length) {
      const coverage = profileState.profileData.incomeProtectionCoverage.map((code) => {
        switch (code) {
          case 'disability':
            return 'Disability insurance';
          case 'employer-std':
            return 'Short-term disability';
          case 'employer-ltd':
            return 'Long-term disability';
          case 'supplemental':
            return 'Supplemental coverage';
          default:
            return code;
        }
      });
      resilience.push({ label: 'Income protection', value: coverage.join(', ') });
    } else {
      const numericCoverage = Number(profileState.profileData.incomeProtectionCoverage);
      if (Number.isFinite(numericCoverage)) {
        const matched = INCOME_COVERAGE_OPTIONS.find((option) => Number(option.value) === numericCoverage);
        resilience.push({
          label: 'Income protection',
          value: matched ? matched.title : `${numericCoverage}% coverage`
        });
      }
    }
  }
  if (profileState.profileData.plannedMajorExpense) {
    resilience.push({ label: 'Major expense', value: 'Planned within 6 months' });
  }
  if (resilience.length) {
    sections.push({ title: 'Resilience & buffer', icon: '→', data: resilience });
  }

  const momentum = [];
  if (profileState.profileData.promotionPipeline !== undefined && profileState.profileData.promotionPipeline !== null) {
    const percentage = Number(profileState.profileData.promotionPipeline);
    if (Number.isFinite(percentage)) {
      momentum.push({ label: 'Promotion outlook', value: `${percentage}%` });
    }
  }
  if (profileState.profileData.upskillingProgress !== undefined && profileState.profileData.upskillingProgress !== null) {
    const percentage = Number(profileState.profileData.upskillingProgress);
    if (Number.isFinite(percentage)) {
      momentum.push({ label: 'Upskilling progress', value: `${percentage}%` });
    }
  }
  if (profileState.profileData.skillDemand) {
    momentum.push({
      label: 'Skill demand',
      value: getLabelForValue(profileState.profileData.skillDemand, SKILL_DEMAND_OPTIONS)
    });
  }
  if (profileState.profileData.roleSatisfaction !== undefined && profileState.profileData.roleSatisfaction !== null) {
    const percentage = Number(profileState.profileData.roleSatisfaction);
    if (Number.isFinite(percentage)) {
      momentum.push({ label: 'Role satisfaction', value: `${percentage}%` });
    }
  }
  if (momentum.length) {
    sections.push({ title: 'Growth momentum', icon: '→', data: momentum });
  }

  if (profileState.profileData.incomeNotes && profileState.profileData.incomeNotes.trim()) {
    sections.push({
      title: 'Additional context',
      icon: '📝',
      note: profileState.profileData.incomeNotes
    });
  }

  const html = sections.map(section => {
    if (section.note) {
      return `
        <article class="rounded-3xl border border-neutral-900 bg-neutral-950/50 px-8 py-8">
          <div class="flex items-center gap-3 mb-6">
            <span class="text-2xl" aria-hidden="true">${section.icon}</span>
            <h3 class="text-xl font-semibold text-white">${escapeHtml(section.title)}</h3>
          </div>
          <div class="prose prose-invert max-w-none">
            <p class="text-neutral-300 whitespace-pre-wrap">${escapeHtml(section.note)}</p>
          </div>
        </article>
      `;
    }

    return `
      <article class="rounded-3xl border border-neutral-900 bg-neutral-950/50 px-8 py-8">
        <div class="flex items-center gap-3 mb-6">
          <span class="text-2xl" aria-hidden="true">${section.icon}</span>
          <h3 class="text-xl font-semibold text-white">${escapeHtml(section.title)}</h3>
        </div>
        <dl class="grid gap-4 sm:grid-cols-2">
          ${section.data.map(item => `
            <div class="flex flex-col gap-1">
              <dt class="text-xs uppercase tracking-[0.2em] text-neutral-500">${escapeHtml(item.label)}</dt>
              <dd class="text-base text-neutral-200 font-medium">${escapeHtml(item.value)}</dd>
            </div>
          `).join('')}
        </dl>
      </article>
    `;
  }).join('');
  
  profileElements.profileSections.innerHTML = html;
}

// Update the entire profile display
function updateProfileDisplay() {
  const completion = getProfileCompletionScore();
  const hasData = completion.rounded > 0;

  // Update identity blurb
  if (profileElements.identityBlurb) {
    profileElements.identityBlurb.innerHTML = generateIdentityBlurb();
  }
  
  // Update progress meta
  if (profileElements.progressMeta) {
    if (hasData) {
      const activeSteps = getActiveStepsForProfile(profileState.profileData || {});
      const totalSteps = activeSteps.length > 0 ? activeSteps.length : STEPS.length;
      const stepsCompleted = Math.min(profileState.profileMeta.completedSteps || 0, totalSteps);
      const lastUpdate = formatDate(profileState.profileMeta.lastUpdated);
      profileElements.progressMeta.innerHTML = 
        `You've completed <strong>${stepsCompleted} of ${totalSteps} steps</strong>. <strong>${completion.rounded}% complete</strong>. Last updated: ${lastUpdate}`;
    } else {
      profileElements.progressMeta.textContent = 
        'Complete the financial profile wizard to generate your personalized overview.';
    }
  }
  
  if (hasData) {
    // Show summary and details sections
    if (profileElements.summarySection) {
      profileElements.summarySection.classList.remove('hidden');
    }
    if (profileElements.detailsSection) {
      profileElements.detailsSection.classList.remove('hidden');
    }
    if (profileElements.emptyState) {
      profileElements.emptyState.classList.add('hidden');
    }
    
    // Update all cards
    updateCompletionCard();
    
    const stabilityInsights = generateStabilityInsights();
    if (stabilityInsights.length > 0) {
      if (profileElements.stabilityText) {
        profileElements.stabilityText.textContent = 
        'Key factors influencing your financial steadiness.';
      }
      renderInsightList(stabilityInsights, profileElements.stabilityList);
    }
    
    const opportunityInsights = generateOpportunityInsights();
    if (opportunityInsights.length > 0) {
      if (profileElements.opportunityText) {
        profileElements.opportunityText.textContent = 
          'Your growth trajectory and career momentum signals.';
      }
      renderInsightList(opportunityInsights, profileElements.opportunityList);
    }
    
    const safetyInsights = generateSafetyInsights();
    if (safetyInsights.length > 0) {
      if (profileElements.safetyText) {
        profileElements.safetyText.textContent = 
          'Your financial cushion and protection mechanisms.';
      }
      renderInsightList(safetyInsights, profileElements.safetyList);
    }
    
    // Generate detailed sections
    generateDetailedSections();
    
  } else {
    // Show empty state
    if (profileElements.summarySection) {
      profileElements.summarySection.classList.add('hidden');
    }
    if (profileElements.detailsSection) {
      profileElements.detailsSection.classList.add('hidden');
    }
    if (profileElements.emptyState) {
      profileElements.emptyState.classList.remove('hidden');
    }
  }
}

// Load profile data
async function loadFinancialProfile(uid) {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const incomeData = data?.income?.profile || {};
      const { updatedAt, completedSteps, version, ...profileFields } = incomeData;
      
      profileState.profileData = profileFields;
      profileState.profileMeta = {
        completedSteps: typeof completedSteps === 'number' ? completedSteps : 0,
        lastUpdated: updatedAt
      };
    } else {
      profileState.profileData = {};
      profileState.profileMeta = {};
    }
    
    updateProfileDisplay();
  } catch (error) {
    console.error('Error loading financial profile:', error);
    profileState.profileData = {};
    profileState.profileMeta = {};
    updateProfileDisplay();
  }
}

// Wire up empty state launch button
if (profileElements.emptyLaunchBtn) {
  profileElements.emptyLaunchBtn.addEventListener('click', () => {
    const launchBtn = document.getElementById('income-profile-launch');
    if (launchBtn) {
      launchBtn.click();
    }
  });
}

// Initialize on auth state change
onAuthStateChanged(auth, (user) => {
  if (user) {
    profileState.userId = user.uid;
    loadFinancialProfile(user.uid);
  } else {
    profileState.userId = null;
    profileState.profileData = {};
    profileState.profileMeta = {};
    updateProfileDisplay();
  }
});

// Listen for profile updates from the financial profile wizard
const handleProfileUpdated = () => {
  if (profileState.userId) {
    loadFinancialProfile(profileState.userId);
  }
};

document.addEventListener('income-profile:updated', handleProfileUpdated);
document.addEventListener('financial-profile:updated', handleProfileUpdated);

// Export for potential use by other modules
export { loadFinancialProfile, updateProfileDisplay };
