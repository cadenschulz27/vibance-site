import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { dataPresenceScore } from '../VibeScore/income/metrics.js';
import {
  REQUIRED_PROFILE_WEIGHTS,
  UNEMPLOYMENT_DATA,
  INCOME_COVERAGE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_RISK_OPTIONS,
  BONUS_RELIABILITY_OPTIONS,
  SKILL_DEMAND_OPTIONS,
  STEPS
} from './income-profile-constants.js';

const elements = {
  launch: document.getElementById('income-profile-launch'),
  launchCard: document.getElementById('income-profile-launch-card'),
  status: document.getElementById('income-profile-status'),
  modal: document.getElementById('income-profile-modal'),
  overlay: document.getElementById('income-modal-overlay'),
  panel: document.getElementById('income-modal-panel'),
  close: document.getElementById('income-modal-close'),
  form: document.getElementById('income-modal-form'),
  stepContainer: document.getElementById('income-modal-step-container'),
  progressBar: document.getElementById('income-modal-progress'),
  stepLabel: document.getElementById('income-modal-step-label'),
  saveStatus: document.getElementById('income-modal-save-status'),
  nextBtn: document.getElementById('income-modal-next'),
  backBtn: document.getElementById('income-modal-back'),
  toast: document.getElementById('income-profile-toast'),
  editButtons: Array.from(document.querySelectorAll('[data-income-profile-edit]'))
};

const state = {
  userId: null,
  profileData: {},
  profileMeta: {
    completedSteps: 0,
    lastUpdated: null
  },
  currentStep: 0,
  modalOpen: false,
  dirtyFields: new Set(),
  saveTimer: null,
  isSaving: false,
  hasCelebrated: false,
  toastTimer: null,
  isLoadingProfile: false,
  pendingLaunch: false,
  onboardingCompletionMarked: false
};

function setWrapperCompact(compact) {
  if (!elements.launchCard) return;
  const wrapper = elements.launchCard.closest('.vibescore-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('vibescore-wrapper--compact', !!compact);
  }

  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.classList.toggle('dashboard-main--compact', !!compact);
  }
}

function toggleEditButtons(visible) {
  if (!elements.editButtons || !elements.editButtons.length) return;
  elements.editButtons.forEach((button) => {
    button.hidden = !visible;
  });
}

function consumeAutoLaunchFlag() {
  try {
    const flag = window.localStorage.getItem('vibance:startIncomeProfile');
    if (flag) {
      window.localStorage.removeItem('vibance:startIncomeProfile');
      return true;
    }
  } catch (error) {
    console.warn('[IncomeProfile] Unable to access localStorage for auto launch', error);
  }
  return false;
}

function getProfileCompletionScore() {
  const presence = dataPresenceScore(state.profileData, REQUIRED_PROFILE_WEIGHTS) || { score: 0 };
  const raw = Number.isFinite(presence.score) ? presence.score : 0;
  return {
    raw,
    rounded: Math.round(raw)
  };
}

function hasCompletedAllSteps() {
  return (state.profileMeta.completedSteps || 0) >= STEPS.length;
}

function isProfileComplete(roundedScore) {
  return hasCompletedAllSteps() && roundedScore >= 95;
}

function showLaunchCard() {
  if (elements.launchCard) {
    elements.launchCard.classList.remove('income-profile-launch--dismissed');
  }
  toggleEditButtons(false);
  setWrapperCompact(false);
}

function hideLaunchCard() {
  if (elements.launchCard) {
    elements.launchCard.classList.add('income-profile-launch--dismissed');
  }
  toggleEditButtons(true);
  setWrapperCompact(true);
}

function hideCompletionToast() {
  if (state.toastTimer) {
    window.clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
  if (elements.toast) {
    elements.toast.classList.remove('is-visible');
    elements.toast.innerHTML = '';
  }
}

function showCompletionToast() {
  if (!elements.toast) return;
  elements.toast.innerHTML = `
    <div class="income-profile-toast__title">Income profile locked in</div>
    <div class="income-profile-toast__meta">We&rsquo;ll keep tuning your VibeScore with the new details.</div>
  `;
  elements.toast.classList.add('is-visible');
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    hideCompletionToast();
  }, 4200);
}

