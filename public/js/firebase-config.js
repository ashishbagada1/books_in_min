// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBs5LWiaKslaA80lHyJdu_Eq0u0uchT2W4",
    authDomain: "books-in-minutes.firebaseapp.com",
    projectId: "books-in-minutes",
    storageBucket: "books-in-minutes.appspot.com",
    messagingSenderId: "1009919244632",
    appId: "1:1009919244632:web:04e214b8834b1a575f4d2d",
    measurementId: "G-3X2GP053F7"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

// Get auth instance
const auth = firebase.auth();

// Configure persistence
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(error => {
        console.error("Persistence error:", error);
    });
