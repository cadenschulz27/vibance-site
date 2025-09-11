// public/Social/post-manager.js
// -------------------------------------------------------------------
// Vibance Community • Post Manager (compat wrapper)
// - Provides a stable API for creating, reading, updating, deleting
//   posts & comments, and toggling likes.
// - Internally delegates to ./data-service.js so all rules/paths are
//   enforced in one place.
// - Exposes ESM exports AND attaches a legacy global window.VBPost.
// -------------------------------------------------------------------

import * as DS from './data-service.js';

/* ------------------------------ Types ------------------------------
 * Post input shape used by create():
 *   { description: string, visibility?: 'public'|'followers', tags?: string[], file?: File|null }
 * ------------------------------------------------------------------*/

/* ---------------------------- Post CRUD --------------------------- */
export async function create(postInput) {
  // postInput: { description, visibility?, tags?, file? }
  return DS.createPost(postInput);
}

export async function get(postId) {
  return DS.getPost(postId);
}

export async function updateDescription(postId, nextText) {
  return DS.updatePostDescription(postId, nextText);
}

export async function remove(postOrId) {
  const post = typeof postOrId === 'string' ? await DS.getPost(postOrId) : postOrId;
  if (!post) return;
  return DS.deletePost(post);
}

/* --------------------------- Likes & Counts ----------------------- */
export async function toggleLike(postId, like) {
  return DS.toggleLike(postId, like);
}

/* ------------------------------ Comments -------------------------- */
export async function listComments(postId, opts = {}) {
  return DS.fetchComments(postId, opts);
}

export async function addComment(postId, text) {
  return DS.addComment(postId, text);
}

/* ---------------------------- Pagination -------------------------- */
export async function listFeedPage({ after = null, pageSize = 12 } = {}) {
  return DS.fetchPostsPage({ after, pageSize });
}

export async function listUserPostsPage(userId, { after = null, pageSize = 10 } = {}) {
  return DS.fetchUserPostsPage(userId, { after, pageSize });
}

/* ----------------------------- Following -------------------------- */
export async function follow(userId) {
  const next = await DS.updateFollowing(userId, { follow: true });
  return next;
}

export async function unfollow(userId) {
  const next = await DS.updateFollowing(userId, { follow: false });
  return next;
}

/* -------------------------- Legacy Global API --------------------- */
(function attachLegacyGlobal() {
  const api = {
    create,
    get,
    updateDescription,
    remove,
    toggleLike,
    listComments,
    addComment,
    listFeedPage,
    listUserPostsPage,
    follow,
    unfollow,
  };
  // Provide under window.VBPost for older scripts
  window.VBPost = Object.freeze({ ...(window.VBPost || {}), ...api });
})();
