// public/Social/user-profile.js
// ------------------------------------------------------------
// Vibance • User Profile page controller
// - Reads target user's public profile info (best-effort; falls back if rules restrict reads)
// - Follow / Unfollow updates ONLY the signed-in user's /users/{uid}.following
// - Lists the target user's posts with pagination
// - Uses the same post card template as the feed
//
// Firestore rules notes (from provided rules):
// - /users/{uid}: reads allowed only by owner; writes restricted fields incl. 'following' (OK for self)
// - /posts: read for authed; update allowed for description/likes/commentCount; delete for owner
// ------------------------------------------------------------

import { auth, db, storage } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp,
  arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref as sRef, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// ----------------------------- DOM -----------------------------
const els = {
  // header
  avatar: document.getElementById('profile-avatar'),
  name: document.getElementById('profile-name'),
  badge: document.getElementById('profile-badge'),
  bio: document.getElementById('profile-bio'),
  email: document.getElementById('profile-email'),
  username: document.getElementById('profile-username'),
  birthday: document.getElementById('profile-birthday'),
  memberSince: document.getElementById('profile-member-since'),
  followers: document.getElementById('profile-followers'),
  following: document.getElementById('profile-following'),
  btnFollow: document.getElementById('btn-follow'),
  btnUnfollow: document.getElementById('btn-unfollow'),
  btnEdit: document.getElementById('btn-edit-profile'),

  // posts
  postsList: document.getElementById('posts-list'),
  postsEmpty: document.getElementById('posts-empty'),
  postsMore: document.getElementById('posts-load-more'),

  // misc
  toast: document.getElementById('toast'),
  postTpl: document.getElementById('post-card-template'),
};

// ----------------------------- State -----------------------------
let YOU = null;                 // auth user
let YOUR_PROFILE = null;        // your /users/{uid} doc (for following)
let FOLLOWING = [];             // array<string> (you follow)
let TARGET_UID = null;          // whose profile we are viewing
let TARGET_PROFILE = null;      // their /users/{uid} (may be unavailable per rules)
let PAGE_SIZE = 10;
let lastCursor = null;          // pagination cursor
let loadingPosts = false;

// ----------------------------- Utils -----------------------------
function qparam(name) { return new URL(location.href).searchParams.get(name); }
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 1500);
}
function fmtTime(tsOrDate) {
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : (tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate || 0));
  if (Number.isNaN(d.getTime())) return 'Just now';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
}
function safeText(el, v) { if (el) el.textContent = v ?? ''; }
function show(el, yes = true) { if (!el) return; el.classList.toggle('hidden', !yes); }
function enable(el, yes = true) { if (!el) return; el.disabled = !yes; el.classList.toggle('opacity-50', !yes); }

// ----------------------------- Profile Reads -----------------------------
async function tryLoadUserProfile(uid) {
  // Rules may block reads to other users; swallow and return {}
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch {
    return {};
  }
}

async function loadYourProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch {
    return {};
  }
}

