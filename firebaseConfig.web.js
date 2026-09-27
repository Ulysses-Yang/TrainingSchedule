import { getApp, getApps, initializeApp } from "firebase/app";
import {
      browserLocalPersistence,
      getAuth,
      setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDUD_fOnjvKKfAawdVFNG369KqGxafQjKc",
  authDomain: "trainingscheduleplan.firebaseapp.com",
  projectId: "trainingscheduleplan",
  storageBucket: "trainingscheduleplan.firebasestorage.app",
  messagingSenderId: "151083445675",
  appId: "1:151083445675:web:a6ba3276b8d73c1e0f76ee",
  measurementId: "G-W1J3CCQ3Y5",
};

// 避免網頁開發模式重複初始化
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Web 使用瀏覽器版 Firebase Auth
const auth = getAuth(app);

// 將登入狀態保存在瀏覽器本機
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Firebase Web Auth 持久化設定失敗：", error);
});

const db = getFirestore(app);
const functions = getFunctions(app, "asia-east1");

export { app, auth, db, functions };

