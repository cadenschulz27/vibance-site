// FILE: public/components/header.js

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const headerPlaceholder = document.getElementById('header-placeholder');

    if (headerPlaceholder) {
        fetch('../components/header.html')
            .then(response => response.text())
            .then(data => {
                headerPlaceholder.innerHTML = data;
                initializeHeader();
            });
    }

    function initializeHeader() {
        const userWelcome = document.getElementById('user-welcome');
        const profileButton = document.getElementById('profile-button');
        const logoutMenu = document.getElementById('logout-menu');
        const logoutButton = document.getElementById('logout-button');

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Get user's name from Firestore
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userName = userDoc.data().name.split(' ')[0]; // Get first name
                    userWelcome.textContent = `Welcome, ${userName}`;
                    userWelcome.classList.remove('hidden');
                }
            }
        });
        
        // Toggle logout dropdown
        profileButton.addEventListener('click', () => {
            logoutMenu.classList.toggle('hidden');
        });

        // Handle logout
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            signOut(auth).then(() => {
                window.location.href = '../login.html';
            }).catch((error) => {
                console.error('Sign Out Error', error);
            });
        });
        
        // Close dropdown if clicked outside
        document.addEventListener('click', (event) => {
            if (!profileButton.contains(event.target) && !logoutMenu.contains(event.target)) {
                logoutMenu.classList.add('hidden');
            }
        });
    }
});