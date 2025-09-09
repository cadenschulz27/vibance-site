/**
 * @file /Social/social.js
 * @description Main controller for the Social page. It handles UI interactions
 * like opening/closing the modal and orchestrates the post creation and feed loading processes.
 */

import { PostManager } from './post-manager.js';
import { FeedManager } from './feed-manager.js';
import { InteractionManager } from './interaction-manager.js';

/**
 * Initializes all functionality for the Social page.
 */
function initSocialPage() {
    // --- ELEMENT SELECTORS ---
    const createPostBtn = document.getElementById('create-post-btn');
    const modal = document.getElementById('create-post-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const postForm = document.getElementById('post-form');
    const feedContainer = document.getElementById('feed-container');

    // --- MODAL VISIBILITY FUNCTIONS ---
    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    // --- EVENT LISTENERS ---

    createPostBtn?.addEventListener('click', openModal);
    closeModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    postForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        // FIX: The onPostCreated callback now only needs to close the modal.
        // The real-time listener in FeedManager will handle updating the feed automatically.
        PostManager.handlePostCreation(e, closeModal);
    });

    feedContainer?.addEventListener('click', async (e) => {
        const target = e.target;
        const postId = target.dataset.postId;

        if (target.classList.contains('like-btn')) {
            const result = await InteractionManager.handleLike(postId);
            if (result) {
                target.textContent = result.userHasLiked ? 'Liked' : 'Like';
                target.classList.toggle('liked', result.userHasLiked);
                const likeCountEl = document.querySelector(`#post-${postId} .like-count`);
                if (likeCountEl) likeCountEl.textContent = `${result.newLikeCount} Likes`;
            }
        }

        if (target.classList.contains('comment-btn')) {
            const commentSection = document.getElementById(`comments-${postId}`);
            const isVisible = commentSection.style.display === 'block';
            if (isVisible) {
                commentSection.style.display = 'none';
            } else {
                commentSection.style.display = 'block';
                if (!commentSection.hasAttribute('data-comments-loaded')) {
                    InteractionManager.loadAndDisplayComments(postId);
                    commentSection.setAttribute('data-comments-loaded', 'true');
                }
            }
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
                // No need to manually remove the element, the real-time listener will do it.
                await InteractionManager.handleDeletePost(postId);
            }
        }

        if (target.classList.contains('edit-btn')) {
            const postCard = document.getElementById(`post-${postId}`);
            postCard.querySelector('.post-description').style.display = 'none';
            postCard.querySelector('.edit-form-container').style.display = 'block';
        }

        if (target.classList.contains('cancel-edit-btn')) {
            const postCard = document.getElementById(`post-${postId}`);
            postCard.querySelector('.post-description').style.display = 'block';
            postCard.querySelector('.edit-form-container').style.display = 'none';
        }

        if (target.classList.contains('save-edit-btn')) {
            const postCard = document.getElementById(`post-${postId}`);
            const textarea = postCard.querySelector('.edit-textarea');
            const newDescription = textarea.value;
            // The listener will automatically update the UI on success.
            await InteractionManager.handleEditPost(postId, newDescription);
        }
    });
    
    feedContainer?.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('comment-form')) {
            e.preventDefault();
            const form = e.target;
            const postId = form.dataset.postId;
            const input = form.querySelector('.comment-input');
            const commentText = input.value;
            const success = await InteractionManager.handleComment(postId, commentText);
            if (success) {
                input.value = '';
                InteractionManager.loadAndDisplayComments(postId);
                const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
                if (commentBtn) {
                    const currentCount = parseInt(commentBtn.textContent.match(/\d+/)[0] || 0);
                    commentBtn.textContent = `Comment (${currentCount + 1})`;
                }
            }
        }
    });

    // --- INITIALIZATION ---
    PostManager.init();
    // FIX: Call the new function to set up the real-time listener.
    FeedManager.initializeFeedListener();
}

document.addEventListener('DOMContentLoaded', initSocialPage);

