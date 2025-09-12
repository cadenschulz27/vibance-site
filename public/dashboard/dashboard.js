/**
 * @file dashboard/dashboard.js
 * @description Handles dynamic content for the main dashboard page, excluding
 * the VibeScore component which is managed by its own set of modules.
 * This script's primary responsibility is to fetch and display financial news.
 */

document.addEventListener('DOMContentLoaded', () => {

    /**
     * Fetches the latest financial news from the Netlify serverless function
     * and populates the news grid on the dashboard.
     */
    async function fetchFinancialNews() {
        const newsGrid = document.getElementById('news-grid');
        if (!newsGrid) {
            console.error("Dashboard Error: News grid container not found.");
            return;
        }

        try {
            // Fetch data from the serverless function endpoint.
            const response = await fetch('/.netlify/functions/getNews');
            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }
            const data = await response.json();

            // Clear any placeholder content.
            newsGrid.innerHTML = '';

            if (!data.articles || data.articles.length === 0) {
                newsGrid.innerHTML = '<p class="text-gray-400 col-span-3 text-center">Could not retrieve news articles at this time.</p>';
                return;
            }

            // Create and append a card for each valid news article.
            data.articles.forEach(article => {
                // Filter out articles with no description or removed content.
                if (!article.description || article.description.includes('[Removed]')) {
                    return;
                }

                const newsCard = document.createElement('a');
                newsCard.href = article.url;
                newsCard.target = '_blank';
                newsCard.rel = 'noopener noreferrer'; // Security best practice
                newsCard.className = 'news-card'; // Use class from dashboard.css for styling

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
            newsGrid.innerHTML = '<p class="text-red-500 col-span-3 text-center">Failed to load news. Please try again later.</p>';
        }
    }

    // --- INITIALIZATION ---

    // Fetch news immediately on page load.
    fetchFinancialNews();

    // Set an interval to refresh the news every 15 minutes (900,000 milliseconds).
    setInterval(fetchFinancialNews, 900000);
});