function spawnConfettiBurst() {
  const colors = ['#CCFF00', '#8C6CFF', '#00FACC', '#F5F5F5'];
  const pieceCount = 36;
  const container = document.createElement('div');
  container.className = 'income-confetti';
  for (let i = 0; i < pieceCount; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'income-confetti__piece';
    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const duration = 1.8 + Math.random() * 1.1;
    const delay = Math.random() * 0.3;
    const xOffset = (Math.random() * 80) - 40;
    const rotation = 180 + Math.random() * 360;
    piece.style.background = color;
    piece.style.left = `${left}%`;
    piece.style.setProperty('--duration', `${duration}s`);
    piece.style.setProperty('--delay', `${delay}s`);
    piece.style.setProperty('--x-offset', `${xOffset}px`);
    piece.style.setProperty('--rotation', `${rotation}deg`);
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  window.setTimeout(() => {
    container.remove();
  }, 2600);
}

function triggerCompletionCelebration() {
  spawnConfettiBurst();
  showCompletionToast();
}

function markOnboardingIncomeComplete() {
  if (!state.userId || state.onboardingCompletionMarked) {
    return;
  }
  state.onboardingCompletionMarked = true;
  const userRef = doc(db, 'users', state.userId);
  setDoc(userRef, {
    onboarding: {
      pending: false,
      basicsComplete: true,
      incomeProfileComplete: true,
      skippedAt: null,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    updatedAt: serverTimestamp()
  }, { merge: true }).catch((error) => {
    state.onboardingCompletionMarked = false;
    console.warn('[IncomeProfile] Failed to mark onboarding complete', error);
  });
}

const REQUIRED_MESSAGE = 'This field is required.';

const escapeHtml = (input = '') => String(input)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = (input = '') => escapeHtml(input).replace(/`/g, '&#96;');

const buildLabelMarkup = (field) => {
  const labelText = escapeHtml(field.label || '');
  const badgeText = field.required ? 'Required' : 'Optional';
  const badgeClass = field.required ? 'income-field__label-badge' : 'income-field__label-badge income-field__label-badge--optional';
  return `
    <div class="income-field__label-row">
      <div class="income-field__label-group">
        <span class="income-field__label-text">${labelText}</span>
      </div>
      <span class="${badgeClass}">${badgeText}</span>
    </div>
  `;
};

const buildFieldNotes = (field) => {
  const meta = [];
  if (field.info) {
    meta.push(`
      <div class="income-field__support">
        <span class="income-field__support-eyebrow">Why this matters</span>
        <p class="income-field__support-text">${escapeHtml(field.info)}</p>
      </div>
    `);
  }
  if (field.hint) {
    meta.push(`
      <div class="income-field__support">
        <span class="income-field__support-eyebrow">How to answer</span>
        <p class="income-field__support-text">${escapeHtml(field.hint)}</p>
      </div>
    `);
  }
  if (field.clarification) {
    meta.push(`
      <div class="income-field__support income-field__support--sub">
        <p class="income-field__support-subtext">${escapeHtml(field.clarification)}</p>
      </div>
    `);
  }
  if (!meta.length) return '';
  return `<div class="income-field__meta">${meta.join('')}</div>`;
};

const getUnemploymentStateData = (stateCode) => UNEMPLOYMENT_DATA.find((entry) => entry.state === stateCode) || null;

const populateUnemploymentStates = (selectEl) => {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Select state</option>' + UNEMPLOYMENT_DATA
    .map((entry) => `<option value="${entry.state}">${escapeHtml(entry.label)}</option>`)
    .join('');
};

const createUnemploymentCityOptions = (stateEntry, selectedCity) => {
  if (!stateEntry) {
    return '<option value="">Select a state first</option>';
  }
  const base = '<option value="">Select city</option>';
  const options = stateEntry.cities
    .map((city) => `<option value="${city.city}" ${city.city === selectedCity ? 'selected' : ''}>${escapeHtml(city.label)}</option>`)
    .join('');
  return base + options;
};

const renderUnemploymentRateMessage = (fieldId, rate, cityLabel) => {
  const noteEl = elements.stepContainer?.querySelector(`[data-unemployment-rate="${fieldId}"]`);
  if (!noteEl) return;
  if (!Number.isFinite(rate)) {
    noteEl.textContent = 'Select a city to auto-fill the local unemployment rate.';
    return;
  }
  const displayCity = cityLabel ? ` in ${cityLabel}` : '';
  noteEl.textContent = `We’ll use ${rate.toFixed(1)}%${displayCity} for local unemployment.`;
};

const applyProfileChange = (changes = {}) => {
  let didChange = false;
  Object.entries(changes).forEach(([key, value]) => {
    state.profileData[key] = value;
    state.dirtyFields.add(key);
    didChange = true;
  });
  if (didChange) {
    updateStatusBadge();
    queueSave();
  }
};

function init() {
  if (!elements.launch || !elements.modal) {
    return;
  }

  elements.launch.addEventListener('click', handleLaunchClick);
  if (elements.editButtons && elements.editButtons.length) {
    elements.editButtons.forEach((button) => {
      button.addEventListener('click', handleLaunchClick);
    });
  }
  if (elements.overlay) elements.overlay.addEventListener('click', closeModal);
  if (elements.close) elements.close.addEventListener('click', closeModal);
  if (elements.backBtn) elements.backBtn.addEventListener('click', handleBackClick);
  if (elements.nextBtn) elements.nextBtn.addEventListener('click', handleNextClick);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.userId = null;
      state.profileData = {};
      state.profileMeta = { completedSteps: 0, lastUpdated: null };
      state.isLoadingProfile = false;
      state.pendingLaunch = false;
      updateStatusBadge();
      toggleLaunchAvailability(false);
      return;
    }
    state.userId = user.uid;
    toggleLaunchAvailability(true);
    const autoLaunch = consumeAutoLaunchFlag();
    await loadProfile(user.uid, { openAfterLoad: autoLaunch });
  });
}

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('keydown', (event) => {
  if (!state.modalOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
  }
}, true);

function toggleLaunchAvailability(allow) {
  if (elements.launch) {
    elements.launch.disabled = !allow;
  }
  if (elements.editButtons && elements.editButtons.length) {
    elements.editButtons.forEach((button) => {
      button.disabled = !allow;
    });
  }
}

function handleLaunchClick() {
  if (!state.userId) {
    state.pendingLaunch = true;
    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      state.userId = currentUser.uid;
      toggleLaunchAvailability(true);
      loadProfile(currentUser.uid, { openAfterLoad: true }).catch((error) => {
        console.error('[IncomeProfile] Failed to load profile for launch', error);
        state.pendingLaunch = false;
      });
    }
    return;
  }

  if (state.isLoadingProfile) {
    state.pendingLaunch = true;
    return;
  }

  openModal();
}

function openModal() {
  if (!elements.modal) return;
  state.modalOpen = true;
  elements.modal.classList.add('income-modal--open');
  document.body.classList.add('modal-open');

  const targetStep = determineStartingStep();
  goToStep(targetStep);
  setSaveStatus('Not saved yet');
}

function closeModal() {
  if (!elements.modal) return;
  state.modalOpen = false;
  elements.modal.classList.remove('income-modal--open');
  document.body.classList.remove('modal-open');
}

function determineStartingStep() {
  const incomplete = STEPS.findIndex((step) => step.fields.some((field) => !hasValue(state.profileData[field.id])));
  if (incomplete >= 0) {
    return incomplete;
  }
  const completed = state.profileMeta.completedSteps || 0;
  if (completed > 0) {
    return Math.min(completed - 1, STEPS.length - 1);
  }
  return 0;
}

function goToStep(index) {
  const safeIndex = Math.max(0, Math.min(STEPS.length - 1, index));
  state.currentStep = safeIndex;
  renderStep();
  updateProgress();
  updateNavigationButtons();
}

function renderStep() {
  if (!elements.stepContainer) return;
  const step = STEPS[state.currentStep];
  if (!step) return;
  const stepNumber = state.currentStep + 1;
  const totalSteps = STEPS.length;

  const html = `
    <div class="income-step" data-step="${step.id}">
      <div class="income-step__header">
        <span class="income-step__eyebrow">Step ${stepNumber} of ${totalSteps}</span>
        <h3 class="income-step__title">${step.title}</h3>
        <p class="income-step__description">${step.description}</p>
      </div>
      <div class="income-step__body">
        <div class="income-fields">
          ${step.fields.map(renderField).join('')}
        </div>
      </div>
    </div>
  `;
  elements.stepContainer.innerHTML = html;

  step.fields.forEach((field) => {
    switch (field.type) {
      case 'tenure':
        initTenureField(field);
        break;
      case 'unemployment':
        initUnemploymentField(field);
        break;
      case 'coverage':
        initCoverageField(field);
        break;
      default: {
        const input = elements.stepContainer.querySelector(`[data-field="${field.id}"]`);
        if (!input) return;
        applyFieldValue(field, input, state.profileData[field.id]);
        const eventName = field.type === 'select' || field.type === 'toggle' ? 'change' : 'input';
        input.addEventListener(eventName, () => handleFieldChange(field, input));
        if (field.type === 'textarea') {
          input.addEventListener('input', autoResizeTextarea);
          autoResizeTextarea({ target: input });
        }
      }
    }
  });
}

function renderField(field) {
  const labelRow = buildLabelMarkup(field);
  const notes = buildFieldNotes(field);
  const error = `<p class="income-field__error" data-field-error="${field.id}"></p>`;
  const notesBlock = notes || '';

  switch (field.type) {
    case 'select':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <select data-field="${field.id}">
              ${field.options.map((opt) => `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`).join('')}
            </select>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'textarea':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <textarea data-field="${field.id}" rows="3" placeholder="${escapeAttr(field.placeholder || '')}"></textarea>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'number':
    case 'percent':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <div class="income-field__input-wrapper">
              <input
                class="income-field__input"
                type="number"
                data-field="${field.id}"
                inputmode="decimal"
                ${field.min !== undefined ? `min="${field.min}"` : ''}
                ${field.max !== undefined ? `max="${field.max}"` : ''}
                ${field.step !== undefined ? `step="${field.step}"` : ''}
                placeholder="${escapeAttr(field.placeholder || '')}"
              />
              ${field.type === 'percent' ? '<span class="income-field__suffix">%</span>' : ''}
            </div>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'toggle':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control income-field__control--inline">
            <label class="income-toggle">
              <input type="checkbox" data-field="${field.id}" />
              <span class="income-toggle__track"><span class="income-toggle__thumb"></span></span>
              <span class="income-toggle__text">${escapeHtml(field.toggleText || 'Yes')}</span>
            </label>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'tenure': {
      const baseId = escapeAttr(field.id);
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <div class="income-tenure" data-tenure="${field.id}">
              <div class="income-tenure__group">
                <label class="income-tenure__label" for="${baseId}-years">Years</label>
                <input class="income-field__input" type="number" id="${baseId}-years" data-field="${field.id}-years" inputmode="numeric" min="0" max="60" placeholder="0" />
              </div>
              <div class="income-tenure__group">
                <label class="income-tenure__label" for="${baseId}-months">Months</label>
                <input class="income-field__input" type="number" id="${baseId}-months" data-field="${field.id}-months" inputmode="numeric" min="0" max="11" placeholder="0" />
              </div>
            </div>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    }
    case 'unemployment':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <div class="income-unemployment" data-unemployment="${field.id}">
              <div class="income-unemployment__row">
                <select data-field="${field.id}-state" class="income-unemployment__select">
                  <option value="">Select state</option>
                </select>
                <select data-field="${field.id}-city" class="income-unemployment__select" disabled>
                  <option value="">Select a state first</option>
                </select>
              </div>
              <p class="income-unemployment__note" data-unemployment-rate="${field.id}">Select a city to auto-fill the local unemployment rate.</p>
            </div>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'coverage':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <div class="income-coverage" role="radiogroup">
              ${INCOME_COVERAGE_OPTIONS.map((option) => `
                <label class="income-coverage__option">
                  <input type="radio" name="${field.id}" data-field="${field.id}" value="${option.value}" />
                  <span class="income-coverage__indicator" aria-hidden="true"></span>
                  <span class="income-coverage__title">${escapeHtml(option.title)}</span>
                  <span class="income-coverage__description">${escapeHtml(option.description)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    case 'text':
    default:
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <input
              class="income-field__input"
              type="text"
              data-field="${field.id}"
              placeholder="${escapeAttr(field.placeholder || '')}"
              ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
            />
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
  }
}

function applyFieldValue(field, input, value) {
  if (value === undefined || value === null) {
    if (field.type === 'toggle') {
      input.checked = false;
    } else {
      input.value = '';
    }
    return;
  }
  switch (field.type) {
    case 'toggle':
      input.checked = Boolean(value);
      break;
    case 'select':
      input.value = value ?? '';
      break;
    case 'percent':
    case 'number':
      input.value = typeof value === 'number' ? value : Number(value) || '';
      break;
    case 'textarea':
    case 'text':
      input.value = value || '';
      break;
    default:
      input.value = value ?? '';
  }
}

function handleFieldChange(field, input) {
  clearFieldError(field.id);
  const value = getFieldValue(field, input);
  applyProfileChange({ [field.id]: value });
}

function getFieldValue(field, input) {
  switch (field.type) {
    case 'toggle':
      return Boolean(input.checked);
    case 'select':
      return input.value || null;
    case 'percent':
    case 'number':
      if (input.value === '' || input.value === null) return null;
      return Number(input.value);
    case 'textarea':
      return input.value.trim() ? input.value.trim() : null;
    case 'tenure':
      return computeTenureValue(field.id);
    case 'coverage': {
      const checked = elements.stepContainer?.querySelector(`input[data-field="${field.id}"]:checked`);
      if (!checked) return null;
      const num = Number(checked.value);
      return Number.isNaN(num) ? null : num;
    }
    case 'unemployment': {
      const rate = state.profileData[field.id];
      return Number.isFinite(rate) ? rate : null;
    }
    case 'text':
    default:
      return input.value.trim() ? input.value.trim() : null;
  }
}

function autoResizeTextarea(event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  target.style.height = 'auto';
  target.style.height = `${Math.min(240, target.scrollHeight + 6)}px`;
}

function getTenureInputs(fieldId) {
  const yearsInput = elements.stepContainer?.querySelector(`[data-field="${fieldId}-years"]`);
  const monthsInput = elements.stepContainer?.querySelector(`[data-field="${fieldId}-months"]`);
  return { yearsInput, monthsInput };
}

function setTenureInputs(fieldId, totalMonths) {
  const { yearsInput, monthsInput } = getTenureInputs(fieldId);
  if (!yearsInput || !monthsInput) return;
  if (!Number.isFinite(totalMonths)) {
    yearsInput.value = '';
    monthsInput.value = '';
    return;
  }
  const safeTotal = Math.max(0, Math.round(Number(totalMonths)));
  const years = Math.floor(safeTotal / 12);
  const months = safeTotal % 12;
  yearsInput.value = years;
  monthsInput.value = months;
}

function normalizeTenureInputs(yearsInput, monthsInput) {
  if (yearsInput && yearsInput.value !== '') {
    const parsedYears = Number.parseInt(yearsInput.value, 10);
    if (Number.isFinite(parsedYears)) {
      yearsInput.value = Math.max(0, Math.min(60, parsedYears));
    } else {
      yearsInput.value = '';
    }
  }
  if (monthsInput && monthsInput.value !== '') {
    let parsedMonths = Number.parseInt(monthsInput.value, 10);
    if (!Number.isFinite(parsedMonths)) {
      monthsInput.value = '';
      return;
    }
    if (parsedMonths < 0) parsedMonths = 0;
    const yearsInputValue = Number.parseInt(yearsInput?.value ?? '0', 10);
    if (parsedMonths > 11) {
      const additionalYears = Math.floor(parsedMonths / 12);
      const remainderMonths = parsedMonths % 12;
      if (yearsInput) {
        const baseYears = Number.isFinite(yearsInputValue) ? yearsInputValue : 0;
        yearsInput.value = Math.min(60, baseYears + additionalYears);
      }
      monthsInput.value = remainderMonths;
    } else {
      monthsInput.value = parsedMonths;
    }
  }
}

function computeTenureValue(fieldId) {
  const { yearsInput, monthsInput } = getTenureInputs(fieldId);
  if (!yearsInput || !monthsInput) return null;
  const yearsRaw = yearsInput.value.trim();
  const monthsRaw = monthsInput.value.trim();
  const hasYears = yearsRaw.length > 0;
  const hasMonths = monthsRaw.length > 0;
  if (!hasYears && !hasMonths) return null;
  const years = hasYears ? Math.max(0, Math.min(60, Number.parseInt(yearsRaw, 10) || 0)) : 0;
  const months = hasMonths ? Math.max(0, Math.min(11, Number.parseInt(monthsRaw, 10) || 0)) : 0;
  return years * 12 + months;
}

function handleTenureInputsChange(field) {
  const { yearsInput, monthsInput } = getTenureInputs(field.id);
  if (!yearsInput || !monthsInput) return;
  normalizeTenureInputs(yearsInput, monthsInput);
  const total = computeTenureValue(field.id);
  clearFieldError(field.id);
  applyProfileChange({ [field.id]: total });
}

function initTenureField(field) {
  const { yearsInput, monthsInput } = getTenureInputs(field.id);
  if (!yearsInput || !monthsInput) return;
  setTenureInputs(field.id, state.profileData[field.id]);
  const handler = () => handleTenureInputsChange(field);
  yearsInput.addEventListener('input', handler);
  monthsInput.addEventListener('input', handler);
  yearsInput.addEventListener('blur', () => normalizeTenureInputs(yearsInput, monthsInput));
  monthsInput.addEventListener('blur', () => normalizeTenureInputs(yearsInput, monthsInput));
}

function initUnemploymentField(field) {
  const stateSelect = elements.stepContainer?.querySelector(`[data-field="${field.id}-state"]`);
  const citySelect = elements.stepContainer?.querySelector(`[data-field="${field.id}-city"]`);
  if (!stateSelect || !citySelect) return;

  populateUnemploymentStates(stateSelect);

  const selection = state.profileData.unemploymentSelection || {};
  const storedState = selection.state || '';
  const storedCity = selection.city || '';
  if (storedState) {
    stateSelect.value = storedState;
  }

  const stateEntry = storedState ? getUnemploymentStateData(storedState) : null;
  if (stateEntry) {
    citySelect.innerHTML = createUnemploymentCityOptions(stateEntry, storedCity);
    citySelect.disabled = false;
  } else {
    citySelect.innerHTML = '<option value="">Select a state first</option>';
    citySelect.disabled = true;
  }

  const rate = Number.isFinite(state.profileData[field.id]) ? Number(state.profileData[field.id]) : null;
  const cityLabel = selection.cityLabel || (stateEntry?.cities.find((city) => city.city === storedCity)?.label ?? '');
  renderUnemploymentRateMessage(field.id, rate, cityLabel);

  stateSelect.addEventListener('change', () => handleUnemploymentStateChange(field, stateSelect, citySelect));
  citySelect.addEventListener('change', () => handleUnemploymentCityChange(field, stateSelect, citySelect));
}

function handleUnemploymentStateChange(field, stateSelect, citySelect) {
  clearFieldError(field.id);
  const stateCode = stateSelect.value || null;
  const stateEntry = stateCode ? getUnemploymentStateData(stateCode) : null;
  citySelect.innerHTML = createUnemploymentCityOptions(stateEntry, null);
  citySelect.disabled = !stateEntry;
  renderUnemploymentRateMessage(field.id, NaN, '');

  applyProfileChange({
    [field.id]: null,
    unemploymentSelection: stateEntry ? {
      state: stateEntry.state,
      stateLabel: stateEntry.label,
      city: null,
      cityLabel: null
    } : {
      state: null,
      stateLabel: null,
      city: null,
      cityLabel: null
    }
  });
}

function handleUnemploymentCityChange(field, stateSelect, citySelect) {
  clearFieldError(field.id);
  const stateCode = stateSelect.value || null;
  const stateEntry = stateCode ? getUnemploymentStateData(stateCode) : null;
  const cityCode = citySelect.value || null;
  let rate = null;
  let cityLabel = null;

  if (stateEntry && cityCode) {
    const cityEntry = stateEntry.cities.find((city) => city.city === cityCode);
    if (cityEntry) {
      rate = cityEntry.rate;
      cityLabel = cityEntry.label;
    }
  }

  renderUnemploymentRateMessage(field.id, rate, cityLabel);

  applyProfileChange({
    [field.id]: rate,
    unemploymentSelection: stateEntry ? {
      state: stateEntry.state,
      stateLabel: stateEntry.label,
      city: cityCode,
      cityLabel: cityLabel || null
    } : {
      state: null,
      stateLabel: null,
      city: null,
      cityLabel: null
    }
  });
}

function initCoverageField(field) {
  const radios = elements.stepContainer?.querySelectorAll(`input[data-field="${field.id}"]`);
  if (!radios || !radios.length) return;
  const stored = Number.isFinite(state.profileData[field.id]) ? Number(state.profileData[field.id]) : null;
  radios.forEach((radio) => {
    const numericValue = Number(radio.value);
    if (stored !== null && numericValue === stored) {
      radio.checked = true;
    }
    radio.addEventListener('change', () => {
      clearFieldError(field.id);
      handleFieldChange(field, radio);
    });
  });
}

function queueSave() {
  if (!state.userId) return;
  if (state.saveTimer) window.clearTimeout(state.saveTimer);
  setSaveStatus('Saving…');
  state.saveTimer = window.setTimeout(() => {
    saveProfile({ reason: 'debounced' }).catch((error) => {
      console.error('[IncomeProfile] Save failed', error);
      setSaveStatus('Save failed. Retrying…');
    });
  }, 900);
}

async function saveProfile(options = {}) {
  const { reason, force = false } = options;
  if (!state.userId || (!state.dirtyFields.size && !force)) return;
  state.isSaving = true;
  if (state.saveTimer) {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  const completedSteps = Math.max(state.profileMeta.completedSteps || 0, state.currentStep + 1);
  state.profileMeta.completedSteps = completedSteps;

  const profilePayload = {};
  Object.entries(state.profileData).forEach(([key, value]) => {
    profilePayload[key] = value === undefined ? null : value;
  });
  profilePayload.version = 1;
  profilePayload.completedSteps = completedSteps;
  profilePayload.updatedAt = serverTimestamp();

  const userRef = doc(db, 'users', state.userId);
  const payload = {
    income: {
      profile: profilePayload,
    },
  };

  try {
    await setDoc(userRef, payload, { merge: true });
  } catch (error) {
    state.isSaving = false;
    console.error('[IncomeProfile] Save failed', error);
    const code = error?.code || '';
    if (code === 'permission-denied') {
      setSaveStatus('Save blocked by account permissions. Check profile setup.');
    } else {
      setSaveStatus('Save failed. Please try again.');
    }
    throw error;
  }

  state.dirtyFields.clear();
  state.isSaving = false;
  state.profileMeta.lastUpdated = new Date();
  setSaveStatus('Saved just now');
  updateStatusBadge();
  document.dispatchEvent(new CustomEvent('income-profile:updated', { detail: { reason, fields: Object.keys(profilePayload) } }));
}

function updateProgress() {
  const progress = ((state.currentStep + 1) / STEPS.length) * 100;
  if (elements.progressBar) {
    elements.progressBar.style.width = `${progress}%`;
  }
  if (elements.stepLabel) {
    elements.stepLabel.textContent = `Step ${state.currentStep + 1} of ${STEPS.length} • ${STEPS[state.currentStep].title}`;
  }
}

function updateNavigationButtons() {
  if (!elements.nextBtn || !elements.backBtn) return;
  const isFirst = state.currentStep === 0;
  const isLast = state.currentStep === STEPS.length - 1;

  elements.backBtn.textContent = isFirst ? 'Cancel' : 'Back';
  elements.nextBtn.textContent = isLast ? 'Finish' : 'Next';
  elements.backBtn.disabled = false;
  elements.nextBtn.disabled = false;
}

function handleBackClick() {
  if (state.currentStep === 0) {
    closeModal();
    return;
  }
  goToStep(state.currentStep - 1);
}

async function handleNextClick() {
  const valid = validateCurrentStep();
  if (!valid) return;

  try {
    await saveProfile({ reason: 'advance', force: true });
  } catch (error) {
    console.warn('[IncomeProfile] Advance blocked', error);
    return;
  }

  if (state.currentStep === STEPS.length - 1) {
    closeModal();
    return;
  }
  goToStep(state.currentStep + 1);
}

function validateCurrentStep() {
  const step = STEPS[state.currentStep];
  if (!step) return true;
  let valid = true;
  step.fields.forEach((field) => {
    const wrapper = elements.stepContainer?.querySelector(`[data-field-wrapper="${field.id}"]`);
    let value = null;
    let input = null;

    switch (field.type) {
      case 'tenure': {
        value = computeTenureValue(field.id);
        const { yearsInput, monthsInput } = getTenureInputs(field.id);
        input = yearsInput || monthsInput || null;
        break;
      }
      case 'unemployment':
        value = getFieldValue(field, {});
        input = elements.stepContainer?.querySelector(`[data-field="${field.id}-state"]`);
        break;
      case 'coverage':
        input = elements.stepContainer?.querySelector(`input[data-field="${field.id}"]`);
        value = getFieldValue(field, input || {});
        break;
      default:
        input = elements.stepContainer?.querySelector(`[data-field="${field.id}"]`);
        if (!input) return;
        value = getFieldValue(field, input);
    }

    if (field.required && !hasValue(value)) {
      valid = false;
      setFieldError(field.id, REQUIRED_MESSAGE);
      if (wrapper) wrapper.classList.add('has-error');
      return;
    }

    if (value !== null && value !== undefined && value !== '') {
      if ((field.type === 'number' || field.type === 'percent') && typeof value === 'number') {
        if (field.min !== undefined && value < field.min) {
          valid = false;
          setFieldError(field.id, `Must be at least ${field.min}.`);
          return;
        }
        if (field.max !== undefined && value > field.max) {
          valid = false;
          setFieldError(field.id, `Must be no more than ${field.max}.`);
          return;
        }
      }
    }
    clearFieldError(field.id);
  });
  return valid;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  return true;
}

function setFieldError(fieldId, message) {
  const errorEl = elements.stepContainer?.querySelector(`[data-field-error="${fieldId}"]`);
  const wrapper = elements.stepContainer?.querySelector(`[data-field-wrapper="${fieldId}"]`);
  if (errorEl) errorEl.textContent = message;
  if (wrapper) wrapper.classList.add('has-error');
}

function clearFieldError(fieldId) {
  const errorEl = elements.stepContainer?.querySelector(`[data-field-error="${fieldId}"]`);
  const wrapper = elements.stepContainer?.querySelector(`[data-field-wrapper="${fieldId}"]`);
  if (errorEl) errorEl.textContent = '';
  if (wrapper) wrapper.classList.remove('has-error');
}

async function loadProfile(uid, options = {}) {
  const { openAfterLoad = false } = options;
  state.isLoadingProfile = true;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      state.profileData = {};
      state.profileMeta = { completedSteps: 0, lastUpdated: null };
      state.hasCelebrated = false;
      state.onboardingCompletionMarked = false;
      updateStatusBadge();
      return;
    }

    const data = snap.data();
    state.onboardingCompletionMarked = Boolean(data?.onboarding?.incomeProfileComplete);
    const profile = data?.income?.profile || {};
    const { updatedAt, completedSteps, version, ...rest } = profile;
    state.profileData = sanitizeProfile(rest);
    state.profileMeta = {
      completedSteps: typeof completedSteps === 'number' ? completedSteps : 0,
      lastUpdated: updatedAt?.toDate ? updatedAt.toDate() : null
    };
    const { rounded } = getProfileCompletionScore();
    state.hasCelebrated = isProfileComplete(rounded);
    updateStatusBadge();
  } catch (error) {
    console.error('[IncomeProfile] Failed to load profile', error);
  } finally {
    state.isLoadingProfile = false;
    if ((openAfterLoad || state.pendingLaunch) && state.userId) {
      state.pendingLaunch = false;
      openModal();
    }
  }
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return {};
  const cleaned = {};
  Object.entries(profile).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value && typeof value.toDate === 'function') {
      cleaned[key] = value.toDate();
      return;
    }
    cleaned[key] = value;
  });
  return cleaned;
}

