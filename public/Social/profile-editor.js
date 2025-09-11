/**
 * @file /Social/profile-editor.js
 * @description Controller for the profile editor page. It handles loading user data,
 * updating the profile name and avatar, and saving changes to Firebase.
 */

import { auth, db, storage } from '../api/firebase.js';
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { createAvatar } from './ui-helpers.js';

// --- STATE MANAGEMENT ---
let selectedAvatarFile = null;

// --- DOM ELEMENTS ---
const avatarContainer = document.getElementById('current-avatar-container');
const userNameEl = document.getElementById('current-user-name');
const avatarFileInput = document.getElementById('avatar-file-input');
const nameInput = document.getElementById('name-input');
const editForm = document.getElementById('profile-edit-form');
const saveBtn = document.querySelector('.save-profile-btn');

/**
 * Loads the current user's profile data into the form fields.
 * @param {object} user - The authenticated Firebase user object.
 * @param {object} userProfile - The user's profile data from Firestore.
 */
function loadProfileData(user, userProfile) {
    if (avatarContainer) {
        avatarContainer.innerHTML = createAvatar(userProfile, 'w-full h-full');
    }
    if (userNameEl) {
        userNameEl.textContent = userProfile.name || 'Current User';
    }
    if (nameInput) {
        nameInput.value = userProfile.name || '';
    }
}

/**
 * Handles the selection of a new avatar file and displays a preview.
 * @param {File} file - The selected image file.
 */
function handleAvatarFileSelect(file) {
    if (file && file.type.startsWith('image/')) {
        selectedAvatarFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const tempAvatarUrl = e.target.result;
            avatarContainer.innerHTML = `<img src="${tempAvatarUrl}" alt="New avatar preview" class="avatar-image">`;
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Handles the form submission to save profile changes.
 * @param {Event} e - The form submission event.
 * @param {object} user - The authenticated Firebase user object.
 */
async function handleProfileSave(e, user) {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const userRef = doc(db, 'users', user.uid);
        const newName = nameInput.value.trim();
        let newAvatarUrl = user.photoURL;

        // Step 1: Upload new avatar if one was selected
        if (selectedAvatarFile) {
            const filePath = `avatars/${user.uid}/${selectedAvatarFile.name}`;
            const storageRef = ref(storage, filePath);
            const snapshot = await uploadBytes(storageRef, selectedAvatarFile);
            newAvatarUrl = await getDownloadURL(snapshot.ref);
        }

        // Step 2: Update the user's profile in Firebase Authentication
        await updateProfile(auth.currentUser, {
            displayName: newName,
            photoURL: newAvatarUrl
        });

        // Step 3: Update the user's profile in the Firestore 'users' collection
        await updateDoc(userRef, {
            name: newName,
            photoURL: newAvatarUrl,
            updatedAt: serverTimestamp()
        });
        
        // Step 4: Redirect back to the user's profile page
        alert('Profile saved successfully!');
        window.location.href = `/Social/user-profile.html?id=${user.uid}`;

    } catch (error) {
        console.error("Error saving profile:", error);
        alert("There was an error saving your profile. Please try again.");
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

/**
 * Main initialization function for the profile editor page.
 */
async function initProfileEditor() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userRef);
                const userProfile = docSnap.exists() ? docSnap.data() : { name: user.displayName, photoURL: user.photoURL };

                loadProfileData(user, userProfile);
                
                avatarFileInput.addEventListener('change', (e) => handleAvatarFileSelect(e.target.files[0]));
                editForm.addEventListener('submit', (e) => handleProfileSave(e, user));

            } catch (error) {
                console.error("Error loading profile data:", error);
                document.querySelector('.edit-profile-form-wrapper').innerHTML = '<p class="text-danger-color">Could not load profile data.</p>';
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initProfileEditor);
