// app/_layout.jsx

import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// ✅ SDK 56：不要從 @react-navigation/native 匯入
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";

import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { MenuProvider } from "react-native-popup-menu";

import dayjs from "dayjs";
import "dayjs/locale/zh-tw";

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthProvider, useAuth } from "../context/AuthContext";

import { doc, getDoc } from "firebase/firestore";

// 初始化 dayjs locale
dayjs.locale("zh-tw");

// ============================================================
// 導航與登入狀態處理
// ============================================================

function LayoutNavigator() {
  const { user, loading: authLoading, db } = useAuth();

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (authLoading) return;

    const top =
      Array.isArray(segments) && segments.length ? segments[0] : undefined;

    const inApp = top === "(app)";
    const inAdmin = top === "(admin)";
    const inProtected = inApp || inAdmin;

    const checkUserAndNavigate = async () => {
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const snap = await getDoc(userDocRef);

          if (snap.exists()) {
            const data = snap.data();

            if (data.role) {
              // 已登入且有 role
              if (!inProtected) {
                router.replace("/(app)");
              }
            } else {
              // 沒有 role
              router.replace("/role-selection");
            }
          } else {
            // 沒有 users 文件
            router.replace("/role-selection");
          }
        } catch (e) {
          console.error("檢查用戶資料失敗：", e);
          router.replace("/(auth)/login");
        }
      } else {
        // 未登入
        if (inProtected) {
          router.replace("/(auth)/login");
        }
      }
    };

    checkUserAndNavigate();
  }, [user, authLoading, segments, db]);

  // Auth 載入中
  if (authLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(app)" options={{ headerShown: false }} />

      <Stack.Screen name="(auth)" options={{ headerShown: false }} />

      <Stack.Screen name="(admin)" options={{ headerShown: false }} />

      <Stack.Screen
        name="role-selection"
        options={{
          title: "選擇您的身分",
          headerShown: false,
          headerBackVisible: false,
        }}
      />
    </Stack>
  );
}

// ============================================================
// Root Layout
// ============================================================

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MenuProvider backHandler skipInstanceCheck>
          <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
          >
            <LayoutNavigator />
            <StatusBar style="auto" />
          </ThemeProvider>
        </MenuProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}
