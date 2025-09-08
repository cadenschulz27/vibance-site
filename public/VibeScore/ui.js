/**
 * @file VibeScore/ui.js
 * @description Manages all DOM manipulation and user interface interactions for the VibeScore component.
 * It is responsible for creating, updating, and handling events for the gauge, HUD, and insight panel.
 */

// --- PRIVATE HELPER FUNCTIONS ---

/**
 * Injects the HTML structure for the insight panel into its container.
 * @param {HTMLElement} container - The container element for the insight panel.
 */
function _injectInsightPanel(container) {
    if (!container) return;
    container.innerHTML = `
        <div id="insight-panel" class="insight-panel">
            <div class="flex justify-between items-center mb-2">
                <h3 id="insight-title" class="insight-title text-lg font-semibold"></h3>
                <p id="insight-score" class="insight-score font-bold text-lg"></p>
            </div>
            <p id="insight-text" class="text-gray-400 text-sm leading-relaxed"></p>
        </div>
    `;
}

/**
 * Creates the HTML elements for the central VibeScore gauge and returns direct references to them.
 * This is more reliable than querying the DOM immediately after an innerHTML update.
 * @param {HTMLElement} container - The main container for the VibeScore gauge.
 * @returns {{progressEl: HTMLElement, percentageEl: HTMLElement}} References to the key gauge elements.
 */
function _createGaugeLayers(container) {
    if (!container) return { progressEl: null, percentageEl: null };
    container.innerHTML = `
        <div class="gauge-layer gauge-progress"></div>
        <svg class="gauge-layer gauge-bezel" viewBox="0 0 100 100">
            <circle class="bezel-ticks" cx="50" cy="50" r="48" fill="none" stroke-dasharray="1 3" pathLength="120"/>
        </svg>
        <svg class="gauge-layer gauge-inner-ring" viewBox="0 0 100 100">
            <circle class="inner-ring-dashes" cx="50" cy="50" r="38" fill="none"/>
        </svg>
        <div class="gauge-layer gauge-glass"></div>
        <div class="vibescore-inner-text">
            <span id="vibe-score-percentage" class="vibescore-percentage">0%</span>
            <span class="vibescore-label">VibeScore</span>
        </div>
    `;
    // Return direct references to the newly created elements
    return {
        progressEl: container.querySelector('.gauge-progress'),
        percentageEl: container.querySelector('#vibe-score-percentage')
    };
}


// --- PUBLIC MODULE ---

