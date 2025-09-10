// public/components/header.js
// ------------------------------------------------------------
// Header Controller
//  - Injects /components/header.html into the page
//  - Auth-aware: shows Login/Signup or greeting + dropdown
//  - Time-of-day greeting: "Good morning/Welcome/Good evening, {firstName}"
//  - Mobile menu toggle
//  - Dropdown menu open/close + outside click + Esc
//  - Logo routes to dashboard when authenticated
//
// Requirements:
//  - ../api/firebase.js must export { auth, db }
//  - /components/header.html must contain data-header hooks below.
// ------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import {
  doc, getDoc, collection, getDocs, query, where, limit
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

// ----------------------------- DOM helpers -----------------------------
const els = {
  mount: () => document.getElementById('site-header') || document.querySelector('header'),
  // Injected elements (resolved after HTML loads):
  authCtas: () => document.querySelector('[data-header="auth-ctas"]'),
  userMenuWrap: () => document.querySelector('[data-header="user-menu"]'),
  userMenuBtn: () => document.querySelector('[data-header="user-menu-button"]'),
  userDropdown: () => document.querySelector('[data-header="user-dropdown"]'),
  greeting: () => document.querySelector('[data-header="greeting"]'),
  logoutBtn: () => document.querySelector('[data-header="logout"]'),
  mobileToggle: () => document.querySelector('[data-header="mobile-toggle"]'),
  mobileNav: () => document.querySelector('[data-header="mobile-nav"]'),
  desktopNav: () => document.querySelector('[data-header="desktop-nav"]'),
  notifBadge: () => document.querySelector('[data-header="notif-badge"]'),
  brandLink: () => document.querySelector('header a[href="/"]'),
};

const DASHBOARD_PATH = '/dashboard/dashboard.html';

// ----------------------------- Load & Inject -----------------------------
async function loadHeaderHtml() {
  const res = await fetch('/components/header.html', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load header.html (${res.status})`);
  return await res.text();
}

function injectHeader(html) {
  let mount = els.mount();
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'site-header';
    document.body.prepend(mount);
  }
  mount.innerHTML = html;
}

// ----------------------------- Active Link Highlight -----------------------------
function normalizePath(path) {
  try {
    const u = new URL(path, window.location.origin);
    return u.pathname.replace(/\/+$/, '');
  } catch {
    return path.replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

function highlightActiveLinks() {
  const current = normalizePath(window.location.pathname || '/');
  const nav = document.querySelectorAll('[data-header="desktop-nav"] a, [data-header="mobile-nav"] a');
  nav.forEach(a => {
    const href = a.getAttribute('href') || '';
    const normalized = normalizePath(href);
    const isActive =
      normalized === current ||
      (normalized !== '/' && current.startsWith(normalized));
    a.classList.toggle('text-emerald-400', !!isActive);
    a.classList.toggle('font-semibold', !!isActive);
  });
}

// ----------------------------- Notifications (optional) -----------------------------
async function fetchUnreadCount(uid) {
  // Optional: users/{uid}/notifications where {read: false}
  try {
    const col = collection(db, 'users', uid, 'notifications');
    const qUnread = query(col, where('read', '==', false), limit(10));
    const snap = await getDocs(qUnread);
    return snap.size || 0;
  } catch {
    return 0;
  }
}

function renderNotifBadge(count) {
  const badge = els.notifBadge();
  if (!badge) return;
  if (!count) {
    badge.classList.add('hidden');
  } else {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.remove('hidden');
  }
}

// ----------------------------- Greeting -----------------------------
function titleCase(s) {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function guessFirstName(user, profileData = {}) {
  // Priority: explicit firstName -> displayName -> email local-part
  const fromProfile = profileData.firstName || profileData.givenName;
  if (fromProfile) return String(fromProfile);

  const dn = user?.displayName || profileData.displayName;
  if (dn) return dn.split(/\s+/)[0];

  const email = user?.email || '';
  if (email.includes('@')) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ');
    return titleCase(local.split(' ')[0] || 'there');
  }
  return 'there';
}

/**
 * Morning: 05:00–11:59 → "Good morning"
 * Evening: 17:00–04:59 → "Good evening"
 * Otherwise: 12:00–16:59 → "Welcome"
 */
function greetingForHour(h) {
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 17 || h < 5) return 'Good evening';
  return 'Welcome';
}

function setGreetingText(text) {
  const g = els.greeting();
  if (g) g.textContent = text;
}

// ----------------------------- Auth Rendering -----------------------------
function setAuthCtasVisible(showCtas) {
  const ctas = els.authCtas();
  const wrap = els.userMenuWrap();
  if (ctas) ctas.classList.toggle('hidden', !showCtas);
  if (wrap) wrap.classList.toggle('hidden', !!showCtas);
}

function setHomeLinkForUser(isAuthed) {
  const brand = els.brandLink();
  if (!brand) return;

  // Replace node to drop previous listeners
  const newBrand = brand.cloneNode(true);
  brand.parentNode.replaceChild(newBrand, brand);

  if (isAuthed) {
    newBrand.setAttribute('href', DASHBOARD_PATH);
    newBrand.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = DASHBOARD_PATH;
    });
  } else {
    newBrand.setAttribute('href', '/');
  }
}

function wireDropdown() {
  const btn = els.userMenuBtn();
  const menu = els.userDropdown();
  const wrap = els.userMenuWrap();
  if (!btn || !menu || !wrap) return;

  function open() {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, { capture: true });
    document.addEventListener('keydown', onKey);
  }
  function close() {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, { capture: true });
    document.removeEventListener('keydown', onKey);
  }
  function toggle() {
    if (menu.classList.contains('hidden')) open();
    else close();
  }
  function onDocClick(e) {
    if (!wrap.contains(e.target)) close();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggle();
  });
}

async function loadUserProfileDoc(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch {
    return {};
  }
}

async function renderAuthedHeader(user) {
  setAuthCtasVisible(false);
  setHomeLinkForUser(true);

  const profile = await loadUserProfileDoc(user.uid);
  const firstName = guessFirstName(user, profile);
  const h = new Date().getHours();
  const greet = `${greetingForHour(h)}, ${firstName}`;
  setGreetingText(greet);

  // Notifications badge (optional)
  const unread = await fetchUnreadCount(user.uid);
  renderNotifBadge(unread);

  // Dropdown wiring
  wireDropdown();

  // Logout
  const logout = els.logoutBtn();
  if (logout) {
    logout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await signOut(auth);
        setHomeLinkForUser(false);
        window.location.href = '/login.html';
      } catch (err) {
        console.error('Sign out failed', err);
        alert('Failed to sign out. Please try again.');
      }
    });
  }
}

function renderAnonHeader() {
  setAuthCtasVisible(true);
  setHomeLinkForUser(false);
  renderNotifBadge(0);
  setGreetingText('Welcome');
}

// ----------------------------- Mobile Menu -----------------------------
function wireMobileMenu() {
  const btn = els.mobileToggle();
  const menu = els.mobileNav();
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
}

// ----------------------------- Boot -----------------------------
async function boot() {
  try {
    const html = await loadHeaderHtml();
    injectHeader(html);

    wireMobileMenu();
    highlightActiveLinks();

    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) await renderAuthedHeader(user);
        else renderAnonHeader();
      } catch (e) {
        console.error('Header auth render failed', e);
      } finally {
        highlightActiveLinks();
      }
    });
  } catch (e) {
    console.error('Header init failed', e);
  }
}

// Run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
