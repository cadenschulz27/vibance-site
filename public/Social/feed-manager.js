// public/Social/feed-manager.js
// --------------------------------------------------------------------
// Vibance Community • Feed Manager
// - Centralized pagination + rendering for the main feed
// - Filters: by following (client filter), userId, tag, visibility
// - Uses data-service.js for reads/writes (rules-safe)
// - Renders with post-renderer.js; pluggable callbacks
// - Exposes ESM API AND legacy global window.VBFeed
// --------------------------------------------------------------------

import { auth } from '../api/firebase.js';
import * as DS from './data-service.js';
import { createPostCard, toPostModel } from './post-renderer.js';
import { toast } from './ui-helpers.js';

/**
 * @typedef {Object} FeedFilter
 * @property {boolean=} onlyFollowing   // Client-side filter using `following` prop
 * @property {string=} userId           // Show posts from a single user
 * @property {string=} tag              // Match if post.tags includes this (case-insensitive)
 * @property {'public'|'followers'=} visibility
 */

/**
 * @typedef {Object} FeedOptions
 * @property {HTMLElement} listEl
 * @property {HTMLElement=} emptyEl
 * @property {HTMLElement=} loadMoreBtn
 * @property {number=} pageSize
 * @property {string=} currentUserId
 * @property {string[]=} following
 * @property {FeedFilter=} filter
 */

export class FeedManager {
  /** @param {FeedOptions} opts */
  constructor(opts) {
    this.listEl = opts.listEl;
    this.emptyEl = opts.emptyEl || null;
    this.moreBtn = opts.loadMoreBtn || null;
    this.pageSize = Number(opts.pageSize || 12);
    this.currentUserId = opts.currentUserId || auth.currentUser?.uid || null;
    this.following = Array.isArray(opts.following) ? opts.following : [];
    this.filter = opts.filter || {};
    this._cursor = null;
    this._loading = false;

    if (this.moreBtn) {
      this.moreBtn.addEventListener('click', () => this.loadNext());
    }
  }

  setFollowing(list) {
    this.following = Array.isArray(list) ? list : [];
  }

  /** @param {FeedFilter} filter */
  setFilter(filter) {
    this.filter = filter || {};
    return this.refresh();
  }

  async refresh() {
    this._cursor = null;
    if (this.listEl) this.listEl.innerHTML = '';
    this._setEmpty(false);
    this._setMore(false);
    return this.loadNext();
  }

  async loadNext() {
    if (this._loading) return;
    this._loading = true;
    this._setMore(false);

    try {
      // If filtering by a specific user, use the dedicated query for better perf
      let page;
      if (this.filter?.userId) {
        page = await DS.fetchUserPostsPage(this.filter.userId, {
          after: this._cursor,
          pageSize: this.pageSize,
        });
      } else {
        page = await DS.fetchPostsPage({
          after: this._cursor,
          pageSize: this.pageSize,
        });
      }

      this._cursor = page.cursor;

      // Client filters (followers, tag, visibility)
      const filtered = (page.items || []).filter((raw) => this._passesFilter(raw));
      if (!filtered.length && !this.listEl.children.length && !page.cursor) {
        this._setEmpty(true);
        return;
      }

      this._setEmpty(false);
      for (const raw of filtered) {
        const model = toPostModel(raw.id, raw);
        this._mountCard(model);
      }

      this._setMore(!!this._cursor);
    } catch (e) {
      console.error('[FeedManager] loadNext failed', e);
      toast('Failed to load feed');
    } finally {
      this._loading = false;
    }
  }

  // --------------------------- internals ---------------------------
  _passesFilter(raw) {
    const f = this.filter || {};
    // onlyFollowing (client filter)
    if (f.onlyFollowing && this.following.length) {
      if (!this.following.includes(raw.userId)) return false;
    }
    // visibility
    if (f.visibility && (raw.visibility || 'public') !== f.visibility) return false;
    // tag (case-insensitive)
    if (f.tag) {
      const t = String(f.tag).toLowerCase();
      const tags = Array.isArray(raw.tags) ? raw.tags.map(x => String(x).toLowerCase()) : [];
      if (!tags.includes(t)) return false;
    }
    // userId handled at query level if provided; keep here for safety
    if (f.userId && raw.userId !== f.userId) return false;
    return true;
  }

  _mountCard(model) {
    const card = createPostCard(model, {
      currentUserId: this.currentUserId,
      onToggleLike: async (post, nextLiked) => {
        try { await DS.toggleLike(post.id, nextLiked); }
        catch { toast('Action failed'); }
      },
      onEdit: async (post, newText) => {
        try { await DS.updatePostDescription(post.id, newText); toast('Updated'); }
        catch { toast('Update failed'); }
      },
      onDelete: async (post) => {
        try { await DS.deletePost(post); card.remove(); this._checkEmpty(); toast('Deleted'); }
        catch { toast('Delete failed'); }
      },
      onOpenPermalink: (post) => {
        location.href = `./post.html?id=${encodeURIComponent(post.id)}`;
      },
      onOpenComments: async (postId) => {
        const list = await DS.fetchComments(postId, { pageSize: 40 });
        return list.map(c => ({
          userId: c.userId,
          displayName: c.displayName || 'Member',
          photoURL: c.photoURL || '/images/logo_white.png',
          text: c.text || '',
          createdAt: c.createdAt || null,
        }));
      },
      onSendComment: async (postId, text) => {
        try { await DS.addComment(postId, text); }
        catch { toast('Failed to comment'); }
      },
    });
    this.listEl.appendChild(card);
  }

  _setEmpty(show) {
    if (!this.emptyEl) return;
    this.emptyEl.classList.toggle('hidden', !show);
  }

  _setMore(show) {
    if (!this.moreBtn) return;
    this.moreBtn.classList.toggle('hidden', !show);
  }

  _checkEmpty() {
    const any = !!this.listEl.querySelector('article.glass');
    this._setEmpty(!any);
  }
}

/* ----------------------------- ESM helpers ----------------------------- */
/** @param {FeedOptions} opts */
export function initFeed(opts) {
  return new FeedManager(opts);
}

/* --------------------------- Legacy Global API -------------------------- */
(function attachLegacy() {
  const api = {
    init: (opts) => new FeedManager(opts),
  };
  window.VBFeed = Object.freeze({ ...(window.VBFeed || {}), ...api });
})();
