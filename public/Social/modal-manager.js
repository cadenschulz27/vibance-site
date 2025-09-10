/**
 * @file /Social/modal-manager.js
 * @description Manages the creation, display, and interaction logic for all modals
 * in the social feed, including the advanced "create post" and "comments" modals.
 */

import { auth } from '../api/firebase.js';
import { DataService } from './data-service.js';
import { PostRenderer } from './post-renderer.js';
import { createAvatar, createIcon } from './ui-helpers.js';
import { formatRelativeTime } from '../utils.js';

// Private variable to hold the currently active modal and its listeners.
let activeModal = {
    element: null,
    commentListener: null,
    selectedFile: null // To hold the image file for a new post
};

export const ModalManager = {

    /**
     * Initializes the manager by creating the modal containers in the DOM.
     */
    init() {
        if (document.getElementById('modal-root')) return;
        const modalRoot = document.createElement('div');
        modalRoot.id = 'modal-root';
        document.body.appendChild(modalRoot);
    },

    /**
     * Opens the modal for creating a new post.
     * @param {object} userProfile - The profile object of the currently logged-in user.
     */
    openCreatePostModal(userProfile) {
        const modalHTML = `
            <div class="modal-content create-post-modal">
                <div class="modal-header">
                    <h2>Create New Post</h2>
                    <button data-action="share-post" class="share-btn">Share</button>
                </div>
                <div class="modal-body">
                    <textarea id="post-description-input" placeholder="Write a caption..."></textarea>
                    <div id="image-upload-area">
                        ${createIcon('image')}
                        <p>Drag and drop a photo here</p>
                        <input type="file" id="image-file-input" class="hidden" accept="image/*">
                    </div>
                    <div id="image-preview-area" class="hidden">
                        <img id="image-preview" src="" alt="Image preview"/>
                        <button id="remove-image-btn" class="remove-image-btn">${createIcon('close')}</button>
                    </div>
                </div>
            </div>
        `;
        this._openModal(modalHTML, (modalEl) => this._setupCreatePostListeners(modalEl, userProfile));
    },

    /**
     * Opens the advanced, two-panel modal for viewing and adding comments.
     * @param {string} postId - The ID of the post to display comments for.
     */
    async openCommentsModal(postId) {
        const post = await DataService.fetchPostById(postId);
        if (!post) return;

        const modalHTML = `
            <div class="modal-content comments-modal">
                <div class="comments-image-panel">
                    <img src="${post.data.imageUrl}" alt="Post image">
                </div>
                <div class="comments-panel">
                    <div class="comments-header">
                        ${PostRenderer.renderPostHeader(post)}
                    </div>
                    <div class="comments-list" id="modal-comments-list">
                        <!-- Comments will be loaded here in real-time -->
                    </div>
                    <div class="comments-actions">
                        ${PostRenderer.renderPostActions(post)}
                    </div>
                    <div class="comments-add-comment">
                        <form id="modal-comment-form" data-post-id="${postId}">
                            <input type="text" placeholder="Add a comment..." required>
                            <button type="submit">Post</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        this._openModal(modalHTML, (modalEl) => this._setupCommentsListeners(modalEl, post));
    },

    // --- Private Helper Methods ---

    _openModal(modalHTML, setupListenersCallback) {
        this.closeModal();
        const modalRoot = document.getElementById('modal-root');
        
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = modalHTML;
        
        modalRoot.appendChild(backdrop);
        
        setTimeout(() => backdrop.classList.add('visible'), 10);
        
        activeModal.element = backdrop;
        
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.closeModal();
        });

        if (setupListenersCallback) {
            setupListenersCallback(backdrop);
        }
    },

    closeModal() {
        if (activeModal.element) {
            activeModal.element.classList.remove('visible');
            setTimeout(() => activeModal.element.remove(), 300);
        }
        if (activeModal.commentListener) {
            activeModal.commentListener();
        }
        activeModal = { element: null, commentListener: null, selectedFile: null };
    },
    
    _setupCreatePostListeners(modalEl) {
        const shareBtn = modalEl.querySelector('[data-action="share-post"]');
        const descriptionInput = modalEl.querySelector('#post-description-input');
        const uploadArea = modalEl.querySelector('#image-upload-area');
        const fileInput = modalEl.querySelector('#image-file-input');
        const previewArea = modalEl.querySelector('#image-preview-area');
        const previewImg = modalEl.querySelector('#image-preview');
        const removeImgBtn = modalEl.querySelector('#remove-image-btn');

        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                activeModal.selectedFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImg.src = e.target.result;
                    uploadArea.classList.add('hidden');
                    previewArea.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        };

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

        removeImgBtn.addEventListener('click', () => {
            activeModal.selectedFile = null;
            fileInput.value = '';
            previewArea.classList.add('hidden');
            uploadArea.classList.remove('hidden');
        });

        shareBtn.addEventListener('click', async () => {
            const description = descriptionInput.value;
            const file = activeModal.selectedFile;

            if (!description && !file) {
                alert('Please add a caption or an image.');
                return;
            }

            shareBtn.disabled = true;
            shareBtn.textContent = 'Sharing...';

            try {
                await DataService.createPost(description, file);
                this.closeModal();
                // Dispatch a custom event to tell the main page to refresh the feed
                document.dispatchEvent(new CustomEvent('feed-needs-refresh'));
            } catch (error) {
                console.error("Error creating post:", error);
                alert("Could not create post. Please try again.");
                shareBtn.disabled = false;
                shareBtn.textContent = 'Share';
            }
        });
    },

    _setupCommentsListeners(modalEl, post) {
        activeModal.commentListener = DataService.onCommentsSnapshot(post.id, (comments) => {
            const listEl = modalEl.querySelector('#modal-comments-list');
            listEl.innerHTML = comments.map(c => this._renderComment(c)).join('');
        });
        
        modalEl.querySelector('#modal-comment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = e.target.querySelector('input');
            await DataService.addComment(post.id, input.value);
            input.value = '';
        });
    },

    _renderComment(comment) {
        return `
            <div class="comment-item">
                ${createAvatar(comment.author, 'h-8 w-8')}
                <div class="comment-content">
                    <p>
                        <a href="#" class="comment-author-name">${comment.author.name}</a>
                        ${comment.data.text}
                    </p>
                    <div class="comment-meta">
                        <span>${formatRelativeTime(comment.data.createdAt)}</span>
                    </div>
                </div>
            </div>
        `;
    }
};

