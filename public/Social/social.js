// public/Social/social.js
// ------------------------------------------------------------
// Vibance Community (Social) Controller
// - Compose posts with optional image upload
// - Feed with pagination, filters, likes, comments, delete
// - Suggested users (based on /users and your 'following' list)
// - Works with rules that allow:
//     * posts: create(owner), read(authed), update({description}|{likes}|{commentCount}), delete(owner)
//     * posts/{postId}/comments: CRUD for owner; reads for authed
//
// Firestore structure (client):
//   posts/{postId} -> {
//     userId, displayName, photoURL, description, createdAt: serverTimestamp(),
//     visibility: 'public'|'followers', tags: array<string>,
//     imageURL?, imagePath? (storage path), likes: array<string>, commentCount: number
//   }
//   posts/{postId}/comments/{commentId} -> { userId, displayName, photoURL, text, createdAt }
//
// Storage path (client):
//   /posts/{userId}/{fileName}
//
// Requirements:
//   - ../api/firebase.js exports { auth, db, storage }
//   - header.js already injected
//   - HTML IDs/classes provided by social.html
// ------------------------------------------------------------

import { auth, db, storage } from '../api/firebase.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy, limit, startAfter, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref as sRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// ----------------------------- DOM -----------------------------
const els = {
  // Composer
  avatar: document.getElementById('composer-avatar'),
  text: document.getElementById('post-text'),
  imageInput: document.getElementById('post-image'),
  imageName: document.getElementById('post-image-name'),
  imageDropzone: document.getElementById('image-dropzone'),
  imagePreview: document.getElementById('image-preview'),
  removeImage: document.getElementById('remove-image'),
  submit: document.getElementById('post-submit'),
  shareFollowersOnly: document.getElementById('post-private'),
  charCount: document.getElementById('char-count'),

  // Filters + suggestions
  filterButtons: document.querySelectorAll('[data-filter]'),
  clearFilters: document.getElementById('clear-filters'),
  suggestedWrap: document.getElementById('suggested-users'),

  // Feed
  list: document.getElementById('post-list'),
  empty: document.getElementById('feed-empty'),
  loadMore: document.getElementById('load-more'),

  // Templates
  postTemplate: document.getElementById('post-card-template'),
  suggestionTemplate: document.getElementById('suggested-user-template'),

  // Toast
  toast: document.getElementById('toast'),
};

// ----------------------------- State -----------------------------
let CURRENT_USER = null;
let CURRENT_PROFILE = null; // from /users/{uid}
let FOLLOWING = [];         // array of userIds
let ACTIVE_FILTER = 'all';  // 'all' | 'following' | 'wins' | 'advice' | 'questions'
let PAGE_SIZE = 12;
let lastCursor = null;      // Firestore cursor for pagination
let isLoading = false;

// ----------------------------- Utils -----------------------------
function toast(msg) {
  if (!els.toast) return console.log('[toast]', msg);
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0', 'pointer-events-none');
    els.toast.classList.remove('opacity-100');
  }, 1600);
}

function titleCase(s) {
  return (s || '').replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
}
function firstNameFromProfile(u, p = {}) {
  const fromProfile = p?.firstName || p?.givenName;
  if (fromProfile) return String(fromProfile);
  const dn = u?.displayName;
  if (dn) return dn.split(/\s+/)[0];
  const email = u?.email || '';
  if (email.includes('@')) return titleCase(email.split('@')[0].replace(/[._-]+/g, ' ').split(' ')[0] || 'You');
  return 'You';
}
function isFollowersOnly() { return !!els.shareFollowersOnly?.checked; }
function selectedTags() {
  // Derive tags from the active filter for write convenience (optional).
  // When composing, we’ll tag the post with the filter if it’s one of the topic filters.
  const map = { wins: ['wins'], advice: ['advice'], questions: ['questions'] };
  return map[ACTIVE_FILTER] || [];
}
function postMatchesActiveFilter(p) {
  if (ACTIVE_FILTER === 'all') return true;
  if (ACTIVE_FILTER === 'following') {
    return FOLLOWING.includes(p.userId) || p.userId === CURRENT_USER?.uid;
  }
  // Tag-based filters
  return Array.isArray(p.tags) && p.tags.includes(ACTIVE_FILTER);
}
function visibilityCheck(p) {
  // If post is "followers" and the viewer is not owner or follower, hide.
  if (p.visibility === 'followers' && p.userId !== CURRENT_USER?.uid && !FOLLOWING.includes(p.userId)) {
    return false;
  }
  return true;
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
function byCreatedAtDesc(a, b) {
  // client-side fallback sorting for mixed pages
  const aT = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? +new Date(a.createdAt) : 0);
  const bT = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? +new Date(b.createdAt) : 0);
  return bT - aT;
}

