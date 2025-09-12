// public/components/header.js
// ------------------------------------------------------------------
// Self-healing header loader + hydrator
// - Creates #site-header if missing
// - Fetches /components/header.html; on failure, uses embedded fallback
// - Signed-out on index: logo + Log in / Sign up only
// - Signed-in: tabs (Dashboard, Expenses, Budgeting, Social) + "Welcome, {FirstName}" + avatar menu
// ------------------------------------------------------------------

import { auth, db } from '/api/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PATH = location.pathname || '/index.html';
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------------------- Embedded fallback ---------------------------- */
const FALLBACK_HTML = `
<header data-header-root class="fixed inset-x-0 top-0 z-50 border-b border-neutral-900/70 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/50">
  <div class="mx-auto max-w-7xl px-4">
    <div class="h-16 flex items-center justify-between gap-3">
      <a href="/index.html" class="flex items-center gap-3 shrink-0">
        <img src="/images/logo_white.png" alt="Vibance" class="h-6 w-6 rounded"/>
        <span class="text-white font-semibold tracking-tight">Vibance</span>
      </a>
      <nav class="hidden md:flex items-center gap-1 text-sm">
        <a id="nav-dashboard" href="/dashboard/dashboard.html" class="nav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Dashboard</a>
        <a id="nav-expenses"  href="/Expenses/expenses.html"  class="nav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Expenses</a>
        <a id="nav-budgeting" href="/Budgeting/budgeting.html" class="nav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Budgeting</a>
        <a id="nav-community" href="/Social/social.html"     class="nav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Social</a>
      </nav>
      <div class="flex items-center gap-2">
        <div id="auth-actions" class="hidden md:flex items-center gap-2">
          <a href="/login.html"  class="px-3 py-2 rounded-lg border border-neutral-800 text-sm text-white hover:bg-neutral-900">Log in</a>
          <a href="/signup.html" class="px-3 py-2 rounded-lg text-sm font-medium text-black" style="background:#CCFF00">Sign up</a>
        </div>
        <div id="user-menu" class="hidden relative">
          <button id="user-menu-button" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-900" aria-haspopup="menu" aria-expanded="false">
            <img id="user-avatar" class="h-8 w-8 rounded-full object-cover bg-neutral-900 border border-neutral-800" src="/images/logo_white.png" alt="Your avatar"/>
            <svg class="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          <div id="user-pop" class="absolute right-0 mt-2 w-44 rounded-xl border border-neutral-800 bg-neutral-950 shadow-lg p-1 hidden"></div>
        </div>
        <button id="btn-mobile" class="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-neutral-900" aria-label="Open menu">
          <svg class="h-5 w-5 text-neutral-300" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </div>
  </div>
  <div id="mobile-panel" class="md:hidden hidden border-t border-neutral-900/70 bg-black/85 backdrop-blur">
    <nav class="px-4 py-3 flex flex-col gap-1 text-sm">
      <a href="/dashboard/dashboard.html" class="mnav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Dashboard</a>
      <a href="/Expenses/expenses.html"  class="mnav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Expenses</a>
      <a href="/Budgeting/budgeting.html" class="mnav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Budgeting</a>
      <a href="/Social/social.html"       class="mnav-link px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-900">Social</a>
      <div id="m-auth-actions" class="mt-2 hidden">
        <a href="/login.html"  class="block px-3 py-2 rounded-lg border border-neutral-800 text-white hover:bg-neutral-900">Log in</a>
        <a href="/signup.html" class="block mt-2 px-3 py-2 rounded-lg font-medium text-black text-center" style="background:#CCFF00">Sign up</a>
      </div>
      <div id="m-user-actions" class="mt-2 hidden">
        <a href="/Social/user-profile.html" class="block px-3 py-2 rounded-lg hover:bg-neutral-900">Your profile</a>
        <a href="/dashboard/dashboard.html" class="block px-3 py-2 rounded-lg hover:bg-neutral-900">Dashboard</a>
        <button id="m-btn-signout" class="w-full text-left mt-1 px-3 py-2 rounded-lg text-red-300 hover:bg-neutral-900">Sign out</button>
      </div>
    </nav>
  </div>
</header>
<style>
  .nav-link.active, .mnav-link.active { background:#0a0a0a; color:#fff; border:1px solid #222226; }
</style>
`;

/* --------------------------- Ensure mount + markup --------------------------- */
async function ensureHeaderMarkup() {
  let mount = $('#site-header');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'site-header';
    document.body.prepend(mount);
  }

  // If markup already present, keep it
  if (mount.querySelector('[data-header-root]')) return mount;

  // Try to fetch the component; fall back if it fails
  try {
    const res = await fetch('/components/header.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const html = await res.text();
    mount.innerHTML = html.includes('data-header-root')
      ? html
      : html.replace('<header', '<header data-header-root');
  } catch (e) {
    console.warn('[header] using fallback header (fetch failed)', e);
    mount.innerHTML = FALLBACK_HTML;
  }
  return mount;
}

/* --------------------------------- Helpers -------------------------------- */
function show(el, yes) { if (el) el.classList.toggle('hidden', !yes); }
function toggle(el)    { if (el) el.classList.toggle('hidden'); }
function active(el)    { if (el) el.classList.add('active'); }
function clearActive(root) {
  $$('.nav-link', root).forEach(a => a.classList.remove('active'));
  $$('.mnav-link', root).forEach(a => a.classList.remove('active'));
}
function outside(el, target) { return !(el && (el === target || el.contains(target))); }
function firstNameFrom(profile, displayName, email) {
  const v = (profile?.firstName || profile?.name || displayName || '').trim();
  if (v) return v.split(/\s+/)[0];
  if (email) return String(email).split('@')[0];
  return 'Friend';
}

/* ------------------------------- Wiring UI -------------------------------- */
function wireBasics(root) {
  // Ensure label reads "Social"
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

  show($('#auth-actions', root), true);
  show($('#m-auth-actions', root), true);
  show($('#user-menu', root), false);
  show($('#m-user-actions', root), false);

  // Hide tabs + mobile in signed-out state
  $$('.nav-link', root).forEach(a => show(a, false));
  show($('#btn-mobile', root), false);

  // Index page layout naturally shows just brand + auth buttons
  if (!isIndex) {
    // Non-index pages while signed out still hide tabs per requirement.
  }
}

function applySignedInUI(root, { firstName, photoURL }) {
  $$('.nav-link', root).forEach(a => show(a, true));
  show($('#btn-mobile', root), true);

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

  // Your menu items
  pop.innerHTML = `
    <a href="/Social/user-profile.html" class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">My Profile</a>
    <a href="/Accounts/accounts.html"  class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">Account Linkage</a>
    <a href="/pages/profile.html"      class="block px-3 py-2 rounded-lg text-sm hover:bg-neutral-900">Settings</a>
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
  $('#m-btn-signout', root)?.addEventListener('click', go);
  // Note: desktop sign-out button is not in your new spec; keep mobile only for now
}

/* ---------------------------------- Boot ---------------------------------- */
async function init() {
  const mount = await ensureHeaderMarkup();
  if (!mount) return;

  wireBasics(mount);
  setActiveNav(mount);
  wireAvatarMenu(mount);
  wireMobileMenu(mount);
  wireSignOut(mount);

  onAuthStateChanged(auth, async (user) => {
    if (!user) { applySignedOutUI(mount); return; }

    // Owner read allowed by rules
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
