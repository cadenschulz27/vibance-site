// public/Social/my-activity.js
// ------------------------------------------------------------
// Vibance • My Activity page controller
// - Displays user's posts, likes, comments, and saved posts
// - Tabbed interface for filtering activity types
// - Real-time stats overview
// ------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loadSavedPosts, getPostsByIds } from './data-service.js';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ----------------------------- DOM -----------------------------
const els = {
  // Stats
  statPosts: document.getElementById('stat-posts'),
  statLikes: document.getElementById('stat-likes'),
  statComments: document.getElementById('stat-comments'),
  statSaved: document.getElementById('stat-saved'),

  // Tabs
  tabAll: document.getElementById('tab-all'),
  tabPosts: document.getElementById('tab-posts'),
  tabLikes: document.getElementById('tab-likes'),
  tabComments: document.getElementById('tab-comments'),
  tabSaved: document.getElementById('tab-saved'),

  // Content
  activityLoading: document.getElementById('activity-loading'),
  activityEmpty: document.getElementById('activity-empty'),
  activityList: document.getElementById('activity-list'),
  activityLoadMore: document.getElementById('activity-load-more'),
  btnLoadMore: document.getElementById('btn-load-more'),

  toast: document.getElementById('toast'),
};

// ----------------------------- State -----------------------------
let YOU = null;
let CURRENT_TAB = 'all';
let ACTIVITY_CURSOR = null;
let LOADING = false;
const PAGE_SIZE = 20;

// Cache for user profiles
const userCache = new Map();

// ----------------------------- Utils -----------------------------
function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2000);
}

function show(el, visible = true) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
}

function fmtTime(tsOrDate) {
  const d = tsOrDate?.toDate ? tsOrDate.toDate() : (tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate || 0));
  if (Number.isNaN(d.getTime())) return 'Just now';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

async function getUserProfile(uid) {
  if (userCache.has(uid)) return userCache.get(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const profile = snap.exists() ? snap.data() : {};
    userCache.set(uid, profile);
    return profile;
  } catch {
    return {};
  }
}

