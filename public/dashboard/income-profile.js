import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { dataPresenceScore } from '../VibeScore/income/metrics.js';
import { computeAgeFromBirthday } from '../VibeScore/income/age-utils.js';
import {
  REQUIRED_PROFILE_WEIGHTS,
  UNEMPLOYMENT_DATA,
  INCOME_COVERAGE_OPTIONS,
  FIELD_VISIBILITY_RULES,
  STEPS,
  deriveAgeBandKey
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SUPPORTS_DATE_INPUT = (() => {
  if (typeof document === 'undefined') return false;
  const input = document.createElement('input');
  input.setAttribute('type', 'date');
  if (input.type !== 'date') return false;
  input.value = '2024-05-05';
  return input.value === '2024-05-05';
})();

const STATE_VALUE_LOOKUP = (() => {
  const map = new Map();
  UNEMPLOYMENT_DATA.forEach((entry) => {
    if (entry?.state) {
      map.set(String(entry.state).trim().toUpperCase(), entry.state);
    }
    if (entry?.label) {
      map.set(String(entry.label).trim().toUpperCase(), entry.state);
    }
  });
  return map;
})();

const OTHER_STATE_ALIASES = new Set([
  'OTHER',
  'INTERNATIONAL',
  'NON-US',
  'NON US',
  'OUTSIDE US',
  'OUTSIDE UNITED STATES',
  'FOREIGN',
  'WORLDWIDE'
]);

const normalizeStateValue = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (STATE_VALUE_LOOKUP.has(upper)) {
    return STATE_VALUE_LOOKUP.get(upper);
  }
  if (OTHER_STATE_ALIASES.has(upper)) {
    return 'OTHER';
  }
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }
  return trimmed;
};

const deriveActiveWeights = (profile = {}) => {
  const active = {};
  Object.entries(REQUIRED_PROFILE_WEIGHTS).forEach(([fieldId, weight]) => {
    const predicate = FIELD_VISIBILITY_RULES[fieldId];
    if (typeof predicate === 'function' && !predicate(profile)) {
      return;
    }
    active[fieldId] = weight;
  });
  return active;
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
  const weights = deriveActiveWeights(state.profileData);
  const presence = dataPresenceScore(state.profileData, weights) || { score: 0 };
  const raw = Number.isFinite(presence.score) ? presence.score : 0;
  return {
    raw,
    rounded: Math.round(raw)
  };
}

function hasCompletedAllSteps() {
  const activeSteps = getActiveSteps(state.profileData || {});
  if (!activeSteps.length) return false;
  return (state.profileMeta.completedSteps || 0) >= activeSteps.length;
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
    <div class="income-profile-toast__title">Financial profile locked in</div>
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

const resolveAgeCopyOverrides = (ageCopyMap, ageKey) => {
  if (!ageCopyMap || !ageKey) return null;
  const searchOrder = [ageKey];
  if (ageKey === 'teen' && !ageCopyMap[ageKey]) {
    searchOrder.push('student');
  }
  if (ageKey !== 'adult') {
    searchOrder.push('adult');
  }
  for (let i = 0; i < searchOrder.length; i += 1) {
    const candidate = ageCopyMap[searchOrder[i]];
    if (candidate) return candidate;
  }
  return null;
};

const resolveStepPresentation = (step, profile) => {
  if (!step) {
    return { title: '', description: '' };
  }
  const ageKey = deriveAgeBandKey(profile);
  const overrides = resolveAgeCopyOverrides(step.ageCopy, ageKey);
  return {
    title: overrides?.title || step.title,
    description: overrides?.description || step.description
  };
};

const decorateFieldForAge = (field, profile) => {
  if (!field) return field;
  const ageKey = deriveAgeBandKey(profile);
  const overrides = resolveAgeCopyOverrides(field.ageCopy, ageKey);
  if (!overrides) return field;
  return {
    ...field,
    ...overrides
  };
};

const isFieldVisible = (field, profile) => {
  if (!field) return false;
  if (typeof field.shouldDisplay === 'function') {
    try {
      return Boolean(field.shouldDisplay(profile));
    } catch (error) {
      console.warn('[IncomeProfile] Failed to evaluate field visibility', field.id, error);
      return false;
    }
  }
  return true;
};

const getVisibleFieldsForStep = (step, profile) => {
  if (!step || !Array.isArray(step.fields)) return [];
  return step.fields.filter((field) => isFieldVisible(field, profile));
};

const shouldStepDisplay = (step, profile) => {
  if (!step) return false;
  if (typeof step.shouldDisplay === 'function' && !step.shouldDisplay(profile)) {
    return false;
  }
  if (step.includeWhenEmpty) {
    return true;
  }
  return getVisibleFieldsForStep(step, profile).length > 0;
};

const getActiveSteps = (profile = state.profileData || {}) => {
  const snapshot = profile || {};
  return STEPS.filter((step) => shouldStepDisplay(step, snapshot));
};

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
  const notes = [];
  if (field.hint) {
    notes.push(`<p class="income-field__note">${escapeHtml(field.hint)}</p>`);
  }
  if (field.info) {
    notes.push(`<p class="income-field__note income-field__note--secondary">${escapeHtml(field.info)}</p>`);
  }
  if (field.clarification) {
    notes.push(`<p class="income-field__note income-field__note--muted">${escapeHtml(field.clarification)}</p>`);
  }
  if (!notes.length) return '';
  return `<div class="income-field__meta">${notes.join('')}</div>`;
};

const formatDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateBoundsForField = (field) => {
  if (field.type !== 'date') return { min: '', max: '' };
  const today = new Date();
  let min = '';
  let max = '';

  if (typeof field.maxAge === 'number') {
    const maxYears = Math.max(0, Math.floor(field.maxAge));
    const minDate = new Date(today.getTime());
    minDate.setFullYear(today.getFullYear() - maxYears);
    min = formatDateInputValue(minDate);
  }

  if (typeof field.minAge === 'number') {
    const minYears = Math.max(0, Math.floor(field.minAge));
    const maxDate = new Date(today.getTime());
    maxDate.setFullYear(today.getFullYear() - minYears);
    max = formatDateInputValue(maxDate);
  }

  return { min, max };
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
  const profile = state.profileData || {};
  const activeSteps = getActiveSteps(profile);
  if (!activeSteps.length) return 0;
  const incomplete = activeSteps.findIndex((step) => {
    const visibleFields = getVisibleFieldsForStep(step, profile);
    return visibleFields.some((field) => !hasValue(profile[field.id]));
  });
  if (incomplete >= 0) {
    return incomplete;
  }
  const completed = Math.min(state.profileMeta.completedSteps || 0, activeSteps.length);
  if (completed > 0) {
    return Math.min(completed - 1, activeSteps.length - 1);
  }
  return 0;
}

function goToStep(index) {
  const activeSteps = getActiveSteps(state.profileData || {});
  if (!activeSteps.length) {
    state.currentStep = 0;
    refreshCurrentStep();
    return;
  }
  const safeIndex = Math.max(0, Math.min(activeSteps.length - 1, index));
  state.currentStep = safeIndex;
  refreshCurrentStep();
}

function refreshCurrentStep() {
  const activeSteps = getActiveSteps(state.profileData || {});
  if (!activeSteps.length) {
    if (elements.stepContainer) {
      elements.stepContainer.innerHTML = '<p class="income-step__empty">No questions available for your profile yet.</p>';
    }
    updateProgress(activeSteps);
    updateNavigationButtons(activeSteps);
    return;
  }
  if (state.currentStep >= activeSteps.length) {
    state.currentStep = activeSteps.length - 1;
  }
  renderStep(activeSteps);
  updateProgress(activeSteps);
  updateNavigationButtons(activeSteps);
}

