/**
 * @file /Social/follow-list.js
 * @description Controller for the followers/following list page. It fetches and
 * displays the list of users and handles follow/unfollow interactions.
 */

import { auth } from '../api/firebase.js';
import { DataService } from './data-service.js';
import { createAvatar } from './ui-helpers.js';

// --- DOM ELEMENTS ---
const backLink = document.getElementById('back-link');
const listTitle = document.getElementById('list-title');
const userListContainer = document.getElementById('user-list');

/**
 * Renders a list of user profiles.
 * @param {Array<object>} userProfiles - An array of user profile objects to display.
 * @param {object} currentUserProfile - The profile of the currently logged-in user.
 */
function renderUserList(userProfiles, currentUserProfile) {
    if (!userListContainer) return;

    if (userProfiles.length === 0) {
        userListContainer.innerHTML = `<p class="text-center p-8 text-secondary-text-color">No users found.</p>`;
        return;
    }

    userListContainer.innerHTML = userProfiles.map(profile => {
        const isCurrentUser = auth.currentUser.uid === profile.id;
        let followButton = '';

        if (!isCurrentUser) {
            const isFollowing = currentUserProfile.following.includes(profile.id);
            followButton = `
                <button class="follow-btn ${isFollowing ? 'secondary' : ''}" data-action="toggle-follow" data-user-id="${profile.id}">
                    ${isFollowing ? 'Following' : 'Follow'}
                </button>
            `;
        }

        return `
            <div class="user-list-item">
                <a href="/Social/user-profile.html?id=${profile.id}" class="author-details">
                    ${createAvatar(profile.data, 'h-10 w-10')}
                    <span class="author-name">${profile.data.name || 'Anonymous'}</span>
                </a>
                ${followButton}
            </div>
        `;
    }).join('');
}


/**
 * Main initialization function for the follow list page.
 */
async function initFollowListPage() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');
    const type = params.get('type'); // 'followers' or 'following'

    if (!userId || !type) {
        document.querySelector('main').innerHTML = '<p class="text-center text-danger-color">Invalid page link.</p>';
        return;
    }

    // Set up the back link to point to the correct profile page
    if (backLink) {
        backLink.href = `/Social/user-profile.html?id=${userId}`;
    }

    // Set the title of the page
    if (listTitle) {
        listTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    }
    document.title = `${type.charAt(0).toUpperCase() + type.slice(1)} - Vibance`;

    // Fetch the primary user's profile to get their list of followers/following
    const primaryUserProfile = await DataService.fetchUserProfile(userId);
    const idList = primaryUserProfile[type] || [];
    
    // Fetch the profile of the currently logged-in user to check follow status
    const currentUserProfile = await DataService.fetchUserProfile(auth.currentUser.uid);

    // Fetch the full profile for each user in the list
    const userProfiles = await Promise.all(
        idList.map(async (id) => {
            const data = await DataService.fetchUserProfile(id);
            return { id, data };
        })
    );

    renderUserList(userProfiles, currentUserProfile);

    // Add a single event listener for all follow buttons in the list
    userListContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action="toggle-follow"]');
        if (target) {
            target.disabled = true;
            const profileUserId = target.dataset.userId;
            await DataService.toggleFollow(profileUserId);
            // Re-render the list to show the updated follow status
            initFollowListPage();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            initFollowListPage();
        }
    });
});
