// public/Social/post-renderer.js
// ------------------------------------------------------------
// Pure UI renderer for Vibance Community posts & comments.
// - No Firebase imports: you pass callbacks for actions.
// - Uses the <template id="post-card-template"> in social.html.
// - Safe defaults to keep working even if the template is absent.
// ------------------------------------------------------------

/**
 * @typedef {Object} PostModel
 * @property {string} id
 * @property {string} userId
 * @property {string} displayName
 * @property {string} photoURL
 * @property {string} description
 * @property {'public'|'followers'} visibility
 * @property {Array<string>} tags
 * @property {string|null} imageURL
 * @property {string|null} imagePath
 * @property {Array<string>} likes
 * @property {number} commentCount
 * @property {any} createdAt  // Firestore TS or ISO/date
 */

/**
 * @typedef {Object} CommentModel
 * @property {string} userId
 * @property {string} displayName
 * @property {string} photoURL
 * @property {string} text
 * @property {any} createdAt // Firestore TS or ISO/date
 */

/**
 * @typedef {Object} PostRenderOptions
 * @property {string=} currentUserId
 * @property {(post: PostModel, nextLiked: boolean) => Promise<void>|void=} onToggleLike
 * @property {(post: PostModel, newText: string) => Promise<void>|void=} onEdit
 * @property {(post: PostModel) => Promise<void>|void=} onDelete
 * @property {(post: PostModel) => void=} onOpenPermalink
 * @property {(postId: string) => Promise<CommentModel[]>|Promise<void>|void=} onOpenComments  // return list (optional)
 * @property {(postId: string, text: string) => Promise<void>|void=} onSendComment
 */