export const VibeScoreUI = {
    /**
     * Initializes the entire VibeScore component on the dashboard.
     * @param {number} vibeScore - The overall VibeScore (0-100).
     * @param {Array<Object>} financialData - Array of financial category data objects.
     */
    initialize(vibeScore, financialData) {
        const vibeScoreContainer = document.getElementById('vibescore-container');
        const hudPlane = document.getElementById('hud-plane');
        const insightPanelContainer = document.getElementById('insight-panel-container');

        if (!vibeScoreContainer || !hudPlane || !insightPanelContainer) {
            console.error("VibeScore UI Error: A required container element is missing from the DOM.");
            return;
        }

        // Create the gauge and get direct references to its updateable parts.
        const gaugeElements = _createGaugeLayers(vibeScoreContainer);

        _injectInsightPanel(insightPanelContainer);
        this.createHudBubbles(hudPlane, financialData);
        
        // Pass the direct references to the update function.
        this.updateVibeScoreDisplay(vibeScore, gaugeElements);
    },

    /**
     * Updates the central VibeScore display using direct element references.
     * @param {number} score - The overall VibeScore (0-100).
     * @param {{progressEl: HTMLElement, percentageEl: HTMLElement}} elements - Direct references to the gauge elements.
     */
    updateVibeScoreDisplay(score, { progressEl, percentageEl }) {
        if (!percentageEl || !progressEl) {
            console.error("VibeScore UI Error: Cannot update display because gauge elements were not found or passed correctly.");
            return;
        }

        percentageEl.textContent = `${score}%`;
        
        let mainColor = 'var(--color-danger)';
        if (score >= 80) mainColor = 'var(--neon-green)';
        else if (score >= 50) mainColor = 'var(--color-yellow)';
        
        progressEl.style.background = `conic-gradient(${mainColor} ${score}%, #1C1C1E 0)`;
    },


    /**
     * Creates and animates the surrounding HUD bubbles for each financial category.
     * @param {HTMLElement} plane - The container for the HUD bubbles.
     * @param {Array<Object>} data - The array of financial data objects.
     */
    createHudBubbles(plane, data) {
        const angleStep = 360 / data.length;
        const startingAngle = -90; // Start at the top

        data.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            
            let colors;
            if (!item.hasData) {
                colors = { borderColor: 'var(--color-nodata)', glowColor: 'rgba(0,0,0,0)', textColor: '#9CA3AF' };
            } else if (item.score < 50) {
                colors = { borderColor: 'rgba(255, 69, 0, 0.4)', glowColor: 'rgba(255, 69, 0, 0.3)', textColor: 'var(--color-red)' };
            } else if (item.score < 80) {
                colors = { borderColor: 'rgba(255, 215, 0, 0.4)', glowColor: 'rgba(255, 215, 0, 0.3)', textColor: 'var(--color-yellow)' };
            } else {
                colors = { borderColor: 'rgba(144, 238, 144, 0.4)', glowColor: 'rgba(144, 238, 144, 0.3)', textColor: 'var(--color-green)' };
            }

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            if (!item.hasData) bubble.classList.add('is-nodata');
            
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--glow-color', colors.glowColor);
            
            const scoreText = item.hasData ? item.score.toFixed(0) : 'N/A';
            const coreContent = `
                <div class="bubble-core" style="--text-color: ${colors.textColor};">
                    <span>${item.name}</span>
                    <span class="bubble-score">${scoreText}</span>
                </div>
                <div class="tracer-line"></div>
            `;

            bubble.innerHTML = item.hasData 
                ? coreContent 
                : `<a href="../pages/profile.html" class="bubble-core-link">${coreContent}</a>`;

            plane.appendChild(bubble);

            bubble.addEventListener('mouseenter', () => this.showInsight(item, colors));
            bubble.addEventListener('mouseleave', () => this.hideInsight());
        });
    },

    /**
     * Displays the insight panel with details for a specific financial category.
     * @param {Object} item - The financial data object for the hovered category.
     * @param {Object} colors - The color scheme for the hovered category.
     */
    showInsight(item, colors) {
        const insightPanel = document.getElementById('insight-panel');
        if (!insightPanel) return;

        insightPanel.querySelector('#insight-title').textContent = item.name;
        insightPanel.querySelector('#insight-score').textContent = item.hasData ? item.score.toFixed(0) : 'N/A';
        insightPanel.querySelector('#insight-text').textContent = item.insight;
        
        insightPanel.style.setProperty('--border-color', colors.borderColor);
        insightPanel.querySelector('.insight-score').style.color = colors.textColor;

        insightPanel.classList.add('visible');

        const bubble = [...document.querySelectorAll('.hud-bubble')].find(b => b.querySelector('span').textContent === item.name);
        if (bubble) {
            const tracerLine = bubble.querySelector('.tracer-line');
            if (tracerLine) {
                const radius = 300;
                const bubbleHeight = 55;
                const traceHeight = radius - (bubbleHeight / 2) - 20;
                tracerLine.style.setProperty('--trace-height', `${traceHeight}px`);
                tracerLine.style.setProperty('--glow-color', colors.glowColor);
            }
        }
    },

    /**
     * Hides the insight panel.
     */
    hideInsight() {
        const insightPanel = document.getElementById('insight-panel');
        if (insightPanel) {
            insightPanel.classList.remove('visible');
        }
    }
};

