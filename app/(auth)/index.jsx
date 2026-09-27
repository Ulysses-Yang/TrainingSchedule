// app/(auth)/index.jsx

import { Redirect } from 'expo-router';

export default function AuthIndex() {
  // 將 (auth) 群組的根路徑重導向到登入頁面
  return <Redirect href="/(auth)/login" />;
}