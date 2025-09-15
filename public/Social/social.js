// public/Social/social.js
// --------------------------------------------------------------------
// Vibance Community • Main feed controller
// - Composer: text, image attach/preview, visibility, tags
// - Feed: paginated posts with like/comment/edit/delete
// - Suggestions: quick follow/unfollow
// - All reads/writes go through ./data-service.js (rules-safe)
// --------------------------------------------------------------------

import { auth } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import * as DS from './data-service.js';
import { createPostCard, toPostModel, renderCommentItem } from './post-renderer.js';
import { toast, debounce, qsa } from './ui-helpers.js';

/* ------------------------------- DOM refs ------------------------------- */
const els = {
  // Composer
  composer: document.getElementById('composer'),
  text: document.getElementById('post-text'),
  file: document.getElementById('post-file'),
  attach: document.getElementById('btn-attach'),
  removeImage: document.getElementById('remove-image'),
  imgWrap: document.getElementById('image-preview'),
  img: document.getElementById('image-preview-img'),
  imgName: document.getElementById('image-filename'),
  vis: document.getElementById('visibility'),
  tags: document.getElementById('tags'),
  youAvatar: document.getElementById('you-avatar'),
  btnPost: document.getElementById('btn-post'),

  // Feed
  list: document.getElementById('feed-list'),
  empty: document.getElementById('feed-empty'),
  more: document.getElementById('load-more'),

  // Suggestions
  sugWrap: document.getElementById('suggested-users'),
  sugTpl: document.getElementById('suggestion-card-template'),

  // Shared toast
  toast: document.getElementById('toast'),
};

/* -------------------------------- State --------------------------------- */
let YOU = null;
let ME_PROFILE = null; // your user doc (for photo/username)
let FEED_CURSOR = null;
let FEED_LOADING = false;
let SUG_CURSOR = null;
let FOLLOWING = [];

/* ------------------------------- Utilities ------------------------------ */
const parseTags = (s) => (s || '')
  .split(',')
  .map(t => t.trim().toLowerCase())
  .filter(Boolean)
  .slice(0, 5);

function show(el, yes = true) { if (el) el.classList.toggle('hidden', !yes); }
function resetComposer() {
  if (els.text) els.text.value = '';
  if (els.tags) els.tags.value = '';
  if (els.vis) els.vis.value = 'public';
  clearImage();
}
function setImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  els.img.src = url;
  els.imgName.textContent = file.name;
  show(els.imgWrap, true);
}
function clearImage() {
  els.file.value = '';
  els.img.src = '';
  els.imgName.textContent = '';
  show(els.imgWrap, false);
}

/* --------------------------- Suggestions (right) ------------------------ */
function suggestionCard(user) {
  const frag = els.sugTpl.content.cloneNode(true);
  const root = frag.querySelector('article');
  const avatar = root.querySelector('.sug-avatar');
  const name = root.querySelector('.sug-name');
  const sub = root.querySelector('.sug-sub');
  const follow = root.querySelector('.sug-follow');
  const unfollow = root.querySelector('.sug-unfollow');
  const links = root.querySelectorAll('a');

  const display = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Member';
  const uname = user.username ? `@${user.username}` : (user.email || 'Active member');
  avatar.src = user.photoURL || '/images/logo_white.png';
  name.textContent = display;
  sub.textContent = uname;
  links.forEach(a => a.href = `./user-profile.html?uid=${encodeURIComponent(user.id)}`);

  const canFollow = YOU && user.id !== YOU.uid;
  const already = FOLLOWING.includes(user.id);
  show(follow, canFollow && !already);
  show(unfollow, canFollow && already);

  follow?.addEventListener('click', async () => {
    follow.disabled = true;
    try {
      FOLLOWING = await DS.updateFollowing(user.id, { follow: true });
      show(follow, false); show(unfollow, true);
      toast(`Following ${display}`);
    } catch { toast('Could not follow'); }
    finally { follow.disabled = false; }
  });

  unfollow?.addEventListener('click', async () => {
    unfollow.disabled = true;
    try {
      FOLLOWING = await DS.updateFollowing(user.id, { follow: false });
      show(unfollow, false); show(follow, true);
      toast(`Unfollowed ${display}`);
    } catch { toast('Could not unfollow'); }
    finally { unfollow.disabled = false; }
  });

  return root;
}

