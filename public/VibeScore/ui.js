/**
 * @file VibeScore/ui.js
 * @description Manages all DOM manipulation and user interface interactions for the VibeScore component.
 * It is responsible for creating, updating, and handling events for the gauge, HUD, and insight panel.
 */

// FIX: Import the Three.js library as a module
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// --- PRIVATE HELPER FUNCTIONS ---

/**
 * Creates the HTML elements for the central VibeScore gauge.
 * @param {HTMLElement} container - The main container for the VibeScore gauge.
 * @returns {Object} References to the key gauge elements.
 */
function _createGaugeLayers(container) {
    if (!container) return {};
    container.innerHTML = `
        <!-- The new canvas for the starry background goes here -->
        <canvas id="vibescore-particle-canvas" class="vibescore-particle-canvas"></canvas>

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
        progressRingEl: container.querySelector('.progress-ring__progress'),
        // Return a reference to the new canvas
        particleCanvasEl: container.querySelector('#vibescore-particle-canvas')
    };
}


// --- PUBLIC MODULE ---

export const VibeScoreUI = {
    insightPanelEl: null,
    wrapperEl: null,

    _createLocalInsightPanel() {
        // FIX: Find the existing container from the HTML instead of creating a new element.
        const container = document.getElementById('insight-panel-container');
        if (this.insightPanelEl || !container) return;

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
        // FIX: Append the panel to the correct container.
        container.appendChild(panel);
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

    updateVibeScoreDisplay(score, { percentageEl, progressRingEl, particleCanvasEl }) {
        if (!percentageEl || !progressRingEl || !particleCanvasEl) {
            console.error("VibeScore UI Error: Cannot update display because gauge elements were not found.");
            return;
        }

        // FIX: Define the final color values directly here
        let mainColor = '#FF4500'; // --color-danger
        if (score >= 80) mainColor = '#CCFF00'; // --neon-green
        else if (score >= 50) mainColor = '#FFD700'; // --color-yellow
        
        // Update text content and color
        percentageEl.textContent = `${score}%`;
        percentageEl.style.color = mainColor;

        const radius = progressRingEl.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;

        progressRingEl.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRingEl.style.strokeDashoffset = offset;
        
        // FIX: Set the stroke color directly on the element.
        progressRingEl.style.stroke = mainColor;

        // Initialize the particle background with the canvas and color
        this._initParticleBackground(particleCanvasEl, mainColor);
    },

    /**
     * NEW: Initializes the Three.js particle animation inside the gauge.
     * @param {HTMLCanvasElement} canvas - The canvas element to render on.
     * @param {string} color - The hex color for the particles.
     */
    _initParticleBackground(canvas, color) {
        // Prevent re-initialization
        if (canvas.hasAttribute('data-initialized')) return;
        canvas.setAttribute('data-initialized', 'true');

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);

        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCnt = 1000; // Fewer particles for the smaller area
        const posArray = new Float32Array(particlesCnt * 3);
        for (let i = 0; i < particlesCnt * 3; i++) {
            // Distribute particles in a sphere-like shape
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            posArray[i * 3 + 0] = Math.sin(phi) * Math.cos(theta); // x
            posArray[i * 3 + 1] = Math.sin(phi) * Math.sin(theta); // y
            posArray[i * 3 + 2] = Math.cos(phi); // z
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.008,
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.8
        });
        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particlesMesh);
        camera.position.z = 1.5;

        const clock = new THREE.Clock();
        const animate = () => {
            requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            particlesMesh.rotation.y = elapsedTime * 0.1;
            particlesMesh.rotation.x = elapsedTime * 0.1;
            renderer.render(scene, camera);
        };
        animate();

        // Keep the renderer size in sync with the canvas
        new ResizeObserver(() => {
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
        }).observe(canvas);
    },

    createHudBubbles(plane, data) {
        if (!data || !Array.isArray(data)) {
            console.error("VibeScore UI Error: Invalid or missing financial data provided.", data);
            return;
        }
        if (!plane) {
            console.error("VibeScore UI Error: HUD plane element is missing from the DOM.");
            return;
        }

        plane.innerHTML = '';

        const angleStep = 360 / data.length;
        const startingAngle = -90;

        data.forEach((item, index) => {
            const angle = startingAngle + (index * angleStep);

            let colors;
            if (!item.hasData) {
                colors = {
                    borderColor: 'rgba(128, 140, 162, 0.12)',
                    borderHover: 'rgba(150, 162, 182, 0.18)',
                    textColor: '#94A3B8',
                    bubbleBg: 'linear-gradient(150deg, rgba(38, 44, 56, 0.68), rgba(18, 22, 32, 0.78))',
                    gradientStart: 'rgba(44, 52, 68, 0.35)',
                    gradientMid: 'rgba(24, 28, 40, 0.42)',
                    gradientEnd: 'rgba(12, 14, 22, 0.52)',
                    hoverGradientStart: 'rgba(64, 76, 96, 0.48)',
                    hoverGradientEnd: 'rgba(24, 28, 40, 0.58)',
                    outline: 'rgba(84, 90, 110, 0.1)',
                    outlineHover: 'rgba(118, 128, 148, 0.15)',
                    animDuration: '32s',
                    animHoverDuration: '20s'
                };
            } else if (item.score < 50) {
                colors = {
                    borderColor: 'rgba(255, 112, 149, 0.2)',
                    borderHover: 'rgba(255, 132, 170, 0.28)',
                    textColor: '#FF8CA1',
                    bubbleBg: 'linear-gradient(150deg, rgba(255, 112, 149, 0.22), rgba(92, 24, 54, 0.55))',
                    gradientStart: 'rgba(170, 60, 92, 0.35)',
                    gradientMid: 'rgba(92, 28, 58, 0.42)',
                    gradientEnd: 'rgba(38, 16, 40, 0.52)',
                    hoverGradientStart: 'rgba(255, 134, 176, 0.32)',
                    hoverGradientEnd: 'rgba(120, 34, 72, 0.42)',
                    outline: 'rgba(255, 120, 160, 0.15)',
                    outlineHover: 'rgba(255, 150, 190, 0.22)',
                    animDuration: '22s',
                    animHoverDuration: '12s'
                };
            } else if (item.score < 80) {
                colors = {
                    borderColor: 'rgba(255, 196, 120, 0.18)',
                    borderHover: 'rgba(255, 210, 150, 0.28)',
                    textColor: '#FBD38D',
                    bubbleBg: 'linear-gradient(150deg, rgba(255, 196, 120, 0.2), rgba(86, 58, 20, 0.52))',
                    gradientStart: 'rgba(168, 112, 52, 0.32)',
                    gradientMid: 'rgba(98, 62, 24, 0.4)',
                    gradientEnd: 'rgba(46, 30, 16, 0.52)',
                    hoverGradientStart: 'rgba(255, 206, 140, 0.3)',
                    hoverGradientEnd: 'rgba(110, 72, 28, 0.4)',
                    outline: 'rgba(255, 200, 140, 0.12)',
                    outlineHover: 'rgba(255, 220, 160, 0.2)',
                    animDuration: '24s',
                    animHoverDuration: '14s'
                };
            } else {
                colors = {
                    borderColor: 'rgba(204, 255, 0, 0.2)',
                    borderHover: 'rgba(204, 255, 0, 0.32)',
                    textColor: '#CCFF00',
                    bubbleBg: 'linear-gradient(150deg, rgba(204, 255, 0, 0.22), rgba(80, 100, 0, 0.56))',
                    gradientStart: 'rgba(120, 150, 20, 0.32)',
                    gradientMid: 'rgba(100, 130, 10, 0.4)',
                    gradientEnd: 'rgba(70, 90, 0, 0.52)',
                    hoverGradientStart: 'rgba(204, 255, 0, 0.3)',
                    hoverGradientEnd: 'rgba(100, 130, 10, 0.4)',
                    outline: 'rgba(204, 255, 0, 0.15)',
                    outlineHover: 'rgba(204, 255, 0, 0.25)',
                    animDuration: '26s',
                    animHoverDuration: '16s'
                };
            }

            const insightAccent = {
                borderColor: colors.borderColor,
                textColor: colors.textColor
            };

            const bubble = document.createElement('div');
            bubble.className = 'hud-bubble';
            if (!item.hasData) bubble.classList.add('is-nodata');

            bubble.style.setProperty('--angle', `${angle}deg`);
            bubble.style.setProperty('--delay', `${index * 80}ms`);
            bubble.style.setProperty('--border-color', colors.borderColor);
            bubble.style.setProperty('--bubble-border', colors.borderColor);
            bubble.style.setProperty('--bubble-hover-border', colors.borderHover || colors.borderColor);
            bubble.style.setProperty('--bubble-outline-alpha', colors.outline);
            bubble.style.setProperty('--bubble-outline-hover-alpha', colors.outlineHover || colors.outline);
            bubble.style.setProperty('--bubble-hover-gradient-start', colors.hoverGradientStart || colors.gradientStart);
            bubble.style.setProperty('--bubble-hover-gradient-end', colors.hoverGradientEnd || colors.gradientEnd);
            bubble.style.setProperty('--bubble-anim-duration', colors.animDuration || '24s');
            bubble.style.setProperty('--bubble-anim-hover-duration', colors.animHoverDuration || '14s');
            bubble.style.setProperty('--text-color', colors.textColor);
            bubble.style.setProperty('--bubble-title-color', colors.textColor);
            bubble.style.setProperty('--bubble-score-color', colors.textColor);

            const scoreText = item.hasData ? item.score.toFixed(0) : 'N/A';
            const tooltipLines = [];
            if (item.analysis && item.analysis.breakdown) {
                const topFactor = Object.values(item.analysis.breakdown)
                    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];
                const biggestGap = Object.values(item.analysis.breakdown)
                    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
                if (topFactor) tooltipLines.push(`Strength: ${topFactor.label} (${topFactor.score.toFixed(0)})`);
                if (biggestGap) tooltipLines.push(`Focus: ${biggestGap.label} (${biggestGap.score.toFixed(0)})`);
            }
            if (item.analysis?.penalty?.total) {
                tooltipLines.push(`Penalties: -${item.analysis.penalty.total.toFixed(1)} pts`);
            }
            const ariaLabel = tooltipLines.length ? ` aria-label="${tooltipLines.join(' \u2022 ').replace(/"/g, "'")}"` : '';

            const coreContent = `
                <div class="bubble-core"${ariaLabel}>
                    <div class="bubble-info">
                        <span class="bubble-title">${item.name}</span>
                        <span class="bubble-score">${scoreText}</span>
                    </div>
                </div>
            `.trim();
            bubble.innerHTML = coreContent;
            plane.appendChild(bubble);

            bubble.addEventListener('pointerenter', () => this.showInsight(item, insightAccent));
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

