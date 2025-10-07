// ui/charts.js
// Lightweight chart builders that return DOM nodes for the cash-flow panel.

/**
 * Creates a mini sparkline element visualizing surplus trend.
 * @param {Array<{ surplus: number }>} series
 * @returns {HTMLElement}
 */
export function createSurplusSparkline(series = []) {
  const canvas = document.createElement('div');
  canvas.className = 'cf-chart cf-chart--sparkline';
  canvas.dataset.points = series.map((point) => point.surplus).join(',');
  // Actual rendering hooked up later by a micro chart library.
  return canvas;
}

/**
 * Creates a waterfall-style list showing income vs expense vs surplus.
 * @param {{ income: number, expense: number, surplus: number }} snapshot
 * @returns {HTMLElement}
 */
export function createWaterfall(snapshot = {}) {
  const wrapper = document.createElement('dl');
  wrapper.className = 'cf-waterfall';
  wrapper.innerHTML = `
    <div>
      <dt>Income</dt>
      <dd data-kind="income">${formatCurrency(snapshot.income || 0)}</dd>
    </div>
    <div>
      <dt>Expenses</dt>
      <dd data-kind="expense">${formatCurrency(snapshot.expense || 0)}</dd>
    </div>
    <div>
      <dt>Surplus</dt>
      <dd data-kind="surplus">${formatCurrency(snapshot.surplus || 0)}</dd>
    </div>
  `;
  return wrapper;
}

/**
 * Creates a circular gauge summarizing the overall cash-flow score.
 * @param {number} score
 * @returns {HTMLElement}
 */
export function createScoreGauge(score) {
  const gauge = document.createElement('div');
  gauge.className = 'cf-gauge';
  gauge.dataset.score = String(score ?? 0);
  gauge.innerHTML = `
    <span class="cf-gauge__value">${Math.round(score ?? 0)}</span>
    <span class="cf-gauge__label">Cash Flow Score</span>
  `;
  return gauge;
}

function formatCurrency(value) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  } catch (error) {
    return `$${Math.round(value || 0)}`;
  }
}
