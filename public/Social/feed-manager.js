/**
 * @file /Social/feed-manager.js
 * @description Manages fetching and rendering posts for the social feed.
 */

import { auth, db } from '../api/firebase.js';
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Formats a Firestore Timestamp into a human-readable date string.
 * @param {object} timestamp - The Firestore Timestamp object.
 * @returns {string} A formatted date string (e.g., "September 8, 2025").
 */
function formatTimestamp(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') {
        return 'Just now';
    }
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Creates the HTML structure for a single post card.
 * @param {object} postData - The data for a single post from Firestore.
 * @param {string} postId - The unique ID of the post document.
 * @returns {string} The HTML string for the post card.
 */
function createPostHTML(postData, postId) {
    const { userId, userName, description, imageUrl, createdAt, likes = [], commentCount = 0 } = postData;
    const currentUser = auth.currentUser;
    
    const imageElement = imageUrl 
        ? `<img src="${imageUrl}" alt="User post image" class="post-image">` 
        : '';

    const userHasLiked = currentUser && likes.includes(currentUser.uid);
    const likeButtonClass = userHasLiked ? 'action-btn like-btn liked' : 'action-btn like-btn';
    const likeButtonText = userHasLiked ? 'Liked' : 'Like';

    const ownerControlsHTML = currentUser && userId === currentUser.uid
        ? `
            <button class="action-btn edit-btn" data-post-id="${postId}">Edit</button>
            <button class="action-btn delete-btn" data-post-id="${postId}">&times;</button>
          `
        : '';

    return `
        <div class="post-card" id="post-${postId}">
            <div class="post-header">
                <div class="post-author">${userName}</div>
                <div class="post-meta">
                    <span class="post-timestamp">${formatTimestamp(createdAt)}</span>
                    ${ownerControlsHTML}
                </div>
            </div>
            <div class="post-body">
                <p class="post-description">${description}</p>
                <div class="edit-form-container" style="display: none;">
                    <textarea class="edit-textarea">${description}</textarea>
                    <div class="edit-actions">
                        <button class="action-btn save-edit-btn" data-post-id="${postId}">Save</button>
                        <button class="action-btn cancel-edit-btn" data-post-id="${postId}">Cancel</button>
                    </div>
                </div>
                ${imageElement}
            </div>
            <div class="post-actions">
                <button class="${likeButtonClass}" data-post-id="${postId}">
                    ${likeButtonText}
                </button>
                <span class="like-count">${likes.length} Likes</span>
                <button class="action-btn comment-btn" data-post-id="${postId}">
                    Comment (${commentCount})
                </button>
            </div>
            <div class="comment-section" id="comments-${postId}">
                <div class="comments-list"></div>
                <form class="comment-form" data-post-id="${postId}">
                    <input type="text" class="comment-input" placeholder="Write a comment..." required>
                    <button type="submit" class="comment-submit-btn">Post</button>
                </form>
            </div>
        </div>
    `;
}

export const FeedManager = {
    /**
     * Sets up a real-time listener that automatically updates the feed
     * whenever there's a change in the posts collection.
     * @param {Function} onFeedRendered - A function to call after the feed HTML is rendered.
     */
    initializeFeedListener(onFeedRendered) {
        const feedContainer = document.getElementById('feed-container');
        if (!feedContainer) return;

        const postsCollection = collection(db, "posts");
        const q = query(postsCollection, orderBy("createdAt", "desc"));
        
        onSnapshot(q, (querySnapshot) => {
            if (querySnapshot.empty) {
                feedContainer.innerHTML = '<p class="text-center text-gray-500">No posts yet. Be the first to share something!</p>';
                return;
            }

            const postIds = [];
            let feedHTML = '';
            querySnapshot.forEach(doc => {
                feedHTML += createPostHTML(doc.data(), doc.id);
                postIds.push(doc.id);
            });

            feedContainer.innerHTML = feedHTML;

            if (onFeedRendered) {
                onFeedRendered(postIds);
            }

        }, (error) => {
            console.error("Error listening to feed:", error);
            feedContainer.innerHTML = '<p class="text-center text-red-500">Could not load the feed. Please try again later.</p>';
        });
    }
};