function renderStep(activeSteps = getActiveSteps(state.profileData || {})) {
  if (!elements.stepContainer) return;
  const step = activeSteps[state.currentStep];
  if (!step) return;
  const stepNumber = state.currentStep + 1;
  const totalSteps = activeSteps.length;
  const stepFields = Array.isArray(step.fields) ? step.fields : [];
  const profileSnapshot = state.profileData || {};
  const stepPresentation = resolveStepPresentation(step, profileSnapshot);

  const visibleFields = getVisibleFieldsForStep(step, profileSnapshot);

  const hiddenFields = stepFields.filter((field) => !isFieldVisible(field, profileSnapshot));

  if (hiddenFields.length) {
    const resetPayload = {};
    hiddenFields.forEach((field) => {
      if (field?.preserveValue) return;
      if (Object.prototype.hasOwnProperty.call(state.profileData, field.id) && state.profileData[field.id] !== null) {
        resetPayload[field.id] = null;
      }
    });
    if (Object.keys(resetPayload).length) {
      applyProfileChange(resetPayload);
    }
  }

  const decoratedVisibleFields = visibleFields.map((field) => decorateFieldForAge(field, profileSnapshot));
  const fieldsMarkup = decoratedVisibleFields.length
    ? decoratedVisibleFields.map(renderField).join('')
    : '<p class="income-step__empty">No questions on this step for your profile. Continue when you&rsquo;re ready.</p>';

  const html = `
    <div class="income-step" data-step="${step.id}">
      <div class="income-step__header">
        <span class="income-step__eyebrow">Step ${stepNumber} of ${totalSteps}</span>
        <h3 class="income-step__title">${stepPresentation.title}</h3>
        <p class="income-step__description">${stepPresentation.description}</p>
      </div>
      <div class="income-step__body">
        <div class="income-fields">
          ${fieldsMarkup}
        </div>
      </div>
    </div>
  `;
  elements.stepContainer.innerHTML = html;

  decoratedVisibleFields.forEach((field) => {
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
        if (field.type === 'date' && field.id === 'birthday') {
          initBirthdayField(field);
          return;
        }
        const input = elements.stepContainer.querySelector(`[data-field="${field.id}"]`);
        if (!input) return;
        applyFieldValue(field, input, state.profileData[field.id]);
        if (field.type === 'date') {
          if (SUPPORTS_DATE_INPUT) {
            input.addEventListener('change', (event) => handleFieldChange(field, input, event));
            input.addEventListener('blur', (event) => handleFieldChange(field, input, event));
          } else {
            input.addEventListener('blur', (event) => handleFieldChange(field, input, event));
            input.addEventListener('change', (event) => handleFieldChange(field, input, event));
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleFieldChange(field, input, event);
              }
            });
          }
        } else {
          const eventName = field.type === 'select' || field.type === 'toggle' ? 'change' : 'input';
          input.addEventListener(eventName, (event) => handleFieldChange(field, input, event));
        }
        if (field.type === 'toggle') {
          // Initialize and sync the gray yes/no note next to the toggle.
          updateToggleStateNote(field, input);
          input.addEventListener('change', () => updateToggleStateNote(field, input));
        }
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
    case 'date': {
      if (field.id === 'birthday') {
        const baseId = escapeAttr(field.id);
        return `
          <div class="income-field" data-field-wrapper="${field.id}">
            ${labelRow}
            <div class="income-field__control">
              <div class="income-birthday" data-birthday="${field.id}">
                <div class="income-birthday__group">
                  <label class="income-birthday__label" for="${baseId}-month">Month</label>
                  <input
                    class="income-field__input income-birthday__input"
                    type="text"
                    id="${baseId}-month"
                    data-birthday-part="month"
                    inputmode="numeric"
                    pattern="\\d{1,2}"
                    maxlength="2"
                    placeholder="MM"
                    autocomplete="bday-month"
                  />
                </div>
                <div class="income-birthday__group">
                  <label class="income-birthday__label" for="${baseId}-day">Day</label>
                  <input
                    class="income-field__input income-birthday__input"
                    type="text"
                    id="${baseId}-day"
                    data-birthday-part="day"
                    inputmode="numeric"
                    pattern="\\d{1,2}"
                    maxlength="2"
                    placeholder="DD"
                    autocomplete="bday-day"
                  />
                </div>
                <div class="income-birthday__group income-birthday__group--year">
                  <label class="income-birthday__label" for="${baseId}-year">Year</label>
                  <input
                    class="income-field__input income-birthday__input"
                    type="text"
                    id="${baseId}-year"
                    data-birthday-part="year"
                    inputmode="numeric"
                    pattern="\\d{4}"
                    maxlength="4"
                    placeholder="YYYY"
                    autocomplete="bday-year"
                  />
                </div>
              </div>
            </div>
            ${error}
            ${notesBlock}
          </div>
        `;
      }
      const { min, max } = getDateBoundsForField(field);
      const minAttr = min ? ` min="${min}"` : '';
      const maxAttr = max ? ` max="${max}"` : '';
      const autocompleteAttr = ' autocomplete="bday"';
      if (SUPPORTS_DATE_INPUT) {
        return `
          <div class="income-field" data-field-wrapper="${field.id}">
            ${labelRow}
            <div class="income-field__control">
              <input
                class="income-field__input"
                type="date"
                data-field="${field.id}"${minAttr}${maxAttr}${autocompleteAttr}
              />
            </div>
            ${error}
            ${notesBlock}
          </div>
        `;
      }
      const minDataAttr = min ? ` data-date-min="${min}"` : '';
      const maxDataAttr = max ? ` data-date-max="${max}"` : '';
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control">
            <input
              class="income-field__input"
              type="text"
              data-field="${field.id}"
              inputmode="numeric"
              pattern="\\d{4}-\\d{2}-\\d{2}"
              maxlength="10"
              placeholder="YYYY-MM-DD"${autocompleteAttr}${minDataAttr}${maxDataAttr}
            />
          </div>
          ${error}
          ${notesBlock}
        </div>
      `;
    }
    case 'toggle':
      return `
        <div class="income-field" data-field-wrapper="${field.id}">
          ${labelRow}
          <div class="income-field__control income-field__control--inline">
            <label class="income-toggle">
              <input type="checkbox" data-field="${field.id}" />
              <span class="income-toggle__track"><span class="income-toggle__thumb"></span></span>
            </label>
            <span class="income-toggle__note" data-toggle-note="${field.id}"></span>
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

function updateToggleStateNote(field, input) {
  if (!field || !input) return;
  const noteEl = elements.stepContainer?.querySelector(`[data-toggle-note="${field.id}"]`);
  if (!noteEl) return;
  const affirmative = field.toggleText || 'Yes';
  let negative;
  if (/^Yes[,\s]/i.test(affirmative)) {
    negative = affirmative.replace(/^Yes/i, 'No');
  } else if (/^Yes$/i.test(affirmative)) {
    negative = 'No';
  } else if (/^Yes/i.test(affirmative)) {
    negative = affirmative.replace(/^Yes/i, 'No');
  } else {
    negative = 'No';
  }
  noteEl.textContent = input.checked ? affirmative : negative;
}

function applyFieldValue(field, input, value) {
  if (field.type === 'date' && field.id === 'birthday') {
    setBirthdayInputs(field.id, value);
    return;
  }
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
    case 'date':
    case 'textarea':
    case 'text':
      input.value = value || '';
      break;
    default:
      input.value = value ?? '';
  }
}

