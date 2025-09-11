// public/Social/profile-editor.js
// ------------------------------------------------------------
// Vibance • Profile Editor controller (external module version)
// - Writes ONLY allowed root fields on /users/{uid} per rules:
//     name, firstName, lastName, photoURL, updatedAt
// - Stores bio in /users/{uid}/settings/profile
// - Works with the updated profile-editor.html IDs
// ------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ----------------------------- DOM -----------------------------
const els = {
  form: document.getElementById('profile-form'),
  name: document.getElementById('name'),
  first: document.getElementById('firstName'),
  last: document.getElementById('lastName'),
  photo: document.getElementById('photoURL'),
  bio: document.getElementById('bio'),
  bioCount: document.getElementById('bio-count'),
  preview: document.getElementById('avatar-preview'),
  toast: document.getElementById('toast'),
  save: document.getElementById('btn-save'),
};

// ----------------------------- Utils -----------------------------
function toast(msg) {
  if (!els.toast) return console.log('[toast]', msg);
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0','pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0','pointer-events-none');
  }, 1500);
}
function enable(el, yes=true){ if (!el) return; el.disabled=!yes; el.classList.toggle('opacity-50', !yes); }

// ----------------------------- Wiring -----------------------------
function wire() {
  els.photo?.addEventListener('input', () => {
    const url = (els.photo.value || '').trim();
    if (els.preview) els.preview.src = url || '/images/logo_white.png';
  });
  els.bio?.addEventListener('input', () => {
    if (els.bioCount) els.bioCount.textContent = String(els.bio.value.length);
  });

  els.form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const payload = {
      name: (els.name?.value || '').trim(),
      firstName: (els.first?.value || '').trim(),
      lastName: (els.last?.value || '').trim(),
      photoURL: (els.photo?.value || '').trim(),
      updatedAt: serverTimestamp(),
    };

    // Strip empty strings to avoid overwriting with ''
    Object.keys(payload).forEach(k => {
      if (payload[k] === '') delete payload[k];
    });

    enable(els.save, false);
    try {
      // Root user doc: only allowed fields per rules
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      // Bio saved privately in settings
      const bio = (els.bio?.value || '').trim();
      await setDoc(
        doc(db, 'users', user.uid, 'settings', 'profile'),
        { bio, updatedAt: serverTimestamp() },
        { merge: true }
      );

      toast('Saved ✓');
      setTimeout(() => {
        location.href = './user-profile.html?uid=' + encodeURIComponent(user.uid);
      }, 600);
    } catch (e) {
      console.error(e);
      toast('Save failed');
    } finally {
      enable(els.save, true);
    }
  });
}

// ----------------------------- Initial Load -----------------------------
function loadInitial() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check handles redirect if needed
    try {
      // Owner read allowed by rules
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.exists() ? (snap.data() || {}) : {};
      if (els.name) els.name.value = data.name || user.displayName || '';
      if (els.first) els.first.value = data.firstName || '';
      if (els.last) els.last.value = data.lastName || '';
      if (els.photo) els.photo.value = data.photoURL || user.photoURL || '';
      if (els.preview) els.preview.src = (els.photo?.value || '') || '/images/logo_white.png';

      // Load bio from settings subcollection
      try {
        const bioSnap = await getDoc(doc(db, 'users', user.uid, 'settings', 'profile'));
        const bio = bioSnap.exists() ? (bioSnap.data().bio || '') : '';
        if (els.bio) els.bio.value = bio;
        if (els.bioCount) els.bioCount.textContent = String(bio.length);
      } catch { /* ignore */ }
    } catch (e) {
      console.error(e);
    }
  });
}

// ----------------------------- Boot -----------------------------
document.addEventListener('DOMContentLoaded', () => { wire(); loadInitial(); });
