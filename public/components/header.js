// public/components/header.js
// ------------------------------------------------------------------
// Loads /components/header.html into #site-header, then hydrates:
// - Signed out (index): logo + Log in/Sign up only
// - Signed in: tabs (Dashboard, Expenses, Budgeting, Social),
//   "Welcome, {FirstName}", avatar with dropdown menu:
//     My Profile, Account Linkage, Settings
// ------------------------------------------------------------------

import { auth, db } from '/api/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PATH = location.pathname || '/index.html';
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------- Load Markup ------------------------------ */
async function ensureHeaderMarkup() {
  const mount = $('#site-header');
  if (!mount) return null;

  // If already has our structure, skip fetch.
  if (mount.querySelector('[data-header-root]')) return mount;

  const res = await fetch('/components/header.html', { cache: 'no-cache' });
  const html = await res.text();
  // Mark root for fast existence check on subsequent calls
  mount.innerHTML = html.replace('<header', '<header data-header-root');

  return mount;
}

/* ------------------------------- Helpers --------------------------------- */
function show(el, yes) { if (el) el.classList.toggle('hidden', !yes); }
function toggle(el)    { if (el) el.classList.toggle('hidden'); }
function active(el)    { if (el) el.classList.add('active'); }
function clearActive(root) {
  $$('.nav-link', root).forEach(a => a.classList.remove('active'));
  $$('.mnav-link', root).forEach(a => a.classList.remove('active'));
}
function outside(el, target) { return !(el && (el === target || el.contains(target))); }
function firstNameFrom(profile, displayName, email) {
  const fromProfile = (profile?.firstName || profile?.name || '').trim();
  if (fromProfile) return fromProfile.split(/\s+/)[0];
  if (displayName) return String(displayName).split(/\s+/)[0];
  if (email) return String(email).split('@')[0];
  return 'Friend';
}

/* ------------------------------- Wiring ---------------------------------- */
function wireBasics(root) {
  // Rename “Community” → “Social”
  const navCommunity = $('#nav-community', root);
  if (navCommunity) navCommunity.textContent = 'Social';
  $$('.mnav-link', root).forEach(a => {
    if (a.getAttribute('href')?.includes('/Social/social.html')) a.textContent = 'Social';
  });
}

function setActiveNav(root) {
  clearActive(root);
  const p = PATH.toLowerCase();
  const map = [
    { test: /\/dashboard\//, id: '#nav-dashboard' },
    { test: /\/expenses\//,  id: '#nav-expenses'  },
    { test: /\/budgeting\//, id: '#nav-budgeting' },
    { test: /\/accounts\//,  id: '#nav-accounts'  },
    { test: /\/social\//,    id: '#nav-community' },
    { test: /\/pages\/blog\.html$/, id: '#nav-blog' },
  ];
  const hit = map.find(x => x.test.test(p));
  if (!hit) return;

  const el = $(hit.id, root);
  if (el) {
    active(el);
    const href = el.getAttribute('href');
    const m = $$('.mnav-link', root).find(a => a.getAttribute('href') === href);
    if (m) active(m);
  }
}

function insertWelcome(root, firstName) {
  const cluster = $('#user-menu', root)?.parentElement;
  if (!cluster) return;
  let welcome = $('#welcome-text', cluster);
  if (!welcome) {
    welcome = document.createElement('span');
    welcome.id = 'welcome-text';
    welcome.className = 'hidden md:inline text-sm text-neutral-300 mr-1';
    cluster.insertBefore(welcome, $('#user-menu', root));
  }
  welcome.textContent = `Welcome, ${firstName}`;
  welcome.classList.remove('hidden');
}

function applySignedOutUI(root) {
  const isIndex = PATH === '/' || PATH.endsWith('/index.html');

  // Show auth buttons
  show($('#auth-actions', root), true);
  show($('#m-auth-actions', root), true);

  // Hide user menu
  show($('#user-menu', root), false);
  show($('#m-user-actions', root), false);

  // Hide tabs + mobile button when signed out (per requirement)
  $$('.nav-link', root).forEach(a => show(a, false));
  show($('#btn-mobile', root), false);

  // On index: this matches “logo left, auth right”
  // (markup already has brand on left; nothing else to do)
}

function applySignedInUI(root, { firstName, photoURL }) {
  // Tabs visible
  $$('.nav-link', root).forEach(a => show(a, true));
  show($('#btn-mobile', root), true);

  // Right side: show user, hide sign-in
  show($('#auth-actions', root), false);
  show($('#m-auth-actions', root), false);
  show($('#user-menu', root), true);
  show($('#m-user-actions', root), true);

  insertWelcome(root, firstName);
  const avatar = $('#user-avatar', root);
  if (avatar) avatar.src = photoURL || '/images/logo_white.png';

  setActiveNav(root);
}

function wireAvatarMenu(root) {
  const btn = $('#user-menu-button', root);
  const pop = $('#user-pop', root);
  if (!btn || !pop) return;

  // Ensure dropdown items match spec
  pop.innerHTML = `
    <a href="/Social/user-profile.html" class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">My Profile</a>
    <a href="/Accounts/accounts.html" class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">Account Linkage</a>
    <a href="/pages/profile.html" class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">Settings</a>
  `;

  let open = false;
  const openMenu  = () => { pop.classList.remove('hidden'); btn.setAttribute('aria-expanded','true'); open = true; };
  const closeMenu = () => { pop.classList.add('hidden');    btn.setAttribute('aria-expanded','false'); open = false; };

  btn.addEventListener('click', (e) => { e.preventDefault(); open ? closeMenu() : openMenu(); });
  document.addEventListener('click', (e) => {
    if (!open) return;
    const t = e.target;
    if (outside(pop, t) && outside(btn, t)) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') closeMenu(); });
}

function wireMobileMenu(root) {
  const btn = $('#btn-mobile', root);
  const panel = $('#mobile-panel', root);
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => { e.preventDefault(); toggle(panel); });
  panel.addEventListener('click', (e) => {
    const t = e.target;
    if (t instanceof HTMLAnchorElement) panel.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.classList.add('hidden'); });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!panel.contains(t) && t !== btn && !btn.contains(t)) panel.classList.add('hidden');
  }, true);
}

function wireSignOut(root) {
  const go = async () => { try { await signOut(auth); location.href = '/index.html'; } catch (e) { console.error('signOut failed', e); } };
  $('#btn-signout', root)?.addEventListener('click', go);
  $('#m-btn-signout', root)?.addEventListener('click', go);
}

/* --------------------------------- Boot ---------------------------------- */
async function init() {
  const mount = await ensureHeaderMarkup();
  if (!mount) return; // Nothing to wire

  wireBasics(mount);
  setActiveNav(mount);
  wireAvatarMenu(mount);
  wireMobileMenu(mount);
  wireSignOut(mount);

  onAuthStateChanged(auth, async (user) => {
    if (!user) { applySignedOutUI(mount); return; }

    // Owner read is allowed by your rules
    let profile = {};
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      profile = snap.exists() ? (snap.data() || {}) : {};
    } catch {}

    const firstName = firstNameFrom(profile, user.displayName, user.email);
    const photoURL  = profile.photoURL || user.photoURL || '/images/logo_white.png';

    applySignedInUI(mount, { firstName, photoURL });
  });
}

document.addEventListener('DOMContentLoaded', init);
