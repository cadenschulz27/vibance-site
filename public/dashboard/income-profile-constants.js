import { computeAgeFromBirthday } from '../VibeScore/income/age-utils.js';

const parseAge = (profile = {}) => {
  const raw = profile?.age;
  if (raw !== null && raw !== undefined) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  const birthday = profile?.birthday;
  if (birthday) {
    const derived = computeAgeFromBirthday(birthday);
    if (Number.isFinite(derived)) return derived;
  }
  return null;
};

const showWhenAgeBetween = (min = null, max = null) => (profile) => {
  const age = parseAge(profile);
  if (age === null) return false;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
};

const showWhenAgeAtMost = (max) => showWhenAgeBetween(null, max);
const showWhenAgeAtLeast = (min) => showWhenAgeBetween(min, null);

const AGE_BANDS = Object.freeze({
  teen: { min: 13, max: 17 },
  student: { min: 18, max: 22 },
  earlyCareer: { min: 23, max: 34 },
  midCareer: { min: 35, max: 49 },
  lateCareer: { min: 50, max: null }
});

const showWhenInAgeBands = (...bands) => (profile) => {
  const age = parseAge(profile);
  if (age === null) return false;
  return bands.some((bandKey) => {
    const band = AGE_BANDS[bandKey];
    if (!band) return false;
    if (band.min !== null && age < band.min) return false;
    if (band.max !== null && age > band.max) return false;
    return true;
  });
};

const resolveAgeBandKeyFromAge = (age) => {
  if (!Number.isFinite(age)) return null;
  if (age < 18) return 'teen';
  if (age <= 22) return 'student';
  return 'adult';
};

export const deriveAgeBandKey = (profile = {}) => {
  const parsed = parseAge(profile);
  if (parsed === null) return 'adult';
  return resolveAgeBandKeyFromAge(parsed) || 'adult';
};

export const EDUCATION_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Choose status' },
  { value: 'high-school', label: 'High school student' },
  { value: 'undergrad', label: 'Undergraduate student' },
  { value: 'graduate', label: 'Graduate / professional program' },
  { value: 'trade', label: 'Trade or certification program' },
  { value: 'gap-year', label: 'Taking a gap year' },
  { value: 'working', label: 'Working full-time' }
]);

export const RETIREMENT_HORIZON_OPTIONS = Object.freeze([
  { value: '', label: 'Choose horizon' },
  { value: 'already-retired', label: 'Already retired' },
  { value: 'within-5', label: 'Within 5 years' },
  { value: 'within-10', label: 'Within 10 years' },
  { value: 'within-20', label: 'Within 20 years' },
  { value: 'over-20', label: '20+ years away' },
  { value: 'not-sure', label: 'Not sure yet' }
]);

export const YOUTH_INCOME_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'allowance', label: 'Allowance or family support' },
  { value: 'part-time', label: 'Part-time job' },
  { value: 'seasonal', label: 'Seasonal or occasional work' },
  { value: 'gig', label: 'Gigs or side hustles' },
  { value: 'not-earning', label: 'Not earning yet' }
]);

export const STUDENT_WORK_INTENT_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'internship', label: 'Interning or co-op' },
  { value: 'part-time', label: 'Working part-time while studying' },
  { value: 'full-time', label: 'Working full-time alongside school' },
  { value: 'seeking', label: 'Actively seeking work for experience' },
  { value: 'not-working', label: 'Focused on school right now' }
]);

export const SUPPORT_RELIABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose reliability' },
  { value: 'solid', label: 'Very reliable • always available' },
  { value: 'steady', label: 'Usually reliable with some conditions' },
  { value: 'limited', label: 'Limited or uncertain support' }
]);

export const HOUSING_STABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'secure', label: 'Locked in for the next 12 months' },
  { value: 'medium', label: 'Likely stable but could change' },
  { value: 'fragile', label: 'Unsettled or short-term' }
]);

export const CAMPUS_JOB_STABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'consistent', label: 'Consistent campus job or assistantship' },
  { value: 'variable', label: 'Hours or gigs fluctuate' },
  { value: 'not-working', label: 'Not working right now' }
]);

export const TEEN_ALLOWANCE_RELIABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose reliability' },
  { value: 'locked-in', label: 'Always arrives on schedule' },
  { value: 'steady-most-months', label: 'Usually on time with rare skips' },
  { value: 'inconsistent', label: 'Changes month to month' },
  { value: 'not-receiving', label: 'No regular family support right now' }
]);

export const STUDENT_FUNDING_RELIABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose reliability' },
  { value: 'guaranteed-term', label: 'Guaranteed for the current term/year' },
  { value: 'performance-based', label: 'Tied to grades, hours, or renewals' },
  { value: 'hour-dependent', label: 'Depends on hours or shift availability' },
  { value: 'not-active', label: 'Not receiving scholarships or stipends now' }
]);

export const YOUTH_SAVINGS_BEHAVIOR_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'super-saver', label: 'Save most of what comes in (50%+)' },
  { value: 'steady-saver', label: 'Save a steady portion (20–50%)' },
  { value: 'occasional', label: 'Save occasionally when possible' },
  { value: 'just-starting', label: 'Not saving yet or figuring it out' }
]);

export const YOUTH_GROWTH_FOCUS_OPTIONS = Object.freeze([
  { value: '', label: 'Choose focus' },
  { value: 'skill-building', label: 'Building core skills & study habits' },
  { value: 'exploring-passions', label: 'Exploring interests, clubs, or activities' },
  { value: 'future-planning', label: 'Planning for college, trade, or apprenticeships' },
  { value: 'entrepreneurial', label: 'Running side hustles or creative projects' }
]);

export const STUDENT_OPPORTUNITY_FOCUS_OPTIONS = Object.freeze([
  { value: '', label: 'Choose focus' },
  { value: 'internship-search', label: 'Searching for internships or co-ops' },
  { value: 'research-projects', label: 'Investing in research or academic projects' },
  { value: 'leadership-campus', label: 'Leading campus organizations or initiatives' },
  { value: 'portfolio-building', label: 'Building freelance work or a portfolio' },
  { value: 'still-exploring', label: 'Still exploring long-term direction' }
]);

export const YOUTH_EMERGENCY_FALLBACK_OPTIONS = Object.freeze([
  { value: '', label: 'Choose plan' },
  { value: 'family-ready', label: 'Family can step in quickly' },
  { value: 'shared-cushion', label: 'Shared cushion with friends or roommates' },
  { value: 'small-personal', label: 'Small personal savings earmarked' },
  { value: 'no-plan', label: 'No clear plan yet' }
]);

export const STUDENT_EMERGENCY_RESOURCES_OPTIONS = Object.freeze([
  { value: '', label: 'Choose resource' },
  { value: 'campus-fund', label: 'Campus emergency grants or relief funds' },
  { value: 'family-support', label: 'Family would cover most shortfalls' },
  { value: 'personal-savings', label: 'Personal savings or part-time earnings' },
  { value: 'credit-options', label: 'Credit card or loan if needed' },
  { value: 'not-sure', label: 'Not sure yet' }
]);

