/**
 * @file VibeScore/vibescore.js
 * @description Main controller for the VibeScore component. This script authenticates the user,
 * fetches their financial data, orchestrates the calculations and insights, and initializes the UI.
 */

// --- MODULE IMPORTS ---
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { VibeScoreCalculations } from './calculations.js';
import { VibeScoreInsights } from './insights.js';
import { VibeScoreUI } from './ui.js';
import { loadIncomeDataFromTabs } from './income/data-loader.js';
import { loadCashflowExperience, getCashflowInsight } from './cashflow/index.js';

// --- DATA MAPPING ---

/**
 * A map that connects financial category names to their respective calculation functions,
 * insight generation functions, and the key used to access their data in Firestore.
 * This centralized map makes the system easily extensible.
 */
const calculationMap = {
    'Savings': {
        calc: VibeScoreCalculations.Savings,
        gen: VibeScoreInsights.Savings,
        dataKey: 'savings'
    },
    'Budgeting': {
        calc: VibeScoreCalculations.Budgeting,
        gen: VibeScoreInsights.Budgeting,
        dataKey: 'budgeting'
    },
    'Income': {
        calc: VibeScoreCalculations.Income,
        gen: VibeScoreInsights.Income,
        dataKey: 'income',
        prepare: async ({ uid, userData }) => {
            const derived = await loadIncomeDataFromTabs(uid, userData);
            if (derived) return derived;
            return userData?.income || {};
        }
    },
    'Cash Flow': {
        calc: (data = {}) => {
            if (!data.report) return null;
            return {
                score: data.report.score ?? 0,
                report: data.report,
                projections: data.projections,
                alerts: data.alerts,
                scenarios: data.scenarios,
                breakdown: buildCashflowBreakdown(data.report),
                penalty: { total: 0, items: [] },
            };
        },
        gen: (_data, _score, analysis) => getCashflowInsight(analysis?.report ?? null),
        dataKey: 'cashFlow',
        prepare: async ({ uid, userData, db, roots }) => {
            try {
                const result = await loadCashflowExperience({
                    uid,
                    db,
                    root: roots?.cashflow || null,
                    context: { userData },
                });
                return result;
            } catch (error) {
                console.warn('[VibeScore] Failed to load cashflow experience', error);
                return userData?.cashFlow || {};
            }
        }
    },
    'Credit Score': {
        calc: VibeScoreCalculations['Credit Score'],
        gen: VibeScoreInsights['Credit Score'],
        dataKey: 'credit'
    },
    'Investing': {
        calc: VibeScoreCalculations.Investing,
        gen: VibeScoreInsights.Investing,
        dataKey: 'investing'
    },
    'Retirement': {
        calc: VibeScoreCalculations.Retirement,
        gen: VibeScoreInsights.Retirement,
        dataKey: 'retirement'
    },
    'Debt': {
        calc: VibeScoreCalculations.Debt,
        gen: VibeScoreInsights.Debt,
        dataKey: 'debt'
    },
    'Net Worth': {
        calc: VibeScoreCalculations['Net Worth'],
        gen: VibeScoreInsights['Net Worth'],
        dataKey: 'netWorth'
    },
    'Emergency Fund': {
        calc: VibeScoreCalculations['Emergency Fund'],
        gen: VibeScoreInsights['Emergency Fund'],
        dataKey: 'emergencyFund'
    }
};

let currentUserId = null;
let renderInFlight = false;
let pendingRenderUid = null;

function normalizeInsightPayload(value, { hasData, category } = {}) {
    const trim = (text) => (typeof text === 'string' ? text.trim() : '');
    const mapBullets = (items = []) => items
        .map((item) => trim(item))
        .filter(Boolean)
        .slice(0, 3);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const summary = trim(value.summary);
        const strengths = mapBullets(value.strengths);
        const improvements = mapBullets(value.improvements);

        if (!strengths.length && hasData) {
            strengths.push(`We’re still crunching ${category || 'this score'}—check back for highlights.`);
        }
        if (!improvements.length) {
            improvements.push(hasData
                ? 'We’ll surface targeted next moves as new data lands.'
                : 'Add data to unlock tailored next steps.');
        }

        return { summary, strengths, improvements };
    }

    if (typeof value === 'string' && value.trim().length) {
        return {
            summary: value.trim(),
            strengths: hasData ? [] : ['Sync this category to surface wins.'],
            improvements: ['Add data to unlock tailored next steps.'],
        };
    }

    return {
        summary: '',
        strengths: hasData ? [`We’re still crunching ${category || 'this score'}—check back for highlights.`] : ['Sync this category to surface wins.'],
        improvements: ['Add data to unlock tailored next steps.'],
    };
}

