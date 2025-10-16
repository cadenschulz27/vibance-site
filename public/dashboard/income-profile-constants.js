export const PROFILE_IMPORTANCE_WEIGHTS = Object.freeze({
  employmentType: 1,
  tenureMonths: 0.9,
  industryRisk: 0.8,
  regionalUnemploymentRate: 0.4,
  layoffHistory: 0.4,
  upcomingContractRenewal: 0.3,
  bonusReliability: 0.7,
  savingsRateOverride: 0.6,
  incomeProtectionCoverage: 0.5,
  plannedMajorExpense: 0.3,
  promotionPipeline: 0.6,
  upskillingProgress: 0.6,
  skillDemand: 0.5,
  roleSatisfaction: 0.4,
  emergencyFundMonths: 0.9
});

export const UNEMPLOYMENT_DATA = Object.freeze([
  {
    state: 'ca',
    label: 'California',
    cities: [
      { city: 'los_angeles', label: 'Los Angeles', rate: 4.8 },
      { city: 'san_francisco', label: 'San Francisco', rate: 3.4 },
      { city: 'san_diego', label: 'San Diego', rate: 3.6 }
    ]
  },
  {
    state: 'ny',
    label: 'New York',
    cities: [
      { city: 'new_york_city', label: 'New York City', rate: 4.7 },
      { city: 'albany', label: 'Albany', rate: 3.2 },
      { city: 'buffalo', label: 'Buffalo', rate: 3.9 }
    ]
  },
  {
    state: 'tx',
    label: 'Texas',
    cities: [
      { city: 'austin', label: 'Austin', rate: 3.4 },
      { city: 'dallas', label: 'Dallas', rate: 3.6 },
      { city: 'houston', label: 'Houston', rate: 4.2 }
    ]
  },
  {
    state: 'fl',
    label: 'Florida',
    cities: [
      { city: 'miami', label: 'Miami', rate: 3.1 },
      { city: 'orlando', label: 'Orlando', rate: 3.4 },
      { city: 'tampa', label: 'Tampa', rate: 3.2 }
    ]
  },
  {
    state: 'il',
    label: 'Illinois',
    cities: [
      { city: 'chicago', label: 'Chicago', rate: 4.3 },
      { city: 'springfield', label: 'Springfield', rate: 4.0 },
      { city: 'rockford', label: 'Rockford', rate: 5.1 }
    ]
  },
  {
    state: 'wa',
    label: 'Washington',
    cities: [
      { city: 'seattle', label: 'Seattle', rate: 3.5 },
      { city: 'spokane', label: 'Spokane', rate: 4.4 },
      { city: 'tacoma', label: 'Tacoma', rate: 4.1 }
    ]
  }
]);

export const INCOME_COVERAGE_OPTIONS = Object.freeze([
  {
    value: 0,
    title: 'No coverage',
    description: 'No short- or long-term disability benefits in place right now.'
  },
  {
    value: 40,
    title: 'Short-term only',
    description: 'Employer plan or savings would replace roughly 40–50% of income for a few months.'
  },
  {
    value: 60,
    title: 'Short + long-term',
    description: 'Short-term disability plus an employer long-term policy covering ~60% of wages.'
  },
  {
    value: 80,
    title: 'Comprehensive',
    description: 'Supplemental or personal policies covering 70%+ of take-home income if you cannot work.'
  }
]);

export const EMPLOYMENT_OPTIONS = [
  { value: '', label: 'Choose one' },
  { value: 'w2', label: 'Full-time employee (W-2)' },
  { value: 'salaried', label: 'Salaried employee' },
  { value: 'full-time', label: 'Full-time hourly' },
  { value: 'contract', label: 'Contractor / 1099' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'freelance', label: 'Freelancer / gig worker' },
  { value: 'business-owner', label: 'Business owner' },
  { value: 'part-time', label: 'Part-time employee' },
  { value: 'seasonal', label: 'Seasonal worker' },
  { value: 'gig', label: 'Platform / gig worker' },
  { value: 'unemployed', label: 'Between roles' }
];

export const INDUSTRY_RISK_OPTIONS = [
  { value: '', label: 'Choose outlook' },
  { value: 'very-low', label: 'Rock solid' },
  { value: 'low', label: 'Healthy' },
  { value: 'moderate', label: 'Neutral' },
  { value: 'elevated', label: 'A little shaky' },
  { value: 'high', label: 'High risk' },
  { value: 'very-high', label: 'Volatile' }
];

export const BONUS_RELIABILITY_OPTIONS = [
  { value: '', label: 'Choose reliability' },
  { value: 'high', label: 'Predictable each cycle' },
  { value: 'medium', label: 'Mostly consistent' },
  { value: 'low', label: 'Occasional / unpredictable' },
  { value: 'none', label: 'Not applicable' }
];

export const SKILL_DEMAND_OPTIONS = [
  { value: '', label: 'Choose demand' },
  { value: 'scarce', label: 'Highly sought after' },
  { value: 'strong', label: 'In demand' },
  { value: 'balanced', label: 'Balanced market' },
  { value: 'saturated', label: 'Lots of supply' },
  { value: 'declining', label: 'Declining demand' }
];

