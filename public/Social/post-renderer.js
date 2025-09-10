/**
 * @file /Social/post-renderer.js
 * @description Renders post data into the new Instagram-style HTML structure.
 */
import { createIcon, createAvatar } from './ui-helpers.js';
import { auth } from '../api/firebase.js';

function formatTimestamp(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'Just now';
    const date = timestamp.toDate();
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export const PostRenderer = {
    renderPost(post) {
        const { id, userId, description, imageUrl, createdAt, likes = [], commentCount = 0, author } = post;
        const currentUser = auth.currentUser;
        const userHasLiked = currentUser && likes.includes(currentUser.uid);

        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        postCard.id = `post-${id}`;
        postCard.innerHTML = `
            <div class="post-header">
                <a href="/Social/user-profile.html?id=${userId}" class="author-info">
                    ${createAvatar(author)}
                    <span class="author-name">${author.name}</span>
                </a>
                <button class="post-options-btn" data-post-id="${id}" data-author-id="${userId}">
                    ${createIcon('options')}
                </button>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="Post image" class="post-image">` : ''}
            <div class="post-content">
                <div class="post-actions">
                    <button class="action-btn like-btn ${userHasLiked ? 'liked' : ''}" data-post-id="${id}">
                        ${createIcon('like')}
                    </button>
                    <button class="action-btn comment-btn" data-post-id="${id}">
                        ${createIcon('comment')}
                    </button>
                    <button class="action-btn share-btn" data-post-id="${id}">
                        ${createIcon('share')}
                    </button>
                </div>
                <div class="post-likes">${likes.length} likes</div>
                <div class="post-caption">
                    <a href="/Social/user-profile.html?id=${userId}" class="caption-author">${author.name}</a>
                    <span>${description}</span>
                </div>
                ${commentCount > 0 ? `<button class="view-comments-link" data-post-id="${id}">View all ${commentCount} comments</button>` : ''}
                <div class="post-timestamp">${formatTimestamp(createdAt)}</div>
            </div>
        `;
        return postCard;
    }
};
