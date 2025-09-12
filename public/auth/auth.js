// FILE: auth/auth.js

import { auth, db } from '../api/firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendEmailVerification,
    signOut
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { 
    doc, 
    setDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";


// --- SIGN UP LOGIC ---
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;

        // This logic remains the same
        if (email.toLowerCase() === 'cadenschulz@gmail.com') {
            document.getElementById('signup-error').textContent = "This email is reserved.";
            return;
        }

        const name = document.getElementById('signup-name').value;
        const password = document.getElementById('signup-password').value;
        const errorElement = document.getElementById('signup-error');
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await sendEmailVerification(user);

            await setDoc(doc(db, "users", user.uid), {
                name: name,
                email: email,
                createdAt: serverTimestamp()
            });
            
            // On sign up, you correctly redirect to the login page to verify email first.
            window.location.href = 'verify-email.html';

        } catch (error) {
            errorElement.textContent = error.message;
        }
    });
}


// --- LOGIN LOGIC ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorElement = document.getElementById('login-error');

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            await auth.currentUser.reload();
            const user = auth.currentUser;

            if (user.emailVerified) {
                if (user.email === 'cadenschulz@gmail.com') {
                    // Admin redirect is correct.
                    window.location.href = 'admin/admin.html';
                } else {
                    // *** FIX: Changed redirect to the user dashboard ***
                    window.location.href = 'dashboard/dashboard.html'; 
                }
            } else {
                errorElement.textContent = "Please verify your email before logging in.";
                await signOut(auth);
            }
            
        } catch (error) {
            console.error("Login error:", error);
            errorElement.textContent = "Invalid email or password. Please try again.";
        }
    });
}