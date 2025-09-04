// FILE: public/dashboard/dashboard.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: LOGIC FOR CALCULATING INCOME SCORE & INSIGHT ---

    /**
     * Calculates an income score based on various factors.
     * @param {object} incomeData - The user's income data from Firestore.
     * @returns {number} A score between 0 and 100.
     */
    function calculateIncomeScore(incomeData = {}) {
        let score = 0;
        const totalIncome = (incomeData.primaryIncome || 0) + (incomeData.additionalIncome || 0);

        // Score based on total monthly income (max 50 points)
        if (totalIncome > 7000) score += 50;
        else if (totalIncome > 5000) score += 40;
        else if (totalIncome > 3000) score += 30;
        else if (totalIncome > 1500) score += 20;
        else score += 10;
        
        // Score based on stability (max 25 points)
        if (incomeData.stability === 'high') score += 25;
        else if (incomeData.stability === 'medium') score += 15;
        else score += 5;

        // Score based on growth potential (max 25 points)
        if (incomeData.growthPotential === 'high') score += 25;
        else if (incomeData.growthPotential === 'medium') score += 15;
        else score += 5;

        return Math.min(100, score); // Cap the score at 100
    }

    /**
     * Generates a personalized insight string based on income data.
     * @param {object} incomeData - The user's income data from Firestore.
     * @param {number} score - The calculated income score.
     * @returns {string} The insight text.
     */
    function generateIncomeInsight(incomeData = {}, score) {
        if (score > 80) {
            return `Your high and stable income of $${(incomeData.primaryIncome || 0) + (incomeData.additionalIncome || 0)}/mo provides a powerful foundation for your financial goals.`;
        }
        if (score > 60) {
            let insight = "Your income is solid. ";
            if (incomeData.growthPotential !== 'high') {
                insight += "Focusing on opportunities for career growth could boost this score even higher.";
            } else {
                insight += "Your high growth potential is a key strength for building future wealth.";
            }
            return insight;
        }
        let insight = "There's room for improvement here. ";
        if ((incomeData.additionalIncome || 0) === 0) {
            insight += "Exploring additional income streams could increase your financial security.";
        } else {
            insight += "Focus on growing your primary income source to improve your financial stability.";
        }
        return insight;
    }


    // --- "LIVING BREATHING" VIBESCORE (Unchanged) ---
    function initVibeScore(score) {
        // ... (This function remains the same as before) ...
    }

    // --- RADIAL HUD BUBBLES ---
    // MODIFIED: This function now accepts the dynamic income score and insight
    function initRadialHUD(dynamicIncomeData) {
        const initialFinancialData = [
            { name: 'Savings', score: 85, insight: "Excellent savings rate..." }, 
            { name: 'Budgeting', score: 92, insight: "Masterful budgeting..." },
            { name: 'Income', score: 50, insight: "Loading your income data..." }, // Placeholder
            { name: 'Cash Flow', score: 75, insight: "Healthy cash flow..." },
            { name: 'Credit Score', score: 78, insight: "Good credit health..." }, 
            { name: 'Investing', score: 45, insight: "There's an opportunity to grow..." },
            { name: 'Retirement', score: 55, insight: "A good start on retirement planning..." }, 
            { name: 'Debt', score: 30, insight: "High debt levels are impacting your score..." },
            { name: 'Net Worth', score: 60, insight: "Your net worth is growing..." }, 
            { name: 'Emergency Fund', score: 88, insight: "Your emergency fund is well-established..." }
        ];

        // Merge dynamic income data into the main data array
        const finalFinancialData = initialFinancialData.map(item => 
            item.name === 'Income' ? { ...item, ...dynamicIncomeData } : item
        );

        const hudPlane = document.getElementById('hud-plane');
        if (!hudPlane) return;
        
        hudPlane.innerHTML = ''; // Clear previous bubbles before rendering
        
        const arcSpan = 360; 
        const angleStep = arcSpan / finalFinancialData.length;
        const startingAngle = -90;

        finalFinancialData.forEach((item, index) => {
            // ... (The rest of this function remains the same) ...
        });
    }

    // --- FINANCIAL NEWS FETCHER (Unchanged) ---
    async function fetchFinancialNews() {
        // ... (This function remains the same as before) ...
    }


    // --- MAIN INITIALIZATION LOGIC ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in, fetch their data
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            let incomeScore = 50; // Default score
            let incomeInsight = "No income data found. Please update your profile.";
            
            if (userDoc.exists() && userDoc.data().income) {
                const incomeData = userDoc.data().income;
                incomeScore = calculateIncomeScore(incomeData);
                incomeInsight = generateIncomeInsight(incomeData, incomeScore);
            }

            // Prepare the dynamic data object for the HUD
            const dynamicIncomeData = {
                score: incomeScore,
                insight: incomeInsight
            };
            
            // In a real app, this score would be fetched from the user's data in Firestore.
            const userVibeScore = 75; 

            // Initialize all dashboard components
            initVibeScore(userVibeScore);
            initRadialHUD(dynamicIncomeData); // Pass the dynamic data to the HUD
            fetchFinancialNews();
            setInterval(fetchFinancialNews, 900000); // Refresh news every 15 mins
        }
    });
});