// ----------------------------- Stats -----------------------------
async function loadStats() {
  if (!YOU) return;

  try {
    // Count user's posts
    const postsSnap = await getDocs(
      query(collection(db, 'posts'), where('userId', '==', YOU.uid))
    );
    const postsCount = postsSnap.size;

    // Count likes given (posts where user is in likes array)
    const allPostsSnap = await getDocs(collection(db, 'posts'));
    let likesCount = 0;
    allPostsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.likes) && data.likes.includes(YOU.uid)) {
        likesCount++;
      }
    });

    // Count comments made
    let commentsCount = 0;
    for (const postDoc of allPostsSnap.docs) {
      const commentsSnap = await getDocs(
        query(
          collection(db, 'posts', postDoc.id, 'comments'),
          where('userId', '==', YOU.uid)
        )
      );
      commentsCount += commentsSnap.size;
    }

    // Count saved posts
    let savedCount = 0;
    try {
      const savedIds = await loadSavedPosts();
      if (Array.isArray(savedIds) && savedIds.length > 0) {
        const savedPosts = await getPostsByIds(savedIds);
        savedCount = Array.isArray(savedPosts) ? savedPosts.length : 0;
      }
    } catch (err) {
      console.warn('Failed to load saved posts stats', err);
    }

    // Update UI
    if (els.statPosts) els.statPosts.textContent = postsCount;
    if (els.statLikes) els.statLikes.textContent = likesCount;
    if (els.statComments) els.statComments.textContent = commentsCount;
    if (els.statSaved) els.statSaved.textContent = savedCount;
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// ----------------------------- Activity Loading -----------------------------
async function loadAllActivity(append = false) {
  if (!YOU || LOADING) return;
  LOADING = true;

  if (!append) {
    ACTIVITY_CURSOR = null;
    if (els.activityList) els.activityList.innerHTML = '';
  }

  show(els.activityLoading, !append);
  show(els.activityEmpty, false);
  show(els.activityList, append);

  try {
    const activities = [];

    // Fetch user's posts
    let postsQuery = query(
      collection(db, 'posts'),
      where('userId', '==', YOU.uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    if (ACTIVITY_CURSOR?.posts) {
      postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', YOU.uid),
        orderBy('createdAt', 'desc'),
        startAfter(ACTIVITY_CURSOR.posts),
        limit(PAGE_SIZE)
      );
    }
    const postsSnap = await getDocs(postsQuery);
    postsSnap.forEach(doc => {
      const data = doc.data();
      activities.push({
        type: 'post',
        id: doc.id,
        timestamp: data.createdAt,
        data: { ...data, postId: doc.id }
      });
    });
    if (postsSnap.docs.length > 0) {
      if (!ACTIVITY_CURSOR) ACTIVITY_CURSOR = {};
      ACTIVITY_CURSOR.posts = postsSnap.docs[postsSnap.docs.length - 1];
    }

    // Fetch liked posts (recent likes)
    const allPostsSnap = await getDocs(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100))
    );
    allPostsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.likes) && data.likes.includes(YOU.uid)) {
        activities.push({
          type: 'like',
          id: doc.id,
          timestamp: data.createdAt, // Approximation
          data: { ...data, postId: doc.id }
        });
      }
    });

    // Fetch recent comments
    for (const postDoc of allPostsSnap.docs) {
      const commentsSnap = await getDocs(
        query(
          collection(db, 'posts', postDoc.id, 'comments'),
          where('userId', '==', YOU.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
      );
      commentsSnap.forEach(commentDoc => {
        const commentData = commentDoc.data();
        const postData = postDoc.data();
        activities.push({
          type: 'comment',
          id: commentDoc.id,
          timestamp: commentData.createdAt,
          data: {
            ...commentData,
            commentId: commentDoc.id,
            postId: postDoc.id,
            postDescription: postData.description
          }
        });
      });
    }

    // Fetch saved posts as activity entries
    try {
      const savedIds = await loadSavedPosts();
      if (Array.isArray(savedIds) && savedIds.length > 0) {
        const savedPosts = await getPostsByIds(savedIds);
        savedPosts.forEach(post => {
          if (!post) return;
          activities.push({
            type: 'save',
            id: `save-${post.id}`,
            timestamp: post.createdAt,
            data: { ...post, postId: post.id }
          });
        });
      }
    } catch (err) {
      console.warn('Failed to load saved activity', err);
    }

    // Sort all activities by timestamp
    activities.sort((a, b) => {
      const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return bTime - aTime;
    });

    // Render
    if (activities.length === 0 && !append) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    await renderActivities(activities);
    show(els.activityLoading, false);
    show(els.activityList, true);
    show(els.activityLoadMore, activities.length >= PAGE_SIZE);
  } catch (e) {
    console.error('Failed to load activity:', e);
    if (e.message?.includes('index') && e.message?.includes('building')) {
      toast('Indexes are building. Please wait a few minutes and refresh.');
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      if (els.activityEmpty) {
        const emptyTitle = els.activityEmpty.querySelector('.activity-empty__title');
        const emptyDesc = els.activityEmpty.querySelector('.activity-empty__description');
        if (emptyTitle) emptyTitle.textContent = 'Building your activity feed...';
        if (emptyDesc) emptyDesc.textContent = 'Firebase is creating indexes for your data. This usually takes 5-15 minutes. Please refresh the page in a few moments.';
      }
    } else {
      toast('Failed to load activity');
      show(els.activityLoading, false);
    }
  } finally {
    LOADING = false;
  }
}

async function loadPostsActivity(append = false) {
  if (!YOU || LOADING) return;
  LOADING = true;

  if (!append) {
    ACTIVITY_CURSOR = null;
    if (els.activityList) els.activityList.innerHTML = '';
  }

  show(els.activityLoading, !append);
  show(els.activityEmpty, false);
  show(els.activityList, append);

  try {
    let postsQuery = query(
      collection(db, 'posts'),
      where('userId', '==', YOU.uid),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    if (ACTIVITY_CURSOR && append) {
      postsQuery = query(
        collection(db, 'posts'),
        where('userId', '==', YOU.uid),
        orderBy('createdAt', 'desc'),
        startAfter(ACTIVITY_CURSOR),
        limit(PAGE_SIZE)
      );
    }
    const snap = await getDocs(postsQuery);

    if (snap.empty && !append) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    const activities = snap.docs.map(doc => ({
      type: 'post',
      id: doc.id,
      timestamp: doc.data().createdAt,
      data: { ...doc.data(), postId: doc.id }
    }));

    await renderActivities(activities);
    ACTIVITY_CURSOR = snap.docs[snap.docs.length - 1] || null;

    show(els.activityLoading, false);
    show(els.activityList, true);
    show(els.activityLoadMore, snap.docs.length >= PAGE_SIZE);
  } catch (e) {
    console.error('Failed to load posts:', e);
    if (e.message?.includes('index') && e.message?.includes('building')) {
      toast('Indexes are building. Please wait a few minutes and refresh.');
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      if (els.activityEmpty) {
        const emptyTitle = els.activityEmpty.querySelector('.activity-empty__title');
        const emptyDesc = els.activityEmpty.querySelector('.activity-empty__description');
        if (emptyTitle) emptyTitle.textContent = 'Building your activity feed...';
        if (emptyDesc) emptyDesc.textContent = 'Firebase is creating indexes for your data. This usually takes 5-15 minutes. Please refresh the page in a few moments.';
      }
    } else {
      toast('Failed to load posts');
      show(els.activityLoading, false);
    }
  } finally {
    LOADING = false;
  }
}

async function loadLikesActivity() {
  if (!YOU || LOADING) return;
  LOADING = true;

  ACTIVITY_CURSOR = null;
  if (els.activityList) els.activityList.innerHTML = '';

  show(els.activityLoading, true);
  show(els.activityEmpty, false);

  try {
    const allPostsSnap = await getDocs(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(200))
    );
    const activities = [];

    allPostsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.likes) && data.likes.includes(YOU.uid)) {
        activities.push({
          type: 'like',
          id: doc.id,
          timestamp: data.createdAt,
          data: { ...data, postId: doc.id }
        });
      }
    });

    if (activities.length === 0) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    await renderActivities(activities);
    show(els.activityLoading, false);
    show(els.activityList, true);
    show(els.activityLoadMore, false);
  } catch (e) {
    console.error('Failed to load likes:', e);
    if (e.message?.includes('index') && e.message?.includes('building')) {
      toast('Indexes are building. Please wait a few minutes and refresh.');
    } else {
      toast('Failed to load likes');
    }
    show(els.activityLoading, false);
  } finally {
    LOADING = false;
  }
}