export const STEPS = [
  {
    id: 'basics',
    title: 'Work snapshot',
    description: 'Tell us how you get paid so we can size your baseline income resilience.',
    fields: [
      {
        id: 'employmentType',
        label: 'How do you primarily get paid?',
        type: 'select',
        required: true,
        options: EMPLOYMENT_OPTIONS,
        hint: 'Choose the structure that best matches your main source of income.',
        info: 'We map your pay structure to a baseline stability score – a W-2 salary is treated differently than 1099 or business-owner income.'
      },
      {
        id: 'roleTitle',
        label: 'Role title',
        type: 'text',
        placeholder: 'e.g. Senior Product Designer',
        hint: 'Optional, used for future insights.',
        info: 'Helps us personalize insights and benchmark against similar roles.'
      },
      {
        id: 'companyName',
        label: 'Company or main client',
        type: 'text',
        placeholder: 'e.g. Vibance Labs',
        info: 'Useful for context, especially if your company is public or in the news.'
      },
      {
        id: 'tenureMonths',
        label: 'Time in current role',
        type: 'tenure',
        required: true,
        hint: 'Break it into full years and leftover months.',
        info: 'Longer tenure generally signals stickier income and less volatility.'
      },
      {
        id: 'upcomingContractRenewal',
        label: 'Contract renewal coming in the next 6 months?',
        type: 'toggle',
        toggleText: 'Yes, a renewal decision is coming up',
        info: 'Renewals introduce a binary risk – if one is looming, we’ll factor that into stability.'
      }
    ]
  },
  {
    id: 'stability',
    title: 'Job stability factors',
    description: 'Capture the forces that influence how steady your current role feels.',
    fields: [
      {
        id: 'industryRisk',
        label: 'How stable is your industry right now?',
        type: 'select',
        required: true,
        options: INDUSTRY_RISK_OPTIONS,
        info: 'Think about hiring freezes, layoffs, and news sentiment in your sector.'
      },
      {
        id: 'regionalUnemploymentRate',
        label: 'Where do you primarily work?',
        type: 'unemployment',
        hint: 'Pick your state and metro. We’ll auto-fill the latest unemployment rate from public data.',
        info: 'Local unemployment acts as a proxy for how easy it is to replace income if needed.'
      },
      {
        id: 'layoffHistory',
        label: 'Layoffs you have faced in the last 5 years',
        type: 'number',
        min: 0,
        max: 10,
        hint: 'Use zero if none.',
        info: 'Each layoff event adds a bit of volatility to the momentum factor.'
      },
      {
        id: 'plannedMajorExpense',
        label: 'Major expense planned in the next 6 months?',
        type: 'toggle',
        toggleText: 'Yes, funds are earmarked for a big purchase',
        info: 'Large planned purchases (like a car or wedding) temporarily reduce your buffer.'
      }
    ]
  },
  {
    id: 'reliability',
    title: 'Income mix & reliability',
    description: 'Share how dependable variable income feels so we can weight it correctly.',
    fields: [
      {
        id: 'bonusReliability',
        label: 'Variable pay confidence',
        type: 'select',
        required: true,
        options: BONUS_RELIABILITY_OPTIONS,
        info: 'Tell us how predictable bonuses, commissions, or variable pay have felt historically.'
      },
      {
        id: 'savingsRateOverride',
        label: 'Monthly savings rate (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        hint: 'We use this if your synced accounts underestimate savings.',
        info: 'If your synced budgets miss cash you automatically save or invest, plug in the real percent here.'
      },
      {
        id: 'incomeProtectionCoverage',
        label: 'Income protection coverage',
        type: 'coverage',
        info: 'Covers disability insurance, employer benefits, or supplemental policies that replace income if you cannot work.'
      }
    ]
  },
  {
    id: 'growth',
    title: 'Growth & momentum',
    description: 'Tell us how your skills and opportunities are trending.',
    fields: [
      {
        id: 'promotionPipeline',
        label: 'Chance of a raise / promotion in next 12 months (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        info: 'Use your best estimate based on recent reviews, business momentum, and career trajectory.'
      },
      {
        id: 'upskillingProgress',
        label: 'Progress on upskilling goals (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        hint: 'How far along you are on courses, certifications, or training you planned for this year.',
        clarification: '0% means “haven’t started,” 50% means “midway,” and 100% means “finished or consistently practicing.”',
        info: 'Signals momentum: actively building skills cushions future income risk.'
      },
      {
        id: 'skillDemand',
        label: 'Market demand for your skills',
        type: 'select',
        required: true,
        options: SKILL_DEMAND_OPTIONS,
        info: 'Consider how recruiters reach out, job postings in your field, and compensation trends.'
      },
      {
        id: 'roleSatisfaction',
        label: 'Role satisfaction (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        hint: 'Gut check on how energized you feel in the role.',
        info: 'Lower satisfaction can lead to churn, making income less resilient.'
      }
    ]
  },
  {
    id: 'safety',
    title: 'Safety net & notes',
    description: 'Round things out with your cushion and any context the score should know.',
    fields: [
      {
        id: 'emergencyFundMonths',
        label: 'Emergency fund coverage (months)',
        type: 'number',
        min: 0,
        max: 48,
        step: 0.1,
        hint: 'How long essentials are covered without new income.',
        info: 'We translate your cash cushion into months of living expenses to gauge resilience.'
      },
      {
        id: 'incomeNotes',
        label: 'Anything else we should know?',
        type: 'textarea',
        placeholder: 'Optional context (career changes, sabbaticals, etc.)',
        info: 'Use this for nuances – upcoming leave, side gigs, or context that informs your income story.'
      }
    ]
  }
];

export const REQUIRED_FIELD_IDS = Object.freeze(
  STEPS.flatMap((step) =>
    step.fields
      .filter((field) => field.required)
      .map((field) => field.id)
  )
);

export const REQUIRED_PROFILE_WEIGHTS = Object.freeze(
  REQUIRED_FIELD_IDS.reduce((weights, fieldId) => {
    const weight = PROFILE_IMPORTANCE_WEIGHTS[fieldId];
    return Object.assign(weights, {
      [fieldId]: typeof weight === 'number' ? weight : 1
    });
  }, {})
);
