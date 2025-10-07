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

export function getCashflowInsight(report) {
  if (!report) return 'Connect accounts to calculate your cash flow score.';
  const breakdown = buildFactorBreakdown(report);
  const sorted = [...breakdown].sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const weakest = sorted.at(-1);
  const base = `Cash Flow Score: ${Math.round(report.score)}. `;
  if (!strongest || !weakest) {
    return `${base}We’re analyzing your factors—check back soon.`;
  }
  return `${base}${strongest.label} is leading the way, while ${weakest.label.toLowerCase()} has the biggest upside.`;
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
