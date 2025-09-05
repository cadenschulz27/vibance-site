// FILE: public/dashboard/dashboard.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- LOGIC FOR CALCULATING INCOME SCORE & INSIGHT ---
    function calculateIncomeScore(incomeData = {}) {
        let score = 0;
        const totalIncome = (incomeData.primaryIncome || 0) + (incomeData.additionalIncome || 0);
        if (totalIncome > 7000) score += 50;
        else if (totalIncome > 5000) score += 40;
        else if (totalIncome > 3000) score += 30;
        else if (totalIncome > 1500) score += 20;
        else score += 10;
        if (incomeData.stability === 'high') score += 25;
        else if (incomeData.stability === 'medium') score += 15;
        else score += 5;
        if (incomeData.growthPotential === 'high') score += 25;
        else if (incomeData.growthPotential === 'medium') score += 15;
        else score += 5;
        return Math.min(100, score);
    }

    function generateIncomeInsight(incomeData = {}, score) {
        if (score > 80) {
            return `Your high and stable income of $${((incomeData.primaryIncome || 0) + (incomeData.additionalIncome || 0)).toLocaleString()}/mo provides a powerful foundation for your financial goals.`;
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
            insight += `Your additional income of $${(incomeData.additionalIncome || 0).toLocaleString()}/mo is a great start.`;
        }
        return insight;
    }

    // --- "LIVING BREATHING" VIBESCORE ---
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

    // --- RADIAL HUD BUBBLES ---
    function initRadialHUD(dynamicIncomeData) {
        const initialFinancialData = [
            { name: 'Savings', score: 85, insight: "Excellent savings rate. Your consistent contributions are building a strong financial cushion." }, 
            { name: 'Budgeting', score: 92, insight: "Masterful budgeting. You're tracking spending effectively and staying well within your means." },
            { name: 'Income', score: 50, insight: "Loading your income data..." },
            { name: 'Cash Flow', score: 75, insight: "Healthy cash flow. Your income comfortably covers your expenses, leaving room for savings and investments." },
            { name: 'Credit Score', score: 78, insight: "Good credit health. Your score is solid, but timely payments on all accounts will push it even higher." }, 
            { name: 'Investing', score: 45, insight: "There's an opportunity to grow. Your investment activity is low; consider a diversified portfolio to build long-term wealth." },
            { name: 'Retirement', score: 55, insight: "A good start on retirement planning. Increasing your contribution rate could significantly improve your outlook." }, 
            { name: 'Debt', score: 30, insight: "High debt levels are impacting your score. Focus on a repayment strategy, starting with high-interest accounts." },
            { name: 'Net Worth', score: 60, insight: "Your net worth is growing. Continuing to reduce debt and increase assets will accelerate this progress." }, 
            { name: 'Emergency Fund', score: 88, insight: "Your emergency fund is well-established, providing excellent security against unexpected expenses." }
        ];

        const finalFinancialData = initialFinancialData.map(item => 
            item.name === 'Income' ? { ...item, ...dynamicIncomeData } : item
        );

        const hudPlane = document.getElementById('hud-plane');
        if (!hudPlane) return;
        
        hudPlane.innerHTML = '';
        
        const insightPanel = document.getElementById('insight-panel');
        const insightTitle = document.getElementById('insight-title');
        const insightScore = document.getElementById('insight-score');
        const insightText = document.getElementById('insight-text');

        const arcSpan = 360; 
        const angleStep = arcSpan / finalFinancialData.length;
        const startingAngle = -90;

        finalFinancialData.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            let colors;
            if (item.score < 50) colors = { borderColor: 'rgba(255, 69, 0, 0.4)', glowColor: 'rgba(255, 69, 0, 0.3)', hoverBorderColor: 'rgba(255, 69, 0, 0.8)', textColor: 'var(--color-red)' };
            else if (item.score < 80) colors = { borderColor: 'rgba(255, 215, 0, 0.4)', glowColor: 'rgba(255, 215, 0, 0.3)', hoverBorderColor: 'rgba(255, 215, 0, 0.8)', textColor: 'var(--color-yellow)' };
            else colors = { borderColor: 'rgba(144, 238, 144, 0.4)', glowColor: 'rgba(144, 238, 144, 0.3)', hoverBorderColor: 'rgba(144, 238, 144, 0.8)', textColor: 'var(--color-green)' };

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--glow-color', colors.glowColor);
            bubble.style.setProperty('--hover-border-color', colors.hoverBorderColor);
            bubble.style.setProperty('--text-color', colors.textColor);
            bubble.innerHTML = `<div class="bubble-core"><span>${item.name}</span><span class="bubble-score">${item.score}</span></div>`;

            bubble.addEventListener('mouseenter', () => {
                insightTitle.textContent = item.name;
                insightScore.textContent = item.score;
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

                let incomeScore = 50;
                let incomeInsight = "No income data found in your profile. This score is an estimate.";
                
                if (userDoc.exists() && userDoc.data().income) {
                    const incomeData = userDoc.data().income;
                    incomeScore = calculateIncomeScore(incomeData);
                    incomeInsight = generateIncomeInsight(incomeData, incomeScore);
                }

                const dynamicIncomeData = { score: incomeScore, insight: incomeInsight };
                const userVibeScore = 75; 

                initVibeScore(userVibeScore);
                initRadialHUD(dynamicIncomeData);
                fetchFinancialNews();
                setInterval(fetchFinancialNews, 900000);
            }
        });
    }

    initializeDashboard();
});