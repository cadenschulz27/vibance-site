// FILE: public/dashboard/dashboard.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- SCORING & INSIGHT GENERATION LOGIC ---
    function calculateIncomeScore(d={}) { let s=0; const t=(d.primaryIncome||0)+(d.additionalIncome||0); if(t>7000)s+=50;else if(t>5000)s+=40;else if(t>3000)s+=30;else s+=10; if(d.stability==='high')s+=25;else if(d.stability==='medium')s+=15;else s+=5; if(d.growthPotential==='high')s+=25;else if(d.growthPotential==='medium')s+=15;else s+=5; return Math.min(100,s); }
    function generateIncomeInsight(d={},s){ if(s>80)return`Your high and stable income of $${((d.primaryIncome||0)+(d.additionalIncome||0)).toLocaleString()}/mo provides a powerful foundation.`; if(s>60){let i="Your income is solid. ";if(d.growthPotential!=='high')i+="Focusing on career growth could boost this score.";else i+="Your high growth potential is a key strength.";return i;} let i="There's room for improvement. ";if((d.additionalIncome||0)===0)i+="Exploring additional income streams could increase security.";else i+=`Your additional income of $${(d.additionalIncome||0).toLocaleString()}/mo is a great start.`;return i;}
    function calculateSavingsScore(d={}) { const r=(d.monthlySavingsRate||0)*3.5; const b=((d.totalLiquidSavings||0)/20000)*30; return Math.min(100, r + b); }
    function generateSavingsInsight(d={},s){ if(s>80)return`Exceptional work! A savings rate of ${d.monthlySavingsRate}% is fantastic for building wealth.`; if(s>50)return`You're on the right track. Consider increasing your monthly savings rate to accelerate your goals.`; return`Your savings need attention. Aim to save at least 15% of your income each month.`;}
    function calculateBudgetingScore(d={}) { const i=(d.averageMonthlyIncome||0); if(i===0)return 20; const p=i-(d.averageMonthlySpending||0); let s=(p/i)*200; if(d.budgetAdherence==='strict')s+=20; if(d.budgetAdherence==='flexible')s+=10; return Math.max(0,Math.min(100,s)); }
    function generateBudgetingInsight(d={},s){ if(s>80)return`You are a budgeting master. Your spending is well-controlled, leading to a healthy surplus.`; if(s>50)return`Your budget is effective. Look for small areas to trim spending to further increase your cash flow.`; return`Your expenses are high relative to your income. A detailed review of your budget is recommended.`;}
    function calculateCashFlowScore(d={}) { return Math.min(100, Math.max(0, (d.averageMonthlySurplus||0)/1000*50)); }
    function generateCashFlowInsight(d={},s){ if(s>80)return`Excellent cash flow. A monthly surplus of $${(d.averageMonthlySurplus||0).toLocaleString()} gives you great financial flexibility.`; if(s>50)return`Your cash flow is positive and healthy. This is the engine for all your financial goals.`; return`Your monthly cash flow is tight. Increasing income or reducing expenses will improve this score.`;}
    function calculateCreditScore(d={}) { const o=d.scoreValue||300; let s=((o-300)/(850-300))*100; if(d.paymentHistory==='excellent')s+=10; if((d.creditUtilization||100)>30)s-=15; return Math.max(0,Math.min(100,s));}
    function generateCreditInsight(d={},s){ if(s>80)return`Your credit score of ${d.scoreValue} is excellent, unlocking the best financial products.`; if(s>60)return`A good credit score of ${d.scoreValue}. Keep utilization below 30% to improve it further.`; return`Your credit score of ${d.scoreValue} needs work. Focus on timely payments and lowering utilization.`;}
    function calculateInvestingScore(d={}) { const v=((d.totalInvested||0)/50000)*50; const c=((d.monthlyContribution||0)/1000)*50; let s=v+c; if(d.portfolioDiversity==='high')s+=10; return Math.min(100,s); }
    function generateInvestingInsight(d={},s){ if(s>80)return`You're a savvy investor. Your consistent contributions and diverse portfolio are building significant wealth.`; if(s>50)return`Your investment journey is well underway. Consider increasing monthly contributions to maximize growth.`; return`Investing is a powerful wealth-building tool. It's a great time to start, even with small amounts.`;}
    function calculateRetirementScore(d={}) { let s=((d.retirementAccountValue||0)/200000)*60; s+=((d.monthlyContributionPercent||0)*4); if(d.onTrackForGoal)s+=20; return Math.min(100,s); }
    function generateRetirementInsight(d={},s){ if(s>80)return`Your retirement planning is superb. You are on track for a secure and comfortable future.`; if(s>50)return`Solid progress on retirement savings. You are building a good nest egg for the future.`; return`It's crucial to prioritize retirement savings. Consider opening or increasing contributions to a 401(k) or IRA.`;}
    function calculateDebtScore(d={}) { const r=Math.max(0,100-((d.debtToIncomeRatio||100)*2)); let s=r; if(d.hasHighInterestDebt)s-=20; return Math.max(0,s); }
    function generateDebtInsight(d={},s){ if(s>80)return`You have very little or no debt, putting you in a powerful financial position.`; if(s>50)return`Your debt is manageable. Focus on paying down high-interest debt first to improve your score.`; return`Your debt level is high. Creating a focused repayment plan is a critical next step.`;}
    function calculateNetWorthScore(d={}) { const n=(d.totalAssets||0)-(d.totalLiabilities||0); return Math.min(100,Math.max(0,n/2000)); }
    function generateNetWorthInsight(d={},s){ const w=(d.totalAssets||0)-(d.totalLiabilities||0); if(s>80)return`Congratulations on building a strong net worth of $${w.toLocaleString()}. Your assets significantly outweigh your liabilities.`; if(s>50)return`You're building a positive net worth. Continue to increase assets and reduce liabilities.`; return`Your net worth is currently low or negative. Focus on debt reduction and asset building.`;}
    function calculateEmergencyFundScore(d={}) { return Math.min(100, ((d.currentMonths||0)/(d.goalMonths||6))*100); }
    function generateEmergencyFundInsight(d={},s){ if(s>=100)return`Fully funded! Your emergency fund provides an excellent safety net for unexpected events.`; if(s>50)return`You're over halfway to your emergency fund goal. You're building great financial resilience.`; return`Building an emergency fund is a key first step. Aim for 3-6 months of living expenses.`;}

    const calculationMap = {
        'Savings':{calc:calculateSavingsScore,gen:generateSavingsInsight,dataKey:'savings'},'Budgeting':{calc:calculateBudgetingScore,gen:generateBudgetingInsight,dataKey:'budgeting'},
        'Income':{calc:calculateIncomeScore,gen:generateIncomeInsight,dataKey:'income'},'Cash Flow':{calc:calculateCashFlowScore,gen:generateCashFlowInsight,dataKey:'cashFlow'},
        'Credit Score':{calc:calculateCreditScore,gen:generateCreditInsight,dataKey:'credit'},'Investing':{calc:calculateInvestingScore,gen:generateInvestingInsight,dataKey:'investing'},
        'Retirement':{calc:calculateRetirementScore,gen:generateRetirementInsight,dataKey:'retirement'},'Debt':{calc:calculateDebtScore,gen:generateDebtInsight,dataKey:'debt'},
        'Net Worth':{calc:calculateNetWorthScore,gen:generateNetWorthInsight,dataKey:'netWorth'},'Emergency Fund':{calc:calculateEmergencyFundScore,gen:generateEmergencyFundInsight,dataKey:'emergencyFund'}
    };

    // --- VIBESCORE & HUD INITIALIZATION ---
    // REVISED: This function now targets the new gauge elements
    function initializeVibeScoreComponent(vibeScore, financialData) {
        const progressRing = document.querySelector('.gauge-progress');
        const percentageText = document.getElementById('vibe-score-percentage');
        const hudPlane = document.getElementById('hud-plane');
        const insightPanelContainer = document.getElementById('insight-panel-container');

        if (!progressRing || !percentageText || !hudPlane) return;

        // 1. Set the main VibeScore value and color
        let statusColor = 'var(--color-danger)';
        if (vibeScore >= 80) statusColor = 'var(--neon-green)';
        else if (vibeScore >= 50) statusColor = 'var(--color-yellow)';
        percentageText.style.color = statusColor;
        
        let currentScore = 0;
        const interval = setInterval(() => {
            if (currentScore >= vibeScore) {
                clearInterval(interval);
            } else {
                currentScore++;
                percentageText.textContent = `${currentScore}%`;
                progressRing.style.background = `conic-gradient(${statusColor} ${currentScore}%, #1C1C1E 0%)`;
            }
        }, 20);

        // 2. Inject the Insight Panel HTML and get references
        insightPanelContainer.innerHTML = `
            <div id="insight-panel" class="insight-panel">
                <div class="flex justify-between items-center mb-2"><h3 id="insight-title" class="insight-title text-lg font-semibold"></h3><p id="insight-score" class="insight-score font-bold text-lg"></p></div>
                <p id="insight-text" class="text-gray-400 text-sm leading-relaxed"></p>
            </div>
        `;
        const insightPanel = document.getElementById('insight-panel');
        const insightTitle = document.getElementById('insight-title');
        const insightScore = document.getElementById('insight-score');
        const insightText = document.getElementById('insight-text');
        
        // 3. Create and animate the surrounding HUD bubbles
        const angleStep = 360 / financialData.length;
        const startingAngle = -90;

        financialData.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            let colors;
            if (!item.hasData) { colors = { borderColor: 'var(--color-nodata)', glowColor: 'rgba(0,0,0,0)', hoverBorderColor: '#9CA3AF', textColor: '#9CA3AF' }; } 
            else if (item.score < 50) { colors = { borderColor: 'rgba(255, 69, 0, 0.4)', glowColor: 'rgba(255, 69, 0, 0.3)', hoverBorderColor: 'rgba(255, 69, 0, 0.8)', textColor: 'var(--color-red)' }; } 
            else if (item.score < 80) { colors = { borderColor: 'rgba(255, 215, 0, 0.4)', glowColor: 'rgba(255, 215, 0, 0.3)', hoverBorderColor: 'rgba(255, 215, 0, 0.8)', textColor: 'var(--color-yellow)' }; } 
            else { colors = { borderColor: 'rgba(144, 238, 144, 0.4)', glowColor: 'rgba(144, 238, 144, 0.3)', hoverBorderColor: 'rgba(144, 238, 144, 0.8)', textColor: 'var(--color-green)' }; }

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            if (!item.hasData) bubble.classList.add('is-nodata');
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--glow-color', colors.glowColor);
            bubble.style.setProperty('--hover-border-color', colors.hoverBorderColor);
            
            const scoreText = item.hasData ? item.score.toFixed(2) : 'N/A';
            const coreContent = `<div class="bubble-core"><span>${item.name}</span><span class="bubble-score">${scoreText}</span></div><div class="tracer-line"></div>`;
            bubble.innerHTML = item.hasData ? coreContent : `<a href="../pages/profile.html" class="bubble-core-link">${coreContent}</a>`;
            hudPlane.appendChild(bubble);

            bubble.addEventListener('mouseenter', () => {
                insightTitle.textContent = item.name;
                insightScore.textContent = scoreText;
                insightText.textContent = item.insight;
                insightPanel.style.setProperty('--border-color', colors.borderColor);
                insightPanel.style.setProperty('--text-color', colors.textColor);
                insightPanel.classList.add('visible');
                const radius = 300; const bubbleHeight = 55;
                const traceHeight = radius - (bubbleHeight / 2) - 20;
                const tracerLine = bubble.querySelector('.tracer-line');
                if (tracerLine) { tracerLine.style.setProperty('--trace-height', `${traceHeight}px`); tracerLine.style.setProperty('--glow-color', colors.glowColor); }
            });
            bubble.addEventListener('mouseleave', () => { insightPanel.classList.remove('visible'); });
        });
    }

    // --- FINANCIAL NEWS FETCHER ---
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        if (!newsGrid) return;
        try { const response = await fetch('/.netlify/functions/getNews'); if (!response.ok) throw new Error(`API Request Failed`); const data = await response.json(); newsGrid.innerHTML = ''; if (!data.articles || data.articles.length === 0) { newsGrid.innerHTML = '<p class="text-gray-400">Could not retrieve news articles at this time.</p>'; return; } data.articles.forEach(article => { if (!article.description || article.description.includes('[Removed]')) return; const newsCard = document.createElement('a'); newsCard.href = article.url; newsCard.target = '_blank'; newsCard.className = 'news-card'; newsCard.innerHTML = `<div class="news-card-content"><h3 class="news-card-title">${article.title}</h3><p class="news-card-preview">${article.description}</p></div>`; newsGrid.appendChild(newsCard); }); } catch (error) { console.error("Error fetching financial news:", error); newsGrid.innerHTML = '<p class="text-red-500">Failed to load news. Please try again later.</p>'; }
    }
    
    // --- MAIN INITIALIZATION LOGIC ---
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
                const insight = hasData ? map.gen(data, score) : "No data found. Click this bubble to go to your profile and add your information.";
                return { name, score, insight, hasData };
            });

            const itemsWithData = dynamicFinancialData.filter(item => item.hasData);
            const totalScore = itemsWithData.reduce((acc, item) => acc + item.score, 0);
            const userVibeScore = itemsWithData.length > 0 ? Math.round(totalScore / itemsWithData.length) : 0;
            
            initializeVibeScoreComponent(userVibeScore, dynamicFinancialData);
            fetchFinancialNews();
            setInterval(fetchFinancialNews, 900000);
        }
    });
});