function handleFieldChange(field, input, event) {
  const eventType = event?.type || 'input';
  const isEnterKey = eventType === 'keydown' && event?.key === 'Enter';
  const shouldCommit = isEnterKey || eventType === 'change' || eventType === 'blur';

  if (field.type !== 'date' || SUPPORTS_DATE_INPUT || shouldCommit || isEnterKey) {
    clearFieldError(field.id);
  }

  const rawInputValue = typeof input?.value === 'string' ? input.value.trim() : '';
  let value = getFieldValue(field, input);
  const isDateField = field.type === 'date';
  const usingDateFallback = isDateField && !SUPPORTS_DATE_INPUT;

  if (usingDateFallback) {
    if (!shouldCommit && !isEnterKey) {
      return;
    }

    if (!rawInputValue) {
      value = null;
    } else if (!ISO_DATE_PATTERN.test(rawInputValue)) {
      const message = field.id === 'birthday'
        ? `Enter a valid date. ${buildBirthdayAgeRequirementMessage(field)}`
        : 'Enter a valid date (YYYY-MM-DD).';
      setFieldError(field.id, message);
      return;
    } else {
      value = rawInputValue;
    }
  }

  if (isDateField && typeof value === 'string' && value && !ISO_DATE_PATTERN.test(value)) {
    if (!shouldCommit && !isEnterKey) {
      return;
    }
    const derived = computeAgeFromBirthday(value);
    if (!Number.isFinite(derived)) {
      const message = field.id === 'birthday'
        ? `Enter a valid date. ${buildBirthdayAgeRequirementMessage(field)}`
        : 'Enter a valid date.';
      setFieldError(field.id, message);
      return;
    }
  }

  const currentValue = state.profileData[field.id];
  if (!valuesAreEqual(currentValue, value)) {
    applyProfileChange({ [field.id]: value });
  }
  if (field.id === 'birthday') {
    const isoValue = typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
    syncAgeFromBirthdayIso(isoValue);
  }
  if (field.triggersRerender) {
    window.requestAnimationFrame(() => {
      refreshCurrentStep();
    });
  }
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
    case 'date':
      if (field.id === 'birthday') {
        const evaluation = evaluateBirthdayInputs(field, getBirthdayInputParts(field.id));
        return evaluation.complete && !evaluation.error ? evaluation.iso : null;
      }
      return input.value.trim() ? input.value.trim() : null;
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

function getBirthdayInputs(fieldId) {
  const container = elements.stepContainer?.querySelector(`[data-birthday="${fieldId}"]`);
  if (!container) {
    return {
      monthInput: null,
      dayInput: null,
      yearInput: null
    };
  }
  return {
    monthInput: container.querySelector('[data-birthday-part="month"]'),
    dayInput: container.querySelector('[data-birthday-part="day"]'),
    yearInput: container.querySelector('[data-birthday-part="year"]')
  };
}

function getBirthdayInputParts(fieldId) {
  const { monthInput, dayInput, yearInput } = getBirthdayInputs(fieldId);
  return {
    month: monthInput ? monthInput.value.trim() : '',
    day: dayInput ? dayInput.value.trim() : '',
    year: yearInput ? yearInput.value.trim() : ''
  };
}

function setBirthdayInputs(fieldId, isoValue) {
  const { monthInput, dayInput, yearInput } = getBirthdayInputs(fieldId);
  if (!monthInput || !dayInput || !yearInput) return;
  if (typeof isoValue !== 'string' || !ISO_DATE_PATTERN.test(isoValue)) {
    monthInput.value = '';
    dayInput.value = '';
    yearInput.value = '';
    return;
  }
  const [year, month, day] = isoValue.split('-');
  monthInput.value = month;
  dayInput.value = day;
  yearInput.value = year;
}

function buildBirthdayAgeRequirementMessage(field) {
  const { minAge, maxAge } = field;
  const hasMin = typeof minAge === 'number';
  const hasMax = typeof maxAge === 'number';
  if (hasMin && hasMax) {
    return `Birthday must make you between ${minAge} and ${maxAge} years old.`;
  }
  if (hasMin) {
    return `Must be at least ${minAge} years old.`;
  }
  if (hasMax) {
    return `Must be ${maxAge} or younger.`;
  }
  return 'Enter a valid date.';
}

function evaluateBirthdayInputs(field, parts) {
  const monthRaw = parts.month || '';
  const dayRaw = parts.day || '';
  const yearRaw = parts.year || '';
  const allEmpty = !monthRaw && !dayRaw && !yearRaw;

  if (allEmpty) {
    return { iso: null, complete: false, error: field.required ? 'Enter month, day, and year.' : null, age: null };
  }

  if (!monthRaw || !dayRaw || !yearRaw) {
    return { iso: null, complete: false, error: 'Enter month, day, and year.', age: null };
  }

  if (!/^\d{1,2}$/.test(monthRaw)) {
    return { iso: null, complete: true, error: 'Use a valid month (1-12).', age: null };
  }
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { iso: null, complete: true, error: 'Use a valid month (1-12).', age: null };
  }

  if (!/^\d{1,2}$/.test(dayRaw)) {
    return { iso: null, complete: true, error: 'Use a valid day (1-31).', age: null };
  }
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return { iso: null, complete: true, error: 'Use a valid day (1-31).', age: null };
  }

  if (!/^\d{4}$/.test(yearRaw)) {
    return { iso: null, complete: true, error: 'Use a 4-digit year.', age: null };
  }
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year)) {
    return { iso: null, complete: true, error: 'Use a 4-digit year.', age: null };
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const testDate = new Date(iso);
  if (
    Number.isNaN(testDate.getTime())
    || testDate.getUTCFullYear() !== year
    || testDate.getUTCMonth() + 1 !== month
    || testDate.getUTCDate() !== day
  ) {
    const rangeMessage = buildBirthdayAgeRequirementMessage(field);
    return { iso: null, complete: true, error: `Enter a valid date. ${rangeMessage}`, age: null };
  }

  const derivedAge = computeAgeFromBirthday(iso);
  if (!Number.isFinite(derivedAge)) {
    const rangeMessage = buildBirthdayAgeRequirementMessage(field);
    return { iso: null, complete: true, error: `Enter a valid date. ${rangeMessage}`, age: null };
  }

  if (typeof field.minAge === 'number' && derivedAge < field.minAge) {
    return { iso: null, complete: true, error: buildBirthdayAgeRequirementMessage(field), age: null };
  }
  if (typeof field.maxAge === 'number' && derivedAge > field.maxAge) {
    return { iso: null, complete: true, error: buildBirthdayAgeRequirementMessage(field), age: null };
  }

  return { iso, complete: true, error: null, age: derivedAge };
}

