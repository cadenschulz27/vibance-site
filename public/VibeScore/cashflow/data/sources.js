// data/sources.js
// Responsible for orchestrating all upstream data fetches for the cash-flow experience.

import { normalizeLedgerEvents } from './transformations.js';
import { buildScenarioSet } from './scenarios.js';

/**
 * Fetches the raw records needed to compute the cash-flow profile for a given user.
 * @param {object} options
 * @param {string} options.uid - Firebase auth UID.
 * @param {import('firebase/firestore').Firestore} options.db - Firestore instance.
 * @param {object} [options.context] - Optional context (e.g., preloaded user doc).
 * @returns {Promise<object>}
 */
export async function fetchCashflowProfile({ uid, db, context = {} }) {
  if (!uid || !db) {
    throw new Error('[cashflow] fetchCashflowProfile requires uid and db');
  }

  // Placeholder: we will hydrate from Firestore & Plaid rollups in a later step.
  const raw = await readPreferredCashflowSource({ uid, db, context });
  const normalized = normalizeLedgerEvents(raw);
  const scenarios = buildScenarioSet(normalized);

  return {
    ...normalized,
    scenarios,
    metadata: {
      source: raw?.metadata?.source || 'legacy',
      generatedAt: Date.now(),
    },
  };
}

async function readLegacyCashFlowDoc({ uid, db, context }) {
  if (context?.cashFlowDoc) return context.cashFlowDoc;
  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snapshot = await getDoc(doc(db, 'users', uid, 'analytics', 'cashFlow'));
    if (!snapshot.exists()) return {};
    return snapshot.data();
  } catch (error) {
    console.warn('[cashflow] failed to read legacy cash flow document', error);
    return {};
  }
}

async function readPreferredCashflowSource({ uid, db, context }) {
  if (context?.rawCashflow) return context.rawCashflow;
  if (context?.userData?.cashFlow) return context.userData.cashFlow;
  return readLegacyCashFlowDoc({ uid, db, context });
}

/**
 * Prefetch helper for routers. Fetches data but intentionally ignores errors.
 * @param {object} options
 * @returns {Promise<CashflowProfile|null>}
 */
export async function prefetchCashflowProfile(options) {
  try {
    return await fetchCashflowProfile(options);
  } catch (error) {
    console.warn('[cashflow] prefetch failed', error);
    return null;
  }
}
