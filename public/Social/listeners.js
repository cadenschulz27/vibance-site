/**
 * @file /Social/listeners.js
 * @description Manages all real-time Firestore listeners for the social feed,
 * ensuring the UI is always in sync with the database.
 */

import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from '../api/firebase.js';
import { DataService } from './data-service.js';
import { PostRenderer } from './post-renderer.js';

// A private map to keep track of active listeners to prevent duplicates.
const activeListeners = new Map();

export const ListenerManager = {

    /**
     * Attaches the author's profile details (name, photoURL) to a set of posts.
     * This is a critical step to ensure posts can be rendered with the correct user info.
     * @param {Array<object>} posts - An array of post objects from the data service.
     * @returns {Promise<Array<object>>} A promise that resolves to the array of posts, now enriched with author details.
     */
    async attachAuthorDetails(posts) {
        // Use Promise.all for efficient, parallel fetching of author profiles.
        const postsWithAuthors = await Promise.all(posts.map(async (post) => {
            const author = await DataService.fetchUserProfile(post.data.userId);
            return { ...post, author };
        }));
        return postsWithAuthors;
    },

    /**
     * Creates and starts a real-time listener for a single post.
     * When the post's data changes in Firestore (e.g., a new like), this function
     * automatically updates the specific parts of the post card in the UI.
     * @param {string} postId - The ID of the post to listen to.
     */
    startPostListener(postId) {
        // If a listener for this post already exists, do nothing.
        if (activeListeners.has(postId)) return;

        const postRef = doc(db, 'posts', postId);

        const unsubscribe = onSnapshot(postRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const postData = { id: docSnapshot.id, data: docSnapshot.data() };
                // Call the renderer to specifically update the dynamic parts of the post.
                PostRenderer.updatePostInteractions(postData);
            } else {
                // If the post is deleted, remove it from the UI.
                const postElement = document.getElementById(`post-${postId}`);
                if (postElement) postElement.remove();
                this.stopPostListener(postId); // Clean up the listener.
            }
        });

        // Store the unsubscribe function so we can stop the listener later.
        activeListeners.set(postId, unsubscribe);
    },

    /**
     * Stops a specific real-time listener to save resources.
     * @param {string} postId - The ID of the post whose listener should be stopped.
     */
    stopPostListener(postId) {
        if (activeListeners.has(postId)) {
            const unsubscribe = activeListeners.get(postId);
            unsubscribe(); // Detach the listener from Firestore.
            activeListeners.delete(postId); // Remove it from our tracking map.
        }
    },

    /**
     * A convenience function to start listeners for an array of posts.
     * @param {Array<object>} posts - An array of post objects.
     */
    startAllPostListeners(posts) {
        posts.forEach(post => this.startPostListener(post.id));
    },

    /**
     * Stops all active real-time listeners. This is useful for cleanup when a user logs out.
     */
    stopAllListeners() {
        activeListeners.forEach(unsubscribe => unsubscribe());
        activeListeners.clear();
    }
};

