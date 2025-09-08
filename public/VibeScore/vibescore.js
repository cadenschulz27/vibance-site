/**
 * @file VibeScore/vibescore.js
 * @description The main orchestrator for the VibeScore component.
 * This script initializes the component, fetches user data, processes it
 * through the calculation and insight modules, and renders the UI.
 */

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { VibeScoreCalculations } from './calculations.js';
import { VibeScoreInsights } from './insights.js';
import { VibeScoreUI } from './ui.js';

/**
 * Defines the categories that contribute to the VibeScore.
 * Each key maps to the corresponding data key in the user's Firestore document
 * and the function names within the calculation and insight modules.
 */
const FINANCIAL_CATEGORIES = [
    'Savings', 'Budgeting', 'Income', 'Cash Flow', 'Credit Score',
    'Investing', 'Retirement', 'Debt', 'Net Worth', 'Emergency Fund'
];

/**
 * Fetches the user's financial data from Firestore.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<object>} A promise that resolves to the user's data object.
 */
async function fetchUserData(uid) {
    if (!uid) {
        throw new Error("User ID is required to fetch data.");
    }
    try {
        const userDocRef = doc(db, "users", uid);
        const userDoc = await getDoc(userDocRef);
        return userDoc.exists() ? userDoc.data() : {};
    } catch (error) {
        console.error("Error fetching user data from Firestore:", error);
        return {}; // Return an empty object on error to prevent crashes
    }
}

/**
 * Processes raw user data into a structured format for the UI.
 * @param {object} userData - The raw data from Firestore.
 * @returns {Array<object>} An array of objects, each representing a financial category.
 */
function processFinancialData(userData) {
    return FINANCIAL_CATEGORIES.map(name => {
        // Find the corresponding calculation and insight functions
        const calculator = VibeScoreCalculations[name];
        const insightGenerator = VibeScoreInsights[name];
        
        // Convert the category name to the Firestore data key (e.g., 'Credit Score' -> 'credit')
        const dataKey = name.charAt(0).toLowerCase() + name.slice(1).replace(/\s+/g, '');
        const data = userData[dataKey] || {};
        
        const hasData = Object.keys(data).length > 0;
        const score = hasData && calculator ? calculator(data) : 0;
        const insight = hasData && insightGenerator ? insightGenerator(data, score) : VibeScoreInsights.default;

        return { name, score, insight, hasData };
    });
}

/**
 * Calculates the final, overall VibeScore.
 * @param {Array<object>} processedData - The array of processed financial data.
 * @returns {number} The final, rounded VibeScore.
 */
function calculateOverallVibeScore(processedData) {
    const itemsWithData = processedData.filter(item => item.hasData);
    if (itemsWithData.length === 0) {
        return 0;
    }
    const totalScore = itemsWithData.reduce((acc, item) => acc + item.score, 0);
    return Math.round(totalScore / itemsWithData.length);
}

/**
 * The main initialization function for the VibeScore component.
 */
async function initVibeScore() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // 1. Fetch Data
            const userData = await fetchUserData(user.uid);

            // 2. Process Data: Calculate scores and generate insights
            const processedData = processFinancialData(userData);

            // 3. Calculate Final Score
            const finalVibeScore = calculateOverallVibeScore(processedData);
            
            // 4. Initialize UI: Create HUD bubbles and insight panel
            VibeScoreUI.init(processedData);
            
            // 5. Update Main Gauge: Animate the central score display
            VibeScoreUI.updateMainGauge(finalVibeScore);
        } else {
            // Handle logged-out state if necessary, e.g., show a placeholder.
            console.log("VibeScore: No user is signed in.");
        }
    });
}

// --- Entry Point ---
// Wait for the DOM to be fully loaded before initializing the component.
document.addEventListener('DOMContentLoaded', initVibeScore);
