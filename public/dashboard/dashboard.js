// FILE: public/dashboard/dashboard.js

document.addEventListener('DOMContentLoaded', () => {

    // --- "LIVING BREATHING" VIBESCORE ---
    function initVibeScore(score) {
        const ring = document.getElementById('vibescore-ring');
        const percentageText = document.getElementById('vibescore-percentage');

        // REMOVED: The 'turbulence' variable is no longer needed.
        if (!ring || !percentageText) { return; }

        ring.classList.remove('status-good', 'status-warning', 'status-danger');
        if (score >= 80) ring.classList.add('status-good');
        else if (score >= 50) ring.classList.add('status-warning');
        else ring.classList.add('status-danger');

        let currentScore = 0;
        const interval = setInterval(() => {
            if (currentScore >= score) {
                clearInterval(interval);
            } else {
                currentScore++;
                percentageText.textContent = `${currentScore}%`;
                ring.style.background = `conic-gradient(var(--ring-color) ${currentScore}%, #1C1C1E 0%)`;
            }
        }, 20);

        // REMOVED: The entire 'animateTurbulence' function is gone.
    }

    // --- RADIAL HUD BUBBLES ---
    function initRadialHUD() {
        const financialData = [
            { name: 'Savings', score: 85 }, { name: 'Budgeting', score: 92 },
            { name: 'Income', score: 65 }, { name: 'Cash Flow', score: 75 },
            { name: 'Credit Score', score: 78 }, { name: 'Investing', score: 45 },
            { name: 'Retirement', score: 55 }, { name: 'Debt', score: 30 },
            { name: 'Net Worth', score: 60 }, { name: 'Emergency Fund', score: 88 }
        ];

        const hudPlane = document.getElementById('hud-plane');
        if (!hudPlane) return;
        
        const arcSpan = 360; 
        const angleStep = arcSpan / financialData.length;
        const startingAngle = -90;

        financialData.forEach((item, index) => {
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
            hudPlane.appendChild(bubble);
        });
    }

    // --- FINANCIAL NEWS FETCHER ---
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        if (!newsGrid) return;
    
        try {
            const response = await fetch('/.netlify/functions/getNews');
            if (!response.ok) {
                throw new Error(`API Request Failed`);
            }
    
            const data = await response.json();
    
            newsGrid.innerHTML = ''; 
    
            if (!data.articles || data.articles.length === 0) {
                newsGrid.innerHTML = '<p class="text-gray-400">Could not retrieve news articles at this time.</p>';
                return;
            }
    
            data.articles.forEach(article => {
                if (!article.description || article.description.includes('[Removed]')) return;
                const newsCard = document.createElement('a');
                newsCard.href = article.url;
                newsCard.target = '_blank';
                newsCard.className = 'news-card';
                newsCard.innerHTML = `<div class="news-card-content"><h3 class="news-card-title">${article.title}</h3><p class="news-card-preview">${article.description}</p></div>`;
                newsGrid.appendChild(newsCard);
            });
    
        } catch (error) {
            console.error("Error fetching financial news:", error);
            newsGrid.innerHTML = '<p class="text-red-500">Failed to load news. Please try again later.</p>';
        }
    }

    // --- INITIALIZE ALL DASHBOARD COMPONENTS ---
    const userVibeScore = 75; 
    initVibeScore(userVibeScore);
    initRadialHUD();
    fetchFinancialNews();
    setInterval(fetchFinancialNews, 900000);
});