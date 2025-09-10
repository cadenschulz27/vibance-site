// FILE: public/api/firebase.js

// FIX: Standardized all imports to the latest stable version (v10.12.2).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Your Firebase configuration object.
const firebaseConfig = {
    apiKey: "AIzaSyC4yxIaK9WDTwrk1riHfYxAvq9Z_v7wGDM",
    authDomain: "vibanceco.firebaseapp.com",
    projectId: "vibanceco",
    // FIX: Reverted to the standard '.appspot.com' format, which is less likely to cause issues.
    storageBucket: "vibanceco.appspot.com", 
    messagingSenderId: "1068160687178",
    appId: "1:1068160687178:web:3cbff24fe03c98fc521ab3"
};

// Initialize Firebase services and export them for other modules to use.
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);