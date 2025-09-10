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
        
        // FIX: Read from the new first name and last name fields
        const firstName = document.getElementById('signup-first-name').value;
        const lastName = document.getElementById('signup-last-name').value;
        const fullName = `${firstName} ${lastName}`.trim(); // Combine for the 'name' field

        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errorElement = document.getElementById('signup-error');
        
        // This logic remains the same
        if (email.toLowerCase() === 'cadenschulz@gmail.com') {
            errorElement.textContent = "This email is reserved for administration.";
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Send email verification
            await sendEmailVerification(user);

            // FIX: Save the new name structure to Firestore
            await setDoc(doc(db, "users", user.uid), {
                firstName: firstName,
                lastName: lastName,
                name: fullName, // Keep 'name' for compatibility with existing code (e.g., header greeting)
                email: email,
                createdAt: serverTimestamp()
            });
            
            // Redirect to the email verification page
            window.location.href = 'verify-email.html';

        } catch (error) {
            errorElement.textContent = error.message;
        }
    });
}


// --- LOGIN LOGIC ---
// This entire section remains unchanged to preserve functionality.
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
                    window.location.href = 'admin/admin.html';
                } else {
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
