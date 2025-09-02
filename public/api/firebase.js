// FILE: public/api/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyC4yxIaK9WDTwrk1riHfYxAvq9Z_v7wGDM",
    authDomain: "vibanceco.firebaseapp.com",
    projectId: "vibanceco",
    storageBucket: "vibanceco.appspot.com",
    messagingSenderId: "1068160687178",
    appId: "1:1068160687178:web:3cbff24fe03c98fc521ab3"
};

// CHANGED: Added 'export' so other files can import the main app object
export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);