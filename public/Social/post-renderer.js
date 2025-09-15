// public/Social/post-renderer.js
// --------------------------------------------------------------------
// Vibance Community • Post Renderer (pure UI)
// - Creates a post card DOM node from a model
// - No Firebase calls here: callbacks are injected by caller
// - Used by social.js, feed-manager.js, user-profile.js, post page
// --------------------------------------------------------------------

import { fmtTime, qsa } from './ui-helpers.js';

/**
 * Normalize raw Firestore doc -> lightweight model used by renderer.
 * Safe to call with either raw snapshots or already-normalized objects.
 */
export function toPostModel(id, d = {}) {
  const data = d || {};
  return {
    id,
    userId: data.userId,
    displayName: data.displayName || 'Member',
    photoURL: data.photoURL || '/images/logo_white.png',
    description: data.description || '',
    createdAt: data.createdAt || null,
    visibility: data.visibility === 'followers' ? 'followers' : 'public',
    tags: Array.isArray(data.tags) ? data.tags : [],
    imageURL: data.imageURL || null,
    imagePath: data.imagePath || null,
    images: Array.isArray(data.images) ? data.images : null,
    likes: Array.isArray(data.likes) ? data.likes : [],
    commentCount: Number(data.commentCount || 0),
  };
}

/**
 * Render a single comment to a DOM node.
 * @param {{displayName:string, photoURL?:string, text:string, createdAt:any}} c
 */
export function renderCommentItem(c) {
  // Instagram-like comment row: avatar + inline username + text, tiny time below
  const row = document.createElement('div');
  row.className = 'comment-item flex items-start gap-3';

  const img = document.createElement('img');
  img.className = 'comment-avatar h-8 w-8 rounded-full object-cover bg-neutral-900 border border-neutral-800';
  img.src = c.photoURL || '/images/logo_white.png';
  img.alt = '';
  row.appendChild(img);

  const body = document.createElement('div');
  body.className = 'flex-1 min-w-0';

  const line = document.createElement('p');
  line.className = 'text-sm leading-snug';

  const author = document.createElement('a');
  author.className = 'comment-author font-medium hover:underline';
  author.textContent = c.displayName || 'Member';
  if (c.userId) author.href = `./user-profile.html?uid=${encodeURIComponent(c.userId)}`;

  const textEl = document.createElement('span');
  textEl.className = 'comment-text text-neutral-200';
  textEl.textContent = ` ${c.text || ''}`;

  line.appendChild(author);
  line.appendChild(textEl);

  const meta = document.createElement('div');
  meta.className = 'text-[11px] text-neutral-500 mt-1';
  meta.textContent = fmtTime(c.createdAt);

  body.appendChild(line);
  body.appendChild(meta);
  row.appendChild(body);

  return row;
}

/**
 * Create a post card DOM node using the shared #post-card-template on the page.
 * The caller must ensure a <template id="post-card-template"> exists in DOM.
 *
 * @param {ReturnType<typeof toPostModel>} post
 * @param {{
 *   currentUserId?: string|null,
 *   onToggleLike?: (post, nextLiked:boolean) => Promise<void>|void,
 *   onEdit?: (post, nextText:string) => Promise<void>|void,
 *   onDelete?: (post) => Promise<void>|void,
 *   onOpenPermalink?: (post) => void,
 *   onOpenComments?: (postId:string) => Promise<Array<{displayName:string,photoURL?:string,text:string,createdAt:any}>>|Array<any>,
 *   onSendComment?: (postId:string, text:string) => Promise<void>|void
 * }} actions
 */
