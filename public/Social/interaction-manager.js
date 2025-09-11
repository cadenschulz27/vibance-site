// public/Social/interaction-manager.js
// --------------------------------------------------------------------
// Vibance Community • Interaction Manager (compat layer)
// - Wires like / comment / edit / delete for post cards rendered
//   anywhere in the app (feed, profile, permalink).
// - Delegates reads/writes to data-service.js (rules-safe).
// - Idempotent wiring with container-scoped delegation.
// - Exposes ESM functions AND legacy global window.VBInteract.
// --------------------------------------------------------------------

import { auth } from '../api/firebase.js';
import * as DS from './data-service.js';
import { toast, qsa } from './ui-helpers.js';

/**
 * @typedef {Object} WireOptions
 * @property {string=} permalinkBase  // e.g., './post.html' (default)
 * @property {boolean=} enableInlineEdit // prompt() for owner edit (default true)
 */

/**
 * Wire post interactions for a given container.
 * Cards must follow the shared template (classes: post-like, post-comment, etc.)
 *
 * @param {HTMLElement|Document} container
 * @param {WireOptions=} options
 * @returns {() => void} teardown function
 */
export function wirePostInteractions(container = document, options = {}) {
  const root = container || document;
  const settings = {
    permalinkBase: options.permalinkBase || './post.html',
    enableInlineEdit: options.enableInlineEdit !== false,
  };

  // Prevent double-binding on same root
  if (root.__vb_interact_wired__) return () => {};
  root.__vb_interact_wired__ = true;

  // -------------------------- Helpers --------------------------
  const findCard = (el) => el.closest?.('article');
  const getPostId = (card) => card?.dataset?.postId || card?.getAttribute('data-post-id');

  async function toggleLike(card, btn) {
    const postId = getPostId(card);
    if (!postId) return;

    const liked = btn.classList.contains('border-[var(--neon)]');
    // optimistic
    btn.classList.toggle('border-[var(--neon)]', !liked);
    const countEl = card.querySelector('.post-like-count');
    if (countEl) {
      const n = Math.max(0, Number(countEl.textContent || '0') + (liked ? -1 : 1));
      countEl.textContent = String(n);
    }
    try {
      await DS.toggleLike(postId, !liked);
    } catch (e) {
      // revert
      btn.classList.toggle('border-[var(--neon)]', liked);
      if (countEl) {
        const n = Math.max(0, Number(countEl.textContent || '0') + (liked ? 1 : -1));
        countEl.textContent = String(n);
      }
      toast('Action failed');
    }
  }

  async function sendComment(card) {
    const postId = getPostId(card);
    if (!postId) return;
    const input = card.querySelector('.comment-input');
    const list = card.querySelector('[data-comments-list]');
    if (!input || !list) return;

    const text = (input.value || '').trim();
    if (!text) return;
    const btn = card.querySelector('.comment-submit');
    if (btn) btn.disabled = true;

    try {
      // Optimistic: insert a local comment bubble
      const you = auth.currentUser;
      const temp = document.createElement('div');
      temp.className = 'flex items-start gap-3 opacity-80';
      temp.innerHTML = `
        <img class="h-8 w-8 rounded-full object-cover bg-neutral-900 border border-neutral-800"
             src="${you?.photoURL || '/images/logo_white.png'}" alt="">
        <div class="flex-1">
          <div class="text-sm"><span class="font-medium">${you?.displayName || 'You'}</span>
            <span class="text-neutral-500 text-xs">• Just now</span></div>
          <div class="text-sm text-neutral-200 whitespace-pre-wrap"></div>
        </div>`;
      temp.querySelector('div.text-sm.text-neutral-200').textContent = text;
      list.prepend(temp);

      await DS.addComment(postId, text);

      // Update comment count
      const countEl = card.querySelector('.post-comment-count');
      if (countEl) {
        const n = Math.max(0, Number(countEl.textContent || '0') + 1);
        countEl.textContent = String(n);
      }

      input.value = '';
    } catch {
      toast('Failed to comment');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function editPost(card) {
    const postId = getPostId(card);
    if (!postId || !settings.enableInlineEdit) return;
    const body = card.querySelector('.post-body');
    const current = body?.textContent || '';
    const next = prompt('Edit your post:', current);
    if (next == null) return;
    try {
      await DS.updatePostDescription(postId, next);
      if (body) body.textContent = next;
      toast('Updated');
    } catch {
      toast('Update failed');
    }
  }

  async function deletePost(card) {
    const postId = getPostId(card);
    if (!postId) return;
    if (!confirm('Delete this post?')) return;
    try {
      const post = await DS.getPost(postId);
      if (post) await DS.deletePost(post);
      card.remove();
      toast('Deleted');
    } catch {
      toast('Delete failed');
    }
  }

  // ----------------------- Delegated listeners -----------------------
  function onClick(e) {
    const t = /** @type {HTMLElement} */ (e.target);

    // Like
    const likeBtn = t.closest?.('.post-like');
    if (likeBtn) {
      const card = findCard(likeBtn);
      if (card) toggleLike(card, likeBtn);
      return;
    }

    // Comment open (ensure section visible)
    const commentBtn = t.closest?.('.post-comment');
    if (commentBtn) {
      const card = findCard(commentBtn);
      const section = card?.querySelector('.post-comments');
      section?.classList.remove('hidden');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card?.querySelector('.comment-input')?.focus();
      return;
    }

    // Comment send
    const sendBtn = t.closest?.('.comment-submit');
    if (sendBtn) {
      const card = findCard(sendBtn);
      if (card) sendComment(card);
      return;
    }

    // Edit
    const editBtn = t.closest?.('.post-edit');
    if (editBtn) {
      const card = findCard(editBtn);
      if (card) editPost(card);
      return;
    }

    // Delete
    const delBtn = t.closest?.('.post-delete');
    if (delBtn) {
      const card = findCard(delBtn);
      if (card) deletePost(card);
      return;
    }

    // Permalink: normal click navigates; meta/alt handled by listeners.js
    const link = t.closest?.('.post-permalink');
    if (link) {
      const card = findCard(link);
      const postId = getPostId(card);
      if (postId && !e.metaKey && !e.altKey) {
        e.preventDefault();
        location.href = `${settings.permalinkBase}?id=${encodeURIComponent(postId)}`;
      }
      return;
    }
  }

  function onKeydown(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Enter' && !e.shiftKey && t?.classList?.contains('comment-input')) {
      e.preventDefault();
      const card = findCard(t);
      if (card) sendComment(card);
    }
  }

  root.addEventListener('click', onClick, true);
  root.addEventListener('keydown', onKeydown, true);

  // Return teardown
  return () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('keydown', onKeydown, true);
    root.__vb_interact_wired__ = false;
  };
}

/* ----------------------------- Convenience ----------------------------- */
/**
 * Automatically wire for all current and future cards beneath a list container.
 * @param {HTMLElement} listEl
 * @param {WireOptions=} options
 */
export function autoWire(listEl, options = {}) {
  const teardown = wirePostInteractions(listEl, options);
  // Observe DOM mutations to ensure delegated listeners remain sufficient
  // (No-op here since delegation covers dynamic cards; return teardown for symmetry)
  return teardown;
}

/* ------------------------- Legacy Global Adapter ------------------------ */
(function attachLegacy() {
  const api = {
    wire: (container, opts) => wirePostInteractions(container, opts),
    autoWire: (listEl, opts) => autoWire(listEl, opts),
  };
  window.VBInteract = Object.freeze({ ...(window.VBInteract || {}), ...api });
})();
