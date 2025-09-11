/**
 * @file /Social/user-profile.js
 * @description Controller for the user profile page. It fetches the user's profile
 * information, stats, and all of their posts, then renders them into the page.
 */

import { auth } from '../api/firebase.js';
import { DataService } from './data-service.js';
import { ModalManager } from './modal-manager.js';
import { createAvatar, createIcon } from './ui-helpers.js';

/**
 * Renders the user's profile information, stats, and action button into the header.
 * @param {object} userProfile - The user's profile data.
 * @param {Array<object>} userPosts - An array of the user's post objects.
 * @param {string} profileUserId - The ID of the user whose profile is being viewed.
 */
function renderProfileHeader(userProfile, userPosts, profileUserId) {
    const headerEl = document.getElementById('profile-header');
    const statsEl = document.getElementById('profile-stats');
    const actionsEl = document.getElementById('profile-actions');
    if (!headerEl || !statsEl || !actionsEl) return;

    // Render avatar and name
    headerEl.querySelector('.avatar-container').innerHTML = createAvatar(userProfile, 'w-full h-full');
    headerEl.querySelector('.profile-name-placeholder').textContent = userProfile.name || 'User Profile';

    // Render stats
    statsEl.innerHTML = `
        <div class="stat-item"><strong>${userPosts.length}</strong> posts</div>
        <div class="stat-item"><strong>${userProfile.followers.length}</strong> followers</div>
        <div class="stat-item"><strong>${userProfile.following.length}</strong> following</div>
    `;

    // Render action button (Follow/Unfollow or Edit Profile)
    const currentUser = auth.currentUser;
    if (currentUser) {
        if (currentUser.uid === profileUserId) {
            actionsEl.innerHTML = `<button class="profile-action-btn edit">Edit Profile</button>`;
        } else {
            const isFollowing = userProfile.followers.includes(currentUser.uid);
            actionsEl.innerHTML = `
                <button class="profile-action-btn ${isFollowing ? 'secondary' : 'primary'}" id="follow-btn" data-user-id="${profileUserId}">
                    ${isFollowing ? 'Following' : 'Follow'}
                </button>
            `;
            // Add event listener for the follow button
            document.getElementById('follow-btn').addEventListener('click', async (e) => {
                e.target.disabled = true;
                await DataService.toggleFollow(profileUserId);
                // Re-fetch data to update the button and counts
                initUserProfilePage(); 
            });
        }
    }
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

    const [userProfile, userPosts] = await Promise.all([
        DataService.fetchUserProfile(userId),
        DataService.fetchPostsByUserId(userId)
    ]);
    
    const postsWithAuthors = userPosts.map(post => ({ ...post, author: userProfile }));

    document.title = `${userProfile.name || 'User'} - Vibance`;
    renderProfileHeader(userProfile, postsWithAuthors, userId);
    renderPostsGrid(postsWithAuthors);

    const gridEl = document.getElementById('user-posts-grid');
    if (gridEl) {
        gridEl.addEventListener('click', (e) => {
            const postItem = e.target.closest('[data-action="view-post"]');
            if (postItem) {
                const postId = postItem.dataset.postId;
                ModalManager.openCommentsModal(postId);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initUserProfilePage);

