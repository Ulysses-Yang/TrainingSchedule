// app/(app)/settings.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

export default function SettingsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const [useDarkMode, setUseDarkMode] = useState(false);
  const db = getFirestore();

  const [profileName, setProfileName] = useState('');
  const [role, setRole] = useState('');
  
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() || {};
        const name =
          data.displayName ||
          auth.currentUser?.displayName ||
          (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : '') ||
          '使用者';
        setProfileName(name);
        setRole(data.role || data.identity || '');
      },
      (err) => {
        console.error('讀取使用者資料失敗:', err);
      }
    );

    return () => unsub();
  }, [auth.currentUser?.uid]);

  const doLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch (e) {
      console.error('登出失敗:', e);
      Alert.alert('登出失敗', '請稍後再試');
    }
  };

  const confirmLogout = () => {
    Alert.alert('確認登出', '確定要登出目前帳號嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: doLogout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <Text style={styles.sectionTitle}>名字/身分</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="ribbon-outline" size={22} color="#4b5563" />
            <Text style={styles.rowText}>{profileName} {role}</Text>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>帳號</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="person-circle-outline" size={22} color="#4b5563" />
            <Text style={styles.rowText}>
              {auth.currentUser?.email || auth.currentUser?.displayName || '已登入'}
            </Text>
          </View>
        </View>
        

        {/* <Text style={styles.sectionTitle}>偏好設定</Text>
        <View style={styles.card}>

          <View style={styles.row}>
            <Ionicons name="moon-outline" size={22} color="#4b5563" />
            <Text style={styles.rowText}>深色模式</Text>
            <View style={{ flex: 1 }} />
            <Switch value={useDarkMode} onValueChange={setUseDarkMode} />
          </View>

          <View style={styles.divider} />


        </View> */}

      </ScrollView>

      {/* 底部固定登出按鈕 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={18} color="#d00" />
          <Text style={styles.logoutText}>登出</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 80 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  rowText: { fontSize: 16, color: '#111827', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f1f3f5', marginLeft: 14 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 16,
    backgroundColor: '#fff',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 20,
    borderRadius: 10,
    backgroundColor: '#ffecec',
    borderWidth: 1,
    borderColor: '#ffbdbd',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#d00',
    fontWeight: '700',
    fontSize: 16,
  },
});