// FILE: public/dashboard/dashboard.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- SCORING & INSIGHT GENERATION LOGIC ---

    function calculateIncomeScore(d = {}) {
        let score = 0;
        const totalIncome = (d.primaryIncome || 0) + (d.additionalIncome || 0);
        if (totalIncome > 7000) score += 50;
        else if (totalIncome > 5000) score += 40;
        else if (totalIncome > 3000) score += 30;
        else if (totalIncome > 1500) score += 20;
        else score += 10;
        if (d.stability === 'high') score += 25;
        else if (d.stability === 'medium') score += 15;
        else score += 5;
        if (d.growthPotential === 'high') score += 25;
        else if (d.growthPotential === 'medium') score += 15;
        else score += 5;
        return Math.min(100, score);
    }
    function generateIncomeInsight(d = {}, s) {
        if (s > 80) return `Your high and stable income of $${((d.primaryIncome || 0) + (d.additionalIncome || 0)).toLocaleString()}/mo provides a powerful foundation.`;
        if (s > 60) { let i = "Your income is solid. "; if (d.growthPotential !== 'high') i += "Focusing on career growth could boost this score."; else i += "Your high growth potential is a key strength."; return i; }
        let i = "There's room for improvement. "; if ((d.additionalIncome || 0) === 0) i += "Exploring additional income streams could increase security."; else i += `Your additional income of $${(d.additionalIncome || 0).toLocaleString()}/mo is a great start.`; return i;
    }

    function calculateSavingsScore(d = {}) {
        const rateScore = (d.monthlySavingsRate || 0) * 3.5;
        const bufferScore = ((d.totalLiquidSavings || 0) / 20000) * 30;
        return Math.min(100, rateScore + bufferScore);
    }
    function generateSavingsInsight(d = {}, s) {
        if (s > 80) return `Exceptional work! A savings rate of ${d.monthlySavingsRate}% is fantastic for building wealth.`;
        if (s > 50) return `You're on the right track. Consider increasing your monthly savings rate to accelerate your goals.`;
        return `Your savings need attention. Aim to save at least 15% of your income each month.`;
    }

    function calculateBudgetingScore(d = {}) {
        const income = (d.averageMonthlyIncome || 0);
        if (income === 0) return 20;
        const surplus = income - (d.averageMonthlySpending || 0);
        let score = (surplus / income) * 200;
        if (d.budgetAdherence === 'strict') score += 20;
        if (d.budgetAdherence === 'flexible') score += 10;
        return Math.max(0, Math.min(100, score));
    }
    function generateBudgetingInsight(d = {}, s) {
        if (s > 80) return `You are a budgeting master. Your spending is well-controlled, leading to a healthy surplus.`;
        if (s > 50) return `Your budget is effective. Look for small areas to trim spending to further increase your cash flow.`;
        return `Your expenses are high relative to your income. A detailed review of your budget is recommended.`;
    }

    function calculateCashFlowScore(d = {}) {
        return Math.min(100, Math.max(0, (d.averageMonthlySurplus || 0) / 1000 * 50));
    }
    function generateCashFlowInsight(d = {}, s) {
        if (s > 80) return `Excellent cash flow. A monthly surplus of $${(d.averageMonthlySurplus || 0).toLocaleString()} gives you great financial flexibility.`;
        if (s > 50) return `Your cash flow is positive and healthy. This is the engine for all your financial goals.`;
        return `Your monthly cash flow is tight. Increasing income or reducing expenses will improve this score.`;
    }

    function calculateCreditScore(d = {}) {
        const score = d.scoreValue || 300;
        let s = ((score - 300) / (850 - 300)) * 100;
        if (d.paymentHistory === 'excellent') s += 10;
        if ((d.creditUtilization || 100) > 30) s -= 15;
        return Math.max(0, Math.min(100, s));
    }
    function generateCreditInsight(d = {}, s) {
        if (s > 80) return `Your credit score of ${d.scoreValue} is excellent, unlocking the best financial products.`;
        if (s > 60) return `A good credit score of ${d.scoreValue}. Keep utilization below 30% to improve it further.`;
        return `Your credit score of ${d.scoreValue} needs work. Focus on timely payments and lowering utilization.`;
    }

    function calculateInvestingScore(d = {}) {
        const valueScore = ((d.totalInvested || 0) / 50000) * 50;
        const contributionScore = ((d.monthlyContribution || 0) / 1000) * 50;
        let score = valueScore + contributionScore;
        if (d.portfolioDiversity === 'high') score += 10;
        return Math.min(100, score);
    }
    function generateInvestingInsight(d = {}, s) {
        if (s > 80) return `You're a savvy investor. Your consistent contributions and diverse portfolio are building significant wealth.`;
        if (s > 50) return `Your investment journey is well underway. Consider increasing monthly contributions to maximize growth.`;
        return `Investing is a powerful wealth-building tool. It's a great time to start, even with small amounts.`;
    }

    function calculateRetirementScore(d = {}) {
        let score = ((d.retirementAccountValue || 0) / 200000) * 60;
        score += ((d.monthlyContributionPercent || 0) * 4);
        if (d.onTrackForGoal) score += 20;
        return Math.min(100, score);
    }
    function generateRetirementInsight(d = {}, s) {
        if (s > 80) return `Your retirement planning is superb. You are on track for a secure and comfortable future.`;
        if (s > 50) return `Solid progress on retirement savings. You are building a good nest egg for the future.`;
        return `It's crucial to prioritize retirement savings. Consider opening or increasing contributions to a 401(k) or IRA.`;
    }

    function calculateDebtScore(d = {}) {
        const ratioScore = Math.max(0, 100 - ((d.debtToIncomeRatio || 100) * 2));
        let score = ratioScore;
        if (d.hasHighInterestDebt) score -= 20;
        return Math.max(0, score);
    }
    function generateDebtInsight(d = {}, s) {
        if (s > 80) return `You have very little or no debt, putting you in a powerful financial position.`;
        if (s > 50) return `Your debt is manageable. Focus on paying down high-interest debt first to improve your score.`;
        return `Your debt level is high. Creating a focused repayment plan is a critical next step.`;
    }

    function calculateNetWorthScore(d = {}) {
        const netWorth = (d.totalAssets || 0) - (d.totalLiabilities || 0);
        return Math.min(100, Math.max(0, netWorth / 2000));
    }
    function generateNetWorthInsight(d = {}, s) {
        const nw = (d.totalAssets || 0) - (d.totalLiabilities || 0);
        if (s > 80) return `Congratulations on building a strong net worth of $${nw.toLocaleString()}. Your assets significantly outweigh your liabilities.`;
        if (s > 50) return `You're building a positive net worth. Continue to increase assets and reduce liabilities.`;
        return `Your net worth is currently low or negative. Focus on debt reduction and asset building.`;
    }

    function calculateEmergencyFundScore(d = {}) {
        return Math.min(100, ((d.currentMonths || 0) / (d.goalMonths || 6)) * 100);
    }
    function generateEmergencyFundInsight(d = {}, s) {
        if (s >= 100) return `Fully funded! Your emergency fund provides an excellent safety net for unexpected events.`;
        if (s > 50) return `You're over halfway to your emergency fund goal. You're building great financial resilience.`;
        return `Building an emergency fund is a key first step. Aim for 3-6 months of living expenses.`;
    }

    const calculationMap = {
        'Savings': { calc: calculateSavingsScore, gen: generateSavingsInsight, dataKey: 'savings' },
        'Budgeting': { calc: calculateBudgetingScore, gen: generateBudgetingInsight, dataKey: 'budgeting' },
        'Income': { calc: calculateIncomeScore, gen: generateIncomeInsight, dataKey: 'income' },
        'Cash Flow': { calc: calculateCashFlowScore, gen: generateCashFlowInsight, dataKey: 'cashFlow' },
        'Credit Score': { calc: calculateCreditScore, gen: generateCreditInsight, dataKey: 'credit' },
        'Investing': { calc: calculateInvestingScore, gen: generateInvestingInsight, dataKey: 'investing' },
        'Retirement': { calc: calculateRetirementScore, gen: generateRetirementInsight, dataKey: 'retirement' },
        'Debt': { calc: calculateDebtScore, gen: generateDebtInsight, dataKey: 'debt' },
        'Net Worth': { calc: calculateNetWorthScore, gen: generateNetWorthInsight, dataKey: 'netWorth' },
        'Emergency Fund': { calc: calculateEmergencyFundScore, gen: generateEmergencyFundInsight, dataKey: 'emergencyFund' }
    };

    // --- VIBESCORE & HUD INITIALIZATION ---
    function initVibeScore(score) {
        const ring = document.getElementById('vibescore-ring');
        const percentageText = document.getElementById('vibescore-percentage');
        const turbulence = document.querySelector('#watery-goo feTurbulence');
        if (!ring || !percentageText) { return; }
        ring.classList.remove('status-good', 'status-warning', 'status-danger');
        if (score >= 80) ring.classList.add('status-good');
        else if (score >= 50) ring.classList.add('status-warning');
        else ring.classList.add('status-danger');
        let currentScore = 0;
        const interval = setInterval(() => { if (currentScore >= score) { clearInterval(interval); } else { currentScore++; percentageText.textContent = `${currentScore}%`; ring.style.background = `conic-gradient(var(--ring-color) ${currentScore}%, #1C1C1E 0%)`; } }, 20);
        if (turbulence) {
            let time = 0;
            function animateTurbulence() { const freqX = 0.01 + Math.sin(time * 0.0002) * 0.005; const freqY = 0.03 + Math.cos(time * 0.0003) * 0.007; turbulence.setAttribute('baseFrequency', `${freqX} ${freqY}`); time++; requestAnimationFrame(animateTurbulence); }
            animateTurbulence();
        }
    }

    function initRadialHUD(financialData) {
        const hudPlane = document.getElementById('hud-plane');
        if (!hudPlane) return;
        hudPlane.innerHTML = '';
        const insightPanel = document.getElementById('insight-panel');
        const insightTitle = document.getElementById('insight-title');
        const insightScore = document.getElementById('insight-score');
        const insightText = document.getElementById('insight-text');
        const arcSpan = 360;
        const angleStep = arcSpan / financialData.length;
        const startingAngle = -90;

        financialData.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            let colors;
            if (!item.hasData) {
                colors = {
                    borderColor: 'var(--color-nodata)', glowColor: 'rgba(0,0,0,0)',
                    hoverBorderColor: '#9CA3AF', textColor: '#9CA3AF'
                };
            } else if (item.score < 50) {
                colors = { borderColor: 'rgba(255, 69, 0, 0.4)', glowColor: 'rgba(255, 69, 0, 0.3)', hoverBorderColor: 'rgba(255, 69, 0, 0.8)', textColor: 'var(--color-red)' };
            } else if (item.score < 80) {
                colors = { borderColor: 'rgba(255, 215, 0, 0.4)', glowColor: 'rgba(255, 215, 0, 0.3)', hoverBorderColor: 'rgba(255, 215, 0, 0.8)', textColor: 'var(--color-yellow)' };
            } else {
                colors = { borderColor: 'rgba(144, 238, 144, 0.4)', glowColor: 'rgba(144, 238, 144, 0.3)', hoverBorderColor: 'rgba(144, 238, 144, 0.8)', textColor: 'var(--color-green)' };
            }
            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            if (!item.hasData) {
                bubble.classList.add('is-nodata');
            }
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--glow-color', colors.glowColor);
            bubble.style.setProperty('--hover-border-color', colors.hoverBorderColor);
            bubble.style.setProperty('--text-color', colors.textColor);
            const scoreText = item.hasData ? item.score.toFixed(2) : 'N/A';
            const coreContent = `<div class="bubble-core"><span>${item.name}</span><span class="bubble-score">${scoreText}</span></div>`;
            bubble.innerHTML = item.hasData ? coreContent : `<a href="../pages/profile.html" class="bubble-core-link">${coreContent}</a>`;
            bubble.addEventListener('mouseenter', () => {
                insightTitle.textContent = item.name;
                insightScore.textContent = scoreText;
                insightScore.style.color = colors.textColor;
                insightText.textContent = item.insight;
                insightPanel.classList.add('visible');
            });
            bubble.addEventListener('mouseleave', () => {
                insightPanel.classList.remove('visible');
            });
            hudPlane.appendChild(bubble);
        });
    }

    // --- FINANCIAL NEWS FETCHER ---
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        if (!newsGrid) return;
        try { const response = await fetch('/.netlify/functions/getNews'); if (!response.ok) throw new Error(`API Request Failed`); const data = await response.json(); newsGrid.innerHTML = ''; if (!data.articles || data.articles.length === 0) { newsGrid.innerHTML = '<p class="text-gray-400">Could not retrieve news articles at this time.</p>'; return; } data.articles.forEach(article => { if (!article.description || article.description.includes('[Removed]')) return; const newsCard = document.createElement('a'); newsCard.href = article.url; newsCard.target = '_blank'; newsCard.className = 'news-card'; newsCard.innerHTML = `<div class="news-card-content"><h3 class="news-card-title">${article.title}</h3><p class="news-card-preview">${article.description}</p></div>`; newsGrid.appendChild(newsCard); }); } catch (error) { console.error("Error fetching financial news:", error); newsGrid.innerHTML = '<p class="text-red-500">Failed to load news. Please try again later.</p>'; }
    }
    
    // --- MAIN INITIALIZATION LOGIC ---
    async function initializeDashboard() {
        try {
            const response = await fetch('components/insight-panel.html');
            const panelHTML = await response.text();
            document.getElementById('insight-panel-placeholder').innerHTML = panelHTML;
        } catch (error) {
            console.error('Failed to load insight panel:', error);
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                const userData = userDoc.exists() ? userDoc.data() : {};

                const dynamicFinancialData = Object.keys(calculationMap).map(name => {
                    const map = calculationMap[name];
                    const data = userData[map.dataKey];
                    const hasData = data && Object.keys(data).length > 0;
                    const score = hasData ? map.calc(data) : 0;
                    const insight = hasData 
                        ? map.gen(data, score) 
                        : "No data found for this category. Click to go to your profile and add your information.";
                    return { name, score, insight, hasData };
                });

                const itemsWithData = dynamicFinancialData.filter(item => item.hasData);
                const totalScore = itemsWithData.reduce((acc, item) => acc + item.score, 0);
                const userVibeScore = itemsWithData.length > 0 ? Math.round(totalScore / itemsWithData.length) : 0;
                
                initVibeScore(userVibeScore);
                initRadialHUD(dynamicFinancialData);
                fetchFinancialNews();
                setInterval(fetchFinancialNews, 900000);
            }
        });
    }

    initializeDashboard();
});