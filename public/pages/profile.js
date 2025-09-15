// public/pages/profile.js
// ----------------------------------------------------
// Profile controller
//  - Display & update profile (displayName, avatar)
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
  sendEmailVerification,
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
  displayName: document.getElementById('display-name'),
  email: document.getElementById('email'),
  emailVerified: document.getElementById('email-verified'),
  resendVerification: document.getElementById('resend-verification'),
  saveProfile: document.getElementById('save-profile'),

  prefWeekly: document.getElementById('pref-weekly'),
  prefProduct: document.getElementById('pref-product'),
  prefNews: document.getElementById('pref-news'),
  savePrefs: document.getElementById('save-prefs'),

  exportData: document.getElementById('export-data'),
  deleteAccount: document.getElementById('delete-account'),

  toast: document.getElementById('toast'),
};

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
  const path = `users/${uid}/profile/avatar.jpg`;
  const r = sRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(r);
  return { url, path };
}

async function removeAvatarIfExists(uid) {
  try {
    const r = sRef(storage, `users/${uid}/profile/avatar.jpg`);
    await deleteObject(r);
  } catch (e) {
    // ignore if not found
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
  // Basics
  if (els.email) els.email.textContent = user.email || '';
  if (els.displayName) els.displayName.value = user.displayName || '';
  if (els.avatarImg) els.avatarImg.src = user.photoURL || '/images/logo_white.png';

  // Verified badge
  if (els.emailVerified) {
    els.emailVerified.textContent = user.emailVerified ? 'Verified' : 'Not verified';
    els.emailVerified.className = user.emailVerified
      ? 'text-emerald-400 text-sm'
      : 'text-amber-400 text-sm';
  }

  // Pull extended profile doc (optional fields)
  const docData = await loadUserDoc(user.uid);
  if (docData?.displayName && els.displayName && !user.displayName) {
    els.displayName.value = docData.displayName;
  }
  if (docData?.photoURL && els.avatarImg && !user.photoURL) {
    els.avatarImg.src = docData.photoURL;
  }
}

async function handleSaveProfile(user) {
  const name = (els.displayName?.value || '').trim();
  const file = els.avatarInput?.files?.[0] || null;

  setBusy(els.saveProfile, 'Saving…', true);
  try {
    let photoURL = user.photoURL;

    if (file) {
      const { url } = await uploadAvatar(user.uid, file);
      photoURL = url;
    }

    // Update Auth profile
    await updateProfile(user, {
      displayName: name || user.displayName || '',
      photoURL: photoURL || user.photoURL || null,
    });

    // Mirror to Firestore user doc
    await saveUserDoc(user.uid, {
      displayName: user.displayName || name || '',
      photoURL: user.photoURL || photoURL || null,
    });

    // Update UI
    if (els.avatarImg && photoURL) els.avatarImg.src = photoURL;
    toast('Profile saved');
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Failed to save profile');
  } finally {
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

// -------------------- Email verification --------------------
async function handleResendVerification(user) {
  if (user.emailVerified) { toast('Email already verified'); return; }
  setBusy(els.resendVerification, 'Sending…', true);
  try {
    await sendEmailVerification(user);
    toast('Verification email sent');
  } catch (e) {
    console.error(e);
    toast('Failed to send verification');
  } finally {
    setBusy(els.resendVerification, '', false);
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
  els.resendVerification?.addEventListener('click', () => handleResendVerification(user));
  els.savePrefs?.addEventListener('click', () => handleSavePrefs(user.uid));
  els.exportData?.addEventListener('click', () => handleExport(user.uid));
  els.deleteAccount?.addEventListener('click', () => handleDeleteAccount(user));

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
      await renderPrefs(user.uid);
      wire(user);
    } catch (e) {
      console.error('Profile init failed', e);
      toast('Failed to load profile');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