function syncAgeFromBirthdayIso(isoValue) {
  const derivedAge = isoValue ? computeAgeFromBirthday(isoValue) : NaN;
  const normalizedAge = Number.isFinite(derivedAge) ? Math.max(0, Math.round(derivedAge)) : null;
  const existingAgeRaw = state.profileData.age;
  let existingAge = null;
  const isEmptyString = typeof existingAgeRaw === 'string' && existingAgeRaw.trim() === '';
  if (existingAgeRaw !== null && existingAgeRaw !== undefined && !isEmptyString) {
    const numericExisting = Number(existingAgeRaw);
    existingAge = Number.isFinite(numericExisting) ? numericExisting : existingAgeRaw;
  }
  if (existingAge !== normalizedAge) {
    applyProfileChange({ age: normalizedAge });
  }
}

function resetProfileForNewBirthday(isoValue) {
  const keepKeys = new Set(['birthday', 'age']);
  const resetPayload = {};
  const snapshot = state.profileData || {};
  Object.keys(snapshot).forEach((key) => {
    if (!keepKeys.has(key)) {
      resetPayload[key] = null;
    }
  });

  resetPayload.birthday = isoValue;
  const derivedAge = isoValue ? computeAgeFromBirthday(isoValue) : NaN;
  resetPayload.age = Number.isFinite(derivedAge) ? Math.max(0, Math.round(derivedAge)) : null;

  state.profileMeta.completedSteps = 0;
  state.profileMeta.lastUpdated = null;
  state.hasCelebrated = false;
  hideCompletionToast();

  applyProfileChange(resetPayload);
  state.currentStep = 0;
  refreshCurrentStep();
  updateStatusBadge();
}

