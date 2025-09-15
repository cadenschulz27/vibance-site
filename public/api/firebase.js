// public/api/firebase.js
// ------------------------------------------------------------
// Vibance • Firebase client initialization (v10.12.2 modules)
// Exports: app, auth, db, storage
// ------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC4yxIaK9WDTwrk1riHfYxAvq9Z_v7wGDM",
  authDomain: "vibanceco.firebaseapp.com",
  projectId: "vibanceco",
  storageBucket: "vibanceco.firebasestorage.app",
  messagingSenderId: "1068160687178",
  appId: "1:1068160687178:web:3cbff24fe03c98fc521ab3",
  measurementId: "G-T9L0S3VSKP"
};

// Initialize and export Firebase services
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
