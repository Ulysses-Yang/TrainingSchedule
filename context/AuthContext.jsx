//context/AuthContext.jsx

import { createContext, useContext, useEffect, useState } from "react";
// ✨ 1. 導入所有需要的 Firebase 服務和函式
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import app from "../firebaseConfig.native"; // 您的 firebaseConfig 導出的是 app，這樣很好

// ✨ 2. 在這裡一次性初始化所有的 Firebase 服務
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-east1"); // 如果您有設定區域，請保留

// 建立 Context
export const AuthContext = createContext();

// 建立 Context Provider 元件
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 監聽 Firebase 的認證狀態變化
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user); // 無論是 user 物件或 null，都設定進 state
      setLoading(false); // 標記認證流程已檢查完畢
    });

    // 元件卸載時取消監聽
    return () => unsubscribe();
  }, []);

  // ✨ 3. 將所有服務都放進 value 中，提供給整個 App
  const value = {
    user,
    loading,
    db, // 提供 db 實例
    functions, // 提供 functions 實例
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// 建立一個自定義 Hook，方便子元件使用
export function useAuth() {
  return useContext(AuthContext);
}
