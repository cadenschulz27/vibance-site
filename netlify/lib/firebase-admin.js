/**
 * @file /netlify/lib/firebase-admin.js
 * @description Initializes and exports the Firebase Admin SDK for use in serverless functions.
 */

const admin = require('firebase-admin');

// Initialize once (serverless cold start) with flexible env support:
// 1. FIREBASE_ADMIN_SDK_CONFIG containing full JSON service account (preferred single var)
// 2. Or separate FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//    (private key may contain literal \n sequences that must be restored)
if (!admin.apps.length) {
  try {
    let serviceAccount = null;
    if (process.env.FIREBASE_ADMIN_SDK_CONFIG) {
      serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else {
      throw new Error('Missing Firebase admin credentials: set FIREBASE_ADMIN_SDK_CONFIG or the trio FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

module.exports = {
  auth: admin.auth(),
  db: admin.firestore(),
  FieldValue: admin.firestore.FieldValue,
  app: admin.app(),
};
