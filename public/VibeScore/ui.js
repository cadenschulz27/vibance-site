/**
 * @file VibeScore/ui.js
 * @description Manages all DOM manipulation and user interface interactions for the VibeScore component.
 * It is responsible for creating, updating, and handling events for the gauge, HUD, and insight panel.
 */

// --- PRIVATE HELPER FUNCTIONS ---

/**
 * Creates the HTML elements for the central VibeScore gauge.
 * @param {HTMLElement} container - The main container for the VibeScore gauge.
 * @returns {Object} References to the key gauge elements.
 */
function _createGaugeLayers(container) {
    if (!container) return {};
    container.innerHTML = `
        <svg class="gauge-layer progress-ring" viewBox="0 0 120 120">
            <circle class="progress-ring__track" cx="60" cy="60" r="54" fill="transparent" />
            <circle class="progress-ring__progress" cx="60" cy="60" r="54" fill="transparent" />
        </svg>

        <div class="vibescore-inner-text">
            <span id="vibe-score-percentage" class="vibescore-percentage">0%</span>
            <span class="vibescore-label">VibeScore</span>
        </div>
    `;
    return {
        percentageEl: container.querySelector('#vibe-score-percentage'),
        progressRingEl: container.querySelector('.progress-ring__progress')
    };
}


// --- PUBLIC MODULE ---

export const VibeScoreUI = {
    insightPanelEl: null,
    wrapperEl: null,

    _createLocalInsightPanel() {
        if (this.insightPanelEl || !this.wrapperEl) return;
        const panel = document.createElement('div');
        panel.id = 'insight-panel';
        panel.className = 'insight-panel';
        panel.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h3 class="insight-title text-lg font-semibold"></h3>
                <p class="insight-score font-bold text-lg"></p>
            </div>
            <p class="insight-text text-gray-400 text-sm leading-relaxed"></p>
        `;
        this.wrapperEl.appendChild(panel);
        this.insightPanelEl = panel;
    },
    
    init(vibeScore, financialData) {
        this.wrapperEl = document.getElementById('vibescore-section');
        const vibeScoreContainer = document.getElementById('vibescore-container');
        const hudPlane = document.getElementById('hud-plane');

        if (!this.wrapperEl || !vibeScoreContainer || !hudPlane) {
            console.error("VibeScore UI Error: A required container element is missing from the DOM.");
            return;
        }

        const gaugeElements = _createGaugeLayers(vibeScoreContainer);
        this._createLocalInsightPanel();
        this.createHudBubbles(hudPlane, financialData);
        this.updateVibeScoreDisplay(vibeScore, gaugeElements);
    },

    /**
     * Updates the central VibeScore display and animates the progress ring.
     * @param {number} score - The overall VibeScore (0-100).
     * @param {Object} elements - Direct references to the gauge elements.
     */
    updateVibeScoreDisplay(score, { percentageEl, progressRingEl }) {
        if (!percentageEl || !progressRingEl) {
            console.error("VibeScore UI Error: Cannot update display because gauge elements were not found.");
            return;
        }

        // Determine color based on score
        let mainColor = 'var(--color-danger)';
        if (score >= 80) mainColor = 'var(--neon-green)';
        else if (score >= 50) mainColor = 'var(--color-yellow)';
        
        // Update text content and color directly
        percentageEl.textContent = `${score}%`;
        percentageEl.style.color = mainColor;

        // Animate the SVG progress ring
        const radius = progressRingEl.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;

        progressRingEl.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRingEl.style.strokeDashoffset = offset;
        
        // FIX: Apply the stroke color directly to the ring element.
        progressRingEl.style.stroke = mainColor;
    },

    createHudBubbles(plane, data) {
        if (!data || !Array.isArray(data)) {
            console.error("VibeScore UI Error: Invalid or missing financial data provided.", data);
            return;
        }
        const angleStep = 360 / data.length;
        const startingAngle = -90;

        data.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);
            
            let colors;
            if (!item.hasData) {
                colors = { borderColor: 'var(--color-nodata)', textColor: '#9CA3AF' };
            } else if (item.score < 50) {
                colors = { borderColor: 'rgba(255, 69, 0, 0.4)', textColor: 'var(--color-red)' };
            } else if (item.score < 80) {
                colors = { borderColor: 'rgba(255, 215, 0, 0.4)', textColor: 'var(--color-yellow)' };
            } else {
                colors = { borderColor: 'rgba(144, 238, 144, 0.4)', textColor: 'var(--color-green)' };
            }

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            if (!item.hasData) bubble.classList.add('is-nodata');
            
            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            
            const scoreText = item.hasData ? item.score.toFixed(0) : 'N/A';
            const coreContent = `<div class="bubble-core" style="--text-color: ${colors.textColor};"><span>${item.name}</span><span class="bubble-score">${scoreText}</span></div>`;
            bubble.innerHTML = item.hasData ? coreContent : `<a href="../pages/profile.html" class="bubble-core-link">${coreContent}</a>`;
            plane.appendChild(bubble);

            bubble.addEventListener('pointerenter', () => this.showInsight(item, colors));
            bubble.addEventListener('pointerleave', () => this.hideInsight());
        });
    },

    showInsight(item, colors) {
        if (!this.insightPanelEl || !this.wrapperEl) return;
        
        this.insightPanelEl.querySelector('.insight-title').textContent = item.name;
        this.insightPanelEl.querySelector('.insight-score').textContent = item.hasData ? item.score.toFixed(0) : 'N/A';
        this.insightPanelEl.querySelector('.insight-text').textContent = item.insight;
        this.insightPanelEl.style.setProperty('--border-color', colors.borderColor);
        this.insightPanelEl.querySelector('.insight-score').style.color = colors.textColor;

        this.insightPanelEl.classList.add('visible');
        this.wrapperEl.classList.add('insight-is-active');
    },

    hideInsight() {
        if (this.insightPanelEl && this.wrapperEl) {
            this.insightPanelEl.classList.remove('visible');
            this.wrapperEl.classList.remove('insight-is-active');
        }
    }
};

