/**
 * @file /Social/user-profile.js
 * @description Controller for the user profile page.
 */
import { DataService } from './data-service.js';
import { createAvatar } from './ui-helpers.js';

async function initUserProfile() {
    const profileContainer = document.getElementById('profile-container');
    const postsGrid = document.getElementById('user-posts-grid');
    
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');

    if (!userId) {
        profileContainer.innerHTML = '<p class="text-center p-20 text-red-500">User not found.</p>';
        return;
    }

    try {
        const [userProfile, userPosts] = await Promise.all([
            DataService.fetchUserProfile(userId),
            DataService.fetchPostsByUser(userId)
        ]);

        document.title = `${userProfile.name}'s Profile - Vibance`;
        
        // Render profile header
        profileContainer.innerHTML = `
            <div class="profile-header">
                ${createAvatar({ ...userProfile, name: userProfile.name || 'User' }).replace('author-avatar', 'profile-avatar')}
                <div>
                    <h1 class="profile-name">${userProfile.name}</h1>
                    <div class="profile-stats">
                        <div><span class="stat-number">${userPosts.length}</span> posts</div>
                        <div><span class="stat-number">0</span> followers</div>
                        <div><span class="stat-number">0</span> following</div>
                    </div>
                </div>
            </div>
        `;

        // Render posts grid
        postsGrid.innerHTML = '';
        if (userPosts.length > 0) {
            userPosts.forEach(post => {
                if(post.imageUrl) {
                    const thumb = document.createElement('div');
                    thumb.className = 'post-thumbnail';
                    thumb.innerHTML = `<img src="${post.imageUrl}" alt="Post by ${userProfile.name}">`;
                    postsGrid.appendChild(thumb);
                }
            });
        } else {
            // This part might need better styling if it ever happens
            const noPosts = document.createElement('p');
            noPosts.textContent = 'No posts yet.';
            noPosts.className = 'col-span-3 text-center p-8 text-gray-500';
            postsGrid.appendChild(noPosts);
        }

    } catch (error) {
        console.error("Error loading user profile:", error);
        profileContainer.innerHTML = '<p class="text-center p-20 text-red-500">Could not load profile.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initUserProfile);