export const YOUTH_PRIMARY_MONEY_SOURCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose the main source' },
  { value: 'allowance', label: 'Allowance or family support' },
  { value: 'part-time-job', label: 'Part-time or seasonal job' },
  { value: 'gifts', label: 'Gifts from friends or family' },
  { value: 'other', label: 'Something else' }
]);

export const YOUTH_MONEY_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose how often' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'occasionally', label: 'Only occasionally' }
]);

export const YOUTH_BALANCE_CHECK_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose frequency' },
  { value: 'daily', label: 'Daily' },
  { value: 'few-days', label: 'Every few days' },
  { value: 'weekly', label: 'About once a week' },
  { value: 'monthly', label: 'About once a month' },
  { value: 'rarely', label: 'Rarely or only when needed' }
]);

export const YOUTH_SAVINGS_LOCATION_OPTIONS = Object.freeze([
  { value: '', label: 'Choose where you keep it' },
  { value: 'bank', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Somewhere else' }
]);

export const YOUTH_SAVINGS_CONTRIBUTION_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose how often' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'rarely', label: 'Only once in a while' },
  { value: 'never', label: 'I don’t add to it right now' }
]);

export const YOUTH_SPENDING_CATEGORY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose the main category' },
  { value: 'food', label: 'Food and snacks' },
  { value: 'clothing', label: 'Clothing or accessories' },
  { value: 'entertainment', label: 'Entertainment or going out' },
  { value: 'hobbies', label: 'Hobbies or activities' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'other', label: 'Something else' }
]);

export const YOUTH_SPENDING_APPROACH_OPTIONS = Object.freeze([
  { value: '', label: 'Choose what fits best' },
  { value: 'plan-ahead', label: 'I plan my spending ahead of time' },
  { value: 'mix', label: 'A mix of planning and spontaneous spending' },
  { value: 'as-needed', label: 'I mostly buy things as I need them' }
]);

export const YOUTH_CONFIDENCE_LEVEL_OPTIONS = Object.freeze([
  { value: '', label: 'Choose your confidence level' },
  { value: 'very-confident', label: 'Very confident' },
  { value: 'somewhat-confident', label: 'Somewhat confident' },
  { value: 'not-yet-confident', label: 'Not yet confident' }
]);

export const YOUNG_ADULT_INCOME_SOURCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose primary source' },
  { value: 'job', label: 'Job / paycheck' },
  { value: 'freelance', label: 'Freelance or contract work' },
  { value: 'family-support', label: 'Family support' },
  { value: 'scholarship', label: 'Scholarships or stipends' },
  { value: 'other', label: 'Other' }
]);

export const YOUNG_ADULT_INCOME_STABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose stability' },
  { value: 'fixed', label: 'Fixed each month' },
  { value: 'varies', label: 'Varies month-to-month' },
  { value: 'occasional', label: 'Occasional income only' }
]);

export const BALANCE_CHECK_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose frequency' },
  { value: 'daily', label: 'Daily' },
  { value: 'few-days', label: 'Every few days' },
  { value: 'weekly', label: 'About once a week' },
  { value: 'monthly', label: 'About once a month' },
  { value: 'rarely', label: 'Rarely or only when needed' }
]);

export const SAVINGS_CONTRIBUTION_CADENCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose cadence' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'never', label: 'Never' }
]);

export const EXPENSE_CATEGORY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose main expense' },
  { value: 'rent', label: 'Rent' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'food', label: 'Food & groceries' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'loans', label: 'Loans / debt payments' },
  { value: 'subscriptions', label: 'Subscriptions & services' },
  { value: 'other', label: 'Other' }
]);

export const CREDIT_CARD_BEHAVIOR_OPTIONS = Object.freeze([
  { value: '', label: 'Choose an option' },
  { value: 'no-card', label: 'No credit cards' },
  { value: 'pay-in-full', label: 'Yes, and I pay the balance in full each month' },
  { value: 'carry-balance', label: 'Yes, and I usually carry a balance' }
]);

export const DEBT_STRESS_LEVEL_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'manageable', label: 'Easily manageable' },
  { value: 'sometimes-tight', label: 'Sometimes tight' },
  { value: 'stressful', label: 'Often stressful' }
]);

export const FINANCIAL_CONFIDENCE_OUTLOOK_OPTIONS = Object.freeze([
  { value: '', label: 'Choose confidence level' },
  { value: 'very-confident', label: 'Very confident about the future' },
  { value: 'mostly-confident', label: 'Mostly confident with a few concerns' },
  { value: 'somewhat-concerned', label: 'Some concerns about stability' },
  { value: 'very-concerned', label: 'Very concerned about the future' }
]);

export const TRACKING_INTENSITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose tracking style' },
  { value: 'detailed', label: 'Very closely' },
  { value: 'regular', label: 'I review regularly' },
  { value: 'rough', label: 'Rough idea only' },
  { value: 'rarely', label: 'Rarely check' }
]);

export const YOUNG_ADULT_CONFIDENCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose confidence level' },
  { value: 'very-confident', label: 'Very confident' },
  { value: 'somewhat-confident', label: 'Somewhat confident' },
  { value: 'learning', label: 'Still learning' }
]);

export const INCOME_STABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose stability' },
  { value: 'very-stable', label: 'Very stable' },
  { value: 'somewhat-stable', label: 'Somewhat stable' },
  { value: 'unpredictable', label: 'Unpredictable' }
]);

export const EARLY_CAREER_INCOME_STABILITY_OPTIONS = INCOME_STABILITY_OPTIONS;

export const CREDIT_CARD_BALANCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose balance range' },
  { value: 'zero', label: '$0' },
  { value: 'lt-500', label: 'Less than $500' },
  { value: '500-1000', label: '$500–$1,000' },
  { value: 'gt-1000', label: 'Over $1,000' }
]);

export const INCOME_GROWTH_EXPECTATION_OPTIONS = Object.freeze([
  { value: '', label: 'Choose outlook' },
  { value: 'yes', label: 'Yes, I expect it to increase' },
  { value: 'no', label: 'No, likely to stay the same' },
  { value: 'unsure', label: 'Not sure yet' }
]);

export const BILL_PAYMENT_RELIABILITY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose one' },
  { value: 'always-on-time', label: 'Always on time' },
  { value: 'sometimes-late', label: 'Sometimes late' },
  { value: 'often-late', label: 'Often late' }
]);

export const GOAL_REVIEW_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose cadence' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'twice-yearly', label: 'Twice a year' },
  { value: 'rarely', label: 'Rarely / ad hoc' }
]);

export const EARLY_CAREER_CONFIDENCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose confidence level' },
  { value: 'very-confident', label: 'Very confident' },
  { value: 'fairly-confident', label: 'Fairly confident' },
  { value: 'somewhat-uneasy', label: 'Somewhat uneasy' },
  { value: 'struggling', label: 'Struggling right now' }
]);

