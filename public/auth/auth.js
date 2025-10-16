// FILE: public/auth/auth.js
// ------------------------------------------------------------------
// Vibance • Auth (Sign up / Login) with USERNAME + Code Verification
// - Collects firstName, lastName, username, email, password
// - Validates username (3–20, a–z, 0–9, _), ensures uniqueness
// - Reserves username atomically in Firestore and creates user profile
// - Sends a 6-digit verification CODE via Netlify function, verified on-site
// - Redirects verified users to dashboard; admin email to admin panel
// ------------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* --------------------------- Username helpers --------------------------- */

const USERNAME_RE = /^[a-z0-9_]{3,20}$/; // lowercase letters, digits, underscore; 3-20 chars

/**
 * Reserve a username atomically and stamp it onto /users/{uid}.
 * Fails if the username document already exists.
 */
async function reserveUsernameTx(uid, username) {
  const uname = String(username || '').toLowerCase();
  if (!USERNAME_RE.test(uname)) {
    throw new Error('Username must be 3–20 chars, lowercase letters, numbers, or underscore.');
  }
  const unameRef = doc(db, 'usernames', uname);
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const taken = await tx.get(unameRef);
    if (taken.exists()) throw new Error('This username is already taken.');
    // Reserve the username and ensure the user doc exists with username set
    tx.set(unameRef, { uid, reservedAt: serverTimestamp() });
    tx.set(userRef, { username: uname }, { merge: true });
  });

  return uname;
}

/* --------------------------- Verification helpers --------------------------- */

/**
 * Triggers sending a 6-digit verification code email via Netlify function.
 * Uses Firebase ID token for auth. Errors are logged but not thrown.
 */
async function triggerCodeCreate(user, noteEl) {
  try {
    const idToken = await user.getIdToken(true);
    const res = await fetch('/.netlify/functions/verify-code-create', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Code send failed (${res.status})`);
    }
    if (noteEl) noteEl.textContent = 'Verification code sent. Check your email.';
  } catch (e) {
    console.warn('Could not trigger code email:', e);
    if (noteEl) noteEl.textContent = 'We tried to send a code, but something went wrong. Use “Resend code” on the next page.';
  }
}

/* ------------------------------- SIGN UP -------------------------------- */

const signupForm = document.getElementById('signup-form');

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = (document.getElementById('signup-first-name')?.value || '').trim();
    const lastName  = (document.getElementById('signup-last-name')?.value || '').trim();
    const username  = (document.getElementById('signup-username')?.value || '').trim().toLowerCase();
    const email     = (document.getElementById('signup-email')?.value || '').trim();
    const password  = (document.getElementById('signup-password')?.value || '').trim();
    const errorEl   = document.getElementById('signup-error');

    // Clear any prior error
    if (errorEl) errorEl.textContent = '';

    // Reserved admin address guard (leave as-is per your original behavior)
    if (email.toLowerCase() === 'cadenschulz@gmail.com') {
      if (errorEl) errorEl.textContent = "This email is reserved for administration.";
      return;
    }

    // Validate inputs
    if (!firstName || !lastName) {
      if (errorEl) errorEl.textContent = 'Please provide your first and last name.';
      return;
    }
    if (!USERNAME_RE.test(username)) {
      if (errorEl) errorEl.textContent = 'Username must be 3–20 chars, lowercase letters, numbers, or underscore.';
      return;
    }

    try {
      // 1) Create auth user
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // 2) Reserve username atomically (creates /usernames/{username} and sets /users/{uid}.username)
      await reserveUsernameTx(user.uid, username);

      // 3) Write profile fields (do NOT re-send 'username' here)
      const fullName = `${firstName} ${lastName}`.trim();
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        firstName,
        lastName,
        name: fullName,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        onboarding: {
          pending: true,
          basicsComplete: false,
          incomeProfileComplete: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastPrompted: serverTimestamp()
        }
      }, { merge: true });

      // 4) Send 6-digit code and go to verification page
      await triggerCodeCreate(user, errorEl);
      window.location.href = 'verify-email.html';

    } catch (err) {
      console.error('Signup error:', err);
      if (errorEl) errorEl.textContent = err?.message || 'Sign up failed. Please try again.';
    }
  });
}

/* ------------------------------- LOGIN ---------------------------------- */

const loginForm = document.getElementById('login-form');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = (document.getElementById('login-email')?.value || '').trim();
    const password = (document.getElementById('login-password')?.value || '').trim();
    const errorEl  = document.getElementById('login-error');

    // Clear any prior error
    if (errorEl) errorEl.textContent = '';

    try {
      await signInWithEmailAndPassword(auth, email, password);

      // Refresh and route based on verification status
      await auth.currentUser.reload();
      const user = auth.currentUser;

      if (user.email === 'cadenschulz@gmail.com') {
        // Admin shortcut: you may still want emailVerified for admin; keeping your prior behavior
        window.location.href = 'admin/admin.html';
        return;
      }

      if (user.emailVerified) {
        window.location.href = 'dashboard/dashboard.html';
      } else {
        // Not verified yet — send code, then move to the verify page
        await triggerCodeCreate(user, errorEl);
        window.location.href = 'verify-email.html';
      }
    } catch (error) {
      console.error("Login error:", error);
      if (errorEl) errorEl.textContent = "Invalid email or password. Please try again.";
    }
  });
}
