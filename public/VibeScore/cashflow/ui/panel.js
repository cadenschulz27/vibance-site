// ui/panel.js
// Primary renderer for the cash-flow experience inside Vibance dashboards.

import { createSurplusSparkline, createWaterfall, createScoreGauge } from './charts.js';
import { buildRecommendedActions } from './actions.js';

/**
 * Renders the cash-flow panel.
 * @param {object} options
 * @param {HTMLElement} options.root - Container element.
 * @param {{ score: number, factors: Record<string, number>, diagnostics: object }} options.report
 * @param {{ runwayDays: number, burnoutDate: string|null, trend: Array<object> }} options.projections
 * @param {Array<object>} [options.alerts]
 * @param {Array<object>} [options.scenarios]
 */
export function renderCashflowPanel({ root, report, projections, alerts = [], scenarios = [] }) {
  if (!root) throw new Error('[cashflow] renderCashflowPanel requires a root element');
  root.classList.add('cashflow-panel');
  root.innerHTML = '';

  root.appendChild(renderScoreCluster(report));
  root.appendChild(renderRunwayCard(projections));
  root.appendChild(renderAlerts(alerts));
  root.appendChild(renderScenarios(scenarios));
}

function renderScoreCluster(report) {
  const card = document.createElement('section');
  card.className = 'cf-card cf-card--score';

  const header = document.createElement('header');
  header.innerHTML = `
    <h3>Cash Flow Command Center</h3>
    <p>Your surplus, stability, and runway in one snapshot.</p>
  `;
  card.appendChild(header);

  card.appendChild(createScoreGauge(report?.score || 0));

  const waterfall = createWaterfall(report?.diagnostics?.latestSnapshot || {});
  waterfall.classList.add('cf-card__waterfall');
  card.appendChild(waterfall);

  const sparkline = createSurplusSparkline(report?.diagnostics?.trend || []);
  sparkline.classList.add('cf-card__sparkline');
  card.appendChild(sparkline);

  return card;
}

function renderRunwayCard(projections = {}) {
  const card = document.createElement('section');
  card.className = 'cf-card cf-card--runway';

  const runway = projections.runwayDays ?? 0;
  const burnout = projections.burnoutDate ? new Date(projections.burnoutDate).toLocaleDateString() : 'n/a';

  card.innerHTML = `
    <header>
      <h3>Runway Outlook</h3>
      <p>Projected cushion at current burn rate.</p>
    </header>
    <div class="cf-runway">
      <strong>${runway} days</strong>
      <span>Burnout date: ${burnout}</span>
    </div>
  `;

  const actions = buildRecommendedActions({ projections });
  if (actions.length) {
    const list = document.createElement('ul');
    list.className = 'cf-actions';
    actions.forEach((action) => {
      const item = document.createElement('li');
      item.innerHTML = `<strong>${action.title}</strong><p>${action.body}</p>`;
      list.appendChild(item);
    });
    card.appendChild(list);
  }

  return card;
}

function renderAlerts(alerts = []) {
  const card = document.createElement('section');
  card.className = 'cf-card cf-card--alerts';
  card.innerHTML = `
    <header>
      <h3>Alerts & Signals</h3>
      <p>We flag spikes, dips, and missed paychecks instantly.</p>
    </header>
  `;

  if (!alerts.length) {
    const empty = document.createElement('p');
    empty.className = 'cf-empty';
    empty.textContent = 'No alerts right now. Stay the course!';
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement('ul');
  list.className = 'cf-alerts';
  alerts.forEach((alert) => {
    const item = document.createElement('li');
    item.dataset.severity = alert.severity;
    item.textContent = alert.message;
    list.appendChild(item);
  });
  card.appendChild(list);

  return card;
}

function renderScenarios(scenarios = []) {
  const card = document.createElement('section');
  card.className = 'cf-card cf-card--scenarios';
  card.innerHTML = `
    <header>
      <h3>Scenario Playground</h3>
      <p>Preview what happens when you boost income or trim spend.</p>
    </header>
  `;

  const list = document.createElement('ul');
  list.className = 'cf-scenarios';
  scenarios.forEach((scenario) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <strong>${scenario.label}</strong>
      <span>${scenario.summary}</span>
    `;
    list.appendChild(item);
  });

  if (!scenarios.length) {
    const empty = document.createElement('p');
    empty.className = 'cf-empty';
    empty.textContent = 'Add linked accounts to unlock personalized simulations.';
    card.appendChild(empty);
  } else {
    card.appendChild(list);
  }

  return card;
}
