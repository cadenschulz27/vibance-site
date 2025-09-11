/**
 * @file /Social/social.js
 * @description Main controller for the Social page. It handles UI interactions,
 * orchestrates the post creation and feed loading processes, and manages all post interactions.
 */

import { auth } from '../api/firebase.js';
import { DataService } from './data-service.js';
import { PostRenderer } from './post-renderer.js';
import { ModalManager } from './modal-manager.js';
import { Listeners } from './listeners.js';
import { createAvatar } from './ui-helpers.js';

// --- STATE MANAGEMENT ---
let lastVisiblePost = null;
let isLoading = false;
let allPostsLoaded = false;
let activeOptionsMenu = null;
let activeFeedType = 'for-you'; // 'for-you' or 'following'

// --- DOM ELEMENTS ---
const feedContainer = document.getElementById('feed-container');
const createPostBar = document.getElementById('create-post-bar');
const loadMoreBtn = document.getElementById('load-more-btn');
const feedTabsContainer = document.querySelector('.feed-tabs');

/**
 * Main function to load posts based on the active feed type.
 */
async function loadPosts() {
    if (isLoading || allPostsLoaded) return;
    isLoading = true;
    if (loadMoreBtn) loadMoreBtn.textContent = 'Loading...';

    const fetchFunction = activeFeedType === 'following'
        ? DataService.fetchFollowingPosts
        : DataService.fetchPosts;

    const { posts, lastVisible } = await fetchFunction(lastVisiblePost);
    
    if (posts.length > 0) {
        lastVisiblePost = lastVisible;
        const postsWithAuthors = await Listeners.attachAuthorDetailsToPosts(posts);
        
        postsWithAuthors.forEach(post => {
            const postElement = document.createElement('div');
            postElement.innerHTML = PostRenderer.createPostHTML(post);
            feedContainer.appendChild(postElement.firstElementChild);
        });

        Listeners.startPostListeners(posts.map(p => p.id));
    }

    if (posts.length < 10) {
        allPostsLoaded = true;
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    isLoading = false;
    if (loadMoreBtn) loadMoreBtn.textContent = 'Load More';
}

/**
 * Resets the feed and loads posts for the newly selected tab.
 * @param {string} newFeedType - The type of feed to load ('for-you' or 'following').
 */
function switchFeed(newFeedType) {
    if (newFeedType === activeFeedType) return;

    activeFeedType = newFeedType;
    feedContainer.innerHTML = '';
    lastVisiblePost = null;
    allPostsLoaded = false;
    if (loadMoreBtn) loadMoreBtn.style.display = 'block';

    // Update tab UI
    document.querySelectorAll('.feed-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.feedType === newFeedType);
    });

    loadPosts();
}

/**
 * Sets up the event listener for the feed tabs.
 */
function setupTabEventListeners() {
    feedTabsContainer.addEventListener('click', (e) => {
        const target = e.target.closest('.feed-tab');
        if (target) {
            const feedType = target.dataset.feedType;
            switchFeed(feedType);
        }
    });
}

/**
 * Sets up the main event listener for all interactions within the feed.
 */
function setupFeedEventListeners() {
    feedContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const postId = target.dataset.postId;
        const postCard = document.getElementById(`post-${postId}`);

        switch (action) {
            case 'like-post':
                await DataService.toggleLike(postId);
                break;
            case 'comment-post':
                ModalManager.openCommentsModal(postId);
                break;
            case 'view-image':
                ModalManager.openCommentsModal(postId);
                break;
            case 'toggle-options':
                toggleOptionsMenu(postId);
                break;
            case 'edit-post':
                toggleEditMode(postCard, true);
                closeActiveOptionsMenu();
                break;
            case 'cancel-edit':
                toggleEditMode(postCard, false);
                break;
            case 'save-edit':
                const wrapper = postCard.querySelector('.post-description-wrapper');
                const textarea = wrapper.querySelector('.edit-textarea');
                await DataService.updatePost(postId, textarea.value);
                wrapper.querySelector('.view-mode span').textContent = textarea.value;
                toggleEditMode(postCard, false);
                break;
            case 'delete-post':
                if (confirm('Are you sure you want to delete this post?')) {
                    const imageUrl = target.dataset.imageUrl;
                    await DataService.deletePost(postId, imageUrl);
                    postCard.remove();
                }
                closeActiveOptionsMenu();
                break;
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-options')) {
            closeActiveOptionsMenu();
        }
    });
}

function toggleOptionsMenu(postId) {
    const menu = document.querySelector(`[data-menu-for-post="${postId}"]`);
    if (!menu) return;

    if (activeOptionsMenu && activeOptionsMenu !== menu) {
        activeOptionsMenu.classList.add('hidden');
    }

    menu.classList.toggle('hidden');
    activeOptionsMenu = menu.classList.contains('hidden') ? null : menu;
}

function closeActiveOptionsMenu() {
    if (activeOptionsMenu) {
        activeOptionsMenu.classList.add('hidden');
        activeOptionsMenu = null;
    }
}

function toggleEditMode(postCard, isEditing) {
    const wrapper = postCard.querySelector('.post-description-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('edit-active', isEditing);
    }
}

/**
 * Main initialization function for the social page.
 */
async function initSocialPage() {
    ModalManager.init();
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userProfile = await DataService.fetchUserProfile(user.uid);
            
            createPostBar.querySelector('.avatar-container').innerHTML = createAvatar(userProfile);
            createPostBar.addEventListener('click', () => {
                ModalManager.openCreatePostModal(userProfile);
            });

            document.addEventListener('feed-needs-refresh', () => {
                switchFeed('for-you'); // Refresh to the main feed
            });

            setupTabEventListeners();
            setupFeedEventListeners();
            loadPosts(); // Initial load
            if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadPosts);
        }
    });
}

document.addEventListener('DOMContentLoaded', initSocialPage);