export function createPostCard(post, actions = {}) {
  const tpl = document.getElementById('post-card-template');
  if (!tpl) {
    console.warn('[post-renderer] Missing #post-card-template');
    return document.createElement('div');
  }
  const frag = tpl.content.cloneNode(true);
  const root = frag.querySelector('article');
  root.dataset.postId = post.id;

  // --- Header
  const avatar = root.querySelector('.post-avatar');
  const author = root.querySelector('.post-author');
  const meta = root.querySelector('.post-meta');
  const badge = root.querySelector('.post-badge');

  avatar.src = post.photoURL || '/images/logo_white.png';
  author.textContent = post.displayName || 'Member';
  author.href = `./user-profile.html?uid=${encodeURIComponent(post.userId)}`;
  meta.textContent = `${fmtTime(post.createdAt)} • ${post.visibility === 'followers' ? 'Followers' : 'Public'}`;
  if (post.tags?.length) {
    badge.textContent = post.tags[0];
    badge.classList.remove('hidden');
  }

  // --- Body
  root.querySelector('.post-body').textContent = post.description || '';
  if (post.tags?.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'mt-2 flex flex-wrap gap-2';
    post.tags.slice(0,5).forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'px-2 py-0.5 rounded-lg border border-neutral-800 text-xs text-neutral-300';
      chip.textContent = `#${t}`;
      tagsWrap.appendChild(chip);
    });
    const insertBefore = root.querySelector('.post-image-wrap');
    if (insertBefore && !insertBefore.classList.contains('hidden')) insertBefore.before(tagsWrap);
    else root.appendChild(tagsWrap);
  }

  // --- Image(s) with simple carousel
  const imgWrap = root.querySelector('.post-image-wrap');
  const img = root.querySelector('.post-image');
  const imgs = Array.isArray(post.images) && post.images.length ? post.images : (post.imageURL ? [{ url: post.imageURL, path: post.imagePath }] : []);
  if (imgs.length) {
    imgWrap.classList.remove('hidden');
    img.src = imgs[0].url || imgs[0];
    img.alt = 'Post image';

    if (imgs.length > 1) {
      const nav = document.createElement('div');
      nav.className = 'absolute inset-0 flex items-center justify-between pointer-events-none';
      const mkBtn = (dir) => {
        const b = document.createElement('button');
        b.className = 'pointer-events-auto h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 border border-neutral-800 flex items-center justify-center text-white';
        b.innerHTML = dir < 0 ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M15 18 9 12l6-6"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6"/></svg>';
        return b;
      };
      const left = mkBtn(-1);
      const right = mkBtn(1);
      nav.appendChild(left);
      nav.appendChild(right);
      imgWrap.style.position = 'relative';
      imgWrap.appendChild(nav);
      let idx = 0;
      const setIdx = (next) => { idx = (next + imgs.length) % imgs.length; img.src = imgs[idx].url || imgs[idx]; };
      left.addEventListener('click', (e) => { e.preventDefault(); setIdx(idx - 1); });
      right.addEventListener('click', (e) => { e.preventDefault(); setIdx(idx + 1); });
    }
  }

  // --- Footer
  const likeBtn = root.querySelector('.post-like');
  const likeCountEl = root.querySelector('.post-like-count');
  const commentBtn = root.querySelector('.post-comment');
  const commentCountEl = root.querySelector('.post-comment-count');
  const permalink = root.querySelector('.post-permalink');

  likeCountEl.textContent = String(post.likes?.length || 0);
  commentCountEl.textContent = String(post.commentCount || 0);
  if (permalink) {
    permalink.href = `./post.html?id=${encodeURIComponent(post.id)}`;
    permalink.addEventListener('click', (e) => {
      // Meta/alt click is handled elsewhere; default here is navigate or callback
      if (actions.onOpenPermalink && !e.metaKey && !e.altKey) {
        e.preventDefault();
        actions.onOpenPermalink(post);
      }
    });
  }

  // Initial like state
  const youLiked = post.likes?.includes?.(actions.currentUserId);
  if (youLiked) likeBtn.classList.add('border-[var(--neon)]');

  likeBtn.addEventListener('click', async () => {
    const next = !likeBtn.classList.contains('border-[var(--neon)]');
    // Optimistic UI
    likeBtn.classList.toggle('border-[var(--neon)]', next);
    likeCountEl.textContent = String(
      Math.max(0, Number(likeCountEl.textContent || '0') + (next ? 1 : -1))
    );
    try {
      await actions.onToggleLike?.(post, next);
    } catch {
      // Revert on failure
      likeBtn.classList.toggle('border-[var(--neon)]', !next);
      likeCountEl.textContent = String(
        Math.max(0, Number(likeCountEl.textContent || '0') + (next ? -1 : 1))
      );
    }
  });

  // --- Comments (lazy open + send)
  const commentsSection = root.querySelector('.post-comments');
  const commentsList = root.querySelector('[data-comments-list]');
  const commentInput = root.querySelector('.comment-input');
  const commentSend = root.querySelector('.comment-submit');

  // In feed/profile we collapse comments by default; open, load, focus
  commentBtn.addEventListener('click', async () => {
    commentsSection.classList.remove('hidden');
    // Lazy-load comments just once
    if (!commentsSection._loaded) {
      try {
        const items = await (actions.onOpenComments?.(post.id) || []);
        items.forEach(c => commentsList.appendChild(renderCommentItem(c)));
        commentsSection._loaded = true;
      } catch { /* ignore */ }
    }
    commentInput?.focus();
  });

  // Send comment
  async function doSend() {
    const text = (commentInput?.value || '').trim();
    if (!text) return;
    commentSend.disabled = true;

    // Optimistic add
    const temp = renderCommentItem({
      userId: actions.currentUserId,
      displayName: actions.currentUserDisplayName || 'Member',
      photoURL: actions.currentUserPhoto || undefined,
      text,
      createdAt: new Date(),
    });
    commentsList.prepend(temp);
    commentInput.value = '';
    commentCountEl.textContent = String(Math.max(0, Number(commentCountEl.textContent || '0') + 1));

    try {
      await actions.onSendComment?.(post.id, text);
    } catch {
      // On failure, remove optimistic node and revert count
      temp.remove();
      commentCountEl.textContent = String(Math.max(0, Number(commentCountEl.textContent || '0') - 1));
    } finally {
      commentSend.disabled = false;
    }
  }

  commentSend?.addEventListener('click', (e) => { e.preventDefault(); doSend(); });
  commentInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  // --- Owner-only menu (Edit/Delete)
  const menuBtn = root.querySelector('.post-menu');
  const menu = root.querySelector('.post-menu-popover');
  const editBtn = root.querySelector('.post-edit');
  const delBtn = root.querySelector('.post-delete');

  const isOwner = actions.currentUserId && actions.currentUserId === post.userId;

  if (!isOwner) {
    // Hide owner-only controls
    editBtn.classList.add('hidden');
    delBtn.classList.add('hidden');
  } else {
    // Toggle menu (local — global close handled by listeners.js)
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = !menu.classList.contains('hidden');
      document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
      if (!isOpen) menu.classList.remove('hidden');
      const close = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== menuBtn) {
          menu.classList.add('hidden');
          document.removeEventListener('click', close, true);
        }
      };
      document.addEventListener('click', close, true);
    });

    // Inline edit or delegate to external modal
    editBtn.addEventListener('click', async () => {
      if (typeof actions.onStartEdit === 'function') {
        menu.classList.add('hidden');
        actions.onStartEdit(post, { root });
        return;
      }
      const body = root.querySelector('.post-body');
      const current = body?.textContent || '';
      const next = prompt('Edit your post:', current);
      if (next == null) return;
      try {
        await actions.onEdit?.(post, next);
        if (body) body.textContent = next;
      } finally {
        menu.classList.add('hidden');
      }
    });

    // Delete
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await actions.onDelete?.(post);
        // The caller often removes the card; do it here as a fallback:
        root.remove();
      } finally {
        menu.classList.add('hidden');
      }
    });
  }

  return root;
}

/* ----------------------- Convenience render helpers ---------------------- */
/**
 * Render an array of post models into a container.
 * @param {HTMLElement} container
 * @param {Array<ReturnType<typeof toPostModel>>} posts
 * @param {*} actions same callbacks as createPostCard
 */
export function renderPostList(container, posts, actions = {}) {
  const nodes = posts.map(p => createPostCard(p, actions));
  nodes.forEach(n => container.appendChild(n));
  return nodes;
}
