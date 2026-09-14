const admin = require('firebase-admin');
const serviceAccount = require('../books-in-minutes-firebase-adminsdk-d02ki-e6d59c4e7a.json');

// Initialize Firebase Admin using service account file
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Initialize Firestore
const db = admin.firestore();

// Configure Firestore settings
db.settings({
    ignoreUndefinedProperties: true
});

module.exports = { admin, db };