function fmtMemberSince(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function fmtBirthday(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

function applyHeaderFromProfile(profile, fallback) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  const display = fullName || profile.name || profile.displayName || fallback?.name || 'Member';
  const photo = profile.photoURL || fallback?.photoURL || '/images/logo_white.png';
  const bio = profile.bio || '';
  const email = profile.email || '';
  const username = profile.username ? `@${profile.username}` : '';
  const birthday = fmtBirthday(profile.birthday || '');
  const memberSince = fmtMemberSince(profile.createdAt || null);

  if (els.avatar) els.avatar.src = photo;
  safeText(els.name, display);
  safeText(els.bio, bio);
  safeText(els.email, email);
  safeText(els.username, username);
  safeText(els.birthday, birthday);
  safeText(els.memberSince, memberSince);

  const followersCount = (Array.isArray(profile.followers) ? profile.followers.length : (profile.followersCount|0)) || 0;
  const followingCount = (Array.isArray(profile.following) ? profile.following.length : (profile.followingCount|0)) || 0;
  safeText(els.followers, followersCount);
  safeText(els.following, followingCount);
}

// If profile reads are blocked, we can infer basic header from their latest post
async function fallbackHeaderFromPosts(uid) {
  try {
    const q1 = query(
      collection(db, 'posts'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q1);
    const d = snap.docs[0]?.data();
    if (!d) return null;
    return {
      name: d.displayName || 'Member',
      photoURL: d.photoURL || '/images/logo_white.png',
    };
  } catch { return null; }
}

function setFollowButtons() {
  if (!YOU || YOU.uid === TARGET_UID) {
    show(els.btnEdit, !!YOU && YOU.uid === TARGET_UID);
    show(els.btnFollow, false);
    show(els.btnUnfollow, false);
    return;
  }
  const already = FOLLOWING.includes(TARGET_UID);
  show(els.btnEdit, false);
  show(els.btnFollow, !already);
  show(els.btnUnfollow, already);
}

async function followTarget() {
  if (!YOU) return;
  enable(els.btnFollow, false);
  try {
    const youRef = doc(db, 'users', YOU.uid);
    const next = Array.from(new Set([...(YOUR_PROFILE?.following || []), TARGET_UID]));
    await setDoc(youRef, { following: next, updatedAt: serverTimestamp() }, { merge: true });
    FOLLOWING = next;
    YOUR_PROFILE.following = next;
    setFollowButtons();
    toast('Following');
  } catch (e) {
    console.error(e); toast('Could not follow');
  } finally {
    enable(els.btnFollow, true);
  }
}

async function unfollowTarget() {
  if (!YOU) return;
  enable(els.btnUnfollow, false);
  try {
    const youRef = doc(db, 'users', YOU.uid);
    const next = (YOUR_PROFILE?.following || []).filter(x => x !== TARGET_UID);
    await setDoc(youRef, { following: next, updatedAt: serverTimestamp() }, { merge: true });
    FOLLOWING = next;
    YOUR_PROFILE.following = next;
    setFollowButtons();
    toast('Unfollowed');
  } catch (e) {
    console.error(e); toast('Could not unfollow');
  } finally {
    enable(els.btnUnfollow, true);
  }
}

// ----------------------------- Posts -----------------------------
function clearPosts() {
  if (els.postsList) els.postsList.innerHTML = '';
  show(els.postsEmpty, false);
  show(els.postsMore, false);
  lastCursor = null;
}

function toModel(id, d) {
  return {
    id,
    userId: d.userId,
    displayName: d.displayName || 'Member',
    photoURL: d.photoURL || '/images/logo_white.png',
    description: d.description || '',
    createdAt: d.createdAt || null,
    visibility: d.visibility || 'public',
    tags: Array.isArray(d.tags) ? d.tags : [],
    imageURL: d.imageURL || null,
    imagePath: d.imagePath || null,
    likes: Array.isArray(d.likes) ? d.likes : [],
    commentCount: Number(d.commentCount || 0),
  };
}

function renderPostCard(p) {
  const frag = els.postTpl.content.cloneNode(true);
  const root = frag.querySelector('article');

  // Header
  const avatar = frag.querySelector('.post-avatar');
  const author = frag.querySelector('.post-author');
  const meta = frag.querySelector('.post-meta');
  const badge = frag.querySelector('.post-badge');
  const menuBtn = frag.querySelector('.post-menu');
  const menu = frag.querySelector('.post-menu-popover');
  const editBtn = frag.querySelector('.post-edit');
  const delBtn = frag.querySelector('.post-delete');

  avatar.src = p.photoURL || '/images/logo_white.png';
  author.textContent = p.displayName || 'Member';
  author.href = `./user-profile.html?uid=${encodeURIComponent(p.userId)}`;
  meta.textContent = `${fmtTime(p.createdAt)} • ${p.visibility === 'followers' ? 'Followers' : 'Public'}`;
  if (p.tags?.length) {
    badge.textContent = p.tags[0];
    badge.classList.remove('hidden');
  }

  // Body
  frag.querySelector('.post-body').textContent = p.description || '';

  // Image
  const imgWrap = frag.querySelector('.post-image-wrap');
  const img = frag.querySelector('.post-image');
  if (p.imageURL) { imgWrap.classList.remove('hidden'); img.src = p.imageURL; }

  // Footer
  const likeBtn = frag.querySelector('.post-like');
  const likeCountEl = frag.querySelector('.post-like-count');
  const commentBtn = frag.querySelector('.post-comment');
  const commentCountEl = frag.querySelector('.post-comment-count');
  const permalink = frag.querySelector('.post-permalink');

  likeCountEl.textContent = String(p.likes?.length || 0);
  commentCountEl.textContent = String(p.commentCount || 0);
  permalink.href = `./post.html?id=${encodeURIComponent(p.id)}`;

  const youLiked = !!p.likes?.includes(YOU?.uid);
  if (youLiked) likeBtn.classList.add('border-[var(--neon)]');

  likeBtn.addEventListener('click', async () => {
    if (!YOU) return;
    const postRef = doc(db, 'posts', p.id);
    const next = !likeBtn.classList.contains('border-[var(--neon)]');
    // optimistic
    likeBtn.classList.toggle('border-[var(--neon)]', next);
    likeCountEl.textContent = String(Math.max(0, Number(likeCountEl.textContent || '0') + (next ? 1 : -1)));
    try {
      await updateDoc(postRef, { likes: next ? arrayUnion(YOU.uid) : arrayRemove(YOU.uid) });
    } catch (e) {
      // revert
      likeBtn.classList.toggle('border-[var(--neon)]', !next);
      likeCountEl.textContent = String(Math.max(0, Number(likeCountEl.textContent || '0') + (next ? -1 : 1)));
      console.error(e); toast('Action failed');
    }
  });

  // Comments (collapsed by default on profile list)
  const commentsSection = frag.querySelector('.post-comments');
  commentBtn.addEventListener('click', () => {
    commentsSection.classList.toggle('hidden', false);
    commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Owner-only actions
  if (YOU?.uid !== p.userId) {
    editBtn.classList.add('hidden');
    delBtn.classList.add('hidden');
  } else {
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const open = !menu.classList.contains('hidden');
      document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
      if (!open) menu.classList.remove('hidden');
      const close = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== menuBtn) {
          menu.classList.add('hidden'); document.removeEventListener('click', close, true);
        }
      };
      document.addEventListener('click', close, true);
    });

    editBtn.addEventListener('click', async () => {
      const next = prompt('Edit your post:', p.description || '');
      if (next == null) return;
      try { await updateDoc(doc(db, 'posts', p.id), { description: next }); }
      catch (e) { console.error(e); toast('Update failed'); }
      finally { menu.classList.add('hidden'); }
      // update UI
      const body = root.querySelector('.post-body'); if (body) body.textContent = next;
      toast('Updated');
    });

    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        if (p.imagePath) { try { await deleteObject(sRef(storage, p.imagePath)); } catch {} }
        await deleteDoc(doc(db, 'posts', p.id));
        root.remove();
        toast('Deleted');
        if (!els.postsList.children.length) show(els.postsEmpty, true);
      } catch (e) { console.error(e); toast('Delete failed'); }
      finally { menu.classList.add('hidden'); }
    });
  }

  return root;
}

