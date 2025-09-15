// public/Social/follow-list.js
// ------------------------------------------------------------
// Vibance • Follow People directory
// - Loads users with pagination
// - Client-side search & sort (recommended / recent / popular)
// - Follow / Unfollow writes only to the current user's document
//   (allowed by your rules: updates to 'following' + 'updatedAt').
// ------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, orderBy, limit, startAfter, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ----------------------------- DOM -----------------------------
const els = {
  grid: document.getElementById('user-grid'),
  empty: document.getElementById('user-empty'),
  count: document.getElementById('result-count'),
  search: document.getElementById('user-search'),
  clear: document.getElementById('clear-search'),
  sort: document.getElementById('sort-select'),
  loadMore: document.getElementById('load-more-users'),
  toast: document.getElementById('toast'),
  cardTpl: document.getElementById('user-card-template'),
};

// ----------------------------- State -----------------------------
let YOU = null;                 // firebase auth user
let YOUR_PROFILE = null;        // /users/{uid}
let FOLLOWING = [];             // array<string> userIds you follow
let PAGE_SIZE = 18;
let lastCursor = null;          // Firestore cursor for raw fetch
let RAW_BATCH = [];             // last raw page (before client filters)
let ALL_RESULTS = [];           // accumulated (after filters) for display count
let IS_LOADING = false;

// ----------------------------- Utils -----------------------------
function toast(msg) {
  if (!els.toast) return console.log('[toast]', msg);
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 1500);
}

function normalize(s) { return (s ?? '').toString().toLowerCase().trim(); }
function matchesQuery(user, q) {
  if (!q) return true;
  const hay = [
    user.displayName, user.firstName, user.lastName, user.name,
    user.bio, user.email
  ].map(normalize).join(' ');
  return hay.includes(q);
}

function followersCount(u) {
  return Array.isArray(u.followers) ? u.followers.length : (typeof u.followersCount === 'number' ? u.followersCount : 0);
}

function sortUsers(arr, mode) {
  if (mode === 'recent') {
    return arr.slice().sort((a, b) => {
      const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    });
  }
  if (mode === 'popular') {
    return arr.slice().sort((a, b) => followersCount(b) - followersCount(a));
  }
  // recommended: not-followed first, then by activity
  return arr.slice().sort((a, b) => {
    const aF = FOLLOWING.includes(a.id) ? 1 : 0;
    const bF = FOLLOWING.includes(b.id) ? 1 : 0;
    if (aF !== bF) return aF - bF; // not-followed (0) before followed (1)
    const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
    const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
    return tb - ta;
  });
}

function setLoadMoreVisible(yes) {
  if (els.loadMore) els.loadMore.classList.toggle('hidden', !yes);
}

function setEmptyVisible(yes) {
  if (els.empty) els.empty.classList.toggle('hidden', !yes);
}

function updateResultCount(n) {
  if (els.count) els.count.textContent = `${n} result${n === 1 ? '' : 's'}`;
}

function isYou(uid) { return YOU?.uid === uid; }
function isFollowing(uid) { return FOLLOWING.includes(uid); }

// ----------------------------- Firestore helpers -----------------------------
async function loadYourProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch { return {}; }
}

async function follow(uid) {
  // Update ONLY your own /users/{YOU.uid} document per rules
  try {
    const youRef = doc(db, 'users', YOU.uid);
    const next = Array.from(new Set([...FOLLOWING, uid]));
    await setDoc(youRef, { following: next, updatedAt: serverTimestamp() }, { merge: true });
    FOLLOWING = next;
    return true;
  } catch (e) { console.error('follow failed', e); return false; }
}

async function unfollow(uid) {
  try {
    const youRef = doc(db, 'users', YOU.uid);
    const next = FOLLOWING.filter(x => x !== uid);
    await setDoc(youRef, { following: next, updatedAt: serverTimestamp() }, { merge: true });
    FOLLOWING = next;
    return true;
  } catch (e) { console.error('unfollow failed', e); return false; }
}

