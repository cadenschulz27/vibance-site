// FILE: public/dashboard/dashboard.js

document.addEventListener('DOMContentLoaded', () => {

    // --- DYNAMIC DATA ORRERY ---
    function initOrrery() {
        const financialData = [
            { name: 'Budgeting', score: 92 },
            { name: 'Savings', score: 85 },
            { name: 'Credit', score: 78 },
            { name: 'Investing', score: 45 },
            { name: 'Debt', score: 30 },
            { name: 'Income', score: 65 }
        ];

        const orbitPlane = document.getElementById('orbit-plane');
        const tooltip = document.getElementById('tooltip');

        if (!orbitPlane || !tooltip) return;

        const angleStep = 360 / financialData.length;

        financialData.forEach((item, index) => {
            const size = 40 + (item.score / 100) * 50;
            const distance = 180 + ((100 - item.score) / 100) * 150;
            let color;
            if (item.score < 50) color = 'var(--color-red)';
            else if (item.score < 80) color = 'var(--color-yellow)';
            else color = 'var(--color-green)';
            const angle = index * angleStep;

            const bubble = document.createElement('div');
            bubble.className = 'orrery-bubble';
            bubble.dataset.name = item.name;
            bubble.dataset.score = item.score;
            
            bubble.style.setProperty('--size', `${size}px`);
            bubble.style.setProperty('--distance', `${distance}px`);
            bubble.style.setProperty('--color', color);
            bubble.style.setProperty('--angle', `${angle}deg`);

            bubble.innerHTML = `
                <div class="bubble-core">${item.name.charAt(0)}</div>
                <div class="connecting-line"></div>
            `;
            orbitPlane.appendChild(bubble);
        });

        orbitPlane.addEventListener('mouseover', (event) => {
            const bubble = event.target.closest('.orrery-bubble');
            if (bubble) {
                tooltip.textContent = `${bubble.dataset.name}: ${bubble.dataset.score}/100`;
                tooltip.classList.add('visible');
            }
        });

        orbitPlane.addEventListener('mouseout', () => {
            tooltip.classList.remove('visible');
        });

        window.addEventListener('mousemove', (event) => {
            tooltip.style.left = `${event.clientX + 15}px`;
            tooltip.style.top = `${event.clientY + 15}px`;
        });
    }


    // --- FINANCIAL NEWS FETCHER ---
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
    initOrrery();
    fetchFinancialNews();
    setInterval(fetchFinancialNews, 900000); // Refresh news every 15 mins
});