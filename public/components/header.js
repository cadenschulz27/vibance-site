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

    /**
     * Highlights the active navigation link based on the current URL.
     */
    function highlightActiveLink() {
        // FIX: Move the element lookups inside the function. This ensures the DOM has been
        // updated with the fetched HTML before we try to find the nav links.
        const navLinks = {
            '/dashboard/dashboard.html': document.getElementById('nav-dashboard'),
            '/Expenses/expenses.html': document.getElementById('nav-expenses'),
            '/Budgeting/budgeting.html': document.getElementById('nav-budgeting'),
            '/Social/social.html': document.getElementById('nav-social')
        };
        
        const currentPath = window.location.pathname;

        // Use .endsWith() for a more precise match instead of .includes().
        for (const path in navLinks) {
            if (currentPath.endsWith(path)) {
                // Use optional chaining (?) in case an element is not found
                navLinks[path]?.classList.add('active');
                break; // Stop after finding the first match
            }
        }
    }

    function initializeHeader() {
        const userWelcome = document.getElementById('user-welcome');
        const profileButton = document.getElementById('profile-button');
        const logoutMenu = document.getElementById('logout-menu');
        const logoutButton = document.getElementById('logout-button');

        // Call the highlighting function as soon as the header is initialized.
        highlightActiveLink();

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userName = userDoc.data().name.split(' ')[0];
                    userWelcome.textContent = `Welcome, ${userName}`;
                    userWelcome.classList.remove('hidden');
                }
            }
        });
        
        if (profileButton) {
            profileButton.addEventListener('click', () => {
                logoutMenu?.classList.toggle('hidden');
            });
        }

        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                signOut(auth).then(() => {
                    window.location.href = '../login.html';
                }).catch((error) => {
                    console.error('Sign Out Error', error);
                });
            });
        }
        
        document.addEventListener('click', (event) => {
            if (profileButton && logoutMenu && !profileButton.contains(event.target) && !logoutMenu.contains(event.target)) {
                logoutMenu.classList.add('hidden');
            }
        });
    }
});