function handleBirthdayInputsChange(field, event) {
  const eventType = event?.type || 'input';
  const isEnterKey = eventType === 'keydown' && event?.key === 'Enter';
  const shouldValidate = isEnterKey || eventType === 'blur' || eventType === 'change';

  if (eventType === 'input') {
    clearFieldError(field.id);
  }

  const parts = getBirthdayInputParts(field.id);
  const evaluation = evaluateBirthdayInputs(field, parts);

  if (!shouldValidate) {
    return;
  }

  if (!evaluation.complete) {
    if (field.required) {
      setFieldError(field.id, evaluation.error || 'Enter month, day, and year.');
    }
    const currentValue = state.profileData[field.id];
    if (currentValue !== null && currentValue !== undefined) {
      applyProfileChange({ [field.id]: null });
    }
    syncAgeFromBirthdayIso(null);
    return;
  }

  if (evaluation.error) {
    setFieldError(field.id, evaluation.error);
    const currentValue = state.profileData[field.id];
    if (currentValue !== null && currentValue !== undefined) {
      applyProfileChange({ [field.id]: null });
    }
    syncAgeFromBirthdayIso(null);
    return;
  }

  const iso = evaluation.iso;
  if (!ISO_DATE_PATTERN.test(iso)) {
    setFieldError(field.id, 'Enter a valid date.');
    return;
  }

  setBirthdayInputs(field.id, iso);
  clearFieldError(field.id);
  const previousBirthday = state.profileData[field.id] || null;
  if (previousBirthday !== iso) {
    resetProfileForNewBirthday(iso);
  } else if (state.profileData[field.id] !== iso) {
    applyProfileChange({ [field.id]: iso });
    syncAgeFromBirthdayIso(iso);
  } else {
    syncAgeFromBirthdayIso(iso);
  }
}

