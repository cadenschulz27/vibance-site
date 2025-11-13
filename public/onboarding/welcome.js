import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { computeAgeFromBirthday } from '../VibeScore/income/age-utils.js';

const els = {
  welcomeName: document.getElementById('welcome-name'),
  basicsForm: document.getElementById('basics-form'),
  firstName: document.getElementById('basics-first-name'),
  lastName: document.getElementById('basics-last-name'),
  birthday: document.getElementById('basics-birthday'),
  saveBasics: document.getElementById('save-basics'),
  basicsFeedback: document.getElementById('basics-feedback'),
  basicsStatusPill: document.getElementById('basics-status-pill'),
  launchIncomeProfile: document.getElementById('launch-income-profile'),
  skipDashboard: document.getElementById('skip-to-dashboard'),
  statusBanner: document.getElementById('status-banner')
};

let currentUser = null;
let userRef = null;
let onboardingState = null;
let isSavingBasics = false;

const DASHBOARD_URL = '/dashboard/dashboard.html';

function goToDashboard() {
  window.location.href = DASHBOARD_URL;
}

function setBanner(message, variant = 'info') {
  if (!els.statusBanner) return;
  els.statusBanner.textContent = message;
  els.statusBanner.dataset.state = 'visible';
  els.statusBanner.dataset.variant = variant;
  window.clearTimeout(setBanner._timer);
  setBanner._timer = window.setTimeout(() => {
    if (els.statusBanner) {
      els.statusBanner.dataset.state = 'hidden';
    }
  }, 3200);
}

function clearBanner() {
  if (!els.statusBanner) return;
  window.clearTimeout(setBanner._timer);
  els.statusBanner.dataset.state = 'hidden';
}

function setBasicsStatus(flag) {
  if (!els.basicsStatusPill) return;
  if (flag) {
    els.basicsStatusPill.textContent = 'Complete';
    els.basicsStatusPill.classList.remove('bg-[rgba(128,156,238,0.18)]', 'border-[rgba(150,176,246,0.32)]');
    els.basicsStatusPill.classList.add('bg-[rgba(106,216,115,0.18)]', 'border-[rgba(155,236,169,0.45)]');
  } else {
    els.basicsStatusPill.textContent = 'Required';
    els.basicsStatusPill.classList.remove('bg-[rgba(106,216,115,0.18)]', 'border-[rgba(155,236,169,0.45)]');
    els.basicsStatusPill.classList.add('bg-[rgba(128,156,238,0.18)]', 'border-[rgba(150,176,246,0.32)]');
  }
}

function applyBasicsEnablement(flag) {
  if (els.launchIncomeProfile) {
    els.launchIncomeProfile.disabled = !flag;
  }
}

function paintProfile(data = {}) {
  const firstName = (data.firstName || '').trim();
  const lastName = (data.lastName || '').trim();
  const birthday = data.birthday || '';
  onboardingState = data.onboarding || onboardingState || {};

  if (els.firstName) els.firstName.value = firstName;
  if (els.lastName) els.lastName.value = lastName;
  if (els.birthday) els.birthday.value = birthday;

  const displayName = firstName || (currentUser?.email ? currentUser.email.split('@')[0] : 'friend');
  if (els.welcomeName) {
    els.welcomeName.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  }

  const basicsComplete = Boolean(onboardingState?.basicsComplete);
  setBasicsStatus(basicsComplete);
  applyBasicsEnablement(basicsComplete);
  if (basicsComplete && els.basicsFeedback) {
    els.basicsFeedback.textContent = 'Basics saved.';
  }
}

function setSavingBasics(busy) {
  if (!els.saveBasics) return;
  isSavingBasics = busy;
  if (busy) {
    els.saveBasics.disabled = true;
    els.saveBasics.textContent = 'Saving…';
  } else {
    els.saveBasics.disabled = false;
    els.saveBasics.textContent = 'Save details';
  }
}

function validateBasicsInputs() {
  const first = (els.firstName?.value || '').trim();
  const last = (els.lastName?.value || '').trim();
  if (!first || !last) {
    setBanner('Enter both your first and last name to continue.', 'error');
    return false;
  }
  return true;
}

