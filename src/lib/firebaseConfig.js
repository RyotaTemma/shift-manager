import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// 環境変数から設定を読み込む
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 本番環境では 'warn' に設定することを推奨
setLogLevel(import.meta.env.DEV ? 'debug' : 'warn');

// Firestoreのパスで使用するアプリケーションID (環境やインスタンスごとに変更可能)
// 例: 'cram-school-scheduler-prod', 'cram-school-scheduler-dev'
const appIdForPaths = import.meta.env.VITE_APP_ID_FOR_PATHS || 'cram-school-scheduler-dev'; 

export { app, auth, db, appIdForPaths };