async function renderVibeScore(uid) {
    if (!uid) return;
    if (currentUserId && uid !== currentUserId) return;
    if (renderInFlight) {
        pendingRenderUid = uid;
        return;
    }

    renderInFlight = true;
    try {
        const userDocRef = doc(db, "users", uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};

        if (currentUserId && uid !== currentUserId) {
            return;
        }

        const dynamicFinancialData = await Promise.all(Object.keys(calculationMap).map(async (name) => {
            const map = calculationMap[name];
            let data = {};
            if (typeof map.prepare === 'function') {
                data = await map.prepare({ uid, userData, db }) || {};
            } else {
                data = userData[map.dataKey] || {};
            }
            const hasData = !!(data && typeof data === 'object' && Object.values(data).some((value) => {
                if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
                if (typeof value === 'boolean') return true;
                if (typeof value === 'string') return value.trim().length > 0;
                if (Array.isArray(value)) return value.length > 0;
                if (value && typeof value === 'object') {
                    return Object.keys(value).length > 0;
                }
                return false;
            }));
            const calcResult = hasData ? map.calc(data) : null;
            const score = hasData
                ? (typeof calcResult === 'number' ? calcResult : (calcResult?.score ?? 0))
                : 0;
            const analysis = (calcResult && typeof calcResult === 'object') ? calcResult : null;
            let rawInsight;
            if (hasData) {
                rawInsight = map.gen(data, score, analysis);
            } else if (typeof VibeScoreInsights.default === 'function') {
                rawInsight = VibeScoreInsights.default();
            } else {
                rawInsight = null;
            }

            const insight = normalizeInsightPayload(rawInsight, { hasData, category: name });

            return { name, score, insight, hasData, analysis };
        }));

        const itemsWithData = dynamicFinancialData.filter(item => item.hasData);
        const totalScore = itemsWithData.reduce((acc, item) => acc + item.score, 0);
        const userVibeScore = itemsWithData.length > 0 ? Math.round(totalScore / itemsWithData.length) : 0;

        VibeScoreUI.init(userVibeScore, dynamicFinancialData);
    } catch (error) {
        console.error("Error initializing VibeScore:", error);
    } finally {
        renderInFlight = false;
        if (pendingRenderUid) {
            if (currentUserId && pendingRenderUid !== currentUserId) {
                pendingRenderUid = null;
                return;
            }
            const nextUid = pendingRenderUid;
            pendingRenderUid = null;
            renderVibeScore(nextUid);
        }
    }
}


// --- INITIALIZATION LOGIC ---

/**
 * Main function to initialize the VibeScore component.
 * It waits for user authentication, fetches and processes data, then renders the UI.
 */
function initVibeScore() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            await renderVibeScore(user.uid);
        } else {
            currentUserId = null;
            VibeScoreUI.hideInsight();
        }
    });
}

const CASHFLOW_FACTOR_META = {
    surplus: { label: 'Surplus Quality', weight: 0.4 },
    volatility: { label: 'Stability', weight: 0.2 },
    runway: { label: 'Runway', weight: 0.25 },
    goals: { label: 'Goal Fuel', weight: 0.15 },
};

function buildCashflowBreakdown(report = {}) {
    const factors = report.factors || {};
    return Object.entries(CASHFLOW_FACTOR_META).reduce((acc, [key, meta]) => {
        const score = Math.round(factors[key] ?? 0);
        acc[key] = {
            key,
            label: meta.label,
            score,
            weight: meta.weight,
            contribution: Math.round(meta.weight * score),
        };
        return acc;
    }, {});
}


// --- SCRIPT EXECUTION ---

// Start the initialization process once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initVibeScore);

document.addEventListener('income-profile:updated', () => {
    if (!currentUserId) return;
    renderVibeScore(currentUserId);
});