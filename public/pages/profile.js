// public/pages/profile.js
// ----------------------------------------------------
// Profile controller
//  - Display & update profile (avatar)
//  - Email verification (resend)
//  - Notification preferences (save/load)
//  - Export data as JSON
//  - Delete account (with reauth) + Firestore cleanup
//
// Requirements:
//   - ../api/firebase.js exports { auth, db, storage }
//   - DOM elements (adjust IDs if needed):
//       #avatar-img                 <img>
//       #avatar-input               <input type="file">
//       #display-name               <input type="text">
//       #email                      <span>
//       #email-verified             <span> (or badge)
//       #resend-verification        <button>
//       #save-profile               <button>
//
//       #pref-weekly                <input type="checkbox">
//       #pref-product               <input type="checkbox">
//       #pref-news                  <input type="checkbox">
//       #save-prefs                 <button>
//
//       #export-data                <button>
//       #delete-account             <button>
//
//       #toast                      <div> (optional toast)
// ----------------------------------------------------

import { auth, db, storage } from '../api/firebase.js';
import {
  onAuthStateChanged,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc, getDoc, setDoc, collection, getDocs, deleteDoc,
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref as sRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// -------------------- DOM --------------------
const els = {
  avatarImg: document.getElementById('avatar-img'),
  avatarInput: document.getElementById('avatar-input'),
  profileUsernameInput: document.getElementById('profile-username-input'),
  profileUsernameFeedback: document.getElementById('profile-username-feedback'),
  email: document.getElementById('email'),
  emailVerified: document.getElementById('email-verified'),
  saveProfile: document.getElementById('save-profile'),

  prefWeekly: document.getElementById('pref-weekly'),
  prefProduct: document.getElementById('pref-product'),
  prefNews: document.getElementById('pref-news'),
  savePrefs: document.getElementById('save-prefs'),

  exportData: document.getElementById('export-data'),
  deleteAccount: document.getElementById('delete-account'),

  toast: document.getElementById('toast'),
};

let cachedProfileDoc = null;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// -------------------- Utils --------------------
function toast(msg) {
  if (!els.toast) { console.log('[toast]', msg); return; }
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0','pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.remove('opacity-100');
    els.toast.classList.add('opacity-0','pointer-events-none');
  }, 1800);
}

function setBusy(btn, text, busy = true) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = text || 'Working…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || 'Done';
  }
}

function downloadFile(filename, text, type='application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function normalizeUsernameValue(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function setUsernameFeedback(message = '', tone = 'neutral') {
  const el = els.profileUsernameFeedback;
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('is-error', 'is-success');
  if (tone === 'error') el.classList.add('is-error');
  else if (tone === 'success') el.classList.add('is-success');
}

function validateUsernameInput(raw) {
  const normalized = normalizeUsernameValue(raw);
  const current = normalizeUsernameValue(cachedProfileDoc?.username || '');

  if (!normalized) {
    if (current) {
      setUsernameFeedback('Leave blank to keep your current handle.', 'neutral');
    } else {
      setUsernameFeedback('Choose a handle to personalize your profile.', 'neutral');
    }
    return { valid: true, normalized: '' };
  }

  if (!USERNAME_RE.test(normalized)) {
    setUsernameFeedback('Use 3–20 lowercase letters, numbers, or underscore.', 'error');
    return { valid: false, normalized };
  }

  if (normalized === current) {
    setUsernameFeedback('This is your current username.', 'neutral');
  } else {
    setUsernameFeedback('Format looks good. We’ll confirm availability when you save.', 'success');
  }

  return { valid: true, normalized };
}

// -------------------- Firestore helpers --------------------
function userDocRef(uid) { return doc(db, 'users', uid); }
function prefsDocRef(uid) { return doc(db, 'users', uid, 'settings', 'preferences'); }

async function loadUserDoc(uid) {
  const snap = await getDoc(userDocRef(uid));
  return snap.exists() ? snap.data() : null;
}