async function loadCommentsActivity() {
  if (!YOU || LOADING) return;
  LOADING = true;

  ACTIVITY_CURSOR = null;
  if (els.activityList) els.activityList.innerHTML = '';

  show(els.activityLoading, true);
  show(els.activityEmpty, false);

  try {
    const activities = [];
    const allPostsSnap = await getDocs(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100))
    );

    for (const postDoc of allPostsSnap.docs) {
      const commentsSnap = await getDocs(
        query(
          collection(db, 'posts', postDoc.id, 'comments'),
          where('userId', '==', YOU.uid),
          orderBy('createdAt', 'desc')
        )
      );
      commentsSnap.forEach(commentDoc => {
        const commentData = commentDoc.data();
        const postData = postDoc.data();
        activities.push({
          type: 'comment',
          id: commentDoc.id,
          timestamp: commentData.createdAt,
          data: {
            ...commentData,
            commentId: commentDoc.id,
            postId: postDoc.id,
            postDescription: postData.description
          }
        });
      });
    }

    activities.sort((a, b) => {
      const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return bTime - aTime;
    });

    if (activities.length === 0) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    await renderActivities(activities);
    show(els.activityLoading, false);
    show(els.activityList, true);
    show(els.activityLoadMore, false);
  } catch (e) {
    console.error('Failed to load comments:', e);
    if (e.message?.includes('index') && e.message?.includes('building')) {
      toast('Indexes are building. Please wait a few minutes and refresh.');
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      if (els.activityEmpty) {
        const emptyTitle = els.activityEmpty.querySelector('.activity-empty__title');
        const emptyDesc = els.activityEmpty.querySelector('.activity-empty__description');
        if (emptyTitle) emptyTitle.textContent = 'Building your activity feed...';
        if (emptyDesc) emptyDesc.textContent = 'Firebase is creating indexes for your data. This usually takes 5-15 minutes. Please refresh the page in a few moments.';
      }
    } else {
      toast('Failed to load comments');
      show(els.activityLoading, false);
    }
  } finally {
    LOADING = false;
  }
}

async function loadSavedActivity() {
  if (!YOU || LOADING) return;
  LOADING = true;

  ACTIVITY_CURSOR = null;
  if (els.activityList) els.activityList.innerHTML = '';

  show(els.activityLoading, true);
  show(els.activityEmpty, false);

  try {
    const savedIds = await loadSavedPosts();

    if (!Array.isArray(savedIds) || savedIds.length === 0) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    const posts = await getPostsByIds(savedIds);
    const activities = posts
      .filter(Boolean)
      .map(post => ({
        type: 'save',
        id: `save-${post.id}`,
        timestamp: post.createdAt,
        data: { ...post, postId: post.id }
      }));

    activities.sort((a, b) => {
      const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return bTime - aTime;
    });

    if (activities.length === 0) {
      show(els.activityLoading, false);
      show(els.activityEmpty, true);
      show(els.activityLoadMore, false);
      return;
    }

    await renderActivities(activities);
    show(els.activityLoading, false);
    show(els.activityList, true);
    show(els.activityLoadMore, false);
  } catch (e) {
    console.error('Failed to load saved posts:', e);
    if (e.message?.includes('index') && e.message?.includes('building')) {
      toast('Indexes are building. Please wait a few minutes and refresh.');
    } else {
      toast('Failed to load saved posts');
    }
    show(els.activityLoading, false);
  } finally {
    LOADING = false;
  }
}