function enable(el, yes = true) {
  if (!el) return;
  el.disabled = !yes;
  el.classList.toggle('opacity-50', !yes);
  el.classList.toggle('cursor-not-allowed', !yes);
}

function cleanFileName(name = '') {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || `image_${Date.now()}.jpg`;
}

// ----------------------------- Profile / Following -----------------------------
async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch { return {}; }
}

function applyAvatar(u, profile) {
  const photoURL = u?.photoURL || profile?.photoURL || '/images/logo_white.png';
  if (els.avatar) els.avatar.src = photoURL;
}

async function loadFollowing(uid) {
  const profile = await loadProfile(uid);
  FOLLOWING = Array.isArray(profile?.following) ? profile.following : [];
  return profile;
}

// ----------------------------- Composer -----------------------------
function updateComposerState() {
  const text = (els.text?.value || '').trim();
  const hasFile = !!els.imageInput?.files?.[0];
  enable(els.submit, !!(text || hasFile));
  if (els.charCount) els.charCount.textContent = `${els.text.value.length} / 480`;
}

function wireComposer() {
  els.text?.addEventListener('input', updateComposerState);
  els.imageInput?.addEventListener('change', () => {
    const f = els.imageInput.files?.[0];
    els.imageName.textContent = f ? f.name : '';
    if (f) {
      const u = URL.createObjectURL(f);
      els.imagePreview.src = u;
      els.imageDropzone.classList.remove('hidden');
      setTimeout(() => URL.revokeObjectURL(u), 1500);
    } else {
      els.imageDropzone.classList.add('hidden');
      els.imagePreview.src = '';
    }
    updateComposerState();
  });
  els.removeImage?.addEventListener('click', (e) => {
    e.preventDefault();
    if (els.imageInput) els.imageInput.value = '';
    els.imageName.textContent = '';
    els.imageDropzone.classList.add('hidden');
    els.imagePreview.src = '';
    updateComposerState();
  });

  els.submit?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!CURRENT_USER) return;
    await createPost().catch(err => {
      console.error(err);
      toast('Failed to post');
    });
  });

  // Filters
  els.filterButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVE_FILTER = btn.getAttribute('data-filter') || 'all';
      // Visual active state
      els.filterButtons.forEach(b => b.classList.remove('border-[var(--neon)]'));
      btn.classList.add('border-[var(--neon)]');

      // Reset pagination and reload
      lastCursor = null;
      clearFeed();
      loadNextPage().catch(console.error);
    });
  });
  els.clearFilters?.addEventListener('click', () => {
    ACTIVE_FILTER = 'all';
    els.filterButtons?.forEach(b => b.classList.remove('border-[var(--neon)]'));
    lastCursor = null;
    clearFeed();
    loadNextPage().catch(console.error);
  });

  updateComposerState();
}

async function createPost() {
  const text = (els.text?.value || '').trim();
  const f = els.imageInput?.files?.[0] || null;
  if (!text && !f) return;

  enable(els.submit, false);

  // Prepare base document
  const base = {
    userId: CURRENT_USER.uid,
    displayName: CURRENT_USER.displayName || firstNameFromProfile(CURRENT_USER, CURRENT_PROFILE),
    photoURL: CURRENT_USER.photoURL || CURRENT_PROFILE?.photoURL || '',
    description: text,
    createdAt: serverTimestamp(),
    visibility: isFollowersOnly() ? 'followers' : 'public',
    tags: selectedTags(), // optional tags from current filter
    likes: [],
    commentCount: 0,
  };

  let imageURL = null;
  let imagePath = null;

  try {
    if (f) {
      const safeName = `${Date.now()}_${cleanFileName(f.name)}`;
      imagePath = `posts/${CURRENT_USER.uid}/${safeName}`;
      const r = sRef(storage, imagePath);
      await uploadBytes(r, f, { contentType: f.type || 'image/jpeg' });
      imageURL = await getDownloadURL(r);
      base.imageURL = imageURL;
      base.imagePath = imagePath;
    }

    await addDoc(collection(db, 'posts'), base);
    // Clear UI
    if (els.text) els.text.value = '';
    if (els.imageInput) els.imageInput.value = '';
    if (els.imageName) els.imageName.textContent = '';
    els.imageDropzone?.classList.add('hidden');
    els.imagePreview && (els.imagePreview.src = '');
    updateComposerState();
    toast('Posted ✓');

    // Prepend refresh: reset pagination so the newest shows up
    lastCursor = null;
    clearFeed();
    await loadNextPage();
  } finally {
    enable(els.submit, true);
  }
}

