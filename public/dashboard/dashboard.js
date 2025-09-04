// FILE: public/dashboard/dashboard.js

document.addEventListener('DOMContentLoaded', () => {

    // --- RADIAL HUD ---
    function initRadialHUD() {
        // CHANGED: Expanded the data set for a full circle
        const financialData = [
            { name: 'Savings', score: 85 },
            { name: 'Budgeting', score: 92 },
            { name: 'Income', score: 65 },
            { name: 'Cash Flow', score: 75 },
            { name: 'Credit Score', score: 78 },
            { name: 'Investing', score: 45 },
            { name: 'Retirement', score: 55 },
            { name: 'Debt', score: 30 },
            { name: 'Net Worth', score: 60 },
            { name: 'Emergency Fund', score: 88 }
        ];

        const hudPlane = document.getElementById('hud-plane');
        if (!hudPlane) return;
        
        // CHANGED: Set the arc to a full 360 degrees
        const arcSpan = 360; 
        const angleStep = arcSpan / financialData.length; // Divide by item count for a full circle
        const startingAngle = -90; // Start at the top

        financialData.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            
            let colors;
            if (item.score < 50) {
                colors = {
                    borderColor: 'rgba(255, 69, 0, 0.4)', glowColor: 'rgba(255, 69, 0, 0.3)',
                    hoverBorderColor: 'rgba(255, 69, 0, 0.8)', textColor: 'var(--color-red)'
                };
            } else if (item.score < 80) {
                colors = {
                    borderColor: 'rgba(255, 215, 0, 0.4)', glowColor: 'rgba(255, 215, 0, 0.3)',
                    hoverBorderColor: 'rgba(255, 215, 0, 0.8)', textColor: 'var(--color-yellow)'
                };
            } else {
                 colors = {
                    borderColor: 'rgba(144, 238, 144, 0.4)', glowColor: 'rgba(144, 238, 144, 0.3)',
                    hoverBorderColor: 'rgba(144, 238, 144, 0.8)', textColor: 'var(--color-green)'
                };
            }

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`); // Slightly adjusted delay
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--glow-color', colors.glowColor);
            bubble.style.setProperty('--hover-border-color', colors.hoverBorderColor);
            bubble.style.setProperty('--text-color', colors.textColor);

            bubble.innerHTML = `
                <div class="bubble-core">
                    <span>${item.name}</span>
                    <span class="bubble-score">${item.score}</span>
                </div>
            `;
            hudPlane.appendChild(bubble);
        });
    }


    // --- FINANCIAL NEWS FETCHER (Unchanged) ---
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        if (!newsGrid) return;
        const apiUrl = `/.netlify/functions/getNews`;
        newsGrid.innerHTML = '<p class="text-gray-400">Fetching the latest financial news...</p>';
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`Request failed`);
            const data = await response.json();
            newsGrid.innerHTML = '';
            if (!data.articles || data.articles.length === 0) {
                newsGrid.innerHTML = '<p class="text-gray-400">Could not retrieve news articles.</p>';
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

    // --- INITIALIZE ALL COMPONENTS ---
    initRadialHUD();
    fetchFinancialNews();
    setInterval(fetchFinancialNews, 900000); 
});