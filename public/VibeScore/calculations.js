/**
 * @file VibeScore/calculations.js
 * @description Advanced calculation module for the VibeScore component.
 * This file contains all the mathematical logic for scoring different aspects of a user's financial health.
 * Each function is designed to be pure, taking in a data object and returning a score from 0 to 100.
 */

// --- UTILITY FUNCTIONS ---

/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} value - The number to clamp.
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} The clamped number.
 */
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(value, max));

/**
 * Safely retrieves a numeric value from a data object.
 * @param {object} data - The data object to query.
 * @param {string} key - The key of the value to retrieve.
 * @returns {number} The value, or 0 if it's not a valid number.
 */
const getNumeric = (data, key) => {
    const value = data?.[key];
    return typeof value === 'number' && !isNaN(value) ? value : 0;
};

// --- CORE CALCULATION FUNCTIONS ---

/**
 * Calculates the Income Score based on amount, stability, and growth potential.
 * - 50% of score from total monthly income amount.
 * - 25% from income stability (e.g., salaried vs. freelance).
 * - 25% from growth potential (e.g., career field).
 * @param {object} data - The user's income data.
 * @returns {number} The calculated Income Score (0-100).
 */
const calculateIncomeScore = (data = {}) => {
    const totalIncome = getNumeric(data, 'primaryIncome') + getNumeric(data, 'additionalIncome');
    
    // Score based on income brackets
    let amountScore;
    if (totalIncome >= 7000) amountScore = 50;
    else if (totalIncome >= 5000) amountScore = 40;
    else if (totalIncome >= 3000) amountScore = 30;
    else if (totalIncome > 0) amountScore = 15;
    else amountScore = 0;

    // Score based on stability
    const stabilityMap = { high: 25, medium: 15, low: 5 };
    const stabilityScore = stabilityMap[data.stability] || 5;

    // Score based on growth potential
    const growthMap = { high: 25, medium: 15, low: 5 };
    const growthScore = growthMap[data.growthPotential] || 5;

    const totalScore = amountScore + stabilityScore + growthScore;
    return clamp(totalScore);
};

/**
 * Calculates the Savings Score based on savings rate and total liquid savings.
 * - 70% of score from the monthly savings rate.
 * - 30% from the total amount of liquid savings as a buffer.
 * @param {object} data - The user's savings data.
 * @returns {number} The calculated Savings Score (0-100).
 */
const calculateSavingsScore = (data = {}) => {
    // A 20% savings rate is a common healthy target. We'll give it a high score.
    const rateScore = (getNumeric(data, 'monthlySavingsRate') / 20) * 70;
    
    // Score based on having a buffer. $25,000 is a strong buffer for many.
    const bufferScore = (getNumeric(data, 'totalLiquidSavings') / 25000) * 30;

    const totalScore = rateScore + bufferScore;
    return clamp(totalScore);
};

/**
 * Calculates the Budgeting Score based on surplus and adherence.
 * A positive surplus is the most important factor.
 * @param {object} data - The user's budgeting data.
 * @returns {number} The calculated Budgeting Score (0-100).
 */
const calculateBudgetingScore = (data = {}) => {
    const income = getNumeric(data, 'averageMonthlyIncome');
    const spending = getNumeric(data, 'averageMonthlySpending');
    
    if (income === 0) return 10; // Low score if no income is logged
    
    const surplus = income - spending;
    // Score based on the percentage of income saved (surplus)
    const surplusRatio = surplus / income;
    // A 20% surplus is excellent, mapping to 80 points.
    let surplusScore = (surplusRatio / 0.20) * 80;

    // Add bonus points for budget adherence
    const adherenceMap = { strict: 20, flexible: 10, loose: 0 };
    const adherenceScore = adherenceMap[data.budgetAdherence] || 0;

    const totalScore = surplusScore + adherenceScore;
    return clamp(totalScore);
};

/**
 * Calculates the Cash Flow Score directly from the monthly surplus.
 * @param {object} data - The user's cash flow data.
 * @returns {number} The calculated Cash Flow Score (0-100).
 */
const calculateCashFlowScore = (data = {}) => {
    const surplus = getNumeric(data, 'averageMonthlySurplus');
    // A surplus of $2,000/mo represents very strong cash flow.
    const score = (surplus / 2000) * 100;
    return clamp(score);
};

/**
 * Calculates the Credit Score.
 * The raw score value is the primary driver.
 * @param {object} data - The user's credit data.
 * @returns {number} The calculated Credit Score (0-100).
 */