export const YOUTH_GOAL_MILESTONE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose milestone' },
  { value: 'first-job', label: 'Land first job or paid project' },
  { value: 'skill-upgrade', label: 'Level up a core skill or certification' },
  { value: 'save-major', label: 'Save toward a major purchase' },
  { value: 'explore-careers', label: 'Explore career paths or mentors' }
]);

export const YOUTH_SUPPORT_PREFERENCE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose support' },
  { value: 'family', label: 'Check-ins with family or guardians' },
  { value: 'friends', label: 'Accountability with friends or classmates' },
  { value: 'coach', label: 'Mentor, coach, or counselor guidance' },
  { value: 'self-driven', label: 'Prefer to self-manage progress' }
]);

export const STUDENT_SUPPORT_CHANNEL_OPTIONS = Object.freeze([
  { value: '', label: 'Choose channel' },
  { value: 'career-center', label: 'Career center meetings' },
  { value: 'faculty-mentor', label: 'Faculty or program mentor' },
  { value: 'peer-network', label: 'Peer networking or clubs' },
  { value: 'online-community', label: 'Online communities or forums' }
]);

export const CHECK_IN_FREQUENCY_OPTIONS = Object.freeze([
  { value: '', label: 'Choose cadence' },
  { value: 'monthly', label: 'Monthly check-ins' },
  { value: 'quarterly', label: 'Quarterly reviews' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'annual', label: 'Annual refresh' }
]);

export const ADVISOR_INTEREST_OPTIONS = Object.freeze([
  { value: '', label: 'Choose interest level' },
  { value: 'high', label: 'Definitely want a conversation' },
  { value: 'medium', label: 'Open to it if recommended' },
  { value: 'low', label: 'Maybe later' },
  { value: 'none', label: 'Not interested right now' }
]);

export const US_STATE_OPTIONS = Object.freeze([
  { value: '', label: 'Choose state' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'PR', label: 'Puerto Rico' },
  { value: 'GU', label: 'Guam' },
  { value: 'AS', label: 'American Samoa' },
  { value: 'VI', label: 'U.S. Virgin Islands' },
  { value: 'MP', label: 'Northern Mariana Islands' },
  { value: 'OTHER', label: 'Outside the U.S.' }
]);

