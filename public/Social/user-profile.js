/**
 * @file /Social/user-profile.js
 * @description Controller for the user profile page. It fetches the user's profile
 * information and all of their posts, then renders them into the page.
 */

import { DataService } from './data-service.js';
import { ModalManager } from './modal-manager.js';
import { createAvatar, createIcon } from './ui-helpers.js';

/**
 * Renders the user's profile information into the header.
 * @param {object} userProfile - The user's profile data.
 */
function renderProfileHeader(userProfile) {
    const headerEl = document.getElementById('profile-header');
    if (!headerEl) return;

    headerEl.innerHTML = `
        <div class="avatar-container">
            ${createAvatar(userProfile, 'w-full h-full')}
        </div>
        <h1 class="profile-name">${userProfile.name || 'User Profile'}</h1>
    `;
}

/**
 * Renders a grid of the user's posts.
 * @param {Array<object>} posts - An array of the user's post objects.
 */
function renderPostsGrid(posts) {
    const gridEl = document.getElementById('user-posts-grid');
    if (!gridEl) return;

    if (posts.length === 0) {
        gridEl.innerHTML = `<p class="no-posts-message">This user hasn't posted anything yet.</p>`;
        return;
    }

    gridEl.innerHTML = posts.map(post => `
        <div class="profile-post-item" data-action="view-post" data-post-id="${post.id}">
            <img src="${post.data.imageUrl}" alt="Post by ${post.author.name}">
            <div class="profile-post-overlay">
                <div class="overlay-stat">
                    ${createIcon('liked', 'w-6 h-6')}
                    <span>${post.data.likes.length}</span>
                </div>
                <div class="overlay-stat">
                    ${createIcon('comment', 'w-6 h-6')}
                    <span>${post.data.commentCount}</span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Main initialization function for the user profile page.
 */
async function initUserProfilePage() {
    ModalManager.init();
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');

    if (!userId) {
        document.querySelector('main').innerHTML = '<p class="text-center text-danger-color">User not found.</p>';
        return;
    }

    // Fetch user profile and posts in parallel for efficiency
    const [userProfile, userPosts] = await Promise.all([
        DataService.fetchUserProfile(userId),
        DataService.fetchPostsByUserId(userId)
    ]);
    
    // Attach author details to each post (even though it's the same author)
    // This keeps our post object structure consistent.
    const postsWithAuthors = userPosts.map(post => ({ ...post, author: userProfile }));

    document.title = `${userProfile.name || 'User'} - Vibance`;
    renderProfileHeader(userProfile);
    renderPostsGrid(postsWithAuthors);

    // Add a single event listener to the grid for opening the comments modal
    const gridEl = document.getElementById('user-posts-grid');
    gridEl.addEventListener('click', (e) => {
        const postItem = e.target.closest('[data-action="view-post"]');
        if (postItem) {
            const postId = postItem.dataset.postId;
            ModalManager.openCommentsModal(postId);
        }
    });
}

document.addEventListener('DOMContentLoaded', initUserProfilePage);

