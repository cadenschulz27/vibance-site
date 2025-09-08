/**
 * @file VibeScore/vibescore.js
 * @description Main controller for the VibeScore component. This script authenticates the user,
 * fetches their financial data, orchestrates the calculations and insights, and initializes the UI.
 */

// --- MODULE IMPORTS ---
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { VibeScoreCalculations } from './calculations.js';
import { VibeScoreInsights } from './insights.js';
import { VibeScoreUI } from './ui.js';

// --- DATA MAPPING ---

/**
 * A map that connects financial category names to their respective calculation functions,
 * insight generation functions, and the key used to access their data in Firestore.
 * This centralized map makes the system easily extensible.
 */
const calculationMap = {
    'Savings': {
        calc: VibeScoreCalculations.calculateSavingsScore,
        gen: VibeScoreInsights.generateSavingsInsight,
        dataKey: 'savings'
    },
    'Budgeting': {
        calc: VibeScoreCalculations.calculateBudgetingScore,
        gen: VibeScoreInsights.generateBudgetingInsight,
        dataKey: 'budgeting'
    },
    'Income': {
        calc: VibeScoreCalculations.calculateIncomeScore,
        gen: VibeScoreInsights.generateIncomeInsight,
        dataKey: 'income'
    },
    'Cash Flow': {
        calc: VibeScoreCalculations.calculateCashFlowScore,
        gen: VibeScoreInsights.generateCashFlowInsight,
        dataKey: 'cashFlow'
    },
    'Credit Score': {
        calc: VibeScoreCalculations.calculateCreditScore,
        gen: VibeScoreInsights.generateCreditInsight,
        dataKey: 'credit'
    },
    'Investing': {
        calc: VibeScoreCalculations.calculateInvestingScore,
        gen: VibeScoreInsights.generateInvestingInsight,
        dataKey: 'investing'
    },
    'Retirement': {
        calc: VibeScoreCalculations.calculateRetirementScore,
        gen: VibeScoreInsights.generateRetirementInsight,
        dataKey: 'retirement'
    },
    'Debt': {
        calc: VibeScoreCalculations.calculateDebtScore,
        gen: VibeScoreInsights.generateDebtInsight,
        dataKey: 'debt'
    },
    'Net Worth': {
        calc: VibeScoreCalculations.calculateNetWorthScore,
        gen: VibeScoreInsights.generateNetWorthInsight,
        dataKey: 'netWorth'
    },
    'Emergency Fund': {
        calc: VibeScoreCalculations.calculateEmergencyFundScore,
        gen: VibeScoreInsights.generateEmergencyFundInsight,
        dataKey: 'emergencyFund'
    }
};


// --- INITIALIZATION LOGIC ---

/**
 * Main function to initialize the VibeScore component.
 * It waits for user authentication, fetches and processes data, then renders the UI.
 */
function initVibeScore() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.exists() ? userDoc.data() : {};

            // Process the raw user data into a structured format for the UI
            const dynamicFinancialData = Object.keys(calculationMap).map(name => {
                const map = calculationMap[name];
                const data = userData[map.dataKey] || {};
                const hasData = Object.keys(data).length > 0;
                const score = hasData ? map.calc(data) : 0;
                const insight = hasData ? map.gen(data, score) : "No data found. Click this bubble to go to your profile and add your information.";
                return { name, score, insight, hasData };
            });

            // Calculate the overall VibeScore
            const itemsWithData = dynamicFinancialData.filter(item => item.hasData);
            const totalScore = itemsWithData.reduce((acc, item) => acc + item.score, 0);
            const userVibeScore = itemsWithData.length > 0 ? Math.round(totalScore / itemsWithData.length) : 0;
            
            // Initialize the UI with the processed data
            VibeScoreUI.init(userVibeScore, dynamicFinancialData);
        }
    });
}


// --- SCRIPT EXECUTION ---

// Start the initialization process once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initVibeScore);

