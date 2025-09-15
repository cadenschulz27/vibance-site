/**
 * @file /netlify/lib/firebase-admin.js
 * @description Initializes and exports the Firebase Admin SDK for use in serverless functions.
 */

const admin = require('firebase-admin');

// This check prevents the app from being initialized multiple times,
// which can happen in a serverless environment.
if (!admin.apps.length) {
  try {
    // The service account key is stored securely as a JSON string in an environment variable.
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

// Export the initialized services
module.exports = {
  auth: admin.auth(),
  db: admin.firestore(),
};
