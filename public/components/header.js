// public/components/header.js
// Vibance Header Controller — injects header.html, wires auth state, avatar/name, dropdown, admin link, and mobile menu.

import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Bump this to force refetch of header assets when structure changes
const HEADER_VERSION = 'v24';
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
  console.log('[header] setActiveNav called with path:', path);
  const pairs = [
    [/\/dashboard\//, '#nav-dashboard'],
    [/\/expenses\//,  '#nav-expenses'],
    [/\/income\//,    '#nav-income'],
    [/\/budgeting\//, '#nav-budgeting'],
    [/\/social\//,    '#nav-community'],
    [/\/literacy\//,  '#nav-literacy'],
  ];
  const clear = sel => $$(sel, root).forEach(a => a.classList.remove('active'));
  clear('.nav-link');
  clear('.mnav-link');
  let matched = false;
  for (const [re, id] of pairs) {
    if (re.test(path)) {
      console.log('[header] Matched regex:', re, 'for element:', id);
      const el = $(id, root);
      if (el) {
        el.classList.add('active');
        console.log('[header] Added active class to:', el);
        const text = el.textContent?.trim();
        if (text) $$('.mnav-link', root).find(a => a.textContent.trim() === text)?.classList.add('active');
        matched = true;
      } else {
        console.log('[header] Element not found:', id);
      }
      break;
    }
  }
  if (!matched) {
    console.log('[header] No regex match, trying fallback');
    // Fallback: highlight by href segment containing last path part
    const seg = path.split('/').filter(Boolean).pop();
    if (seg) {
      const anchor = Array.from($$('#desktop-nav a', root)).find(a => a.getAttribute('href')?.toLowerCase().includes(`/${seg}`));
      if (anchor) {
        console.log('[header] Fallback matched anchor:', anchor);
        anchor.classList.add('active');
      } else {
        console.log('[header] No fallback match for segment:', seg);
      }
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
function isMarketingPath() {
  const p = location.pathname.toLowerCase();
  return [
    '/', '/index.html', '/about', '/pages/about.html', '/pages/blog', '/pages/blog.html',
    '/pages/careers.html', '/pages/press.html', '/pages/terms.html', '/pages/privacy.html', '/pages/disclosures.html',
    '/pages/feature-budgeting.html', '/pages/feature-expenses.html', '/pages/feature-goals.html'
  ].some(x => p === x || p.startsWith(x.replace(/\.html$/,'')));
}

async function ensureHeaderMarkup({ variant }) {
  // Remove any existing header(s) to prevent duplication stacking
  $('#app-header')?.remove();
  $('#public-header')?.remove();
  const file = variant === 'public' ? 'header-public.html' : 'header.html';
  const url = new URL(`./${file}`, import.meta.url);
  url.searchParams.set('v', HEADER_VERSION);
  const res = await fetch(url.toString());
  const html = await res.text();
  const frag = document.createElement('div');
  frag.innerHTML = html.trim();
  const node = frag.firstElementChild;
  document.body.prepend(node);
  const headerEl = variant === 'public' ? $('#public-header') : $('#app-header');
  const headerHeight = clamp(headerEl?.offsetHeight || 64, 56, 96);
  document.body.style.paddingTop = `${headerHeight}px`;
  document.documentElement.style.setProperty('--vb-header-offset', `${headerHeight}px`);
  return document.body;
}

// Theme support removed – site now uses single default dark style

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
// Admin link visibility logic removed: Admin links are no longer present in header

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
  // Decide initial variant before auth (marketing pages use public by default)
  let variant = 'app';
  if (isMarketingPath()) variant = 'public';

  await ensureHeaderMarkup({ variant });
  const root = document;

  // Brand link: public variant -> index landing, app variant -> dashboard
  function wireBrand() {
    const brand = $('#brand-link', root) || $('a[aria-label="Vibance Home"]', root);
    if (!brand) return;
    if (variant === 'public') {
      brand.setAttribute('href', '/index.html');
      brand.onclick = (e) => { e.preventDefault(); location.href = '/index.html'; };
    } else {
      brand.setAttribute('href', '/dashboard/dashboard.html');
      brand.onclick = (e) => { e.preventDefault(); location.href = '/dashboard/dashboard.html'; };
    }
  }
  wireBrand();

  // 3) Static nav highlighting (works even before auth)
  if (variant === 'app') setActiveNav(root);

  // Theme toggle removed: no initialization required

  // 4) Firebase
  const { auth, db } = await loadFirebase();

  // If Firebase not available just keep current variant (likely public)
  if (!auth || !db) {
    if (variant === 'app') showSignedOut(root); // fallback
    return;
  }

  // 5) Wire menus (they’ll be revealed on sign-in)
  wireAvatarMenu(root, auth);
  wireMobileMenu(root, auth);

  // 6) React to auth state
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // If on marketing path but public header not loaded yet, swap
      if (variant !== 'public' && isMarketingPath()) {
        variant = 'public';
        await ensureHeaderMarkup({ variant:'public' });
        wireBrand();
      }
      showSignedOut(root);
      return;
    }
    // Logged in: ensure app header
    if (variant !== 'app') {
      variant = 'app';
      await ensureHeaderMarkup({ variant:'app' });
      wireBrand();
      setActiveNav(root);
      wireAvatarMenu(root, auth);
      wireMobileMenu(root, auth);
    }

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
      setActiveNav(root);
  });
})();
