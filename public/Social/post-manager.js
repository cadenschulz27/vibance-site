/**
 * @file /Social/post-manager.js
 * @description Manages the creation and submission of new posts. This includes
 * handling image uploads to Firebase Storage and saving post data to Firestore.
 */

import { auth, db, storage } from '../api/firebase.js';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// A private variable to hold the file selected by the user.
let selectedFile = null;

export const PostManager = {

    /**
     * Initializes the manager by setting up listeners for the image input.
     */
    init() {
        const imageInput = document.getElementById('image-input');
        const imageDropZone = document.getElementById('image-drop-zone');
        const removeImageBtn = document.getElementById('remove-image-btn');

        // Trigger file input when the drop zone is clicked
        imageDropZone?.addEventListener('click', () => imageInput?.click());
        
        // Handle file selection from the input
        imageInput?.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Handle drag and drop
        imageDropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageDropZone.classList.add('dragover');
        });
        imageDropZone?.addEventListener('dragleave', () => imageDropZone.classList.remove('dragover'));
        imageDropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            imageDropZone.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files[0]);
        });
        
        // Handle image removal
        removeImageBtn?.addEventListener('click', () => this.clearSelectedFile());
    },

    /**
     * Handles the selection of a file, validates it, and displays a preview.
     * @param {File} file - The file selected by the user.
     */
    handleFileSelect(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }
        selectedFile = file;

        // Display the image preview
        const previewContainer = document.getElementById('image-preview-container');
        const previewImg = document.getElementById('image-preview');
        const removeBtn = document.getElementById('remove-image-btn');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImg) previewImg.src = e.target.result;
            if (previewContainer) previewContainer.classList.remove('hidden');
            if (removeBtn) removeBtn.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    },

    /**
     * Clears the currently selected file and hides the preview.
     */
    clearSelectedFile() {
        selectedFile = null;
        const imageInput = document.getElementById('image-input');
        if (imageInput) imageInput.value = ''; // Clear the file input

        const previewContainer = document.getElementById('image-preview-container');
        const removeBtn = document.getElementById('remove-image-btn');
        if (previewContainer) previewContainer.classList.add('hidden');
        if (removeBtn) removeBtn.classList.add('hidden');
    },

    /**
     * The main function to handle the post creation process.
     * @param {Event} e - The form submission event.
     * @param {Function} onComplete - A callback function to run after submission is complete.
     */
    async handlePostCreation(e, onComplete) {
        const user = auth.currentUser;
        if (!user) return alert('You must be logged in to post.');

        const form = e.target;
        const description = form.querySelector('#post-description').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        if (!description && !selectedFile) {
            alert('Please add a description or an image to your post.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            let imageUrl = '';
            if (selectedFile) {
                // Step 1: Upload image if one exists
                submitBtn.textContent = 'Uploading Image...';
                const filePath = `posts/${user.uid}/${Date.now()}_${selectedFile.name}`;
                const storageRef = ref(storage, filePath);
                const uploadTask = await uploadBytesResumable(storageRef, selectedFile);
                imageUrl = await getDownloadURL(uploadTask.ref);
            }

            // Step 2: Get user's name from their profile
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            const userName = userDoc.exists() ? userDoc.data().name : "Anonymous";

            // Step 3: Save post data to Firestore
            submitBtn.textContent = 'Saving Post...';
            const postsCollection = collection(db, "posts");
            await addDoc(postsCollection, {
                userId: user.uid,
                userName: userName,
                description: description,
                imageUrl: imageUrl,
                createdAt: serverTimestamp(),
                likes: [],
                commentCount: 0
            });

            // Step 4: Finalize
            this.clearSelectedFile();
            form.reset();
            onComplete(); // This will typically close the modal

        } catch (error) {
            console.error("Error creating post:", error);
            alert("There was an error creating your post. Please try again.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post to Feed';
        }
    }
};
