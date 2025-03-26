// lib/firebaseMedford.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const medfordFirebaseConfig = {
  apiKey: "AIzaSyAq6iz-1HFHk6EKxHkdt8c_2suJ91jJ5N8",
  authDomain: "hospital-uid-medfordfamily.firebaseapp.com",
  databaseURL: "https://hospital-uid-medfordfamily-default-rtdb.firebaseio.com",
  projectId: "hospital-uid-medfordfamily",
  storageBucket: "hospital-uid-medfordfamily.firebasestorage.app",
  messagingSenderId: "912435094498",
  appId: "1:912435094498:web:6f6afbdb4608b77ebf0fbb",
  measurementId: "G-V6B2N49YZ8"
};

// Initialize a separate Firebase app instance for Medford Family
const medfordApp = initializeApp(medfordFirebaseConfig, "Medford");
const db = getDatabase(medfordApp);

export { db };
