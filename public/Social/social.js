/**
 * @file /Social/social.js
 * @description Main controller for the Social page. It handles UI interactions
 * like opening/closing the modal and orchestrates the post creation and feed loading processes.
 */

// Import the new module for handling post creation
import { PostManager } from './post-manager.js';

/**
 * Initializes all functionality for the Social page.
 */
function initSocialPage() {
    // --- ELEMENT SELECTORS ---
    const createPostBtn = document.getElementById('create-post-btn');
    const modal = document.getElementById('create-post-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const postForm = document.getElementById('post-form');

    // --- MODAL VISIBILITY FUNCTIONS ---
    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    // --- EVENT LISTENERS ---

    // Open the "Create Post" modal
    createPostBtn?.addEventListener('click', openModal);

    // Close the modal via the 'X' button
    closeModalBtn?.addEventListener('click', closeModal);

    // Close the modal by clicking on the backdrop
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Handle the form submission
    postForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        // Delegate the complex post creation logic to the PostManager module.
        // Pass the `closeModal` function as a callback to be executed on success.
        PostManager.handlePostCreation(e, closeModal);
    });

    // --- INITIALIZATION ---

    // Initialize the PostManager to set up its event listeners (e.g., for image previews).
    PostManager.init();

    // TODO: Add function call to load the post feed.
}

// Run the initialization function once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initSocialPage);

