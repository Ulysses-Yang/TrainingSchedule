// app/(app)/custom/new.jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useAuth } from '../../../context/AuthContext';

function AddCategoryScreen() {
  const [newCategory, setNewCategory] = useState('');
  const router = useRouter();
  const { user } = useAuth();

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) {
      Alert.alert('錯誤', '分類名稱不可為空');
      return;
    }
    if (!user) {
      Alert.alert('錯誤', '請先登入');
      return;
    }

    try {
      const catId = `${trimmed}_${user.uid}`;
      const catRef = doc(db, 'categories', catId);
      await setDoc(catRef, {
        name: trimmed,
        options: [],
        notes: {},
        ownerId: user.uid,
      });
      setNewCategory('');
      Alert.alert('成功', `新增分類：${trimmed}`);

      // 回到 /category 並自動打開剛新增的分類面板
      router.replace({ pathname: '/category', params: { open: trimmed } });
    } catch (error) {
      Alert.alert('錯誤', '新增分類失敗');
      console.error(error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.container}
    >
      <Text style={styles.title}>新增自訂分類</Text>
      <TextInput
        style={styles.input}
        placeholder="請輸入分類名稱"
        value={newCategory}
        onChangeText={setNewCategory}
        returnKeyType="done"
        onSubmitEditing={addCategory}
      />
      <Button title="新增分類" onPress={addCategory} />
    </KeyboardAvoidingView>
  );
}
export default AddCategoryScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 18,
  },
});