const calculateCreditScore = (data = {}) => {
    const scoreValue = getNumeric(data, 'scoreValue');
    // Map the 300-850 FICO range to a 0-100 scale.
    let score = ((scoreValue - 300) / (850 - 300)) * 100;

    // Apply adjustments
    if (data.paymentHistory === 'excellent') score += 5;
    if (getNumeric(data, 'creditUtilization') > 30) score -= 15;

    return clamp(score);
};

/**
 * Calculates the Investing Score.
 * Based on total amount invested and monthly contributions.
 * @param {object} data - The user's investing data.
 * @returns {number} The calculated Investing Score (0-100).
 */
const calculateInvestingScore = (data = {}) => {
    // Having $50,000 invested is a significant milestone.
    const totalInvestedScore = (getNumeric(data, 'totalInvested') / 50000) * 50;
    
    // Contributing $1,000/mo is a strong, consistent habit.
    const contributionScore = (getNumeric(data, 'monthlyContribution') / 1000) * 50;

    let totalScore = totalInvestedScore + contributionScore;
    
    // Bonus for diversity
    if (data.portfolioDiversity === 'high') totalScore += 10;
    
    return clamp(totalScore);
};

/**
 * Calculates the Retirement Score.
 * Based on total retirement savings and contribution percentage.
 * @param {object} data - The user's retirement data.
 * @returns {number} The calculated Retirement Score (0-100).
 */
const calculateRetirementScore = (data = {}) => {
    // $250,000 is a great milestone for many stages of life.
    const totalValueScore = (getNumeric(data, 'retirementAccountValue') / 250000) * 60;
    
    // A 15% contribution rate is a strong target.
    const contributionScore = (getNumeric(data, 'monthlyContributionPercent') / 15) * 40;

    let totalScore = totalValueScore + contributionScore;
    
    // Bonus if they feel they are on track
    if (data.onTrackForGoal) totalScore += 10;
    
    return clamp(totalScore);
};

/**
 * Calculates the Debt Score.
 * Primarily based on Debt-to-Income (DTI) ratio.
 * @param {object} data - The user's debt data.
 * @returns {number} The calculated Debt Score (0-100).
 */
const calculateDebtScore = (data = {}) => {
    const dti = getNumeric(data, 'debtToIncomeRatio');
    // A lower DTI is better. A DTI of 50% is high, mapping to a score of 0.
    // A DTI of 0% is perfect, mapping to a score of 100.
    let score = 100 - (dti * 2);
    
    // Penalty for high-interest debt (e.g., credit cards)
    if (data.hasHighInterestDebt) score -= 25;
    
    return clamp(score);
};

/**
 * Calculates the Net Worth Score.
 * Net worth is a long-term indicator of financial health.
 * @param {object} data - The user's net worth data.
 * @returns {number} The calculated Net Worth Score (0-100).
 */
const calculateNetWorthScore = (data = {}) => {
    const netWorth = getNumeric(data, 'totalAssets') - getNumeric(data, 'totalLiabilities');
    // A net worth of $250,000 represents a strong financial position.
    const score = (netWorth / 250000) * 100;
    return clamp(score);
};

/**
 * Calculates the Emergency Fund Score.
 * Based on how many months of expenses are saved versus the goal.
 * @param {object} data - The user's emergency fund data.
 * @returns {number} The calculated Emergency Fund Score (0-100).
 */
const calculateEmergencyFundScore = (data = {}) => {
    const currentMonths = getNumeric(data, 'currentMonths');
    const goalMonths = getNumeric(data, 'goalMonths') || 6; // Default to a 6-month goal
    
    if (goalMonths === 0) return 100; // If goal is 0, they've met it.
    
    const score = (currentMonths / goalMonths) * 100;
    return clamp(score);
};


/**
 * Main export object containing all calculation functions.
 * This allows other modules to import and use them.
 */
export const VibeScoreCalculations = {
    'Income': calculateIncomeScore,
    'Savings': calculateSavingsScore,
    'Budgeting': calculateBudgetingScore,
    'Cash Flow': calculateCashFlowScore,
    'Credit Score': calculateCreditScore,
    'Investing': calculateInvestingScore,
    'Retirement': calculateRetirementScore,
    'Debt': calculateDebtScore,
    'Net Worth': calculateNetWorthScore,
    'Emergency Fund': calculateEmergencyFundScore,
};