async function loadSuggestions(initial = false) {
  try {
    const page = await DS.fetchUsersPage({ after: initial ? null : SUG_CURSOR, pageSize: 12 });
    SUG_CURSOR = page.cursor;
    const items = (page.items || []).filter(u => u.id !== YOU?.uid);
    items.forEach(u => els.sugWrap.appendChild(suggestionCard(u)));
  } catch (e) {
    console.error('suggestions', e);
  }
}

/* ------------------------------ Feed render ----------------------------- */
function mountPostCard(pModel) {
  const card = createPostCard(pModel, {
    currentUserId: YOU?.uid,
    currentUserPhoto: (ME_PROFILE?.photoURL || YOU?.photoURL || ''),
    onToggleLike: async (post, nextLiked) => {
      await DS.toggleLike(post.id, nextLiked);
    },
    onEdit: async (post, newText) => {
      await DS.updatePostDescription(post.id, newText);
      toast('Updated');
    },
    onDelete: async (post) => {
      await DS.deletePost(post);
      toast('Deleted');
    },
    onOpenPermalink: (post) => {
      location.href = `./post.html?id=${encodeURIComponent(post.id)}`;
    },
    onOpenComments: async (postId) => {
      // Return latest comments for the renderer to mount
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
      await DS.addComment(postId, text);
    },
  });

  els.list.appendChild(card);
}

async function loadFeed(next = false) {
  if (FEED_LOADING) return;
  FEED_LOADING = true;
  show(els.more, false);

  try {
    const { items, cursor } = await DS.fetchPostsPage({
      after: next ? FEED_CURSOR : null,
      pageSize: 12
    });
    FEED_CURSOR = cursor;

    if (!next) els.list.innerHTML = '';

    if (!items.length && els.list.children.length === 0) {
      show(els.empty, true);
      return;
    }

    show(els.empty, false);
    items.forEach(p => mountPostCard(toPostModel(p.id, p)));
    show(els.more, !!FEED_CURSOR);
  } catch (e) {
    console.error('feed load failed', e);
    toast('Failed to load feed');
  } finally {
    FEED_LOADING = false;
  }
}

/* -------------------------------- Composer ------------------------------ */
function wireComposer() {
  // avatar
  if (els.youAvatar && YOU?.photoURL) els.youAvatar.src = YOU.photoURL;

  // attach image
  els.attach?.addEventListener('click', () => els.file?.click());
  els.file?.addEventListener('change', () => {
    const f = els.file.files?.[0];
    if (f) setImage(f);
  });
  els.removeImage?.addEventListener('click', clearImage);

  // submit
  els.composer?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!YOU) return;
    const description = (els.text?.value || '').trim();
    if (!description) return;

    const visibility = els.vis?.value === 'followers' ? 'followers' : 'public';
    const tags = parseTags(els.tags?.value || '');
    const file = els.file?.files?.[0] || null;

    els.btnPost.disabled = true;
    try {
      await DS.createPost({ description, visibility, tags, file });
      toast('Posted ✓');
      resetComposer();
      // Reload first page fresh
      FEED_CURSOR = null;
      await loadFeed(false);
      // Smooth scroll to top of feed
      els.list?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      toast('Post failed');
    } finally {
      els.btnPost.disabled = false;
    }
  });
}

/* --------------------------------- Wiring -------------------------------- */
function wireUI() {
  els.more?.addEventListener('click', () => loadFeed(true));

  // Optional: lazy-load more suggestions when scrolled near end of rail
  const onScroll = debounce(() => {
    const rail = els.sugWrap;
    if (!rail) return;
    const nearEnd = rail.scrollTop + rail.clientHeight >= rail.scrollHeight - 64;
    if (nearEnd && SUG_CURSOR) loadSuggestions(false);
  }, 150);
  els.sugWrap?.addEventListener('scroll', onScroll);
}

/* ---------------------------------- Boot --------------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // auth-check will handle redirect if needed
  YOU = user;

  // Attempt to load your following list so suggestions can reflect state
  try {
    const me = await DS.loadUser(user.uid);
    ME_PROFILE = me || {};
    FOLLOWING = Array.isArray(me?.following) ? me.following : [];
  } catch {
    FOLLOWING = [];
  }

  wireComposer();
  wireUI();

  // Initial loads
  await loadFeed(false);
  await loadSuggestions(true);
});

/* --------------------------- Small progressive tweaks -------------------- */
// In case feed cards are dynamically removed (delete), hide empty-state if needed
const mo = new MutationObserver(() => {
  const anyCards = qsa('article.glass', els.list).length > 0;
  show(els.empty, !anyCards);
});
mo.observe(els.list || document.body, { childList: true, subtree: true });
