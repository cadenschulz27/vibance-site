// public/Social/data-service.js
// -------------------------------------------------------------------
// Vibance Community • Data Service (Firestore + Storage helpers)
// - Centralizes CRUD for posts, comments, follows, and user lookup
// - Respects your Firestore/Storage security rules
// - ESM module: import what you need
//
// Usage examples:
//   import * as DS from './data-service.js';
//   const page = await DS.fetchPostsPage({ pageSize: 12 });
//   const id = await DS.createPost({ description: 'Hello', visibility: 'public' });
//
// NOTE: All functions assume the caller has ensured the user is signed in.
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

/* --------------------------------- Types --------------------------------- */
// JSDoc typedefs for DX (optional)
/**
 * @typedef {'public'|'followers'} Visibility
 * @typedef {{id:string,userId:string,displayName:string,photoURL:string,description:string,createdAt:any,visibility:Visibility,tags:string[],imageURL?:string,imagePath?:string,likes:string[],commentCount:number}} PostModel
 */

/* ------------------------------- Utilities ------------------------------- */
const cleanFileName = (name = '') => name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || `file_${Date.now()}`;
const nowServer = () => serverTimestamp();

/* --------------------------------- Users --------------------------------- */
export async function loadUser(uid) {
  // Owner reads to /users/{uid} are allowed; other reads may be blocked by rules.
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
  // Rules: owner can update 'following' + 'updatedAt'
  await setDoc(youRef, { following: next, updatedAt: nowServer() }, { merge: true });
  return next;
}

/* ---------------------------------- Posts --------------------------------- */
function toPostModel(id, d = {}) {
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
 * Create a post (with optional image upload).
 * Respects rules:
 *  - create allowed if request.resource.data.userId == auth.uid
 *  - fields we set are rule-compliant
 */
export async function createPost({ description = '', visibility = 'public', tags = [], file = null } = {}) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');

  const base = {
    userId: me.uid,
    displayName: me.displayName || 'Member',
    photoURL: me.photoURL || '',
    description: description.trim(),
    createdAt: nowServer(),
    visibility: visibility === 'followers' ? 'followers' : 'public',
    tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
    likes: [],
    commentCount: 0,
  };

  // Optional image upload (Storage rules: write allowed to /posts/{userId} by owner)
  if (file) {
    const safe = `${Date.now()}_${cleanFileName(file.name)}`;
    const path = `posts/${me.uid}/${safe}`;
    const r = sRef(storage, path);
    await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' });
    const url = await getDownloadURL(r);
    base.imageURL = url;
    base.imagePath = path;
  }

  const docRef = await addDoc(collection(db, 'posts'), base);
  return docRef.id;
}

/**
 * Update post description (owner-only; rules enforce).
 */
export async function updatePostDescription(postId, nextText) {
  await updateDoc(doc(db, 'posts', postId), { description: String(nextText || '') });
}

/**
 * Delete a post (owner-only; rules enforce). Best-effort delete of image.
 */
export async function deletePost(post) {
  if (post?.imagePath) {
    try { await deleteObject(sRef(storage, post.imagePath)); } catch {}
  }
  await deleteDoc(doc(db, 'posts', post.id));
}

/**
 * Toggle like for current user.
 * Rules allow updating the 'likes' array.
 */
export async function toggleLike(postId, like) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, { likes: like ? arrayUnion(me.uid) : arrayRemove(me.uid) });
}

/* -------------------------------- Comments ------------------------------- */
export async function fetchComments(postId, { pageSize = 40 } = {}) {
  const snap = await getDocs(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'), limit(pageSize)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
}

/**
 * Add a comment; then bump commentCount (allowed by rules).
 */
export async function addComment(postId, text) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in');

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    userId: me.uid,
    displayName: me.displayName || 'You',
    photoURL: me.photoURL || '',
    text: String(text || ''),
    createdAt: nowServer(),
  });

  // Bump commentCount with read-modify-write (server-side increment not available here)
  try {
    const ref = doc(db, 'posts', postId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const curr = Number(snap.data()?.commentCount || 0);
      await updateDoc(ref, { commentCount: curr + 1 });
    }
  } catch {
    // Ignore; UI can be optimistic.
  }
}

/* ------------------------------- Directory ------------------------------- */
/**
 * Fetch a page of users for "Follow" directory.
 * Reads to others' user docs may be restricted by rules; fetch best-effort.
 */
export async function fetchUsersPage({ after = null, pageSize = 18 } = {}) {
  let qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), limit(pageSize));
  if (after) qBase = query(collection(db, 'users'), orderBy('updatedAt', 'desc'), startAfter(after), limit(pageSize));
  try {
    const snap = await getDocs(qBase);
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    const cursor = snap.docs[snap.docs.length - 1] || null;
    return { items, cursor, rawDocs: snap.docs };
  } catch {
    // If rules prevent reading users, return empty page
    return { items: [], cursor: null, rawDocs: [] };
  }
}

/* --------------------------------- Exports --------------------------------
 * Everything is named-exported; no default export.
 * Keep this file lean to avoid duplicate SDK bundles across pages.
 * ------------------------------------------------------------------------- */
