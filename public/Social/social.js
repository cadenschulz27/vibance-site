/**
 * @file /Social/social.js
 * @description Main controller for the Social page. It handles UI interactions
 * like opening/closing the modal and orchestrates the post creation and feed loading processes.
 */

import { PostManager } from './post-manager.js';
import { FeedManager } from './feed-manager.js';
import { InteractionManager } from './interaction-manager.js';
import { auth } from '../api/firebase.js';

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
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const closeLightboxBtn = document.getElementById('close-lightbox-btn');

    // --- MODAL VISIBILITY FUNCTIONS ---
    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');
    const openLightbox = (imageUrl) => {
        if (lightbox && lightboxImage) {
            lightboxImage.src = imageUrl;
            lightbox.classList.remove('hidden');
        }
    };
    const closeLightbox = () => lightbox?.classList.add('hidden');


    // --- STATE MANAGEMENT ---
    let postListeners = {};
    let commentListeners = {};

    // --- REAL-TIME UPDATE LOGIC ---
    function clearPostListeners() {
        Object.values(postListeners).forEach(unsubscribe => unsubscribe());
        postListeners = {};
    }

    function attachPostListeners(postIds) {
        clearPostListeners(); 

        postIds.forEach(postId => {
            const updateCallback = (postData) => {
                const postCard = document.getElementById(`post-${postId}`);
                if (!postCard) return;

                const { likes = [], commentCount = 0, description } = postData;
                const currentUser = auth.currentUser;

                const likeBtn = postCard.querySelector('.like-btn');
                const likeCountEl = postCard.querySelector('.like-count');
                if (likeBtn && likeCountEl) {
                    const userHasLiked = currentUser && likes.includes(currentUser.uid);
                    likeBtn.textContent = userHasLiked ? 'Liked' : 'Like';
                    likeBtn.classList.toggle('liked', userHasLiked);
                    likeCountEl.textContent = `${likes.length} Likes`;
                }

                const commentBtn = postCard.querySelector('.comment-btn');
                if (commentBtn) {
                    commentBtn.textContent = `Comment (${commentCount})`;
                }
                
                const descriptionEl = postCard.querySelector('.post-description');
                const editContainer = postCard.querySelector('.edit-form-container');
                if (descriptionEl && editContainer.style.display === 'none') {
                    descriptionEl.textContent = description;
                }
            };
            postListeners[postId] = InteractionManager.createPostListener(postId, updateCallback);
        });
    }

    // --- EVENT LISTENERS ---

    createPostBtn?.addEventListener('click', openModal);
    closeModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    closeLightboxBtn?.addEventListener('click', closeLightbox);
    lightbox?.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    postForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        PostManager.handlePostCreation(e, closeModal);
    });

    feedContainer?.addEventListener('click', async (e) => {
        const target = e.target;
        const postId = target.dataset.postId;

        if (target.classList.contains('post-image')) {
            openLightbox(target.src);
            return;
        }

        if (target.classList.contains('like-btn')) {
            await InteractionManager.handleLike(postId);
        }

        if (target.classList.contains('comment-btn')) {
            const commentSection = document.getElementById(`comments-${postId}`);
            const commentsList = commentSection.querySelector('.comments-list');
            const isVisible = commentSection.style.display === 'block';

            if (isVisible) {
                commentSection.style.display = 'none';
                if (commentListeners[postId]) {
                    commentListeners[postId]();
                    delete commentListeners[postId];
                }
            } else {
                commentSection.style.display = 'block';
                const callback = (commentsHTML) => {
                    commentsList.innerHTML = commentsHTML;
                };
                commentListeners[postId] = InteractionManager.createCommentListener(postId, callback);
            }
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this post?')) {
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
            await InteractionManager.handleEditPost(postId, textarea.value);
            postCard.querySelector('.post-description').style.display = 'block';
            postCard.querySelector('.edit-form-container').style.display = 'none';
        }
    });
    
    feedContainer?.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('comment-form')) {
            e.preventDefault();
            const form = e.target;
            const postId = form.dataset.postId;
            const input = form.querySelector('.comment-input');
            
            const success = await InteractionManager.handleComment(postId, input.value);
            if (success) {
                input.value = '';
            }
        }
    });

    // --- INITIALIZATION ---
    PostManager.init();
    FeedManager.initializeFeedListener(attachPostListeners);
}

document.addEventListener('DOMContentLoaded', initSocialPage);

