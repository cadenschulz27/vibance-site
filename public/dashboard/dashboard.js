// FILE: public/dashboard/dashboard.js

document.addEventListener('DOMContentLoaded', () => {

    // --- "LIVING BREATHING" VIBESCORE ---
    function initVibeScore(score) {
        const ring = document.getElementById('vibescore-ring');
        const percentageText = document.getElementById('vibescore-percentage');
        const turbulence = document.querySelector('#watery-goo feTurbulence');

        if (!ring || !percentageText || !turbulence) {
            console.error('VibeScore elements not found!');
            return;
        }

        // 1. SET THE STATUS CLASS (Controls Color & Glow)
        ring.classList.remove('status-good', 'status-warning', 'status-danger');
        if (score >= 80) {
            ring.classList.add('status-good');
        } else if (score >= 50) {
            ring.classList.add('status-warning');
        } else {
            ring.classList.add('status-danger');
        }

        // 2. ANIMATE THE TEXT AND CONIC GRADIENT
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

        // 3. ANIMATE THE SVG FILTER (Creates the "Living" Texture)
        let time = 0;
        function animateTurbulence() {
            const freqX = 0.01 + Math.sin(time * 0.0002) * 0.005;
            const freqY = 0.03 + Math.cos(time * 0.0003) * 0.007;
            turbulence.setAttribute('baseFrequency', `${freqX} ${freqY}`);
            time++;
            requestAnimationFrame(animateTurbulence);
        }
        animateTurbulence();
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
    // In a real app, this score would be fetched from the user's data in Firestore.
    const userVibeScore = 75; 
    initVibeScore(userVibeScore);

    fetchFinancialNews();
    setInterval(fetchFinancialNews, 900000); // Refresh news every 15 mins
});