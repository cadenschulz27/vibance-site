// public/components/header.js
// Vibance Header Controller — injects header.html, wires auth state, avatar/name, dropdown, admin link, and mobile menu.

import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Bump this to force refetch of header.html if you update it
const HEADER_VERSION = 'v15';
const ADMIN_EMAIL_FALLBACK = 'cadenschulz@gmail.com';

// Utils
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const outside = (el, t) => !(el && (el === t || el.contains(t)));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function firstNameFrom(profile, displayName, email) {
  const v = (profile?.firstName || profile?.name || displayName || '').trim();
  if (v) return v.split(/\s+/)[0];
  if (email) return String(email).split('@')[0];
  return 'Friend';
}
function lastInitialFrom(profile, displayName) {
  const last = (profile?.lastName || (displayName || '').split(/\s+/)[1] || '').trim();
  return last ? last[0].toUpperCase() : '';
}
function setActiveNav(root) {
  const path = (location.pathname || '').toLowerCase();
  const pairs = [
    [/\/dashboard\//, '#nav-dashboard'],
    [/\/expenses\//,  '#nav-expenses'],
    [/\/income\//,    '#nav-income'],
    [/\/budgeting\//, '#nav-budgeting'],
    [/\/net\//,       '#nav-net'],
    [/\/social\//,    '#nav-community'],
    [/\/literacy\//,  '#nav-literacy'],
    [/\/admin\//,     '#nav-admin'],
  ];
  $$('.nav-link', root).forEach(a => a.classList.remove('active'));
  $$('.mnav-link', root).forEach(a => a.classList.remove('active'));
  for (const [re, id] of pairs) {
    if (re.test(path)) {
      $(id, root)?.classList.add('active');
      // mobile counterpart
      const text = $(id, root)?.textContent?.trim() || '';
      $$('.mnav-link', root).find(a => a.textContent.trim() === text)?.classList.add('active');
      break;
    }
  }
}

// Load /api/firebase.js robustly from likely paths
async function loadFirebase() {
  const cand = [
    new URL('../api/firebase.js', import.meta.url).toString(),   // components/ → api/
    '/api/firebase.js',                                         // absolute
  ];
  for (const url of cand) {
    try {
      const mod = await import(url);
      if (mod?.auth && mod?.db) return { auth: mod.auth, db: mod.db };
    } catch (e) {
      console.warn('[header] firebase import failed at', url, e?.message || e);
    }
  }
  return { auth: null, db: null };
}

// Inject header.html once
async function ensureHeaderMarkup() {
  if ($('#app-header')) return document.body; // already present
  const url = new URL('./header.html', import.meta.url);
  url.searchParams.set('v', HEADER_VERSION);
  const res = await fetch(url.toString());
  const html = await res.text();
  const frag = document.createElement('div');
  frag.innerHTML = html.trim();
  const node = frag.firstElementChild;
  document.body.prepend(node);
  // push content down below the fixed header
  const headerHeight = clamp($('#app-header')?.offsetHeight || 64, 56, 96);
  document.body.style.paddingTop = `${headerHeight}px`;
  // Expose header offset for sticky elements (e.g., Expenses toolbar)
  document.documentElement.style.setProperty('--vb-header-offset', `${headerHeight}px`);
  return document.body;
}

// ---------------- Theme ----------------
function applyTheme(theme) {
  const root = document.documentElement;
  const dark = theme !== 'light';
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('vb_theme', dark ? 'dark' : 'light'); } catch {}
  const logo = document.getElementById('brand-logo');
  if (logo) logo.src = dark ? '/images/logo_white.png' : '/images/logo_black.png';
  const sun = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (sun && moon) { sun.classList.toggle('hidden', !dark); moon.classList.toggle('hidden', dark); }
}

// Signed-out/signed-in UI toggles
function showSignedOut(root) {
  $('#desktop-nav', root)?.classList.add('hidden');
  $('#btn-mobile', root)?.classList.add('hidden');
  $('#user-menu', root)?.classList.add('hidden');
  $('#m-user-actions', root)?.classList.add('hidden');
  $('#auth-actions', root)?.classList.remove('hidden');
  $('#m-auth-actions', root)?.classList.remove('hidden');
}
function showSignedIn(root) {
  $('#auth-actions', root)?.remove();
  $('#m-auth-actions', root)?.remove();
  $('#desktop-nav', root)?.classList.remove('hidden');
  $('#btn-mobile', root)?.classList.remove('hidden');
  $('#user-menu', root)?.classList.remove('hidden');
  $('#m-user-actions', root)?.classList.remove('hidden');
}

// Dropdown wiring
function wireAvatarMenu(root, auth) {
  const btn = $('#user-menu-button', root);
  const pop = $('#user-pop', root);
  if (!btn || !pop) return;

  // Build once
  pop.innerHTML = `
    <a href="/Social/user-profile.html" class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900" role="menuitem">My Profile</a>
    <a href="/Social/bookmarks.html"  class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900" role="menuitem">Saved Posts</a>
    <a href="/pages/profile.html"       class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900" role="menuitem">Settings</a>
    <a href="/Accounts/accounts.html"   class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900" role="menuitem">Account Linkage</a>
    <hr class="my-1 border-neutral-800" role="separator"/>
    <a href="/pages/support.html"       class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900" role="menuitem">Help &amp; Support</a>
    <button id="btn-signout" class="w-full text-left mt-1 px-3 py-2 rounded-lg text-sm text-red-400 bg-red-600/10 hover:bg-red-600/20" role="menuitem">Log out</button>
  `;

  // Toggle logic
  let open = false;
  const openMenu  = () => { pop.classList.remove('hidden'); btn.setAttribute('aria-expanded','true'); open = true; };
  const closeMenu = () => { pop.classList.add('hidden');    btn.setAttribute('aria-expanded','false'); open = false; };

  btn.addEventListener('click', (e) => { e.preventDefault(); open ? closeMenu() : openMenu(); });
  document.addEventListener('click', (e) => { if (open && outside(pop, e.target) && outside(btn, e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') closeMenu(); });

  // Sign out
  $('#btn-signout', pop)?.addEventListener('click', async () => {
    try { await signOut(auth); } catch (e) { console.error('[header] signOut failed', e); }
    location.href = '/login.html';
  });
}

// Mobile menu wiring
function wireMobileMenu(root, auth) {
  const btn = $('#btn-mobile', root);
  const panel = $('#mobile-panel', root);
  if (!btn || !panel) return;
  const toggle = () => {
    const isOpen = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  };
  btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
  // Close when clicking a link
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(); });
  // Mobile sign out
  $('#m-btn-signout', root)?.addEventListener('click', async () => {
    try { await signOut(auth); } catch (e) { console.error('[header] signOut failed', e); }
    location.href = '/login.html';
  });
}

// Admin link visibility based on custom claims OR email allow-list
async function applyAdminVisibility(root, user) {
  try {
    if (!user) return;
    await user.reload();
    const tok = await user.getIdTokenResult(true);
    const hasClaim = !!(tok?.claims?.roles && tok.claims.roles.admin === true);
    const isAllowList = (user.email || '').toLowerCase() === ADMIN_EMAIL_FALLBACK;
    const show = hasClaim || isAllowList;
    const adminDesktop = $('#nav-admin', root);
    const adminMobile  = $('#m-admin-link', root);
    if (show) { adminDesktop?.classList.remove('hidden'); adminMobile?.classList.remove('hidden'); }
    else      { adminDesktop?.classList.add('hidden');    adminMobile?.classList.add('hidden');    }
  } catch (e) {
    console.warn('[header] admin visibility check failed', e?.message || e);
  }
}

// Apply user identity (avatar + First L.)
function paintIdentity(root, { firstName, lastInitial, photoURL }) {
  const nameEl = $('#user-name', root);
  const display = lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  if (nameEl) nameEl.textContent = display;
  const avatar = $('#user-avatar', root);
  if (avatar) avatar.src = photoURL || '/images/logo_white.png';
}

// Boot
(async function init() {
  // 1) Inject markup
  await ensureHeaderMarkup();
  const root = document;

  // 2) Brand link always points to dashboard
  const brand = $('#brand-link', root);
  if (brand) {
    brand.setAttribute('href', '/dashboard/dashboard.html');
    brand.addEventListener('click', (e) => { e.preventDefault(); location.href = '/dashboard/dashboard.html'; });
  }

  // 3) Static nav highlighting (works even before auth)
  setActiveNav(root);

  // 4) Firebase
  const { auth, db } = await loadFirebase();

  // If Firebase failed to load, show anonymous header
  if (!auth || !db) {
    console.warn('[header] Firebase not available — rendering signed-out UI.');
    showSignedOut(root);
    return;
  }

  // 5) Wire menus (they’ll be revealed on sign-in)
  wireAvatarMenu(root, auth);
  wireMobileMenu(root, auth);

  // 6) React to auth state
  onAuthStateChanged(auth, async (user) => {
    if (!user) { showSignedOut(root); return; }

    // Fetch profile doc
    let profile = {};
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) profile = snap.data() || {};
    } catch (e) {
      console.warn('[header] failed to read user profile', e?.message || e);
    }

    // Name + avatar
    const firstName   = firstNameFrom(profile, user.displayName, user.email);
    const lastInitial = lastInitialFrom(profile, user.displayName);
    const photoURL    = profile.photoURL || user.photoURL || '/images/logo_white.png';

    paintIdentity(root, { firstName, lastInitial, photoURL });
    showSignedIn(root);
    await applyAdminVisibility(root, user);
    setActiveNav(root); // re-evaluate now that admin link may be visible
  });
})();
