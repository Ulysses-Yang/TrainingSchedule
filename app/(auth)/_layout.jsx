//app/(auth)/_layout.jsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  // 這個群組的頁面都不需要共用的標頭
  return <Stack screenOptions={{ headerShown: false }} />;
}