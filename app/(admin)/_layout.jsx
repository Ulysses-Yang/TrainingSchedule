// app/(admin)/_layout.jsx
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AdminLayout() {
  const router = useRouter();
  return (
    <Stack>
      <Stack.Screen
        name="coach-approvals"
        options={{
          title: '教練申請名單',
          headerTitleAlign: 'center',    // 標題置中（Android 需要這個）
          headerBackVisible: false,      // 我們自己畫返回鍵
          headerLeft: () => (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
              hitSlop={10}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="chevron-back" size={24} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}