// ----------------------------- Feed -----------------------------
function clearFeed() {
  if (els.list) els.list.innerHTML = '';
  if (els.empty) els.empty.classList.add('hidden');
  if (els.loadMore) els.loadMore.classList.add('hidden');
}

function setLoadMoreVisible(yes) {
  if (!els.loadMore) return;
  els.loadMore.classList.toggle('hidden', !yes);
}

function postDocToModel(id, data) {
  return {
    id,
    userId: data.userId,
    displayName: data.displayName || 'Member',
    photoURL: data.photoURL || '/images/logo_white.png',
    description: data.description || '',
    createdAt: data.createdAt || null,
    visibility: data.visibility || 'public',
    tags: Array.isArray(data.tags) ? data.tags : [],
    imageURL: data.imageURL || null,
    imagePath: data.imagePath || null,
    likes: Array.isArray(data.likes) ? data.likes : [],
    commentCount: data.commentCount || 0,
  };
}

async function loadNextPage() {
  if (isLoading) return;
  isLoading = true;
  setLoadMoreVisible(false);

  try {
    // Base query: newest first
    let qBase = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    if (lastCursor) {
      qBase = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastCursor), limit(PAGE_SIZE));
    }

    const snap = await getDocs(qBase);
    const docs = snap.docs.map(d => postDocToModel(d.id, d.data()));
    // Apply client-side filtering for FOLLOWING/tags/visibility
    const filtered = docs.filter(p => postMatchesActiveFilter(p) && visibilityCheck(p));

    // Render in order
    filtered.sort(byCreatedAtDesc).forEach(p => renderPost(p));

    // Empty state
    if (!els.list?.children.length) els.empty?.classList.remove('hidden');

    // Pagination cursor
    lastCursor = snap.docs[snap.docs.length - 1] || null;
    setLoadMoreVisible(!!(lastCursor && snap.size >= PAGE_SIZE));
  } catch (e) {
    console.error('Feed load failed', e);
    toast('Failed to load feed');
  } finally {
    isLoading = false;
  }
}

function wireLoadMore() {
  els.loadMore?.addEventListener('click', () => loadNextPage().catch(console.error));
}

