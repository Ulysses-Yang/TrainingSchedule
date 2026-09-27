// app/(app)/_layout.jsx 
import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, Text, View, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NotificationBell from '../../components/NotificationBell';

// 移除了所有重複的 Provider 和不必要的 import

export default function AppLayout() { // 函式名稱改為 AppLayout 以示區別
  const router = useRouter();

  // 移除了 useFonts 和 useColorScheme，因為它們在根佈局中已經處理
  // 字體和主題會自動繼承下來

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: 'center',
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#000',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{
          title: '',
          headerStyle: { backgroundColor: '#ffffffff' },
          headerRight: () => <NotificationBell />,
        }} 
      />
      <Stack.Screen 
        name="settings" 
        options={{
          title: '設定與資訊',
          headerStyle: { backgroundColor: '#ffffffff' },
        }} 
      />
      <Stack.Screen
        name="schedules-list"
        options={{
          title: '訓練課表',
          headerStyle: { backgroundColor: '#f0f8ff' },
          headerRight: () => <NotificationBell />,
        }}
      />
      <Stack.Screen 
        name="schedule"
        options={{
          title: '',
          unmountOnBlur: true, // 離開就卸載，連帶清掉 header 的 PopupMenu 與遮罩
        }}
      />
      <Stack.Screen
        name="category"
        options={({ route }) => ({
          gestureEnabled: false,
          unmountOnBlur: true, // 離開就卸載，連帶清掉 header 的 PopupMenu 與遮罩
          header: () => (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              backgroundColor: '#c1ebfdff', 
              height: 80, 
              paddingHorizontal: 10,
              paddingTop: 30,
            }}>
              <TouchableOpacity onPress={() => router.back()} style={{ width: 50, alignItems: 'flex-start' }}>
                <Ionicons name="chevron-back" size={28} color="#007AFF" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 5 }}>
                <Text 
                  style={{ fontSize: 17, fontWeight: 'bold', textAlign: 'center' }}
                  numberOfLines={2}
                  ellipsizeMode='tail'
                >
                  {route.params?.scheduleName
                    ? `正在編輯：${route.params.scheduleName}\n ${route.params.formattedDate}` 
                    : '選擇分類'}
                </Text>
              </View>
              <View style={{ width: 50, alignItems: 'flex-end' }}>
                <NotificationBell />
              </View>
            </View>
          ),
        })}
      />
      <Stack.Screen
        name="custom/[name]"
        options={({ route }) => ({
          title: route?.params?.name || '自訂分類',
          headerStyle: { backgroundColor: '#c1ebfdff' },
          gestureEnabled: false,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 15 }}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
            </TouchableOpacity>
          ),
          headerRight: () => <NotificationBell />,
        })}
      />
      <Stack.Screen name="copy-schedule" options={{ headerShown: false }} />
    </Stack>
  );
}