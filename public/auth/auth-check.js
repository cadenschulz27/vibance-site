// FILE: public/auth/auth-check.js

import { auth } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (!user) {
        // User is not logged in, redirect to login page
        console.log("No user found, redirecting to login.");
        window.location.href = '../login.html';
    } else if (!user.emailVerified) {
        // User is logged in but email is not verified
        console.log("User email not verified, redirecting to login.");
        window.location.href = '../login.html';
    }
});