async function saveBasics() {
  if (!currentUser || !userRef) return;
  if (!validateBasicsInputs()) return;
  if (isSavingBasics) return;

  const firstName = (els.firstName?.value || '').trim();
  const lastName = (els.lastName?.value || '').trim();
  const birthdayRaw = (els.birthday?.value || '').trim();
  const birthday = birthdayRaw ? birthdayRaw : null;
  const fullName = `${firstName} ${lastName}`.trim();
  const derivedAge = birthday ? computeAgeFromBirthday(birthday) : NaN;
  const normalizedAge = Number.isFinite(derivedAge) ? Math.max(0, Math.round(derivedAge)) : null;

  setSavingBasics(true);
  clearBanner();
  if (els.basicsFeedback) els.basicsFeedback.textContent = '';

  const onboardingPayload = {
    basicsComplete: true,
    pending: onboardingState?.pending ?? true,
    lastPrompted: onboardingState?.lastPrompted || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const userPayload = {
    firstName,
    lastName,
    name: fullName,
    birthday,
    updatedAt: serverTimestamp(),
    onboarding: onboardingPayload
  };

  if (birthday) {
    userPayload.age = normalizedAge !== null ? normalizedAge : null;
  } else {
    userPayload.age = null;
  }

  userPayload.income = {
    profile: {
      birthday,
      age: normalizedAge !== null ? normalizedAge : null
    }
  };

  try {
    await setDoc(userRef, userPayload, { merge: true });

    onboardingState = {
      ...onboardingState,
      basicsComplete: true,
      pending: onboardingPayload.pending,
      lastPrompted: onboardingPayload.lastPrompted
    };
    setBasicsStatus(true);
    applyBasicsEnablement(true);
    if (els.basicsFeedback) {
      els.basicsFeedback.textContent = 'Saved just now.';
    }
    setBanner('Profile basics saved.', 'success');
  } catch (error) {
    console.error('[Onboarding] Failed to save basics', error);
    setBanner(error?.message || 'Could not save details. Try again.', 'error');
  } finally {
    setSavingBasics(false);
  }
}

async function updateOnboardingFields(fields = {}) {
  if (!userRef) return;
  try {
    await setDoc(userRef, {
      onboarding: {
        ...fields,
        updatedAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
    onboardingState = { ...onboardingState, ...fields };
  } catch (error) {
    console.error('[Onboarding] Failed to update onboarding fields', error);
    throw error;
  }
}

async function launchIncomeProfile() {
  if (!onboardingState?.basicsComplete) {
    setBanner('Save your basic details first, then launch the wizard.', 'error');
    return;
  }
  try {
    await updateOnboardingFields({
      pending: false,
      basicsComplete: true,
      skippedAt: null,
      startedIncomeProfileAt: serverTimestamp(),
      lastPrompted: serverTimestamp()
    });
  } catch (error) {
    setBanner('Unable to update your onboarding status.', 'error');
    return;
  }
  try {
    window.localStorage.setItem('vibance:startIncomeProfile', '1');
  } catch (_) {
    /* ignore storage errors */
  }
  goToDashboard();
}

async function skipOnboarding() {
  try {
    await updateOnboardingFields({
      pending: false,
      skippedAt: serverTimestamp(),
      lastPrompted: serverTimestamp()
    });
  } catch (error) {
    setBanner('Unable to update your onboarding status.', 'error');
    return;
  }
  goToDashboard();
}

function bindEvents() {
  if (els.saveBasics) {
    els.saveBasics.addEventListener('click', saveBasics);
  }
  if (els.launchIncomeProfile) {
    els.launchIncomeProfile.addEventListener('click', launchIncomeProfile);
  }
  if (els.skipDashboard) {
    els.skipDashboard.addEventListener('click', skipOnboarding);
  }
  if (els.basicsForm) {
    els.basicsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveBasics();
    });
  }
}

async function hydrate(user) {
  currentUser = user;
  userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      paintProfile({});
      return;
    }
    const data = snap.data() || {};

    if (data.onboarding && data.onboarding.pending === false) {
      goToDashboard();
      return;
    }

    if (!data.onboarding && data.income?.profile) {
      // Legacy users who already have profiles complete should skip onboarding.
      goToDashboard();
      return;
    }

    paintProfile(data);
  } catch (error) {
    console.error('[Onboarding] Failed to load profile', error);
    setBanner('We could not load your profile. Redirecting…', 'error');
    window.setTimeout(goToDashboard, 2200);
  }
}

function init() {
  bindEvents();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    await user.reload().catch(() => {});
    if (!user.emailVerified) {
      window.location.href = '/verify-email.html';
      return;
    }
    hydrate(user);
  });
}

document.addEventListener('DOMContentLoaded', init);
