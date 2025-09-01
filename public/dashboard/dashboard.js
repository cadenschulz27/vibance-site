// FILE: public/dashboard/dashboard.js

document.addEventListener('DOMContentLoaded', () => {

    // --- Example function to dynamically update the VibeScore ---
    function setVibeScore(percentage) {
        const ring = document.getElementById('vibe-score-ring');
        const percentageText = document.querySelector('.vibe-score-percentage');

        if (ring && percentageText) {
            const p = Math.max(0, Math.min(100, percentage));
            ring.style.setProperty('--p', p);
            percentageText.textContent = `${p}%`;
        }
    }
    const userScore = 75; 
    setVibeScore(userScore);

    // --- Rotation Pause/Play Logic ---
    const bubbles = document.querySelectorAll('.bubble');

    if (bubbles.length > 0) {
        bubbles.forEach(bubble => {
            bubble.addEventListener('mouseenter', () => {
                bubbles.forEach(b => b.style.animationPlayState = 'paused');
            });

            bubble.addEventListener('mouseleave', () => {
                bubbles.forEach(b => b.style.animationPlayState = 'running');
            });
        });
    }

    // --- VibeScore Info Box Logic ---
    const vibeScoreRing = document.getElementById('vibe-score-ring');
    const infoBox = document.getElementById('vibe-score-info');

    if (vibeScoreRing && infoBox) {
        vibeScoreRing.addEventListener('mouseenter', () => {
            infoBox.classList.add('visible');
        });

        vibeScoreRing.addEventListener('mouseleave', () => {
            infoBox.classList.remove('visible');
        });
    }

    // --- REVISED: Function to fetch news from the secure Netlify Function ---
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        
        // This URL now points to YOUR secure Netlify Function
        const apiUrl = `/.netlify/functions/getNews`;

        // Add a loading message
        newsGrid.innerHTML = '<p class="text-gray-400">Fetching the latest financial news...</p>';

        try {
            // No API key is exposed here in the browser!
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const data = await response.json();
            const articles = data.articles;

            // Clear the loading message
            newsGrid.innerHTML = '';

            if (!articles || articles.length === 0) {
                newsGrid.innerHTML = '<p class="text-gray-400">Could not retrieve news articles at this time.</p>';
                return;
            }

            // Loop through the articles and create HTML for each one
            articles.forEach(article => {
                // Skip articles with no content or removed content
                if (!article.description || article.description.includes('[Removed]')) return;

                const newsCard = document.createElement('a');
                newsCard.href = article.url;
                newsCard.target = '_blank';
                newsCard.className = 'news-card'; // Use the existing CSS class

                // Use the existing HTML structure and classes for consistent styling
                newsCard.innerHTML = `
                    <div class="news-card-content">
                        <h3 class="news-card-title">${article.title}</h3>
                        <p class="news-card-preview">${article.description}</p>
                    </div>
                `;
                newsGrid.appendChild(newsCard);
            });

        } catch (error) {
            console.error("Error fetching financial news:", error);
            newsGrid.innerHTML = '<p class="text-red-500">Failed to load news. Please try again later.</p>';
        }
    }

    // Call the new function to load the news when the page is ready
    fetchFinancialNews();
});