// ----------------------------- Render Post Card -----------------------------
function renderPost(p) {
  if (!els.postTemplate || !els.list) return;
  const node = els.postTemplate.content.cloneNode(true);
  const root = node.querySelector('article');

  // Header
  const avatar = node.querySelector('.post-avatar');
  const author = node.querySelector('.post-author');
  const meta = node.querySelector('.post-meta');
  const badge = node.querySelector('.post-badge');
  const menuBtn = node.querySelector('.post-menu');
  const menu = node.querySelector('.post-menu-popover');
  const editBtn = node.querySelector('.post-edit');
  const delBtn = node.querySelector('.post-delete');

  avatar.src = p.photoURL || '/images/logo_white.png';
  author.textContent = p.displayName || 'Member';
  author.href = `./user-profile.html?uid=${encodeURIComponent(p.userId)}`;
  meta.textContent = `${fmtTime(p.createdAt)} • ${p.visibility === 'followers' ? 'Followers' : 'Public'}`;
  if (p.tags?.length) {
    badge.textContent = titleCase(p.tags[0]);
    badge.classList.remove('hidden');
  }

  // Body
  const body = node.querySelector('.post-body');
  body.textContent = p.description || '';

  // Image
  const imageWrap = node.querySelector('.post-image-wrap');
  const imageEl = node.querySelector('.post-image');
  if (p.imageURL) {
    imageWrap.classList.remove('hidden');
    imageEl.src = p.imageURL;
  }

  // Footer actions
  const likeBtn = node.querySelector('.post-like');
  const likeCountEl = node.querySelector('.post-like-count');
  const commentBtn = node.querySelector('.post-comment');
  const commentCountEl = node.querySelector('.post-comment-count');
  const permalink = node.querySelector('.post-permalink');

  likeCountEl.textContent = String(p.likes?.length || 0);
  commentCountEl.textContent = String(p.commentCount || 0);
  permalink.href = `./post.html?id=${encodeURIComponent(p.id)}`;

  const youLiked = !!p.likes?.includes(CURRENT_USER?.uid);
  if (youLiked) likeBtn.classList.add('border-[var(--neon)]');

  likeBtn.addEventListener('click', async () => {
    if (!CURRENT_USER) return;
    const postRef = doc(db, 'posts', p.id);
    const liked = likeBtn.classList.toggle('border-[var(--neon)]');
    try {
      await updateDoc(postRef, {
        likes: liked ? arrayUnion(CURRENT_USER.uid) : arrayRemove(CURRENT_USER.uid)
      });
      // Update UI count locally
      const prev = Number(likeCountEl.textContent || '0');
      likeCountEl.textContent = String(Math.max(0, prev + (liked ? 1 : -1)));
    } catch (e) {
      // revert UI on failure
      likeBtn.classList.toggle('border-[var(--neon)]', !liked);
      console.error('Like failed', e);
      toast('Action failed');
    }
  });

  // Comments section toggle + inline add
  const commentsSection = node.querySelector('.post-comments');
  const commentsList = node.querySelector('[data-comments-list]');
  const commentInput = node.querySelector('.comment-input');
  const commentSubmit = node.querySelector('.comment-submit');

  let commentsOpen = false;
  commentBtn.addEventListener('click', async () => {
    commentsOpen = !commentsOpen;
    commentsSection.classList.toggle('hidden', !commentsOpen);
    if (commentsOpen && commentsList?.childElementCount === 0) {
      await loadComments(p.id, commentsList);
    }
  });

  commentSubmit.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!CURRENT_USER) return;
    const text = (commentInput?.value || '').trim();
    if (!text) return;

    commentSubmit.disabled = true;
    try {
      await addComment(p.id, {
        userId: CURRENT_USER.uid,
        displayName: CURRENT_USER.displayName || firstNameFromProfile(CURRENT_USER, CURRENT_PROFILE),
        photoURL: CURRENT_USER.photoURL || CURRENT_PROFILE?.photoURL || '',
        text,
      });
      commentInput.value = '';
      // Optimistically add to UI
      const item = renderComment({
        userId: CURRENT_USER.uid, displayName: CURRENT_USER.displayName || 'You',
        photoURL: CURRENT_USER.photoURL || '/images/logo_white.png', text, createdAt: new Date()
      });
      commentsList.prepend(item);
      // bump comment count locally
      const prev = Number(commentCountEl.textContent || '0');
      commentCountEl.textContent = String(prev + 1);
    } catch (err) {
      console.error(err); toast('Failed to comment');
    } finally {
      commentSubmit.disabled = false;
    }
  });

  // Post menu (edit/delete)
  menuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const open = !menu.classList.contains('hidden');
    document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
    if (!open) menu.classList.remove('hidden');
    const close = (ev) => { if (!menu.contains(ev.target) && ev.target !== menuBtn) { menu.classList.add('hidden'); document.removeEventListener('click', close, true); } };
    document.addEventListener('click', close, true);
  });

  // Only owners can edit/delete (enforced by rules; we gate UI too)
  if (CURRENT_USER?.uid !== p.userId) {
    editBtn?.classList.add('hidden');
    delBtn?.classList.add('hidden');
  } else {
    editBtn?.addEventListener('click', async () => {
      const next = prompt('Edit your post:', p.description || '');
      if (next == null) return;
      try {
        await updateDoc(doc(db, 'posts', p.id), { description: next });
        body.textContent = next;
        toast('Updated');
      } catch (e) {
        console.error(e); toast('Update failed');
      } finally {
        menu.classList.add('hidden');
      }
    });

    delBtn?.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        // Delete storage image first (best effort)
        if (p.imagePath) {
          try { await deleteObject(sRef(storage, p.imagePath)); } catch {}
        }
        await deleteDoc(doc(db, 'posts', p.id));
        root.remove();
        toast('Deleted');
        if (!els.list.children.length) els.empty?.classList.remove('hidden');
      } catch (e) {
        console.error(e); toast('Delete failed');
      } finally {
        menu.classList.add('hidden');
      }
    });
  }

  els.list.appendChild(node);
}