async function saveUserDoc(uid, patch) {
  await setDoc(userDocRef(uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

async function loadPrefs(uid) {
  const snap = await getDoc(prefsDocRef(uid));
  if (!snap.exists()) return { weeklyDigest: false, productUpdates: true, news: true };
  const d = snap.data() || {};
  return {
    weeklyDigest: !!d.weeklyDigest,
    productUpdates: !!d.productUpdates,
    news: !!d.news,
  };
}

async function savePrefs(uid, prefs) {
  await setDoc(prefsDocRef(uid), { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
}

// -------------------- Avatar upload --------------------
async function uploadAvatar(uid, file) {
  if (!file) throw new Error('No file selected');
  
  // Determine file extension based on MIME type
  let extension = 'jpg';
  if (file.type === 'image/png') extension = 'png';
  else if (file.type === 'image/webp') extension = 'webp';
  
  const path = `users/${uid}/profile/avatar.${extension}`;
  const r = sRef(storage, path);
  
  // Upload with custom metadata
  const metadata = {
    contentType: file.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: file.name,
      visibility: 'public' // Allow authenticated users to view
    }
  };
  
  await uploadBytes(r, file, metadata);
  const url = await getDownloadURL(r);
  return { url, path };
}

async function removeAvatarIfExists(uid) {
  // Try deleting all possible avatar formats
  const extensions = ['jpg', 'png', 'webp'];
  for (const ext of extensions) {
    try {
      const r = sRef(storage, `users/${uid}/profile/avatar.${ext}`);
      await deleteObject(r);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}

// -------------------- Export (lightweight) --------------------
// NOTE: We intentionally do NOT export all transaction docs (can be huge).
// We include: user profile doc, preferences, budgets (names+amounts),
// and a metadata list of Plaid items (id, institution, last_synced).
async function exportUserData(uid) {
  const userSnap = await getDoc(userDocRef(uid));
  const profile = userSnap.exists() ? userSnap.data() : {};

  const prefs = await loadPrefs(uid);

  // Budgets
  const budgetsCol = collection(db, 'users', uid, 'budgets');
  const budgetsSnap = await getDocs(budgetsCol);
  const budgets = {};
  for (const docSnap of budgetsSnap.docs) {
    const ym = docSnap.id;
    const catsCol = collection(db, 'users', uid, 'budgets', ym, 'categories');
    const catsSnap = await getDocs(catsCol);
    budgets[ym] = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Plaid item metadata (no transactions)
  const itemsCol = collection(db, 'users', uid, 'plaid_items');
  const itemsSnap = await getDocs(itemsCol);
  const items = itemsSnap.docs.map(d => {
    const x = d.data() || {};
    return {
      item_id: d.id,
      institution_name: x.institution_name || x.institution || 'Unknown',
      institution_id: x.institution_id || null,
      last_synced: x.last_synced || null,
    };
  });

  return { profile, preferences: prefs, budgets, plaid_items: items, exportedAt: new Date().toISOString() };
}

// -------------------- Delete account (danger) --------------------
async function batchDeleteCollection(colRef, pageSize = 250) {
  // Deletes a top-level collection (no subcollections) in batches.
  // For nested cleanup, call this per subcollection path.
  while (true) {
    const snap = await getDocs(colRef);
    if (snap.empty) break;
    const batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= pageSize) break;
    }
    await batch.commit();
    if (count < pageSize) break; // last page
  }
}

async function deleteAllUserData(uid) {
  // 1) Delete budgets and their 'categories'
  const budgetsCol = collection(db, 'users', uid, 'budgets');
  const budgetsSnap = await getDocs(budgetsCol);
  for (const b of budgetsSnap.docs) {
    const catsCol = collection(db, 'users', uid, 'budgets', b.id, 'categories');
    await batchDeleteCollection(catsCol);
    await deleteDoc(b.ref);
  }

  // 2) Delete plaid transactions subcollections per item, then the items
  const itemsCol = collection(db, 'users', uid, 'plaid_items');
  const itemsSnap = await getDocs(itemsCol);
  for (const it of itemsSnap.docs) {
    const txCol = collection(db, 'users', uid, 'plaid_items', it.id, 'transactions');
    await batchDeleteCollection(txCol);
    await deleteDoc(it.ref);
  }

  // 3) Delete settings collection
  const settingsCol = collection(db, 'users', uid, 'settings');
  await batchDeleteCollection(settingsCol);

  // 4) Delete root user doc
  await deleteDoc(userDocRef(uid));

  // 5) Delete avatar in storage (ignore errors)
  await removeAvatarIfExists(uid);
}

async function reauthPrompt(user) {
  // Email/password reauth prompt
  const email = user.email;
  const pwd = prompt(`For security, re-enter your password for ${email} to continue:`);
  if (!pwd) throw new Error('Reauthentication cancelled');
  const cred = EmailAuthProvider.credential(email, pwd);
  await reauthenticateWithCredential(user, cred);
}

// -------------------- Load & Save profile --------------------
async function renderProfile(user) {
  if (els.email) els.email.textContent = user.email || '';
  if (els.avatarImg) els.avatarImg.src = user.photoURL || '/images/logo_white.png';

  if (els.emailVerified) {
    if (user.emailVerified) {
      els.emailVerified.textContent = '✓ Verified';
      els.emailVerified.className = 'profile-status profile-status--ok';
    } else {
      els.emailVerified.textContent = '⚠ Not verified';
      els.emailVerified.className = 'profile-status profile-status--pending';
    }
  }

  cachedProfileDoc = await loadUserDoc(user.uid) || {};

  const storedUsername = String(cachedProfileDoc.username || '').trim().replace(/^@/, '');
  const displayNameFallback = String(user.displayName || '').trim().replace(/^@/, '');
  const emailFallback = (user.email || '').split('@')[0] || '';
  const rawUsername = storedUsername || displayNameFallback || emailFallback;
  if (els.profileUsernameInput) {
    els.profileUsernameInput.value = rawUsername || '';
    els.profileUsernameInput.dataset.original = normalizeUsernameValue(rawUsername);
    if (!rawUsername && emailFallback) {
      els.profileUsernameInput.placeholder = emailFallback;
    }
  }
  validateUsernameInput(rawUsername);

  const preferredPhoto = cachedProfileDoc.photoURL || user.photoURL;
  if (preferredPhoto && els.avatarImg) {
    els.avatarImg.src = preferredPhoto;
  }
}

async function handleSaveProfile(user) {
  const file = els.avatarInput?.files?.[0] || null;
  const { valid, normalized: desiredUsername } = validateUsernameInput(els.profileUsernameInput?.value || '');
  if (!valid) {
    toast('Fix username format before saving');
    els.profileUsernameInput?.focus();
    return;
  }

  const currentUsername = normalizeUsernameValue(cachedProfileDoc?.username || '');
  let usernameChanged = false;
  let finalUsername = currentUsername;
  let reservedNewHandleRef = null;
  let createdNewHandleDoc = false;

  setBusy(els.saveProfile, 'Saving…', true);

  const progressEl = document.getElementById('avatar-progress');

  try {
    let photoURL = cachedProfileDoc?.photoURL || user.photoURL || null;

    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        throw new Error('Please upload a JPEG, PNG, or WebP image');
      }
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Image must be less than 5MB');
      }

      if (progressEl) progressEl.hidden = false;
      const { url } = await uploadAvatar(user.uid, file);
      photoURL = url;
      if (els.avatarImg) els.avatarImg.src = url;
      if (els.avatarInput) els.avatarInput.value = '';
    }

    if (desiredUsername && desiredUsername !== currentUsername) {
      const newRef = doc(db, 'usernames', desiredUsername);
      const newSnap = await getDoc(newRef);
      if (newSnap.exists()) {
        if (newSnap.data()?.uid !== user.uid) {
          throw new Error('That username is already taken.');
        }
        // Username already reserved by this user; reuse without rewriting to avoid forbidden update.
        createdNewHandleDoc = false;
        reservedNewHandleRef = null;
      } else {
        await setDoc(newRef, { uid: user.uid, reservedAt: serverTimestamp() });
        reservedNewHandleRef = newRef;
        createdNewHandleDoc = true;
      }
      finalUsername = desiredUsername;
      usernameChanged = true;
    } else {
      finalUsername = currentUsername;
    }

    const profilePayload = {
      photoURL: user.photoURL || photoURL || null,
    };
    if (usernameChanged) {
      profilePayload.username = finalUsername;
    }

    await updateProfile(user, {
      photoURL: profilePayload.photoURL,
      ...(finalUsername ? { displayName: finalUsername } : {}),
    });

    await saveUserDoc(user.uid, profilePayload);

    cachedProfileDoc = {
      ...(cachedProfileDoc || {}),
      ...profilePayload,
      username: finalUsername || cachedProfileDoc?.username || '',
    };

    if (usernameChanged && currentUsername && currentUsername !== finalUsername) {
      try {
        await deleteDoc(doc(db, 'usernames', currentUsername));
      } catch (cleanupErr) {
        console.warn('Failed to release old username', cleanupErr);
      }
    }

    if (els.avatarImg && photoURL) els.avatarImg.src = photoURL;
    if (els.profileUsernameInput) {
      els.profileUsernameInput.value = finalUsername || '';
      els.profileUsernameInput.dataset.original = normalizeUsernameValue(finalUsername);
    }

    if (usernameChanged) {
      setUsernameFeedback('Username updated ✓', 'success');
    } else {
      validateUsernameInput(finalUsername || '');
    }

    toast('Profile saved');
  } catch (e) {
    console.error(e);
    if (e?.message?.toLowerCase().includes('username')) {
      setUsernameFeedback(e.message, 'error');
      els.profileUsernameInput?.focus();
    }
    if (reservedNewHandleRef && createdNewHandleDoc) {
      try { await deleteDoc(reservedNewHandleRef); } catch (cleanupErr) { console.warn('Cleanup failed for reserved username', cleanupErr); }
    }
    toast(e?.message || 'Failed to save profile');
  } finally {
    if (progressEl) progressEl.hidden = true;
    setBusy(els.saveProfile, '', false);
    if (els.avatarInput) els.avatarInput.value = '';
  }
}

// -------------------- Preferences --------------------
async function renderPrefs(uid) {
  const p = await loadPrefs(uid);
  if (els.prefWeekly) els.prefWeekly.checked = !!p.weeklyDigest;
  if (els.prefProduct) els.prefProduct.checked = !!p.productUpdates;
  if (els.prefNews) els.prefNews.checked = !!p.news;
}

async function handleSavePrefs(uid) {
  const prefs = {
    weeklyDigest: !!els.prefWeekly?.checked,
    productUpdates: !!els.prefProduct?.checked,
    news: !!els.prefNews?.checked,
  };
  setBusy(els.savePrefs, 'Saving…', true);
  try {
    await savePrefs(uid, prefs);
    toast('Preferences saved');
  } catch (e) {
    console.error(e);
    toast('Failed to save preferences');
  } finally {
    setBusy(els.savePrefs, '', false);
  }
}

// -------------------- Export data --------------------
async function handleExport(uid) {
  setBusy(els.exportData, 'Preparing…', true);
  try {
    const data = await exportUserData(uid);
    const pretty = JSON.stringify(data, null, 2);
    const date = new Date().toISOString().slice(0,10);
    downloadFile(`vibance_export_${date}.json`, pretty, 'application/json');
    toast('Export ready');
  } catch (e) {
    console.error(e);
    toast('Export failed');
  } finally {
    setBusy(els.exportData, '', false);
  }
}

// -------------------- Delete account flow --------------------
async function handleDeleteAccount(user) {
  if (!confirm('This will permanently delete your account and data. Continue?')) return;

  setBusy(els.deleteAccount, 'Deleting…', true);
  try {
    await reauthPrompt(user);

    // Best-effort delete Firestore data & Storage avatar
    await deleteAllUserData(user.uid);

    // Finally delete Auth user
    await deleteUser(user);

    // Redirect to home (or login)
    toast('Account deleted');
    setTimeout(() => { window.location.href = '/'; }, 600);
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Delete failed');
  } finally {
    setBusy(els.deleteAccount, '', false);
  }
}

// -------------------- Wiring --------------------
function wire(user) {
  els.saveProfile?.addEventListener('click', () => handleSaveProfile(user));
  els.profileUsernameInput?.addEventListener('input', () => validateUsernameInput(els.profileUsernameInput.value));
  els.profileUsernameInput?.addEventListener('blur', () => validateUsernameInput(els.profileUsernameInput.value));

  // Live avatar preview
  els.avatarInput?.addEventListener('change', () => {
    const file = els.avatarInput.files?.[0];
    if (!file || !els.avatarImg) return;
    const url = URL.createObjectURL(file);
    els.avatarImg.src = url;
    // Revoke later
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}

// -------------------- Init --------------------
function init() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check.js likely redirects
    try {
      await renderProfile(user);
      wire(user);
    } catch (e) {
      console.error('Profile init failed', e);
      toast('Failed to load profile');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
