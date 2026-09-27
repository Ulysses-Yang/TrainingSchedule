import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
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

// 避免開發模式重新整理時重複初始化 Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
  // Android 與 iOS 使用 AsyncStorage 保存登入狀態
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (error) {
  // Fast Refresh 已初始化 Auth 時，直接取得現有實例
  auth = getAuth(app);
}

const db = getFirestore(app);
const functions = getFunctions(app, "asia-east1");

export { app, auth, db, functions };

