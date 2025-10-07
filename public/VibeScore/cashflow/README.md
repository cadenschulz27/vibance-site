# Cash Flow Experience

An advanced, modular cash-flow analytics surface that powers Vibance’s "Cash Flow Score" and related storytelling. Everything lives inside this folder to keep the experience close to the existing VibeScore stack while letting us iterate independently.

## Architecture Overview

```
cashflow/
  data/              // Fetch and normalize ledgers, rollups, and budgeting metadata
  analytics/         // Scoring, factor attribution, projections, anomaly/alert engines
  ui/                // Presentation helpers for the VibeScore dashboard and standalone views
  services/          // Platform utilities: caching, preferences, background sync
  tests/             // Dedicated Jest coverage for analytics + data integrity
  index.js           // Single entry point consumed by `VibeScore/vibescore.js`
```

### Data pipeline (`data/`)
- **sources.js** pulls from Firestore (`users/{uid}/cashFlow`, `rollups` collection), Plaid sync artifacts, and budgeting tabs.
- **transformations.js** standardizes raw events into monthly snapshots with dimensionality (fixed vs variable spend, goal allocations, trends).
- **scenarios.js** produces what-if projections (adjust income, cut categories, accelerate goals) that are fed into the UI.

### Analytics (`analytics/`)
- **score-engine.js** combines surplus ratio, volatility, runway, and goal funding into a 0–100 score plus factor breakdowns.
- **factors.js** translates raw analytics into UI-ready factor cards and radar chart data.
- **projections.js** calculates forward-looking runway estimates using smoothing/ARIMA-lite techniques.
- **alerts.js** emits anomaly and threshold alerts (missed paycheck, spike in spend, burn warnings).

### UI (`ui/`)
- **panel.js** orchestrates rendering inside Vibance dashboards.
- **charts.js** exports micro visualizations (sparkline, waterfall, burn gauge).
- **actions.js** centralizes CTAs and suggested automations (budget caps, auto-save adjustments).

### Services (`services/`)
- **cache.js** persists snapshots locally for instant reloads.
- **preferences.js** synchronizes user-customized settings with Firestore and local storage.
- **sync.js** coordinates with Netlify functions (e.g., `daily-cashflow`) for background refreshes.

## Integration Contract

The `index.js` entry exposes a tiny surface used by VibeScore:

```ts
loadCashflowExperience({ uid, root }: LoadOptions): Promise<void>
calculateScore(data: CashflowProfile): CashflowScoreReport
getInsight(report: CashflowScoreReport): string
```

Additional helpers (e.g., `prefetch`, `subscribe`) will be documented inline as they land.

## Testing

Place Jest specs inside `tests/`. Files should import the module under test using relative paths, and keep fast deterministic fixtures so they run with the existing `npm test` command.

## Next Steps

1. Flesh out `data/sources.js` and `analytics/score-engine.js` with real logic.
2. Wire the entry point into `VibeScore/vibescore.js` behind a feature flag or progressive rollout.
3. Build the UI panel and charts.