// ----------------------------- Rendering -----------------------------
function renderUserCard(user) {
  const frag = els.cardTpl.content.cloneNode(true);
  const root = frag.querySelector('article');

  const avatar = root.querySelector('.user-avatar');
  const nameEl = root.querySelector('.user-name');
  const subEl = root.querySelector('.user-sub');
  const bioEl = root.querySelector('.user-bio');
  const btnFollow = root.querySelector('.user-follow');
  const btnUnfollow = root.querySelector('.user-unfollow');
  const profileLinks = root.querySelectorAll('.user-profile-link, .user-name');

  const display = user.displayName || user.firstName || user.name || 'Member';
  const subtitle = user.email || (followersCount(user) ? `${followersCount(user)} follower${followersCount(user) === 1 ? '' : 's'}` : 'Active member');

  avatar.src = user.photoURL || '/images/logo_white.png';
  nameEl.textContent = display;
  subEl.textContent = subtitle;
  bioEl.textContent = user.bio || '';

  profileLinks.forEach(a => a.setAttribute('href', `./user-profile.html?uid=${encodeURIComponent(user.id)}`));

  const canFollow = !isYou(user.id);
  const already = isFollowing(user.id);

  if (!canFollow) {
    btnFollow.classList.add('hidden');
    btnUnfollow.classList.add('hidden');
  } else {
    btnFollow.classList.toggle('hidden', already);
    btnUnfollow.classList.toggle('hidden', !already);

    btnFollow.addEventListener('click', async () => {
      btnFollow.disabled = true;
      const ok = await follow(user.id);
      btnFollow.disabled = false;
      if (ok) {
        btnFollow.classList.add('hidden');
        btnUnfollow.classList.remove('hidden');
        toast(`Following ${display}`);
      } else {
        toast('Could not follow');
      }
    });

    btnUnfollow.addEventListener('click', async () => {
      btnUnfollow.disabled = true;
      const ok = await unfollow(user.id);
      btnUnfollow.disabled = false;
      if (ok) {
        btnUnfollow.classList.add('hidden');
        btnFollow.classList.remove('hidden');
        toast(`Unfollowed ${display}`);
      } else {
        toast('Could not unfollow');
      }
    });
  }

  return root;
}

function appendUsersToGrid(users) {
  const list = users.map(renderUserCard);
  list.forEach(n => els.grid.appendChild(n));
}

// ----------------------------- Fetch / Filter / Paginate -----------------------------
function clearGrid() {
  els.grid.innerHTML = '';
  ALL_RESULTS = [];
  updateResultCount(0);
  setEmptyVisible(false);
}

async function fetchNextRawPage() {
  // Primary order: updatedAt desc; fallback to name if missing
  let qBase;
  if (!lastCursor) {
    qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE));
  } else {
    qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), startAfter(lastCursor), limit(PAGE_SIZE));
  }
  const snap = await getDocs(qBase);
  lastCursor = snap.docs[snap.docs.length - 1] || null;
  RAW_BATCH = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { raw: RAW_BATCH, hasMore: !!(lastCursor && snap.size >= PAGE_SIZE) };
}

function applyClientFilters(raw) {
  const q = normalize(els.search?.value || '');
  const mode = els.sort?.value || 'recommended';

  // Remove "you" and dedupe/nulls
  const base = raw
    .filter(u => u && typeof u.id === 'string')
    .filter(u => !isYou(u.id));

  const filtered = base.filter(u => matchesQuery(u, q));
  const sorted = sortUsers(filtered, mode);
  return sorted;
}

async function loadNext() {
  if (IS_LOADING) return;
  IS_LOADING = true;
  setLoadMoreVisible(false);

  try {
    const { raw, hasMore } = await fetchNextRawPage();
    const view = applyClientFilters(raw);

    if (!view.length && hasMore) {
      // If this page got filtered out, try fetching next page once
      const more = await fetchNextRawPage();
      const extraView = applyClientFilters(more.raw);
      appendUsersToGrid(extraView);
      ALL_RESULTS = ALL_RESULTS.concat(extraView);
      updateResultCount(ALL_RESULTS.length);
      setEmptyVisible(ALL_RESULTS.length === 0);
      setLoadMoreVisible(more.hasMore);
    } else {
      appendUsersToGrid(view);
      ALL_RESULTS = ALL_RESULTS.concat(view);
      updateResultCount(ALL_RESULTS.length);
      setEmptyVisible(ALL_RESULTS.length === 0);
      setLoadMoreVisible(hasMore);
    }
  } catch (e) {
    console.error('loadNext failed', e);
    toast('Failed to load people');
  } finally {
    IS_LOADING = false;
  }
}

function rerunFromScratch() {
  lastCursor = null;
  RAW_BATCH = [];
  clearGrid();
  // Load first page using current filters/search
  loadNext().catch(console.error);
}

// ----------------------------- Wiring -----------------------------
function wireUI() {
  els.loadMore?.addEventListener('click', () => loadNext().catch(console.error));

  els.search?.addEventListener('input', debounce(() => {
    rerunFromScratch();
  }, 200));

  els.clear?.addEventListener('click', () => {
    if (els.search) els.search.value = '';
    if (els.sort) els.sort.value = 'recommended';
    rerunFromScratch();
  });

  els.sort?.addEventListener('change', () => {
    // Resort current grid without refetch where possible
    const q = normalize(els.search?.value || '');
    const mode = els.sort?.value || 'recommended';
    const reSorted = sortUsers(ALL_RESULTS.filter(u => matchesQuery(u, q)), mode);

    els.grid.innerHTML = '';
    appendUsersToGrid(reSorted);
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ----------------------------- Boot -----------------------------
async function boot() {
  wireUI();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check likely handles redirect
    YOU = user;
    // Load your profile to read FOLLOWING (client reads allowed by rules)
    YOUR_PROFILE = await loadYourProfile(user.uid);
    FOLLOWING = Array.isArray(YOUR_PROFILE?.following) ? YOUR_PROFILE.following : [];

    // Initial load
    rerunFromScratch();
  });
}

document.addEventListener('DOMContentLoaded', boot);
