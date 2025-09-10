/**
 * @file /Social/social.js
 * @description Main controller for the updated Social page.
 */
import { PostManager } from './post-manager.js';
import { DataService } from './data-service.js';
import { ModalManager } from './modal-manager.js';
import { ListenerManager } from './listeners.js';
import { auth } from '../api/firebase.js';
import { createAvatar } from './ui-helpers.js';

function initSocialPage() {
    const createPostTrigger = document.getElementById('create-post-trigger');
    const createPostBtnIcon = document.getElementById('create-post-btn-icon');
    const createPostAvatarPlaceholder = document.getElementById('create-post-avatar-placeholder');
    
    const modal = document.getElementById('create-post-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const postForm = document.getElementById('post-form');
    const feedContainer = document.getElementById('feed-container');

    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    createPostTrigger?.addEventListener('click', openModal);
    createPostBtnIcon?.addEventListener('click', openModal);
    
    closeModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    postForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        PostManager.handlePostCreation(e, closeModal);
    });

    feedContainer?.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const postCard = button.closest('.post-card');
        const post = JSON.parse(postCard.dataset.postData);

        if (button.classList.contains('like-btn')) {
            await DataService.toggleLike(post.id, post.likes);
        } else if (button.classList.contains('comment-btn') || button.classList.contains('view-comments-link')) {
            ModalManager.showComments(post);
        } else if (button.classList.contains('post-options-btn')) {
            ModalManager.showOptions(post);
        }
    });

    async function initializePage() {
        if (!feedContainer) return;
        feedContainer.innerHTML = '<p class="text-center text-gray-500 py-10">Loading feed...</p>';
        
        const user = auth.currentUser;
        if (user) {
            const userProfile = await DataService.fetchUserProfile(user.uid);
            if (createPostAvatarPlaceholder) {
                createPostAvatarPlaceholder.innerHTML = createAvatar(userProfile);
            }
            ListenerManager.attachFeedListener(feedContainer);
        } else {
            ListenerManager.detachAll();
            feedContainer.innerHTML = '<p class="text-center text-gray-500 py-10">Please log in to see the feed.</p>';
        }
    }
    
    PostManager.init();
    auth.onAuthStateChanged(user => {
        initializePage();
    });

    window.addEventListener('feed-needs-refresh', initializePage);
}

document.addEventListener('DOMContentLoaded', initSocialPage);

