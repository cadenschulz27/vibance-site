// FILE: public/Social/data-service.js
// -------------------------------------------------------------------
// Vibance Community • Data Service (Firestore + Storage helpers)
// - Stores and renders USERNAMES for posts/comments
// - ESM module
// -------------------------------------------------------------------

import { auth, db, storage } from '../api/firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy, limit, startAfter,
  arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  ref as sRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

/* ------------------------------- Utilities ------------------------------- */
const cleanFileName = (name = '') => name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || `file_${Date.now()}`;
const nowServer = () => serverTimestamp();

/**
 * Get the canonical username for the current user.
 * Throws if unavailable — by construction, all new users must have one.
 */
async function getUsername(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? (snap.data() || {}) : {};
  const uname = (data.username || '').trim();
  if (!uname) throw new Error('Username not set on profile.');
  return uname;
}

/* --------------------------------- Users --------------------------------- */
export async function loadUser(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() || {}) : null;
  } catch {
    return null;
  }
}

export async function updateFollowing(targetUid, { follow }) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');
  const youRef = doc(db, 'users', me.uid);
  const snap = await getDoc(youRef);
  const curr = snap.exists() ? (snap.data()?.following || []) : [];
  const next = follow ? Array.from(new Set([...curr, targetUid])) : curr.filter(x => x !== targetUid);
  await setDoc(youRef, { following: next, updatedAt: nowServer() }, { merge: true });
  return next;
}

/* ---------------------------------- Posts --------------------------------- */
function toPostModel(id, d = {}) {
  return {
    id,
    userId: d.userId,
    // NOTE: "displayName" now equals the username at write time.
    displayName: d.displayName || '',        // should always be set
    photoURL: d.photoURL || '/images/logo_white.png',
    description: d.description || '',
    createdAt: d.createdAt || null,
    visibility: d.visibility || 'public',
    tags: Array.isArray(d.tags) ? d.tags : [],
    imageURL: d.imageURL || null,
    imagePath: d.imagePath || null,
    images: Array.isArray(d.images) ? d.images : null,
    likes: Array.isArray(d.likes) ? d.likes : [],
    commentCount: Number(d.commentCount || 0),
  };
}

export async function fetchPostsPage({ after = null, pageSize = 12 } = {}) {
  let qBase = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(pageSize));
  if (after) qBase = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(after), limit(pageSize));
  const snap = await getDocs(qBase);
  const items = snap.docs.map(d => toPostModel(d.id, d.data() || {}));
  const cursor = snap.docs[snap.docs.length - 1] || null;
  return { items, cursor, rawDocs: snap.docs };
}