function initBirthdayField(field) {
  setBirthdayInputs(field.id, state.profileData[field.id]);
  const { monthInput, dayInput, yearInput } = getBirthdayInputs(field.id);
  if (!monthInput || !dayInput || !yearInput) return;

  const handler = (event) => handleBirthdayInputsChange(field, event);
  [monthInput, dayInput, yearInput].forEach((input) => {
    input.addEventListener('input', handler);
    input.addEventListener('blur', handler);
    input.addEventListener('change', handler);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handler(event);
      }
    });
  });
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
    radio.addEventListener('change', (event) => {
      clearFieldError(field.id);
      handleFieldChange(field, radio, event);
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

  const activeSteps = getActiveSteps(state.profileData || {});
  const activeLength = activeSteps.length;
  const completedSteps = activeLength
    ? Math.max(state.profileMeta.completedSteps || 0, state.currentStep + 1)
    : 0;
  const boundedCompleted = activeLength ? Math.min(completedSteps, activeLength) : 0;
  state.profileMeta.completedSteps = boundedCompleted;

  const profilePayload = {};
  Object.entries(state.profileData).forEach(([key, value]) => {
    profilePayload[key] = value === undefined ? null : value;
  });
  profilePayload.version = 2;
  profilePayload.completedSteps = boundedCompleted;
  profilePayload.updatedAt = serverTimestamp();

  const userRef = doc(db, 'users', state.userId);
  const rootUpdates = {};
  if (Object.prototype.hasOwnProperty.call(profilePayload, 'birthday')) {
    const rawBirthday = profilePayload.birthday;
    rootUpdates.birthday = rawBirthday;
    if (typeof rawBirthday === 'string' && rawBirthday) {
      const derivedAge = computeAgeFromBirthday(rawBirthday);
      rootUpdates.age = Number.isFinite(derivedAge) ? Math.max(0, Math.round(derivedAge)) : null;
    } else {
      rootUpdates.age = null;
    }
  }

  const payload = {
    income: {
      profile: profilePayload,
    },
    ...(Object.keys(rootUpdates).length ? rootUpdates : {})
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
  const updatedFields = Object.keys(profilePayload);
  const detail = { reason, fields: updatedFields };
  document.dispatchEvent(new CustomEvent('income-profile:updated', { detail }));
  document.dispatchEvent(new CustomEvent('financial-profile:updated', { detail: { ...detail } }));
}

function updateProgress(activeSteps = getActiveSteps(state.profileData || {})) {
  if (!activeSteps.length) {
    if (elements.progressBar) {
      elements.progressBar.style.width = '0%';
    }
    if (elements.stepLabel) {
      elements.stepLabel.textContent = 'No steps available yet';
    }
    return;
  }
  const progress = ((state.currentStep + 1) / activeSteps.length) * 100;
  if (elements.progressBar) {
    elements.progressBar.style.width = `${progress}%`;
  }
  if (elements.stepLabel) {
    const step = activeSteps[state.currentStep];
    const copy = resolveStepPresentation(step, state.profileData || {});
    elements.stepLabel.textContent = `Step ${state.currentStep + 1} of ${activeSteps.length} • ${copy.title}`;
  }
}

function updateNavigationButtons(activeSteps = getActiveSteps(state.profileData || {})) {
  if (!elements.nextBtn || !elements.backBtn) return;
  const total = activeSteps.length;
  if (!total) {
    elements.backBtn.textContent = 'Cancel';
    elements.nextBtn.textContent = 'Next';
    elements.backBtn.disabled = false;
    elements.nextBtn.disabled = true;
    return;
  }

  const isFirst = state.currentStep === 0;
  const isLast = state.currentStep === total - 1;

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
  const activeSteps = getActiveSteps(state.profileData || {});
  if (!activeSteps.length) {
    closeModal();
    return;
  }

  const valid = validateCurrentStep(activeSteps);
  if (!valid) return;

  try {
    await saveProfile({ reason: 'advance', force: true });
  } catch (error) {
    console.warn('[IncomeProfile] Advance blocked', error);
    return;
  }

  if (state.currentStep === activeSteps.length - 1) {
    closeModal();
    return;
  }
  goToStep(state.currentStep + 1);
}

function validateCurrentStep(activeSteps = getActiveSteps(state.profileData || {})) {
  const step = activeSteps[state.currentStep];
  if (!step) return true;
  let valid = true;
  step.fields.forEach((field) => {
    const isVisible = isFieldVisible(field, state.profileData || {});
    if (!isVisible) {
      clearFieldError(field.id);
      return;
    }

    const wrapper = elements.stepContainer?.querySelector(`[data-field-wrapper="${field.id}"]`);
    let value = null;
    let input = null;
    let customError = null;

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
      case 'date':
        if (field.id === 'birthday') {
          const evaluation = evaluateBirthdayInputs(field, getBirthdayInputParts(field.id));
          if (!evaluation.complete) {
            value = null;
            customError = evaluation.error || (field.required ? 'Enter month, day, and year.' : null);
          } else if (evaluation.error) {
            value = null;
            customError = evaluation.error;
          } else {
            value = evaluation.iso;
          }
          break;
        }
        input = elements.stepContainer?.querySelector(`[data-field="${field.id}"]`);
        if (!input) return;
        value = getFieldValue(field, input);
        break;
      default:
        input = elements.stepContainer?.querySelector(`[data-field="${field.id}"]`);
        if (!input) return;
        value = getFieldValue(field, input);
    }

    if (customError) {
      valid = false;
      setFieldError(field.id, customError);
      if (field.id === 'birthday') {
        persistFieldState(field, null);
        syncAgeFromBirthdayIso(null);
      }
      if (wrapper) wrapper.classList.add('has-error');
      return;
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
      if (field.type === 'date') {
        const derivedAge = computeAgeFromBirthday(value);
        if (!Number.isFinite(derivedAge)) {
          valid = false;
          setFieldError(field.id, 'Enter a valid date.');
          return;
        }
        if (field.minAge !== undefined && derivedAge < field.minAge) {
          valid = false;
          setFieldError(field.id, buildBirthdayAgeRequirementMessage(field));
          return;
        }
        if (field.maxAge !== undefined && derivedAge > field.maxAge) {
          valid = false;
          setFieldError(field.id, buildBirthdayAgeRequirementMessage(field));
          return;
        }
        if (field.id === 'birthday') {
          syncAgeFromBirthdayIso(value);
        }
      }
    }
    persistFieldState(field, value);
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

function valuesAreEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (error) {
      console.warn('[IncomeProfile] Failed to compare field values', error);
      return false;
    }
  }
  return false;
}

function persistFieldState(field, value) {
  if (!field) return;
  if (value === undefined) return;
  const current = state.profileData[field.id];
  if (valuesAreEqual(current, value)) return;
  applyProfileChange({ [field.id]: value });
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
    if (!state.profileData.birthday && typeof data?.birthday === 'string' && data.birthday) {
      state.profileData.birthday = data.birthday;
    }
    if (!Number.isFinite(Number(state.profileData.age)) && Number.isFinite(Number(data?.age))) {
      state.profileData.age = Number(data.age);
    }
    hydrateLegacyLocation(state.profileData);
    if (!Number.isFinite(Number(state.profileData.age)) && state.profileData.birthday) {
      const derivedAge = computeAgeFromBirthday(state.profileData.birthday);
      if (Number.isFinite(derivedAge)) {
        state.profileData.age = Math.max(0, Math.round(derivedAge));
      }
    }
    state.profileMeta = {
      completedSteps: typeof completedSteps === 'number' ? completedSteps : 0,
      lastUpdated: updatedAt?.toDate ? updatedAt.toDate() : null
    };
    const activeSteps = getActiveSteps(state.profileData || {});
    if (state.profileMeta.completedSteps > activeSteps.length) {
      state.profileMeta.completedSteps = activeSteps.length;
    }
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

function hydrateLegacyLocation(profile) {
  if (!profile || typeof profile !== 'object') return;
  if (profile.locationState) {
    const normalized = normalizeStateValue(profile.locationState);
    if (normalized) {
      profile.locationState = normalized;
    }
  }

  if (!profile.locationState) {
    const fromRegion = normalizeStateValue(profile.locationRegion);
    if (fromRegion) {
      profile.locationState = fromRegion;
    } else {
      const country = profile.locationCountry ? String(profile.locationCountry).trim() : '';
      if (country && country.toLowerCase() !== 'united states') {
        profile.locationState = 'OTHER';
      }
    }
  }
}

function updateStatusBadge() {
  if (!elements.status) return;
  if (!state.userId) {
    hideCompletionToast();
    state.hasCelebrated = false;
    showLaunchCard();
    elements.status.textContent = 'Sign in to complete your financial profile.';
    if (elements.launch) elements.launch.textContent = 'Financial profile';
    return;
  }

  const { rounded } = getProfileCompletionScore();
  const lastUpdatedLabel = state.profileMeta.lastUpdated ? formatRelative(state.profileMeta.lastUpdated) : null;
  const complete = isProfileComplete(rounded);

  let message;
  if (!rounded) {
    message = 'Share a few quick basics to unlock your personalized financial profile.';
    if (elements.launch) elements.launch.textContent = 'Complete financial profile';
  } else if (rounded < 60) {
    message = `Financial profile is ${rounded}% complete. A few answers unlock sharper VibeScore tuning.`;
    if (elements.launch) elements.launch.textContent = 'Continue financial profile';
  } else if (rounded < 95) {
    message = `Nice! Financial profile ${rounded}% complete. Finish it to unlock richer guidance.`;
    if (elements.launch) elements.launch.textContent = 'Review financial profile';
  } else {
    message = `Financial profile dialed in${lastUpdatedLabel ? ` • updated ${lastUpdatedLabel}` : ''}.`;
    if (elements.launch) elements.launch.textContent = 'Review financial profile';
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