async function loadNextPostsPage() {
  if (loadingPosts || !TARGET_UID) return;
  loadingPosts = true;
  show(els.postsMore, false);

  try {
    let qBase = query(
      collection(db, 'posts'),
      where('userId', '==', TARGET_UID),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    if (lastCursor) {
      qBase = query(
        collection(db, 'posts'),
        where('userId', '==', TARGET_UID),
        orderBy('createdAt', 'desc'),
        startAfter(lastCursor),
        limit(PAGE_SIZE)
      );
    }

    const snap = await getDocs(qBase);
    const docs = snap.docs;
    lastCursor = docs[docs.length - 1] || null;

    if (!docs.length && !els.postsList.children.length) {
      show(els.postsEmpty, true);
      return;
    }

    const nodes = docs.map(d => renderPostCard(toModel(d.id, d.data() || {})));
    nodes.forEach(n => els.postsList.appendChild(n));
    show(els.postsEmpty, els.postsList.children.length === 0);
    show(els.postsMore, !!(lastCursor && docs.length >= PAGE_SIZE));
  } catch (e) {
    console.error('load posts failed', e);
    toast('Failed to load posts');
  } finally {
    loadingPosts = false;
  }
}

// ----------------------------- Wire -----------------------------
function wireActions() {
  els.btnFollow?.addEventListener('click', followTarget);
  els.btnUnfollow?.addEventListener('click', unfollowTarget);
  els.postsMore?.addEventListener('click', () => loadNextPostsPage().catch(console.error));
}

// ----------------------------- Boot -----------------------------
async function boot() {
  wireActions();
  TARGET_UID = qparam('uid');

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check likely redirects if not authed
    YOU = user;

    // Load your profile to get 'following'
    YOUR_PROFILE = await loadYourProfile(YOU.uid);
    FOLLOWING = Array.isArray(YOUR_PROFILE?.following) ? YOUR_PROFILE.following : [];

    // Load target profile (may be blocked by rules)
    let fallback = null;
    TARGET_PROFILE = TARGET_UID ? await tryLoadUserProfile(TARGET_UID) : (await tryLoadUserProfile(YOU.uid));
    if ((!TARGET_PROFILE || Object.keys(TARGET_PROFILE).length === 0) && TARGET_UID) {
      // fall back to latest post for avatar/name
      fallback = await fallbackHeaderFromPosts(TARGET_UID);
    }

    applyHeaderFromProfile(TARGET_PROFILE || {}, fallback || {});
    setFollowButtons();

    // Load posts
    clearPosts();
    await loadNextPostsPage();
  });
}

document.addEventListener('DOMContentLoaded', boot);