function updateStatusBadge() {
  if (!elements.status) return;
  if (!state.userId) {
    hideCompletionToast();
    state.hasCelebrated = false;
    showLaunchCard();
    elements.status.textContent = 'Sign in to complete your income profile.';
    if (elements.launch) elements.launch.textContent = 'Income profile';
    return;
  }

  const { rounded } = getProfileCompletionScore();
  const lastUpdatedLabel = state.profileMeta.lastUpdated ? formatRelative(state.profileMeta.lastUpdated) : null;
  const complete = isProfileComplete(rounded);

  let message;
  if (!rounded) {
    message = 'Boost accuracy by sharing a few quick details.';
    if (elements.launch) elements.launch.textContent = 'Complete income profile';
  } else if (rounded < 60) {
    message = `Income profile is ${rounded}% complete. A few answers unlock sharper VibeScore tuning.`;
    if (elements.launch) elements.launch.textContent = 'Continue income profile';
  } else if (rounded < 95) {
    message = `Nice! Income profile ${rounded}% complete. Finish it to unlock richer guidance.`;
    if (elements.launch) elements.launch.textContent = 'Review income profile';
  } else {
    message = `Income profile dialed in${lastUpdatedLabel ? ` • updated ${lastUpdatedLabel}` : ''}.`;
    if (elements.launch) elements.launch.textContent = 'Review income profile';
  }
  elements.status.textContent = message;

  if (complete) {
    hideLaunchCard();
    markOnboardingIncomeComplete();
    if (!state.hasCelebrated) {
      state.hasCelebrated = true;
      window.setTimeout(() => {
        triggerCompletionCelebration();
      }, 120);
    }
  } else {
    showLaunchCard();
    if (state.hasCelebrated) state.hasCelebrated = false;
    hideCompletionToast();
  }
}

function setSaveStatus(text) {
  if (!elements.saveStatus) return;
  elements.saveStatus.textContent = text;
}

function formatRelative(date) {
  if (!(date instanceof Date)) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 45 * 1000) return 'just now';
  if (diff < 90 * 1000) return '1 minute ago';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(diff / 86400000);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