// ----------------------------- Rendering -----------------------------
async function renderActivities(activities) {
  if (!els.activityList) return;

  for (const activity of activities) {
    const item = await createActivityItem(activity);
    if (item) els.activityList.appendChild(item);
  }
}

async function createActivityItem(activity) {
  const div = document.createElement('div');
  div.className = 'activity-item';

  const { type, timestamp, data } = activity;
  const time = fmtTime(timestamp);

  let typeLabel = '';
  let typeIcon = '';
  let typeClass = '';
  let content = '';

  switch (type) {
    case 'post':
      typeLabel = 'Posted';
      typeClass = 'post';
      typeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
      </svg>`;
      content = `<p>${escapeHtml(data.description || 'No description')}</p>`;
      
      if (data.images && data.images.length > 0) {
        const imageHtml = data.images.map(img => 
          `<img src="${img.url}" alt="Post image" class="activity-item__image" />`
        ).join('');
        content += `<div class="activity-item__images">${imageHtml}</div>`;
      }
      
      content += `<div class="activity-item__actions">
        <button class="activity-item__action" onclick="window.location.href='/Social/social.html'">View Post</button>
      </div>`;
      break;

    case 'like':
      typeLabel = 'Liked a post';
      typeClass = 'like';
      typeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>`;
      content = `<div class="activity-item__post-preview">${escapeHtml(data.description || 'No description')}</div>`;
      content += `<div class="activity-item__actions">
        <button class="activity-item__action" onclick="window.location.href='/Social/social.html'">View Post</button>
      </div>`;
      break;

    case 'comment':
      typeLabel = 'Commented';
      typeClass = 'comment';
      typeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>`;
      content = `<p>${escapeHtml(data.text || 'No comment text')}</p>`;
      if (data.postDescription) {
        content += `<div class="activity-item__post-preview">On: ${escapeHtml(data.postDescription)}</div>`;
      }
      content += `<div class="activity-item__actions">
        <button class="activity-item__action" onclick="window.location.href='/Social/social.html'">View Post</button>
      </div>`;
      break;

    case 'save':
      typeLabel = 'Saved a post';
      typeClass = 'save';
      typeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>`;
      content = `<div class="activity-item__post-preview">${escapeHtml(data.description || 'No description')}</div>`;
      content += `<div class="activity-item__actions">
        <button class="activity-item__action" onclick="window.location.href='/Social/social.html'">View Post</button>
      </div>`;
      break;
  }

  div.innerHTML = `
    <div class="activity-item__header">
      <div class="activity-item__type-icon activity-item__type-icon--${typeClass}">
        ${typeIcon}
      </div>
      <div class="activity-item__meta">
        <p class="activity-item__type">${typeLabel}</p>
        <time class="activity-item__time">${time}</time>
      </div>
    </div>
    <div class="activity-item__content">
      ${content}
    </div>
  `;

  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ----------------------------- Tab Switching -----------------------------
function switchTab(tabName) {
  CURRENT_TAB = tabName;

  // Update tab UI
  document.querySelectorAll('.activity-tab').forEach(tab => {
    tab.classList.remove('activity-tab--active');
  });
  const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeTab) activeTab.classList.add('activity-tab--active');

  // Load corresponding activity
  switch (tabName) {
    case 'all':
      loadAllActivity(false);
      break;
    case 'posts':
      loadPostsActivity(false);
      break;
    case 'likes':
      loadLikesActivity();
      break;
    case 'comments':
      loadCommentsActivity();
      break;
    case 'saved':
      loadSavedActivity();
      break;
  }
}

// ----------------------------- Wiring -----------------------------
function wireUI() {
  els.tabAll?.addEventListener('click', () => switchTab('all'));
  els.tabPosts?.addEventListener('click', () => switchTab('posts'));
  els.tabLikes?.addEventListener('click', () => switchTab('likes'));
  els.tabComments?.addEventListener('click', () => switchTab('comments'));
  els.tabSaved?.addEventListener('click', () => switchTab('saved'));

  els.btnLoadMore?.addEventListener('click', () => {
    if (CURRENT_TAB === 'all') loadAllActivity(true);
    else if (CURRENT_TAB === 'posts') loadPostsActivity(true);
  });

  // Refresh button
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh?.addEventListener('click', () => {
    location.reload();
  });
}

// ----------------------------- Init -----------------------------
function init() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }

    YOU = user;
    wireUI();
    await loadStats();
    await loadAllActivity(false);
  });
}

document.addEventListener('DOMContentLoaded', init);
