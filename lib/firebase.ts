// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB6UXHfZdbn_jSJauHhbTwBvrFGsKnPeTw",
  authDomain: "gautami-55545.firebaseapp.com",
  databaseURL: "https://gautami-55545-default-rtdb.firebaseio.com",
  projectId: "gautami-55545",
  storageBucket: "gautami-55545.appspot.com",
  messagingSenderId: "328668763634",
  appId: "1:328668763634:web:5cd1be7de0e5e08aaa476b",
  measurementId: "G-FZ93TQS67R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getDatabase(app);

export { auth, provider, signInWithPopup, signOut ,db };