/* --------------------------- Utilities --------------------------- */
function fmtTime(tsOrDate) {
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : (tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate || 0));
  if (Number.isNaN(d.getTime())) return 'Just now';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function titleCase(s = '') {
  return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

function cloneTemplate() {
  const t = document.getElementById('post-card-template');
  if (t?.content) return /** @type {DocumentFragment} */ (t.content.cloneNode(true));
  // Fallback minimal card if template missing
  const frag = document.createDocumentFragment();
  const art = document.createElement('article');
  art.className = 'glass p-4 md:p-5';
  art.innerHTML = `
    <header class="flex items-center gap-3">
      <img class="post-avatar h-10 w-10 rounded-full bg-neutral-900 border border-neutral-800" alt="Avatar">
      <div>
        <div class="post-author font-medium"></div>
        <div class="post-meta text-xs text-neutral-500"></div>
      </div>
    </header>
    <div class="post-body text-neutral-100 mt-3 whitespace-pre-wrap"></div>
    <figure class="post-image-wrap mt-3 hidden"><img class="post-image w-full rounded-xl border border-neutral-800"></figure>
    <footer class="mt-4 flex items-center justify-between">
      <button class="post-like px-3 py-1.5 rounded-lg border border-neutral-800 text-sm">♥ <span class="post-like-count">0</span></button>
      <button class="post-comment px-3 py-1.5 rounded-lg border border-neutral-800 text-sm">💬 <span class="post-comment-count">0</span></button>
      <a class="post-permalink text-xs text-neutral-400 hover:text-white" href="#">Open</a>
    </footer>
    <section class="post-comments mt-4 hidden">
      <div class="space-y-3" data-comments-list></div>
      <div class="mt-3 flex items-start gap-2">
        <input class="comment-input flex-1 bg-neutral-950/70 border border-neutral-800 rounded-xl px-3 py-2 text-sm" placeholder="Write a comment…">
        <button class="comment-submit px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm">Send</button>
      </div>
    </section>
  `;
  frag.appendChild(art);
  return frag;
}

/* --------------------------- Comments --------------------------- */
export function renderCommentItem(c /** @type {CommentModel} */) {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-start gap-3';
  wrap.innerHTML = `
    <img class="h-8 w-8 rounded-full object-cover bg-neutral-900 border border-neutral-800"
         src="${c.photoURL || '/images/logo_white.png'}" alt="">
    <div class="flex-1">
      <div class="text-sm">
        <span class="font-medium">${c.displayName || 'Member'}</span>
        <span class="text-neutral-500 text-xs">• ${fmtTime(c.createdAt)}</span>
      </div>
      <div class="text-sm text-neutral-200 whitespace-pre-wrap">${c.text || ''}</div>
    </div>
  `;
  return wrap;
}

/* ----------------------------- Post ----------------------------- */
export function createPostCard(post /** @type {PostModel} */, opts /** @type {PostRenderOptions} */ = {}) {
  const {
    currentUserId,
    onToggleLike,
    onEdit,
    onDelete,
    onOpenPermalink,
    onOpenComments,
    onSendComment,
  } = opts;

  const frag = cloneTemplate();
  const root = frag.querySelector('article') || frag.firstElementChild;

  // Header
  const avatar = root.querySelector('.post-avatar');
  const author = root.querySelector('.post-author');
  const meta = root.querySelector('.post-meta');
  const badge = root.querySelector('.post-badge');
  const menuBtn = root.querySelector('.post-menu');
  const menu = root.querySelector('.post-menu-popover');
  const editBtn = root.querySelector('.post-edit');
  const delBtn = root.querySelector('.post-delete');

  if (avatar) avatar.src = post.photoURL || '/images/logo_white.png';
  if (author) {
    author.textContent = post.displayName || 'Member';
    author.href = `./user-profile.html?uid=${encodeURIComponent(post.userId)}`;
  }
  if (meta) meta.textContent = `${fmtTime(post.createdAt)} • ${post.visibility === 'followers' ? 'Followers' : 'Public'}`;

  if (badge && post.tags?.length) {
    badge.textContent = titleCase(post.tags[0]);
    badge.classList.remove('hidden');
  }

  // Body
  const body = root.querySelector('.post-body');
  if (body) body.textContent = post.description || '';

  // Image
  const imgWrap = root.querySelector('.post-image-wrap');
  const img = root.querySelector('.post-image');
  if (post.imageURL && img && imgWrap) {
    img.src = post.imageURL;
    imgWrap.classList.remove('hidden');
  }

  // Actions
  const likeBtn = root.querySelector('.post-like');
  const likeCountEl = root.querySelector('.post-like-count');
  const commentBtn = root.querySelector('.post-comment');
  const commentCountEl = root.querySelector('.post-comment-count');
  const permalink = root.querySelector('.post-permalink');

  if (likeCountEl) likeCountEl.textContent = String(post.likes?.length || 0);
  if (commentCountEl) commentCountEl.textContent = String(post.commentCount || 0);
  if (permalink) {
    permalink.href = `./post.html?id=${encodeURIComponent(post.id)}`;
    if (onOpenPermalink) {
      permalink.addEventListener('click', (e) => { e.preventDefault(); onOpenPermalink(post); });
    }
  }

  const youLiked = !!post.likes?.includes(currentUserId || '');
  if (youLiked && likeBtn) likeBtn.classList.add('border-[var(--neon)]');

  likeBtn?.addEventListener('click', async () => {
    if (!onToggleLike) return;
    const next = !likeBtn.classList.contains('border-[var(--neon)]');
    // Optimistic UI
    likeBtn.classList.toggle('border-[var(--neon)]', next);
    if (likeCountEl) {
      const prev = Number(likeCountEl.textContent || '0');
      likeCountEl.textContent = String(Math.max(0, prev + (next ? 1 : -1)));
    }
    try {
      await onToggleLike(post, next);
    } catch {
      // revert on failure
      likeBtn.classList.toggle('border-[var(--neon)]', !next);
      if (likeCountEl) {
        const prev = Number(likeCountEl.textContent || '0');
        likeCountEl.textContent = String(Math.max(0, prev + (next ? -1 : 1)));
      }
    }
  });

  // Comments
  const commentsSection = root.querySelector('.post-comments');
  const commentsList = root.querySelector('[data-comments-list]');
  const commentInput = root.querySelector('.comment-input');
  const commentSubmit = root.querySelector('.comment-submit');

  let commentsOpen = false;
  commentBtn?.addEventListener('click', async () => {
    commentsOpen = !commentsOpen;
    commentsSection?.classList.toggle('hidden', !commentsOpen);
    if (commentsOpen && commentsList && commentsList.childElementCount === 0 && onOpenComments) {
      try {
        const res = await onOpenComments(post.id);
        if (Array.isArray(res)) {
          res.forEach(c => commentsList.appendChild(renderCommentItem(c)));
        }
      } catch { /* ignore */ }
    }
  });

  commentSubmit?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!onSendComment || !commentInput) return;
    const text = (commentInput.value || '').trim();
    if (!text) return;
    commentSubmit.disabled = true;
    try {
      await onSendComment(post.id, text);
      // optimistic add
      commentsList?.prepend(renderCommentItem({
        userId: currentUserId || '',
        displayName: 'You',
        photoURL: '/images/logo_white.png',
        text,
        createdAt: new Date(),
      }));
      commentInput.value = '';
      if (commentCountEl) {
        const prev = Number(commentCountEl.textContent || '0');
        commentCountEl.textContent = String(prev + 1);
      }
    } finally {
      commentSubmit.disabled = false;
    }
  });

  // Menu (edit/delete) – show only for owner
  if (currentUserId !== post.userId) {
    editBtn?.classList.add('hidden');
    delBtn?.classList.add('hidden');
  } else {
    menuBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const open = !menu?.classList.contains('hidden');
      document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
      if (!open) menu?.classList.remove('hidden');
      const close = (ev) => {
        if (menu && !menu.contains(ev.target) && ev.target !== menuBtn) {
          menu.classList.add('hidden');
          document.removeEventListener('click', close, true);
        }
      };
      document.addEventListener('click', close, true);
    });

    editBtn?.addEventListener('click', async () => {
      if (!onEdit) return;
      const next = prompt('Edit your post:', post.description || '');
      if (next == null) return;
      try {
        await onEdit(post, next);
        if (body) body.textContent = next;
      } finally {
        menu?.classList.add('hidden');
      }
    });

    delBtn?.addEventListener('click', async () => {
      if (!onDelete) return;
      if (!confirm('Delete this post?')) return;
      try {
        await onDelete(post);
        root.remove();
      } finally {
        menu?.classList.add('hidden');
      }
    });
  }

  return /** @type {HTMLElement} */ (root);
}

/* ------------- Optional helpers to standardize models ------------- */
export function toPostModel(id, data = {}) {
  return /** @type {PostModel} */ ({
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
    commentCount: Number(data.commentCount || 0),
  });
}
