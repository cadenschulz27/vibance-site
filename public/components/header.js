// public/components/header.js
// ------------------------------------------------------------
// Header Controller
//  - Injects /components/header.html into the page
//  - Auth-aware: shows Login/Signup or user avatar + dropdown
//  - Highlights active nav item
//  - Mobile menu toggle
//  - Logout
//  - Removes "Blog" tab from header nav (desktop + mobile)
//  - When authenticated, brand logo routes to /dashboard/dashboard.html
//
// Requirements:
//  - ../api/firebase.js must export { auth, db }
//  - The HTML partial at /components/header.html should contain elements
//    with the selectors referenced in `els` below (or adjust them).
//
// Suggested minimal hook in each page:
//   <div id="site-header"></div>
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
  // These are queried *after* the header HTML is injected:
  authCtas: () => document.querySelector('[data-header="auth-ctas"]'),         // Login / Signup wrapper
  userMenu: () => document.querySelector('[data-header="user-menu"]'),         // Avatar + dropdown wrapper
  avatarImg: () => document.querySelector('[data-header="avatar"]'),           // <img>
  displayName: () => document.querySelector('[data-header="display-name"]'),   // <span>
  logoutBtn: () => document.querySelector('[data-header="logout"]'),           // <button>
  mobileToggle: () => document.querySelector('[data-header="mobile-toggle"]'), // hamburger button
  mobileNav: () => document.querySelector('[data-header="mobile-nav"]'),       // mobile nav container
  desktopNav: () => document.querySelector('[data-header="desktop-nav"]'),     // desktop nav container
  notifBadge: () => document.querySelector('[data-header="notif-badge"]'),     // small unread bubble (optional)
  brandLink: () => document.querySelector('header a[href="/"]'),               // site logo/home link
};

const FALLBACK_AVATAR = '/images/logo_white.png';
const DASHBOARD_PATH = '/dashboard/dashboard.html';

// ----------------------------- Fetch & Inject -----------------------------
async function loadHeaderHtml() {
  const res = await fetch('/components/header.html', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load header.html (${res.status})`);
  return await res.text();
}

function injectHeader(html) {
  let mount = els.mount();
  if (!mount) {
    // Create a mount if not present: stick at top of body
    mount = document.createElement('div');
    mount.id = 'site-header';
    document.body.prepend(mount);
  }
  mount.innerHTML = html;
}

// ----------------------------- Active Link Highlight -----------------------------
function normalizePath(path) {
  // Converts "/pages/blog.html?x=1#y" -> "/pages/blog.html"
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
  // Optional: if you add a notifications collection later.
  // Schema: users/{uid}/notifications/{id} with { read: boolean }
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

// ----------------------------- Auth Rendering -----------------------------
async function loadUserProfileDoc(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch {
    return {};
  }
}

function setAuthCtasVisible(showCtas) {
  const ctas = els.authCtas();
  const menu = els.userMenu();
  if (ctas) ctas.classList.toggle('hidden', !showCtas);
  if (menu) menu.classList.toggle('hidden', !!showCtas);
}

function setHomeLinkForUser(isAuthed) {
  const brand = els.brandLink();
  if (!brand) return;

  // Remove any prior handler so we don't double-bind
  const newBrand = brand.cloneNode(true);
  brand.parentNode.replaceChild(newBrand, brand);

  if (isAuthed) {
    newBrand.setAttribute('href', DASHBOARD_PATH);
    newBrand.addEventListener('click', (e) => {
      // Ensure SPA-like feel and avoid flashing public home
      e.preventDefault();
      window.location.href = DASHBOARD_PATH;
    });
  } else {
    newBrand.setAttribute('href', '/');
    // Default behavior to go home
  }
}

async function renderAuthedHeader(user) {
  setAuthCtasVisible(false);
  setHomeLinkForUser(true);

  const nameEl = els.displayName();
  const avatar = els.avatarImg();

  // Prefer Auth fields; fallback to Firestore doc
  let displayName = user.displayName || '';
  let photoURL = user.photoURL || '';

  if (!displayName || !photoURL) {
    const docData = await loadUserProfileDoc(user.uid);
    displayName = displayName || docData.displayName || '';
    photoURL = photoURL || docData.photoURL || '';
  }

  if (nameEl) nameEl.textContent = displayName || user.email || 'Account';
  if (avatar) avatar.src = photoURL || FALLBACK_AVATAR;

  // Optional: show unread notifications badge
  const unread = await fetchUnreadCount(user.uid);
  renderNotifBadge(unread);

  // Wire logout
  const logout = els.logoutBtn();
  if (logout) {
    logout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await signOut(auth);
        // After logout, the home link should go to public home
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
}

// ----------------------------- Remove Blog Nav -----------------------------
function removeBlogLinks() {
  // Remove any link that points to /pages/blog.html
  const selectors = [
    'a[href="/pages/blog.html"]',
    'a[href="/pages/blog.html/"]',
  ];
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(a => {
      // Remove the entire nav item container if reasonable
      const liLike = a.closest('a, li, div');
      if (liLike && (liLike !== document.body)) {
        liLike.remove();
      } else {
        a.remove();
      }
    });
  });
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

  // Close on nav click
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
}

// ----------------------------- Init -----------------------------
async function boot() {
  try {
    const html = await loadHeaderHtml();
    injectHeader(html);

    // Remove Blog from both desktop and mobile navs
    removeBlogLinks();

    wireMobileMenu();
    highlightActiveLinks();

    // React to auth changes
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) await renderAuthedHeader(user);
        else renderAnonHeader();
      } catch (e) {
        console.error('Header auth render failed', e);
      } finally {
        // Re-apply active link highlighting (in case menu content changed)
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
