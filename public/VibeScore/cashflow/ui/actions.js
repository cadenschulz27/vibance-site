// ui/actions.js
// Centralizes recommended actions and CTAs for the cash-flow experience.

/**
 * @param {object} context
 * @param {{ runwayDays: number }} context.projections
 * @returns {Array<{ title: string, body: string }>}
 */
export function buildRecommendedActions({ projections = {} } = {}) {
  const actions = [];
  const runway = projections.runwayDays ?? 0;

  if (runway < 30) {
    actions.push({
      title: 'Freeze Discretionary Spend',
      body: 'Pause entertainment and luxury categories until runway is above 45 days.',
    });
  } else if (runway > 120) {
    actions.push({
      title: 'Deploy Idle Cash',
      body: 'Consider sweeping excess cash into high-yield savings or investment goals.',
    });
  }

  actions.push({
    title: 'Schedule Automatic Sync',
    body: 'Link accounts or refresh Plaid connections to keep insights live.',
  });

  return actions;
}
