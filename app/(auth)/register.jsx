//app/(auth)/register.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore'; // 新增：Firestore 相關導入
import { db } from '../../firebaseConfig'; // 假設 db 從這裡導入（Firestore 實例）

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); // 新增：用來儲存顯示名稱
  const [loading, setLoading] = useState(false);
  const auth = getAuth();
  const router = useRouter();

  const handleSignUp = () => {
    // 1. 基本輸入驗證
    if (!email || !password || !confirmPassword || !displayName) { // 修改：加入 displayName 檢查
      Alert.alert('提示', '所有欄位皆為必填');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('錯誤', '兩次輸入的密碼不一致');
      return;
    }

    setLoading(true);

    // 2. 呼叫 Firebase 建立帳號
    createUserWithEmailAndPassword(auth, email, password)
      .then(async (userCredentials) => { // 修改：改為 async 以使用 await
        const user = userCredentials.user;

        // 3. 將用戶資料儲存到 Firestore (新增這段)
        try {
          await updateProfile(user, { displayName });
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: displayName, // 儲存用戶輸入的名字
            friends: [], // 初始化好友列表為空陣列
            createdAt: new Date(), // 可選：記錄建立時間
          });
          console.log('用戶資料已儲存到 Firestore！');
        } catch (firestoreError) {
          console.error('儲存用戶資料失敗：', firestoreError);
          Alert.alert('錯誤', '無法儲存用戶資料，請稍後再試。');
          return; // 如果儲存失敗，停止導向
        }

        // 4. 導向到角色選擇頁面
        router.replace('/role-selection');
      })
      .catch((error) => {
        let errorMessage = '註冊時發生錯誤，請稍後再試。';
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = '這個電子信箱已經被註冊了。';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = '電子信箱格式不正確。';
        } else if (error.code === 'auth/weak-password') {
          errorMessage = '密碼強度不足，至少需要6個字元。';
        }
        Alert.alert('註冊失敗', errorMessage);
        console.log(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>建立新帳號</Text>
      
      <TextInput
        style={styles.input}
        placeholder="電子信箱"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="密碼 (至少6個字元)"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="確認密碼"
        placeholderTextColor="#666"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      {/* 新增：顯示名稱輸入欄位 */}
      <TextInput
        style={styles.input}
        placeholder="姓名"
        placeholderTextColor="#666"
        value={displayName}
        onChangeText={setDisplayName}
      />
      
      <Button
        title={loading ? '註冊中...' : '註冊'}
        onPress={handleSignUp}
        disabled={loading}
      />

      <View style={styles.footer}>
        <Text>已經有帳號了嗎？ </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text style={styles.link}>前往登入</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

// 樣式與 login.jsx 保持一致，以獲得統一的視覺體驗
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffffff',
    flex: 1,
    justifyContent: 'flex-start',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  input: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  link: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});