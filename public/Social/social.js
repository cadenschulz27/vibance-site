/**
 * @file /Social/social.js
 * @description Main controller for the updated Social page.
 */
import { PostManager } from './post-manager.js';
import { DataService } from './data-service.js';
import { PostRenderer } from './post-renderer.js';
import { auth } from '../api/firebase.js';

function initSocialPage() {
    const createPostBtn = document.getElementById('create-post-btn');
    const modal = document.getElementById('create-post-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const postForm = document.getElementById('post-form');
    const feedContainer = document.getElementById('feed-container');

    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    createPostBtn?.addEventListener('click', openModal);
    closeModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    postForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        PostManager.handlePostCreation(e, () => {
            closeModal();
            loadFeed(); // Refresh feed after posting
        });
    });

    feedContainer?.addEventListener('click', async (e) => {
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            const postId = likeBtn.dataset.postId;
            const postRef = await getDoc(doc(db, 'posts', postId));
            if(postRef.exists()) {
                await DataService.toggleLike(postId, postRef.data().likes || []);
                loadFeed(); // Naive refresh for now
            }
        }
    });

    async function loadFeed() {
        if (!feedContainer) return;
        feedContainer.innerHTML = '<p>Loading feed...</p>';
        try {
            const posts = await DataService.fetchFeedPosts();
            feedContainer.innerHTML = '';
            if (posts.length === 0) {
                feedContainer.innerHTML = '<p>No posts yet. Be the first!</p>';
            } else {
                posts.forEach(post => {
                    const postElement = PostRenderer.renderPost(post);
                    feedContainer.appendChild(postElement);
                });
            }
        } catch (error) {
            console.error("Error loading feed:", error);
            feedContainer.innerHTML = '<p>Could not load feed.</p>';
        }
    }

    PostManager.init();
    auth.onAuthStateChanged(user => {
        if (user) {
            loadFeed();
        }
    });
}

document.addEventListener('DOMContentLoaded', initSocialPage);
