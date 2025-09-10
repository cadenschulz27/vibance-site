/**
 * @file /Social/listeners.js
 * @description Manages all real-time Firestore listeners for the social feed.
 */
import { collection, query, orderBy, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from '../api/firebase.js';
import { PostRenderer } from './post-renderer.js';
import { DataService } from './data-service.js';

let feedUnsubscribe = null;
const commentListeners = new Map();

export const ListenerManager = {
    attachFeedListener(container) {
        if (feedUnsubscribe) feedUnsubscribe(); // Unsubscribe from any previous listener

        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        feedUnsubscribe = onSnapshot(q, async (querySnapshot) => {
            container.innerHTML = '';
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-center text-gray-500 py-10">No posts yet. Be the first!</p>';
                return;
            }
            const posts = await Promise.all(querySnapshot.docs.map(async (doc) => {
                const postData = doc.data();
                const author = await DataService.fetchAuthorDetails(postData.userId);
                return { id: doc.id, ...postData, author };
            }));

            posts.forEach(post => {
                const postElement = PostRenderer.renderPost(post);
                container.appendChild(postElement);
            });
        }, (error) => {
            console.error("Error with feed listener:", error);
            container.innerHTML = '<p class="text-center text-red-500 py-10">Could not load feed.</p>';
        });
    },

    attachCommentListener(postId, listElement) {
        if (commentListeners.has(postId)) {
            commentListeners.get(postId)(); // Unsubscribe if already listening
        }
        
        const q = query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc"));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const comments = await Promise.all(snapshot.docs.map(async (doc) => {
                const commentData = doc.data();
                const author = await DataService.fetchAuthorDetails(commentData.userId);
                return { ...commentData, author };
            }));

            listElement.innerHTML = ''; // Clear previous comments
            comments.forEach(comment => {
                 const commentEl = PostRenderer.renderComment(comment);
                 listElement.appendChild(commentEl);
            });
        });
        commentListeners.set(postId, unsubscribe);
    },

    detachAll() {
        if (feedUnsubscribe) feedUnsubscribe();
        for (const unsubscribe of commentListeners.values()) {
            unsubscribe();
        }
        commentListeners.clear();
    }
};
