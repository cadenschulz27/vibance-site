/**
 * @file VibeScore/ui.js
 * @description Handles the creation, manipulation, and interaction of all
 * VibeScore-related DOM elements.
 */

// A private container for DOM elements to avoid repeated queries.
const DOM = {};

/**
 * Determines the appropriate color set for a bubble based on its score.
 * @param {object} item - The financial data item for the bubble.
 * @returns {object} An object containing border, glow, and text colors.
 */
function getBubbleColors(item) {
    if (!item.hasData) {
        return {
            borderColor: 'var(--bubble-nodata-border-color)',
            glowColor: 'rgba(0,0,0,0)',
            textColor: 'var(--bubble-nodata-text-color)'
        };
    }
    if (item.score < 50) {
        return {
            borderColor: 'rgba(255, 69, 0, 0.4)',
            glowColor: 'rgba(255, 69, 0, 0.3)',
            textColor: 'var(--color-red)'
        };
    }
    if (item.score < 80) {
        return {
            borderColor: 'rgba(255, 215, 0, 0.4)',
            glowColor: 'rgba(255, 215, 0, 0.3)',
            textColor: 'var(--color-yellow)'
        };
    }
    return {
        borderColor: 'rgba(144, 238, 144, 0.4)',
        glowColor: 'rgba(144, 238, 144, 0.3)',
        textColor: 'var(--color-green)'
    };
}

/**
 * Handles the mouse enter event for a HUD bubble.
 * @param {Event} event - The mouse event.
 * @param {object} item - The financial data associated with the bubble.
 * @param {object} colors - The color set for the bubble.
 */
function handleBubbleMouseEnter(event, item, colors) {
    const scoreText = item.hasData ? `${item.score.toFixed(0)}%` : 'N/A';
    
    // Populate and style the insight panel
    DOM.insightTitle.textContent = item.name;
    DOM.insightScore.textContent = scoreText;
    DOM.insightText.textContent = item.insight;
    DOM.insightPanel.style.setProperty('--border-color', colors.borderColor);
    DOM.insightPanel.style.setProperty('--text-color', colors.textColor);
    DOM.insightPanel.classList.add('visible');

    // Animate the tracer line
    const tracerLine = event.currentTarget.querySelector('.tracer-line');
    if (tracerLine) {
        // Calculate the height needed for the line to connect to the panel
        const hudRadius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-radius'));
        const bubbleHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bubble-height'));
        const traceHeight = hudRadius - (bubbleHeight / 2) - 20; // -20 for padding

        tracerLine.style.setProperty('--trace-height', `${traceHeight}px`);
        tracerLine.style.setProperty('--glow-color', colors.glowColor);
    }
}

/**
 * Handles the mouse leave event for a HUD bubble.
 */
function handleBubbleMouseLeave() {
    DOM.insightPanel.classList.remove('visible');
}

/**
 * Creates and appends all HUD bubbles to the DOM.
 * @param {Array<object>} financialData - The array of financial data objects.
 */
function createHudBubbles(financialData) {
    // Clear any existing bubbles before creating new ones
    DOM.hudPlane.innerHTML = '';
    const angleStep = 360 / financialData.length;
    const startingAngle = -90; // Start at the top

    financialData.forEach((item, index) => {
        const angle = startingAngle + (index * angleStep);
        const colors = getBubbleColors(item);

        const bubble = document.createElement('div');
        bubble.className = `hud-bubble${!item.hasData ? ' is-nodata' : ''}`;

        // Set CSS custom properties for dynamic styling and animation
        bubble.style.setProperty('--angle', `${angle}deg`);
        bubble.style.setProperty('--delay', `${index * 80}ms`);
        bubble.style.setProperty('--border-color', colors.borderColor);
        bubble.style.setProperty('--glow-color', colors.glowColor);
        
        const scoreText = item.hasData ? `${item.score.toFixed(0)}%` : 'N/A';
        const coreContent = `
            <div class="bubble-core" style="--text-color: ${colors.textColor};">
                <span>${item.name}</span>
                <span class="bubble-score">${scoreText}</span>
            </div>
            <div class="tracer-line"></div>
        `;

        // If data is missing, wrap the bubble content in a link to the profile page
        bubble.innerHTML = item.hasData 
            ? coreContent 
            : `<a href="../pages/profile.html" class="bubble-core-link">${coreContent}</a>`;

        DOM.hudPlane.appendChild(bubble);

        // Add event listeners for interactivity
        bubble.addEventListener('mouseenter', (e) => handleBubbleMouseEnter(e, item, colors));
        bubble.addEventListener('mouseleave', handleBubbleMouseLeave);
    });
}

/**
 * Injects the insight panel HTML into its placeholder for cleaner markup.
 */
function createInsightPanel() {
    DOM.insightPanelContainer.innerHTML = `
        <div id="insight-panel" class="insight-panel">
            <div class="flex justify-between items-center mb-2">
                <h3 id="insight-title" class="insight-title text-lg font-semibold"></h3>
                <p id="insight-score" class="insight-score font-bold text-lg"></p>
            </div>
            <p id="insight-text" class="text-gray-400 text-sm leading-relaxed"></p>
        </div>
    `;
    // After creating it, add its elements to the DOM cache
    DOM.insightPanel = document.getElementById('insight-panel');
    DOM.insightTitle = document.getElementById('insight-title');
    DOM.insightScore = document.getElementById('insight-score');
    DOM.insightText = document.getElementById('insight-text');
}

/**
 * Main UI initialization function. Caches DOM elements and builds the component.
 * @param {Array<object>} financialData - The user's processed financial data.
 */
function initialize(financialData) {
    // Cache all necessary DOM elements once
    DOM.vibeScorePercentage = document.getElementById('vibe-score-percentage');
    DOM.gaugeProgress = document.querySelector('.gauge-progress');
    DOM.hudPlane = document.getElementById('hud-plane');
    DOM.insightPanelContainer = document.getElementById('insight-panel-container');

    if (!DOM.hudPlane || !DOM.insightPanelContainer) {
        console.error("VibeScore UI Error: Essential DOM elements not found.");
        return;
    }

    createInsightPanel();
    createHudBubbles(financialData);
}

/**
 * Updates the central VibeScore gauge with the final calculated score.
 * @param {number} vibeScore - The user's overall VibeScore.
 */
function updateMainGauge(vibeScore) {
    if (!DOM.vibeScorePercentage || !DOM.gaugeProgress) return;
    
    // Animate the score text
    let currentScore = 0;
    const interval = setInterval(() => {
        if (currentScore >= vibeScore) {
            clearInterval(interval);
            DOM.vibeScorePercentage.textContent = `${vibeScore}%`;
        } else {
            currentScore++;
            DOM.vibeScorePercentage.textContent = `${currentScore}%`;
        }
    }, 15);

    // Set the gauge's color based on the score
    let mainColor = 'var(--color-danger)';
    if (vibeScore >= 80) mainColor = 'var(--neon-green)';
    else if (vibeScore >= 50) mainColor = 'var(--color-yellow)';
    
    DOM.vibeScorePercentage.style.color = mainColor;
    DOM.gaugeProgress.style.background = `conic-gradient(${mainColor} ${vibeScore}%, #1C1C1E 0%)`;
}


// Export the public methods to be used by the main vibescore.js orchestrator
export const VibeScoreUI = {
    init: initialize,
    updateMainGauge,
};
