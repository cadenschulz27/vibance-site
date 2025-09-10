/**
 * @file VibeScore/insights.js
 * @description Generates qualitative insights based on calculated financial scores.
 * This module translates numerical scores into actionable, user-friendly advice.
 */

// --- UTILITY FUNCTIONS ---

/**
 * Formats a number as a USD currency string.
 * @param {number} value - The number to format.
 * @returns {string} A string formatted as currency (e.g., "$5,500").
 */
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return '$0';
    }
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};

// --- INSIGHT GENERATION FUNCTIONS ---

const generateIncomeInsight = (data = {}, score = 0) => {
    const totalIncome = (data.primaryIncome || 0) + (data.additionalIncome || 0);
    if (score > 80) return `Exceptional! Your high and stable income of ${formatCurrency(totalIncome)}/mo provides a powerful foundation for your financial goals.`;
    if (score > 60) {
        let insight = `Your income stream of ${formatCurrency(totalIncome)}/mo is solid. `;
        insight += data.growthPotential !== 'high' 
            ? "Focusing on career growth or upskilling could elevate this score even further." 
            : "Your high growth potential is a key strength to leverage.";
        return insight;
    }
    let insight = "This is a key area for growth. ";
    insight += (data.additionalIncome || 0) === 0 
        ? "Exploring additional income streams, even small ones, can significantly increase your financial security." 
        : `Your additional income of ${formatCurrency(data.additionalIncome)}/mo is a great start—keep building on it!`;
    return insight;
};

const generateSavingsInsight = (data = {}, score = 0) => {
    const rate = data.monthlySavingsRate || 0;
    if (score > 80) return `Fantastic work! A savings rate of ${rate}% is exceptional and will accelerate your wealth-building journey.`;
    if (score > 50) return `You're building a great habit. To boost your progress, consider automating savings or increasing your rate to 15-20%.`;
    return `Your savings need attention. A great first step is to aim to save at least 10-15% of your income each month.`;
};

const generateBudgetingInsight = (data = {}, score = 0) => {
    if (score > 80) return `You are a budgeting master. Your spending is well-controlled, leading to a healthy surplus that you can put to work.`;
    if (score > 50) return `Your budget is effective and you're living within your means. Look for small areas to trim spending to further increase your cash flow.`;
    return `Your expenses are high relative to your income. A detailed review of your budget is recommended to identify potential savings.`;
};

const generateCashFlowInsight = (data = {}, score = 0) => {
    const surplus = data.averageMonthlySurplus || 0;
    if (score > 80) return `Excellent cash flow! A monthly surplus of ${formatCurrency(surplus)} gives you incredible financial flexibility and power.`;
    if (score > 50) return `Your cash flow is positive and healthy. This surplus is the engine that will power all of your financial goals.`;
    return `Your monthly cash flow is tight, leaving little room for error. Focus on increasing income or reducing expenses to improve this score.`;
};

const generateCreditInsight = (data = {}, score = 0) => {
    const creditScore = data.scoreValue || 'your';
    if (score > 80) return `Your credit score of ${creditScore} is excellent, unlocking the best financial products and lowest interest rates.`;
    if (score > 60) return `A good credit score of ${creditScore}. To improve it further, focus on keeping your credit utilization below 30%.`;
    return `Your credit score of ${creditScore} needs some work. Focus on making all payments on time and lowering your credit card balances.`;
};

const generateInvestingInsight = (data = {}, score = 0) => {
    if (score > 80) return `You're a savvy investor. Your consistent contributions and diverse portfolio are building significant, long-term wealth.`;
    if (score > 50) return `Your investment journey is well underway. Consider increasing your monthly contributions to maximize the power of compound growth.`;
    return `Investing is the most powerful tool for building wealth. It's a great time to start, even with small, consistent amounts.`;
};

const generateRetirementInsight = (data = {}, score = 0) => {
    if (score > 80) return `Your retirement planning is superb. You are on track for a secure and comfortable future. Keep up the great work!`;
    if (score > 50) return `You are making solid progress on your retirement savings and building a good nest egg for the future.`;
    return `It's crucial to prioritize retirement savings now. Consider opening or increasing contributions to a 401(k) or IRA.`;
};

const generateDebtInsight = (data = {}, score = 0) => {
    if (score > 80) return `You have very little to no debt, putting you in a powerful and flexible financial position.`;
    if (score > 50) return `Your debt is manageable. To improve your score, focus on creating a plan to aggressively pay down any high-interest debt first.`;
    return `Your debt level is high and may be holding you back. Creating a focused repayment plan is a critical next step for your financial health.`;
};

const generateNetWorthInsight = (data = {}, score = 0) => {
    const netWorth = (data.totalAssets || 0) - (data.totalLiabilities || 0);
    if (score > 80) return `Congratulations on building a strong net worth of ${formatCurrency(netWorth)}. Your assets significantly outweigh your liabilities.`;
    if (score > 50) return `You're successfully building a positive net worth. Continue on this path by increasing assets and reducing liabilities.`;
    return `Your net worth is currently low or negative. The best way to improve this is to focus on debt reduction and asset building.`;
};

const generateEmergencyFundInsight = (data = {}, score = 0) => {
    if (score >= 100) return `Fully funded! Your emergency fund provides an excellent safety net, protecting you from unexpected financial shocks.`;
    if (score > 50) return `You're over halfway to your goal! You are building fantastic financial resilience. Keep up the consistent savings.`;
    return `Building an emergency fund is a critical first step. Aim to save 3-6 months of essential living expenses in a high-yield savings account.`;
};

/**
 * A default message for categories where the user has not provided data.
 */
const noDataInsight = "No data entered. To get your score and personalized insights for this category, please update your financial profile.";


/**
 * Main export object containing all insight generation functions.
 */
export const VibeScoreInsights = {
    'Income': generateIncomeInsight,
    'Savings': generateSavingsInsight,
    'Budgeting': generateBudgetingInsight,
    'Cash Flow': generateCashFlowInsight,
    'Credit Score': generateCreditInsight,
    'Investing': generateInvestingInsight,
    'Retirement': generateRetirementInsight,
    'Debt': generateDebtInsight,
    'Net Worth': generateNetWorthInsight,
    'Emergency Fund': generateEmergencyFundInsight,
    'default': noDataInsight,
};