export const PROFILE_IMPORTANCE_WEIGHTS = Object.freeze({
  birthday: 1,
  age: 1,
  employmentType: 1,
  tenureMonths: 0.9,
  industryRisk: 0.8,
  regionalUnemploymentRate: 0.5,
  layoffHistory: 0.4,
  upcomingContractRenewal: 0.3,
  bonusReliability: 0.6,
  savingsRateOverride: 0.6,
  incomeProtectionCoverage: 0.5,
  plannedMajorExpense: 0.3,
  emergencyFundMonths: 0.9,
  promotionPipeline: 0.6,
  upskillingProgress: 0.6,
  skillDemand: 0.5,
  roleSatisfaction: 0.4,
  youthHasIncome: 0.8,
  youthPrimaryIncomeSource: 0.7,
  youthIncomeFrequency: 0.6,
  youthTypicalMonthlyIncome: 0.8,
  youthHeldPartTimeJob: 0.4,
  youthHasCheckingAccount: 0.4,
  youthHasSavingsAccount: 0.5,
  youthHasDebitCard: 0.3,
  youthUsesMoneyApps: 0.3,
  youthBalanceCheckFrequency: 0.4,
  youthHasCurrentSavings: 0.6,
  youthSavingsAmount: 0.7,
  youthSavingsLocation: 0.4,
  youthSavingsContributionFrequency: 0.5,
  youthHasSavingsGoal: 0.3,
  youthPrimarySpendingCategory: 0.3,
  youthWeeklySpendingAmount: 0.5,
  youthPaysRecurringExpenses: 0.4,
  youthRanOutOfMoney: 0.4,
  youthSpendingApproach: 0.4,
  youthTracksSpending: 0.5,
  youthHasEmergencyBuffer: 0.6,
  youthGetsGuardianHelp: 0.3,
  youthSharesMoneyWithOthers: 0.2,
  youthMoneyConfidence: 0.6,
  youngAdultHasJob: 0.8,
  youngAdultPrimaryIncomeSource: 0.7,
  youngAdultMonthlyIncomeAfterTax: 0.8,
  youngAdultIncomeStability: 0.6,
  youngAdultMultipleIncomeStreams: 0.4,
  youngAdultDualAccounts: 0.5,
  youngAdultHasCreditCard: 0.4,
  youngAdultMissedPayment: 0.3,
  youngAdultUsesBudgetApps: 0.3,
  youngAdultBalanceCheckFrequency: 0.4,
  youngAdultHasSavings: 0.6,
  youngAdultSavingsAmount: 0.7,
  youngAdultSavingsContributionFrequency: 0.5,
  youngAdultHasEmergencyFund: 0.7,
  youngAdultInvestsInAssets: 0.4,
  youngAdultMainExpenseCategory: 0.4,
  youngAdultMonthlySpending: 0.6,
  youngAdultPaysRecurringBills: 0.5,
  youngAdultHasDebt: 0.5,
  youngAdultStruggledWithBills: 0.3,
  youngAdultUsesBudget: 0.5,
  youngAdultTrackingHabit: 0.4,
  youngAdultHasLeftoverMoney: 0.4,
  youngAdultSetsFinancialGoals: 0.4,
  youngAdultFinancialConfidence: 0.6,
  earlyCareerHasFullTimeIncome: 0.9,
  earlyCareerMonthlyIncomeAfterTax: 0.8,
  earlyCareerMultipleIncomeStreams: 0.5,
  earlyCareerIncomeStability: 0.6,
  earlyCareerIncomeGrowthExpectation: 0.5,
  earlyCareerDualAccounts: 0.4,
  earlyCareerHasCreditCard: 0.4,
  earlyCareerCreditCardBalance: 0.4,
  earlyCareerPaysBalanceInFull: 0.4,
  earlyCareerMonitorsCredit: 0.3,
  earlyCareerHasSavings: 0.7,
  earlyCareerSavingsAmount: 0.8,
  earlyCareerSavingsContributionFrequency: 0.5,
  earlyCareerRetirementContributor: 0.6,
  earlyCareerEmergencyFundThreeMonths: 0.7,
  earlyCareerMainExpenseCategory: 0.4,
  earlyCareerMonthlySpending: 0.6,
  earlyCareerHasDebt: 0.6,
  earlyCareerBillPaymentReliability: 0.5,
  earlyCareerTracksFixedVsDiscretionary: 0.4,
  earlyCareerUsesBudget: 0.6,
  earlyCareerGoalReviewCadence: 0.4,
  earlyCareerSavingForMajorPurchase: 0.3,
  earlyCareerHasInsuranceCoverage: 0.4,
  earlyCareerFinancialConfidence: 0.6,
  midCareerHasSteadyIncome: 0.9,
  midCareerMonthlyIncomeAfterTax: 0.8,
  midCareerMultipleIncomeStreams: 0.5,
  midCareerIncomeStability: 0.6,
  midCareerIncomeChangeExpectation: 0.5,
  midCareerHasDualAccounts: 0.5,
  midCareerCreditCardBalanceBehavior: 0.4,
  midCareerAccountMonitoringFrequency: 0.4,
  midCareerTracksCreditScore: 0.4,
  midCareerHasInvestmentAccounts: 0.6,
  midCareerHasSavings: 0.7,
  midCareerSavingsAmount: 0.8,
  midCareerSavingsContributionCadence: 0.5,
  midCareerRetirementContributions: 0.6,
  midCareerEmergencyFundCoverage: 0.7,
  midCareerPrimaryExpenseCategory: 0.4,
  midCareerMonthlySpending: 0.6,
  midCareerHasDebt: 0.5,
  midCareerDebtStressLevel: 0.5,
  midCareerTracksExpenses: 0.4,
  midCareerUsesBudget: 0.5,
  midCareerGoalReviewCadence: 0.4,
  midCareerSavingForLongTermGoals: 0.4,
  midCareerHasInsuranceCoverage: 0.4,
  midCareerFinancialConfidence: 0.6
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
    id: 'birthday-basics',
    title: 'Confirm your birthday',
    description: 'Start by locking in your birthday so we can tailor the rest of the experience.',
    fields: [
      {
        id: 'birthday',
        label: 'Birthday',
        type: 'date',
        required: true,
        minAge: 10,
        maxAge: 120,
        hint: 'Used only to tailor age-based expectations — never shared. You need to be between 10 and 120 years old.',
        triggersRerender: true
      }
    ]
  },
  {
    id: 'foundations',
    title: 'Income foundations',
    description: 'Share the essentials of how you earn so we can benchmark the score correctly.',
    ageCopy: {
      teen: {
        title: 'Starter income foundations',
        description: 'Share a quick snapshot so we can size your starter VibeScore.'
      },
      student: {
        description: 'Set the baseline for how we interpret earnings while you’re in school.'
      },
      adult: {
        description: 'Lock the core inputs we use to benchmark your income stability.'
      }
    },
    fields: [
      {
        id: 'employmentType',
        label: 'How do you primarily get paid?',
        type: 'select',
        required: true,
        options: EMPLOYMENT_OPTIONS,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        ageCopy: {
          teen: {
            label: 'How do you earn money when you do?',
            hint: 'Pick the option that matches your biggest source right now.'
          },
          student: {
            label: 'Primary way you earn while in school',
            hint: 'Choose the structure that best describes your main paid work this term.'
          },
          adult: {
            label: 'Primary income structure',
            hint: 'We translate this to your baseline stability score.'
          }
        }
      },
      {
        id: 'tenureMonths',
        label: 'Time in current role',
        type: 'tenure',
        required: true,
        hint: 'Break it into full years and leftover months.',
        info: 'Longer tenure signals stickier income and less volatility.',
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        ageCopy: {
          student: {
            label: 'How long have you had this job or paid experience?',
            hint: 'Use years and months — include campus jobs, internships, or ongoing clients.'
          },
          adult: {
            label: 'Time in current role',
            hint: 'Years and months with your primary employer or contract.'
          }
        }
      }
    ]
  },
  {
    id: 'youth-income',
    title: 'Income & allowance',
    description: 'Understand how money flows in for younger earners.',
    shouldDisplay: showWhenAgeBetween(3, 17),
    ageCopy: {
      teen: {
        title: 'Money coming in',
        description: 'Tell us how allowance, jobs, or gifts show up for you.'
      }
    },
    fields: [
      {
        id: 'youthHasIncome',
        label: 'Do you currently have a source of income?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I receive money regularly',
        hint: 'Answer yes if you get allowance, job income, or regular gifts.'
      },
      {
        id: 'youthPrimaryIncomeSource',
        label: 'Where does most of your money come from?',
        type: 'select',
        required: true,
        options: YOUTH_PRIMARY_MONEY_SOURCE_OPTIONS,
        hint: 'Pick the source you rely on the most right now.'
      },
      {
        id: 'youthIncomeFrequency',
        label: 'How often do you receive money?',
        type: 'select',
        required: true,
        options: YOUTH_MONEY_FREQUENCY_OPTIONS
      },
      {
        id: 'youthTypicalMonthlyIncome',
        label: 'About how much money do you receive in a typical month?',
        type: 'number',
        required: true,
        min: 0,
        step: 1,
        placeholder: 'e.g. 150',
        hint: 'Estimate the total amount that comes in each month.'
      },
      {
        id: 'youthHeldPartTimeJob',
        label: 'Have you ever had a consistent part-time or summer job?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have held a steady job before'
      }
    ]
  },
  {
    id: 'youth-banking',
    title: 'Banking & access',
    description: 'Tell us how you store and access your money.',
    shouldDisplay: showWhenAgeBetween(3, 17),
    ageCopy: {
      teen: {
        description: 'Share where your money lives and how you keep an eye on it.'
      }
    },
    fields: [
      {
        id: 'youthHasCheckingAccount',
        label: 'Do you have a checking account?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a checking account'
      },
      {
        id: 'youthHasSavingsAccount',
        label: 'Do you have a savings account?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a savings account'
      },
      {
        id: 'youthHasDebitCard',
        label: 'Do you have a debit or prepaid card?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a debit or prepaid card'
      },
      {
        id: 'youthUsesMoneyApps',
        label: 'Do you use any financial apps (like Venmo or Cash App) to send or receive money?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I use money apps'
      },
      {
        id: 'youthBalanceCheckFrequency',
        label: 'How often do you check your account balance or transaction history?',
        type: 'select',
        required: true,
        options: YOUTH_BALANCE_CHECK_FREQUENCY_OPTIONS
      }
    ]
  },
  {
    id: 'youth-saving',
    title: 'Saving habits',
    description: 'Show how you’re building a cushion.',
    shouldDisplay: showWhenAgeBetween(3, 17),
    ageCopy: {
      teen: {
        description: 'Walk through how you save and what you’re working toward.'
      }
    },
    fields: [
      {
        id: 'youthHasCurrentSavings',
        label: 'Do you currently have money saved?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have money saved right now'
      },
      {
        id: 'youthSavingsAmount',
        label: 'Approximately how much money do you have saved right now?',
        type: 'number',
        required: true,
        min: 0,
        step: 1,
        placeholder: 'e.g. 300'
      },
      {
        id: 'youthSavingsLocation',
        label: 'Where do you keep your savings?',
        type: 'select',
        required: true,
        options: YOUTH_SAVINGS_LOCATION_OPTIONS
      },
      {
        id: 'youthSavingsContributionFrequency',
        label: 'How often do you add to your savings?',
        type: 'select',
        required: true,
        options: YOUTH_SAVINGS_CONTRIBUTION_FREQUENCY_OPTIONS
      },
      {
        id: 'youthHasSavingsGoal',
        label: 'Do you have a specific goal you’re saving for (like a car, college, or trip)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I’m saving for a specific goal'
      }
    ]
  },
  {
    id: 'youth-spending',
    title: 'Spending & expenses',
    description: 'Get a feel for where your money goes.',
    shouldDisplay: showWhenAgeBetween(3, 17),
    ageCopy: {
      teen: {
        description: 'Show us your usual spending patterns.'
      }
    },
    fields: [
      {
        id: 'youthPrimarySpendingCategory',
        label: 'What do you spend most of your money on?',
        type: 'select',
        required: true,
        options: YOUTH_SPENDING_CATEGORY_OPTIONS
      },
      {
        id: 'youthWeeklySpendingAmount',
        label: 'About how much do you spend in a typical week?',
        type: 'number',
        required: true,
        min: 0,
        step: 1,
        placeholder: 'e.g. 40'
      },
      {
        id: 'youthPaysRecurringExpenses',
        label: 'Do you pay for any of your own recurring expenses (like a phone bill or subscriptions)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I cover recurring expenses'
      },
      {
        id: 'youthRanOutOfMoney',
        label: 'Have you ever run out of money before your next allowance or paycheck?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I’ve run out before'
      },
      {
        id: 'youthSpendingApproach',
        label: 'Do you plan your spending or just buy as needed?',
        type: 'select',
        required: true,
        options: YOUTH_SPENDING_APPROACH_OPTIONS
      }
    ]
  },
  {
    id: 'youth-management',
    title: 'Money management & behavior',
    description: 'Capture the habits that shape your decisions.',
    shouldDisplay: showWhenAgeBetween(3, 17),
    ageCopy: {
      teen: {
        description: 'Help us understand how you manage and share money day to day.'
      }
    },
    fields: [
      {
        id: 'youthTracksSpending',
        label: 'Do you track your spending or check where your money goes?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I keep track of spending'
      },
      {
        id: 'youthHasEmergencyBuffer',
        label: 'Do you keep some money set aside for emergencies or unexpected expenses?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I keep an emergency cushion'
      },
      {
        id: 'youthGetsGuardianHelp',
        label: 'Do your parents or guardians help you manage your money?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I get help from family or guardians'
      },
      {
        id: 'youthSharesMoneyWithOthers',
        label: 'Have you ever shared or loaned money with friends or family?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have shared or loaned money'
      },
      {
        id: 'youthMoneyConfidence',
        label: 'Do you feel confident managing your own money right now?',
        type: 'select',
        required: true,
        options: YOUTH_CONFIDENCE_LEVEL_OPTIONS
      }
    ]
  },
  {
    id: 'youngAdult-income',
    title: 'Income & employment snapshot',
    description: 'Size up how money comes in while you’re building momentum.',
    shouldDisplay: showWhenAgeBetween(18, 24),
    fields: [
      {
        id: 'youngAdultHasJob',
        label: 'Do you currently have a job or consistent source of income?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a steady income source'
      },
      {
        id: 'youngAdultPrimaryIncomeSource',
        label: 'What is your primary income source?',
        type: 'select',
        required: true,
        options: YOUNG_ADULT_INCOME_SOURCE_OPTIONS
      },
      {
        id: 'youngAdultMonthlyIncomeAfterTax',
        label: 'About how much do you earn in a typical month (after taxes)?',
        type: 'number',
        required: true,
        min: 0,
        step: 50,
        placeholder: 'e.g. 2500'
      },
      {
        id: 'youngAdultIncomeStability',
        label: 'How stable is your income?',
        type: 'select',
        required: true,
        options: YOUNG_ADULT_INCOME_STABILITY_OPTIONS
      },
      {
        id: 'youngAdultMultipleIncomeStreams',
        label: 'Do you have more than one source of income (side jobs, gigs, etc.)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have multiple income streams'
      }
    ]
  },
  {
    id: 'youngAdult-banking',
    title: 'Banking & credit access',
    description: 'Understand how you access cash and credit tools.',
    shouldDisplay: showWhenAgeBetween(18, 24),
    fields: [
      {
        id: 'youngAdultDualAccounts',
        label: 'Do you have both a checking and savings account?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have both accounts'
      },
      {
        id: 'youngAdultHasCreditCard',
        label: 'Do you have a credit card in your name?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a credit card'
      },
      {
        id: 'youngAdultMissedPayment',
        label: 'Have you ever missed a credit card or loan payment?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have missed a payment before'
      },
      {
        id: 'youngAdultUsesBudgetApps',
        label: 'Do you use financial or budgeting apps to track your accounts?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I use finance or budgeting apps'
      },
      {
        id: 'youngAdultBalanceCheckFrequency',
        label: 'How often do you check your account balances or transactions?',
        type: 'select',
        required: true,
        options: BALANCE_CHECK_FREQUENCY_OPTIONS
      }
    ]
  },
  {
    id: 'youngAdult-saving',
    title: 'Saving & investing habits',
    description: 'Capture how you’re building reserves and growing money.',
    shouldDisplay: showWhenAgeBetween(18, 24),
    fields: [
      {
        id: 'youngAdultHasSavings',
        label: 'Do you currently have money saved?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have savings right now'
      },
      {
        id: 'youngAdultSavingsAmount',
        label: 'Approximately how much have you saved or invested so far?',
        type: 'number',
        required: true,
        min: 0,
        step: 50,
        placeholder: 'e.g. 3500'
      },
      {
        id: 'youngAdultSavingsContributionFrequency',
        label: 'How often do you add to your savings or investment accounts?',
        type: 'select',
        required: true,
        options: SAVINGS_CONTRIBUTION_CADENCE_OPTIONS
      },
      {
        id: 'youngAdultHasEmergencyFund',
        label: 'Do you have an emergency fund (money set aside for unexpected expenses)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have an emergency fund'
      },
      {
        id: 'youngAdultInvestsInAssets',
        label: 'Are you investing in any assets (stocks, ETFs, crypto, etc.)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I invest in assets'
      }
    ]
  },
  {
    id: 'youngAdult-expenses',
    title: 'Expenses & debt load',
    description: 'Map the outflows and obligations you manage today.',
    shouldDisplay: showWhenAgeBetween(18, 24),
    fields: [
      {
        id: 'youngAdultMainExpenseCategory',
        label: 'What are your main monthly expenses?',
        type: 'select',
        required: true,
        options: EXPENSE_CATEGORY_OPTIONS
      },
      {
        id: 'youngAdultMonthlySpending',
        label: 'About how much do you spend per month, on average?',
        type: 'number',
        required: true,
        min: 0,
        step: 50,
        placeholder: 'e.g. 1800'
      },
      {
        id: 'youngAdultPaysRecurringBills',
        label: 'Do you pay any recurring bills (rent, utilities, car, phone, etc.) on your own?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I pay recurring bills myself'
      },
      {
        id: 'youngAdultHasDebt',
        label: 'Do you currently have any debt (student loans, credit card balance, car loan)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I currently have debt'
      },
      {
        id: 'youngAdultStruggledWithBills',
        label: 'Have you ever struggled to pay bills or made a late payment?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have struggled with timely payments'
      }
    ]
  },
  {
    id: 'youngAdult-management',
    title: 'Money management & behavior',
    description: 'Understand how you plan, track, and feel about money decisions.',
    shouldDisplay: showWhenAgeBetween(18, 24),
    fields: [
      {
        id: 'youngAdultUsesBudget',
        label: 'Do you follow a budget or spending plan each month?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I follow a budget each month'
      },
      {
        id: 'youngAdultTrackingHabit',
        label: 'How closely do you track where your money goes?',
        type: 'select',
        required: true,
        options: TRACKING_INTENSITY_OPTIONS
      },
      {
        id: 'youngAdultHasLeftoverMoney',
        label: 'Do you usually have money left over at the end of each month?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I usually end the month with money left over'
      },
      {
        id: 'youngAdultSetsFinancialGoals',
        label: 'Do you set specific short- or long-term financial goals?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I actively set financial goals'
      },
      {
        id: 'youngAdultFinancialConfidence',
        label: 'Do you feel confident managing your finances without help?',
        type: 'select',
        required: true,
        options: YOUNG_ADULT_CONFIDENCE_OPTIONS
      }
    ]
  },
  {
    id: 'earlyCareer-income',
    title: 'Income & employment depth',
    description: 'Detail the maturity of your income engine.',
    shouldDisplay: showWhenAgeBetween(25, 34),
    fields: [
      {
        id: 'earlyCareerHasFullTimeIncome',
        label: 'Do you currently have a full-time job or steady income source?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a steady income source'
      },
      {
        id: 'earlyCareerMonthlyIncomeAfterTax',
        label: 'What is your approximate monthly income (after taxes)?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 4200'
      },
      {
        id: 'earlyCareerMultipleIncomeStreams',
        label: 'Do you have multiple income streams (side jobs, freelance, investments)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have multiple income streams'
      },
      {
        id: 'earlyCareerIncomeStability',
        label: 'How stable is your income month-to-month?',
        type: 'select',
        required: true,
        options: EARLY_CAREER_INCOME_STABILITY_OPTIONS
      },
      {
        id: 'earlyCareerIncomeGrowthExpectation',
        label: 'Do you expect your income to increase within the next year?',
        type: 'select',
        required: true,
        options: INCOME_GROWTH_EXPECTATION_OPTIONS
      }
    ]
  },
  {
    id: 'earlyCareer-banking',
    title: 'Banking & credit access',
    description: 'Outline the tools you use to move money and build credit.',
    shouldDisplay: showWhenAgeBetween(25, 34),
    fields: [
      {
        id: 'earlyCareerDualAccounts',
        label: 'Do you have both a checking and savings account?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have both accounts'
      },
      {
        id: 'earlyCareerHasCreditCard',
        label: 'Do you have at least one active credit card?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have an active credit card'
      },
      {
        id: 'earlyCareerCreditCardBalance',
        label: 'What’s your typical credit card balance month-to-month?',
        type: 'select',
        required: true,
        options: CREDIT_CARD_BALANCE_OPTIONS
      },
      {
        id: 'earlyCareerPaysBalanceInFull',
        label: 'Do you regularly pay off your credit card balance in full?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I pay it off in full'
      },
      {
        id: 'earlyCareerMonitorsCredit',
        label: 'Do you monitor your credit score or use a credit-tracking app?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I actively monitor my credit'
      }
    ]
  },
  {
    id: 'earlyCareer-saving',
    title: 'Saving & investing habits',
    description: 'Capture the buffers and long-term bets you’re building.',
    shouldDisplay: showWhenAgeBetween(25, 34),
    fields: [
      {
        id: 'earlyCareerHasSavings',
        label: 'Do you currently have money saved or invested?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have money saved or invested'
      },
      {
        id: 'earlyCareerSavingsAmount',
        label: 'About how much do you have saved across all accounts?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 15000'
      },
      {
        id: 'earlyCareerSavingsContributionFrequency',
        label: 'How often do you contribute to savings or investments?',
        type: 'select',
        required: true,
        options: SAVINGS_CONTRIBUTION_CADENCE_OPTIONS
      },
      {
        id: 'earlyCareerRetirementContributor',
        label: 'Do you contribute to a retirement account (401(k), IRA, etc.)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I contribute to retirement accounts'
      },
      {
        id: 'earlyCareerEmergencyFundThreeMonths',
        label: 'Do you have an emergency fund covering at least 3 months of expenses?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have 3+ months covered'
      }
    ]
  },
  {
    id: 'earlyCareer-expenses',
    title: 'Expenses & debt profile',
    description: 'Summarize your outflows and obligations.',
    shouldDisplay: showWhenAgeBetween(25, 34),
    fields: [
      {
        id: 'earlyCareerMainExpenseCategory',
        label: 'What are your main monthly expenses?',
        type: 'select',
        required: true,
        options: EXPENSE_CATEGORY_OPTIONS
      },
      {
        id: 'earlyCareerMonthlySpending',
        label: 'About how much do you spend per month, on average?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 3200'
      },
      {
        id: 'earlyCareerHasDebt',
        label: 'Do you currently have any outstanding debt (loans, mortgage, credit cards)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have outstanding debt'
      },
      {
        id: 'earlyCareerBillPaymentReliability',
        label: 'How would you rate your ability to manage monthly bills and debt payments?',
        type: 'select',
        required: true,
        options: BILL_PAYMENT_RELIABILITY_OPTIONS
      },
      {
        id: 'earlyCareerTracksFixedVsDiscretionary',
        label: 'Do you actively track your fixed vs. discretionary expenses?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I separate fixed and discretionary costs'
      }
    ]
  },
  {
    id: 'earlyCareer-planning',
    title: 'Financial planning & behavior',
    description: 'Show how you steer your money decisions.',
    shouldDisplay: showWhenAgeBetween(25, 34),
    fields: [
      {
        id: 'earlyCareerUsesBudget',
        label: 'Do you follow a monthly budget or spending plan?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I follow a monthly budget'
      },
      {
        id: 'earlyCareerGoalReviewCadence',
        label: 'How often do you review or adjust your financial goals?',
        type: 'select',
        required: true,
        options: GOAL_REVIEW_FREQUENCY_OPTIONS
      },
      {
        id: 'earlyCareerSavingForMajorPurchase',
        label: 'Are you saving or planning for any major purchases?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I’m saving for a major purchase'
      },
      {
        id: 'earlyCareerHasInsuranceCoverage',
        label: 'Do you have any type of insurance coverage (health, renters, life, disability)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have active insurance coverage'
      },
      {
        id: 'earlyCareerFinancialConfidence',
        label: 'Do you feel confident about your overall financial stability right now?',
        type: 'select',
        required: true,
        options: EARLY_CAREER_CONFIDENCE_OPTIONS
      }
    ]
  },
  {
    id: 'midCareer-income',
    title: 'Income & employment pulse',
    description: 'Check the consistency and outlook of your earnings.',
    shouldDisplay: showWhenAgeBetween(35, 44),
    fields: [
      {
        id: 'midCareerHasSteadyIncome',
        label: 'Do you currently have a full-time job or steady income source?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have a steady income source'
      },
      {
        id: 'midCareerMonthlyIncomeAfterTax',
        label: 'What is your approximate monthly income (after taxes)?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 6500'
      },
      {
        id: 'midCareerMultipleIncomeStreams',
        label: 'Do you have multiple income streams (side jobs, investments, rental income)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have more than one income stream'
      },
      {
        id: 'midCareerIncomeStability',
        label: 'How stable is your income month-to-month?',
        type: 'select',
        required: true,
        options: INCOME_STABILITY_OPTIONS
      },
      {
        id: 'midCareerIncomeChangeExpectation',
        label: 'Do you expect your income to change significantly in the next year?',
        type: 'select',
        required: true,
        options: INCOME_GROWTH_EXPECTATION_OPTIONS
      }
    ]
  },
  {
    id: 'midCareer-banking',
    title: 'Banking & credit access',
    description: 'Outline how you manage cash flow and credit tools.',
    shouldDisplay: showWhenAgeBetween(35, 44),
    fields: [
      {
        id: 'midCareerHasDualAccounts',
        label: 'Do you have both a checking and savings account?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have both account types'
      },
      {
        id: 'midCareerCreditCardBalanceBehavior',
        label: 'Do you have any credit cards, and do you carry a balance?',
        type: 'select',
        required: true,
        options: CREDIT_CARD_BEHAVIOR_OPTIONS
      },
      {
        id: 'midCareerAccountMonitoringFrequency',
        label: 'How often do you monitor your accounts and transactions?',
        type: 'select',
        required: true,
        options: BALANCE_CHECK_FREQUENCY_OPTIONS
      },
      {
        id: 'midCareerTracksCreditScore',
        label: 'Do you track your credit score regularly?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I regularly check my credit score'
      },
      {
        id: 'midCareerHasInvestmentAccounts',
        label: 'Do you have access to other financial accounts, like investment or retirement accounts?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have other financial accounts'
      }
    ]
  },
  {
    id: 'midCareer-saving',
    title: 'Saving & investing habits',
    description: 'Document the cushions and contributions backing your future.',
    shouldDisplay: showWhenAgeBetween(35, 44),
    fields: [
      {
        id: 'midCareerHasSavings',
        label: 'Do you currently have money saved or invested?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have money saved or invested'
      },
      {
        id: 'midCareerSavingsAmount',
        label: 'Approximately how much do you have saved across all accounts (cash, investments, retirement)?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 45000'
      },
      {
        id: 'midCareerSavingsContributionCadence',
        label: 'How often do you contribute to savings or investments?',
        type: 'select',
        required: true,
        options: SAVINGS_CONTRIBUTION_CADENCE_OPTIONS
      },
      {
        id: 'midCareerRetirementContributions',
        label: 'Do you contribute to retirement accounts (401(k), IRA, pensions)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I contribute to retirement accounts'
      },
      {
        id: 'midCareerEmergencyFundCoverage',
        label: 'Do you have an emergency fund covering at least 3–6 months of expenses?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have 3–6 months of expenses covered'
      }
    ]
  },
  {
    id: 'midCareer-expenses',
    title: 'Expenses & debt profile',
    description: 'Summarize your spending load and obligations.',
    shouldDisplay: showWhenAgeBetween(35, 44),
    fields: [
      {
        id: 'midCareerPrimaryExpenseCategory',
        label: 'What are your main monthly expenses?',
        type: 'select',
        required: true,
        options: EXPENSE_CATEGORY_OPTIONS
      },
      {
        id: 'midCareerMonthlySpending',
        label: 'About how much do you spend per month, on average?',
        type: 'number',
        required: true,
        min: 0,
        step: 100,
        placeholder: 'e.g. 5200'
      },
      {
        id: 'midCareerHasDebt',
        label: 'Do you have any outstanding debt (mortgage, student loans, car loans, credit cards)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have outstanding debt'
      },
      {
        id: 'midCareerDebtStressLevel',
        label: 'How manageable are your monthly bills and debt payments?',
        type: 'select',
        required: true,
        options: DEBT_STRESS_LEVEL_OPTIONS
      },
      {
        id: 'midCareerTracksExpenses',
        label: 'Do you actively track fixed vs. discretionary expenses?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I track fixed vs. discretionary spending'
      }
    ]
  },
  {
    id: 'midCareer-planning',
    title: 'Financial planning & behavior',
    description: 'Capture how you plan, protect, and project your money.',
    shouldDisplay: showWhenAgeBetween(35, 44),
    fields: [
      {
        id: 'midCareerUsesBudget',
        label: 'Do you follow a monthly budget or spending plan?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I follow a monthly budget'
      },
      {
        id: 'midCareerGoalReviewCadence',
        label: 'How often do you review or update your financial goals?',
        type: 'select',
        required: true,
        options: GOAL_REVIEW_FREQUENCY_OPTIONS
      },
      {
        id: 'midCareerSavingForLongTermGoals',
        label: 'Are you saving or planning for major long-term goals (children’s education, home upgrades, business)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I’m saving toward long-term goals'
      },
      {
        id: 'midCareerHasInsuranceCoverage',
        label: 'Do you have insurance coverage (health, life, disability, home, auto)?',
        type: 'toggle',
        required: true,
        toggleText: 'Yes, I have insurance coverage'
      },
      {
        id: 'midCareerFinancialConfidence',
        label: 'Do you feel confident about your overall financial stability and future?',
        type: 'select',
        required: true,
        options: FINANCIAL_CONFIDENCE_OUTLOOK_OPTIONS
      }
    ]
  },
  {
    id: 'stability',
    title: 'Stability signals',
    description: 'Capture the market forces and volatility around your income.',
    ageCopy: {
      student: {
        description: 'Show us how solid your target field and current paid work feel right now.'
      },
      adult: {
        description: 'Capture the external risks that could shake up your pay.'
      }
    },
    fields: [
      {
        id: 'industryRisk',
        label: 'How stable is your industry right now?',
        type: 'select',
        required: true,
        options: INDUSTRY_RISK_OPTIONS,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Think about hiring freezes, layoffs, and news sentiment in your field.',
        ageCopy: {
          student: {
            label: 'How steady is the field you’re targeting?',
            hint: 'Use the outlook for the industry you plan to enter or currently intern in.'
          },
          adult: {
            label: 'Current industry outlook',
            hint: 'Choose the option that best reflects hiring trends in your sector.'
          }
        }
      },
      {
        id: 'regionalUnemploymentRate',
        label: 'Where do you primarily work?',
        type: 'unemployment',
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        hint: 'Pick your state and metro to benchmark the local job market.',
        info: 'Local unemployment acts as a proxy for how replaceable income is.',
        ageCopy: {
          student: {
            label: 'Where do you mostly study or work?',
            hint: 'Choose the metro that fits your campus or main job search area.'
          },
          adult: {
            label: 'Primary work location',
            hint: 'Select the region that reflects your current role.'
          }
        }
      },
      {
        id: 'layoffHistory',
        label: 'Layoffs you have faced in the last 5 years',
        type: 'number',
        min: 0,
        max: 10,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        hint: 'Use zero if none.',
        info: 'Past layoffs increase volatility in the score.'
      },
      {
        id: 'bonusReliability',
        label: 'Variable pay confidence',
        type: 'select',
        required: true,
        options: BONUS_RELIABILITY_OPTIONS,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Tell us how dependable bonuses, commissions, or tips feel.',
        ageCopy: {
          student: {
            label: 'How steady are bonuses or extra pay?',
            hint: 'Include tips, commissions, or stipend boosts that supplement your base pay.'
          },
          adult: {
            label: 'How reliable is variable pay?',
            hint: 'Commissions, bonuses, or tips that you count on each cycle.'
          }
        }
      },
      {
        id: 'upcomingContractRenewal',
        label: 'Contract renewal coming in the next 6 months?',
        type: 'toggle',
        toggleText: 'Yes, a renewal decision is coming up',
        shouldDisplay: showWhenInAgeBands('earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Renewals introduce a binary risk—tell us if one is looming.'
      }
    ]
  },
  {
    id: 'resilience',
    title: 'Resilience & buffer',
    description: 'Tell us about the savings and protection that backstop your income.',
    ageCopy: {
      student: {
        description: 'Highlight the savings or support that would keep you afloat between paychecks.'
      },
      adult: {
        description: 'Detail the cash and coverage that protect your income stream.'
      }
    },
    fields: [
      {
        id: 'plannedMajorExpense',
        label: 'Major expense planned in the next 6 months?',
        type: 'toggle',
        toggleText: 'Yes, funds are earmarked for a big purchase',
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        ageCopy: {
          student: {
            label: 'Big expense coming up this term?',
            toggleText: 'Yes, I’m planning a large education or living expense soon'
          },
          adult: {
            label: 'Major expense planned in the next 6 months?',
            toggleText: 'Yes, I have a significant purchase or life event coming up'
          }
        }
      },
      {
        id: 'savingsRateOverride',
        label: 'Real savings rate (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        shouldDisplay: showWhenInAgeBands('earlyCareer', 'midCareer', 'lateCareer'),
        hint: 'If synced accounts miss automatic transfers, plug in your true monthly rate.'
      },
      {
        id: 'incomeProtectionCoverage',
        label: 'Income protection coverage',
        type: 'coverage',
        shouldDisplay: showWhenInAgeBands('earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Disability insurance or policies that replace income if you can’t work.'
      },
      {
        id: 'emergencyFundMonths',
        label: 'Emergency fund coverage (months)',
        type: 'number',
        min: 0,
        max: 48,
        step: 0.1,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        info: 'How many months of essentials could savings or cash cover?',
        ageCopy: {
          student: {
            label: 'How many months of expenses can your cushion cover?',
            hint: 'Count savings, family support, or stipends you could tap if income paused.'
          },
          adult: {
            label: 'Emergency fund coverage (months)',
            hint: 'Use your most realistic estimate of essential expenses.'
          }
        }
      }
    ]
  },
  {
    id: 'momentum',
    title: 'Momentum & growth',
    description: 'Show how quickly your earning power is rising.',
    ageCopy: {
      student: {
        description: 'Capture the traction you’re building toward your first big offer.'
      },
      adult: {
        description: 'Show the signals that your earning power is accelerating.'
      }
    },
    fields: [
      {
        id: 'promotionPipeline',
        label: 'Chance of a raise / promotion in next 12 months (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Your best estimate based on feedback, pipeline, or upcoming graduation.',
        ageCopy: {
          student: {
            label: 'Chance you’ll land your next offer in the next 12 months (%)',
            hint: 'Estimate the odds of securing a job, internship, or raise as you transition.'
          },
          adult: {
            label: 'Chance of a raise or promotion in the next year (%)',
            hint: 'Ground it in recent reviews or pipeline conversations.'
          }
        }
      },
      {
        id: 'upskillingProgress',
        label: 'Progress on upskilling goals (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        clarification: '0% means “haven’t started,” 50% means “midway,” and 100% means “complete.”',
        info: 'Signals momentum—active learning cushions future income risk.',
        ageCopy: {
          student: {
            label: 'Progress on your skill-building this term (%)',
            hint: 'Courses, certifications, or projects tied to your next role.'
          },
          adult: {
            label: 'Progress on upskilling goals (%)',
            hint: 'Include certifications, bootcamps, or skill sprints you planned.'
          }
        }
      },
      {
        id: 'skillDemand',
        label: 'Market demand for your skills',
        type: 'select',
        required: true,
        options: SKILL_DEMAND_OPTIONS,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        info: 'Gauge recruiter activity, job postings, and comp trends.',
        ageCopy: {
          student: {
            label: 'How hot is the field you’re targeting?',
            hint: 'Think about internship listings, recruiter outreach, or mentor feedback.'
          },
          adult: {
            label: 'Market demand for your skills',
            hint: 'Use what you see in offers, inbound leads, and job postings.'
          }
        }
      },
      {
        id: 'roleSatisfaction',
        label: 'Role satisfaction (%)',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        shouldDisplay: showWhenInAgeBands('student', 'earlyCareer', 'midCareer', 'lateCareer'),
        hint: 'Gut check on how energized you feel by your current path.',
        ageCopy: {
          student: {
            label: 'How energized do you feel about your current role or track? (%)',
            hint: 'Combine how you feel about classes, internships, and near-term path.'
          },
          adult: {
            label: 'Role satisfaction (%)',
            hint: 'Lower satisfaction can trigger churn and income swings.'
          }
        }
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

const composeVisibilityPredicate = (stepPredicate, fieldPredicate) => {
  const hasStep = typeof stepPredicate === 'function';
  const hasField = typeof fieldPredicate === 'function';

  if (!hasStep && !hasField) {
    return null;
  }

  if (hasStep && hasField) {
    return (profile) => Boolean(stepPredicate(profile)) && Boolean(fieldPredicate(profile));
  }

  if (hasStep) {
    return (profile) => Boolean(stepPredicate(profile));
  }

  return (profile) => Boolean(fieldPredicate(profile));
};

export const FIELD_VISIBILITY_RULES = Object.freeze(
  STEPS.reduce((acc, step) => {
    step.fields.forEach((field) => {
      if (acc[field.id]) return;
      acc[field.id] = composeVisibilityPredicate(step.shouldDisplay, field.shouldDisplay);
    });
    return acc;
  }, {})
);
