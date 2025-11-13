// cashflow/index.js
// Public entry point consumed by VibeScore and other dashboards.

import { fetchCashflowProfile, prefetchCashflowProfile } from './data/sources.js';
import { buildScenarioSet } from './data/scenarios.js';
import { buildScoreReport } from './analytics/score-engine.js';
import { buildFactorBreakdown } from './analytics/factors.js';
import { buildProjections } from './analytics/projections.js';
import { evaluateAlerts } from './analytics/alerts.js';
import { renderCashflowPanel } from './ui/panel.js';
import { readPreferences, writePreferences } from './services/preferences.js';
import { readCachedSnapshot, writeCachedSnapshot, clearCachedSnapshot } from './services/cache.js';
import { triggerCashflowSync } from './services/sync.js';

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};


/**
 * Loads everything needed for the cash-flow module and optionally renders the UI.
 * @param {object} options
 * @param {string} options.uid
 * @param {import('firebase/firestore').Firestore} options.db
 * @param {HTMLElement} [options.root]
 * @param {string} [options.token]
 * @param {boolean} [options.forceRefresh]
 * @param {boolean} [options.useCache]
 * @param {boolean} [options.triggerSync]
 * @param {object} [options.context]
 */
export async function loadCashflowExperience({
  uid,
  db,
  root,
  token,
  forceRefresh = false,
  useCache = true,
  triggerSync: shouldTriggerSync = false,
  context,
} = {}) {
  if (!uid || !db) throw new Error('[cashflow] loadCashflowExperience requires uid and db');

  if (shouldTriggerSync && token) {
    try {
      await triggerCashflowSync({ token });
    } catch (error) {
      console.warn('[cashflow] sync trigger failed', error);
    }
  }

  let profile = null;
  if (useCache && !forceRefresh) {
    profile = readCachedSnapshot(uid)?.snapshot || null;
  }

  if (!profile || forceRefresh) {
    profile = await fetchCashflowProfile({ uid, db, context });
    writeCachedSnapshot(uid, profile);
  }

  const report = buildScoreReport(profile);
  const projections = buildProjections(profile);
  const alerts = evaluateAlerts({ profile, projections });
  const scenarios = profile.scenarios || buildScenarioSet(profile);

  if (root) {
    renderCashflowPanel({
      root,
      report,
      projections,
      alerts,
      scenarios,
    });
  }

  return {
    profile,
    report,
    projections,
    alerts,
    scenarios,
  };
}

export function calculateScore(profile) {
  return buildScoreReport(profile);
}

const normalizeBullet = (value) => (typeof value === 'string' ? value.trim() : '');

const buildInsightPayload = ({ summary = '', strengths = [], improvements = [] } = {}) => ({
  summary: normalizeBullet(summary),
  strengths: strengths.map(normalizeBullet).filter(Boolean).slice(0, 3),
  improvements: improvements.map(normalizeBullet).filter(Boolean).slice(0, 3),
});

export function getCashflowInsight(report) {
  if (!report) {
    return buildInsightPayload({
      summary: '',
      strengths: ['Connect cash-flow accounts so we can surface wins.'],
      improvements: ['Sync transactions to unlock monthly surplus guidance.'],
    });
  }

  const breakdown = buildFactorBreakdown(report);
  const sorted = [...breakdown].sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const weakest = sorted.at(-1);
  const summary = `Cash Flow Score: ${Math.round(report.score)}.`;

  const strengths = [];
  const improvements = [];

  if (strongest) {
    strengths.push(`${strongest.label} is leading at ${strongest.value}/100.`);
  }
  if (report.diagnostics?.latestSnapshot) {
    const snap = report.diagnostics.latestSnapshot;
    const income = Number(snap.income) || 0;
    const expense = Number(snap.expense) || 0;
    const surplus = income - expense;
    if (surplus > 0) {
      strengths.push(`Latest month cleared ${formatCurrency(surplus)} beyond expenses.`);
    }
  }

  if (weakest) {
    improvements.push(`Focus on ${weakest.label.toLowerCase()} to unlock the next score band.`);
  }

  if (!improvements.length) {
    improvements.push('Keep monitoring cash streaks—we’ll flag drift if it appears.');
  }

  return buildInsightPayload({ summary, strengths, improvements });
}

export async function prefetchCashflow(options) {
  return prefetchCashflowProfile(options);
}

export function clearCashflowCache(uid) {
  clearCachedSnapshot(uid);
}

export { readPreferences as loadPreferences, writePreferences as savePreferences };

export default {
  loadCashflowExperience,
  calculateScore,
  getCashflowInsight,
  prefetchCashflow,
  loadPreferences: readPreferences,
  savePreferences: writePreferences,
  clearCashflowCache,
};