export async function fetchUserPostsPage(uid, { after = null, pageSize = 10 } = {}) {
  let qBase = query(
    collection(db, 'posts'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  if (after) {
    qBase = query(
      collection(db, 'posts'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      startAfter(after),
      limit(pageSize)
    );
  }
  const snap = await getDocs(qBase);
  const items = snap.docs.map(d => toPostModel(d.id, d.data() || {}));
  const cursor = snap.docs[snap.docs.length - 1] || null;
  return { items, cursor, rawDocs: snap.docs };
}

export async function getPost(postId) {
  const ref = doc(db, 'posts', postId);
  const snap = await getDoc(ref);
  return snap.exists() ? toPostModel(snap.id, snap.data() || {}) : null;
}

/**
 * Create a post (optional image).
 * -> displayName is set to the user's username.
 */
export async function createPost({ description = '', visibility = 'public', tags = [], file = null, files = null } = {}) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');

  const username = await getUsername(me.uid);
  // Prefer Firestore profile photo over Auth photo
  let photoURL = '';
  try {
    const u = await loadUser(me.uid);
    photoURL = (u?.photoURL || me.photoURL || '') || '';
  } catch { photoURL = me.photoURL || ''; }

  const base = {
    userId: me.uid,
    displayName: username,          // store username for renderers
    photoURL,
    description: description.trim(),
    createdAt: nowServer(),
    visibility: visibility === 'followers' ? 'followers' : 'public',
    tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
    likes: [],
    commentCount: 0,
  };

  const list = Array.isArray(files) ? files : (file ? [file] : []);
  if (list.length) {
    const imgs = [];
    for (const f of list) {
      const safe = `${Date.now()}_${cleanFileName(f.name)}`;
      const path = `posts/${me.uid}/${safe}`;
      const r = sRef(storage, path);
      await uploadBytes(r, f, { contentType: f.type || 'image/jpeg' });
      const url = await getDownloadURL(r);
      imgs.push({ url, path });
    }
    base.images = imgs;
    // Back-compat: also stamp first imageURL/imagePath
    base.imageURL = imgs[0]?.url || null;
    base.imagePath = imgs[0]?.path || null;
  }

  const docRef = await addDoc(collection(db, 'posts'), base);
  return docRef.id;
}

/**
 * Update post text (owner-only).
 */
export async function updatePostDescription(postId, nextText) {
  await updateDoc(doc(db, 'posts', postId), { description: String(nextText || '') });
}

/**
 * Replace post content and media (owner-only).
 * If `files` provided, replaces all images with the new set.
 */
export async function updatePostContent(postId, { description, tags, visibility, files } = {}) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');
  const ref = doc(db, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const curr = snap.data() || {};

  const patch = {};
  if (typeof description === 'string') patch.description = description;
  if (Array.isArray(tags)) patch.tags = tags.slice(0,5);
  if (visibility === 'followers' || visibility === 'public') patch.visibility = visibility;

  if (Array.isArray(files) && files.length) {
    // delete old media (best-effort)
    try {
      if (Array.isArray(curr.images)) {
        for (const im of curr.images) { try { await deleteObject(sRef(storage, im.path)); } catch {} }
      } else if (curr.imagePath) {
        try { await deleteObject(sRef(storage, curr.imagePath)); } catch {}
      }
    } catch {}
    // upload new
    const imgs = [];
    for (const f of files) {
      const safe = `${Date.now()}_${cleanFileName(f.name)}`;
      const path = `posts/${me.uid}/${safe}`;
      const r = sRef(storage, path);
      await uploadBytes(r, f, { contentType: f.type || 'image/jpeg' });
      const url = await getDownloadURL(r);
      imgs.push({ url, path });
    }
    patch.images = imgs;
    patch.imageURL = imgs[0]?.url || null;
    patch.imagePath = imgs[0]?.path || null;
  }

  await updateDoc(ref, patch);
}

/**
 * Delete a post (owner-only). Cleans image best-effort.
 */
export async function deletePost(post) {
  if (post?.imagePath) {
    try { await deleteObject(sRef(storage, post.imagePath)); } catch {}
  }
  if (Array.isArray(post?.images)) {
    for (const im of post.images) { try { await deleteObject(sRef(storage, im.path)); } catch {} }
  }
  await deleteDoc(doc(db, 'posts', post.id));
}

/**
 * Toggle like.
 */
export async function toggleLike(postId, like) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, { likes: like ? arrayUnion(me.uid) : arrayRemove(me.uid) });
}

/* ------------------------------ Saved posts ------------------------------ */
export async function loadSavedPosts() {
  const me = auth.currentUser; if (!me) throw new Error('Not signed in');
  const snap = await getDoc(doc(db, 'users', me.uid, 'settings', 'social'));
  const data = snap.exists() ? (snap.data() || {}) : {};
  const arr = Array.isArray(data.savedPosts) ? data.savedPosts : [];
  return arr;
}
export async function toggleSavedPost(postId, save) {
  const me = auth.currentUser; if (!me) throw new Error('Not signed in');
  const ref = doc(db, 'users', me.uid, 'settings', 'social');
  await setDoc(ref, { savedPosts: save ? arrayUnion(postId) : arrayRemove(postId), updatedAt: nowServer() }, { merge: true });
}
export async function getPostsByIds(ids = []) {
  const out = [];
  for (const id of ids) {
    const p = await getPost(id);
    if (p) out.push(p);
  }
  return out;
}

/* -------------------------------- Comments ------------------------------- */

export async function fetchComments(postId, { pageSize = 40 } = {}) {
  const snap = await getDocs(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'), limit(pageSize)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
}

/**
 * Add a comment with username (no "You" fallback).
 */
export async function addComment(postId, text) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');

  const username = await getUsername(me.uid);
  let photoURL = '';
  try {
    const u = await loadUser(me.uid);
    photoURL = (u?.photoURL || me.photoURL || '') || '';
  } catch { photoURL = me.photoURL || ''; }

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    userId: me.uid,
    displayName: username,       // store username
    photoURL,
    text: String(text || ''),
    createdAt: nowServer(),
  });

  // increment commentCount best-effort
  try {
    const ref = doc(db, 'posts', postId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const curr = Number(snap.data()?.commentCount || 0);
      await updateDoc(ref, { commentCount: curr + 1 });
    }
  } catch {}
}

/* ------------------------------- Directory ------------------------------- */
export async function fetchUsersPage({ after = null, pageSize = 18 } = {}) {
  let qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), limit(pageSize));
  if (after) qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), startAfter(after), limit(pageSize));
  try {
    const snap = await getDocs(qBase);
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    const cursor = snap.docs[snap.docs.length - 1] || null;
    return { items, cursor, rawDocs: snap.docs };
  } catch {
    return { items: [], cursor: null, rawDocs: [] };
  }
}