// ----------------------------- Comments -----------------------------
async function loadComments(postId, container) {
  try {
    const qC = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'), limit(20));
    const snap = await getDocs(qC);
    snap.docs.forEach(d => {
      const c = d.data() || {};
      container.appendChild(renderComment(c));
    });
  } catch (e) {
    console.error('Comments load failed', e);
  }
}

function renderComment(c) {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-start gap-3';
  wrap.innerHTML = `
    <img class="h-8 w-8 rounded-full object-cover bg-neutral-900 border border-neutral-800" src="${c.photoURL || '/images/logo_white.png'}" alt="">
    <div class="flex-1">
      <div class="text-sm"><span class="font-medium">${c.displayName || 'Member'}</span> <span class="text-neutral-500 text-xs">• ${fmtTime(c.createdAt)}</span></div>
      <div class="text-sm text-neutral-200 whitespace-pre-wrap">${c.text || ''}</div>
    </div>
  `;
  return wrap;
}

async function addComment(postId, { userId, displayName, photoURL, text }) {
  const col = collection(db, 'posts', postId, 'comments');
  await addDoc(col, {
    userId, displayName, photoURL, text,
    createdAt: serverTimestamp(),
  });
  // increment commentCount: rules only allow updating 'commentCount'
  await updateDoc(doc(db, 'posts', postId), { commentCount: (/* server-side inc not allowed */) undefined })
  .catch(async () => {
    // Fallback: set to (prev+1) via read-modify-write (2 calls); if it fails silently, UI already updated
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (snap.exists()) {
        const curr = Number(snap.data()?.commentCount || 0);
        await updateDoc(doc(db, 'posts', postId), { commentCount: curr + 1 });
      }
    } catch {}
  });
}

// ----------------------------- Suggested Users -----------------------------
async function loadSuggested() {
  if (!els.suggestedWrap || !els.suggestionTemplate) return;
  els.suggestedWrap.innerHTML = '';

  // naive suggestion: first 10 users not you and not already following
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(12)));
    const users = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.id !== CURRENT_USER?.uid && !FOLLOWING.includes(u.id))
      .slice(0, 8);

    users.forEach(u => {
      const node = els.suggestionTemplate.content.cloneNode(true);
      const img = node.querySelector('img');
      const nameEl = node.querySelector('.text-sm.font-medium');
      const subEl = node.querySelector('.text-xs.text-neutral-500');
      const btn = node.querySelector('button');

      img.src = u.photoURL || '/images/logo_white.png';
      nameEl.textContent = u.displayName || u.firstName || 'Member';
      subEl.textContent = u.bio || u.email || 'Active member';
      btn.addEventListener('click', async () => {
        try {
          await followUser(u.id);
          btn.textContent = 'Following';
          btn.disabled = true;
          toast(`Following ${nameEl.textContent}`);
        } catch (e) {
          console.error(e); toast('Failed to follow');
        }
      });

      els.suggestedWrap.appendChild(node);
    });
  } catch (e) {
    console.error('Suggested load failed', e);
  }
}

async function followUser(targetUid) {
  if (!CURRENT_USER) return;
  const youRef = doc(db, 'users', CURRENT_USER.uid);
  // We mirror both sides if your backend reads them:
  //   - add to your following
  //   - (optional) add to their followers — only if security rules allow
  try {
    const snap = await getDoc(youRef);
    const data = snap.exists() ? (snap.data() || {}) : {};
    const nextFollowing = Array.isArray(data.following) ? Array.from(new Set([...data.following, targetUid])) : [targetUid];
    await setDoc(youRef, { following: nextFollowing, updatedAt: serverTimestamp() }, { merge: true });
    FOLLOWING = nextFollowing;
  } catch (e) {
    console.error('followUser failed', e);
    throw e;
  }
}

// ----------------------------- Boot -----------------------------
async function boot() {
  wireComposer();
  wireLoadMore();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth-check handles redirect
    CURRENT_USER = user;
    CURRENT_PROFILE = await loadFollowing(user.uid); // loads profile + following
    applyAvatar(user, CURRENT_PROFILE);

    // First page + suggestions
    clearFeed();
    await loadNextPage();
    await loadSuggested();
  });
}

document.addEventListener('DOMContentLoaded', boot);
