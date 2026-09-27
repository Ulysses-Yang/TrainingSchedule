// components/FriendSearch.jsx
import React, { useState } from 'react';
import { View, TextInput, Button, Text, Alert, StyleSheet } from 'react-native';
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function FriendSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const db = getFirestore();
  const { user: currentUser } = useAuth();

  // 只顯示名字；若是教練 => "小明 教練"
  const getNameLabel = (user) => {
    const name = (user?.displayName || '').trim();
    if (!name) return '未設定名稱';
    return user?.role === '教練' ? `${name} 教練` : name;
  };

  const handleSearch = async () => {
    if (!currentUser) {
      Alert.alert("錯誤", "請先登入才能搜尋好友。");
      return;
    }
    const term = searchTerm.trim();
    if (!term) return;

    setLoading(true);
    setSearchResults([]);

    const emailQuery = query(collection(db, 'users'), where('email', '==', term.toLowerCase()));
    const nameQuery = query(collection(db, 'users'), where('displayName', '==', term));

    try {
      const [emailSnapshot, nameSnapshot] = await Promise.all([getDocs(emailQuery), getDocs(nameQuery)]);
      const results = new Map();

      const processSnapshot = (snapshot) => {
        snapshot.forEach(doc => {
          if (doc.id !== currentUser.uid) {
            results.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });
      };

      processSnapshot(emailSnapshot);
      processSnapshot(nameSnapshot);
      setSearchResults(Array.from(results.values()));
    } catch (error) {
      console.error("搜尋好友失敗:", error);
      Alert.alert("錯誤", "搜尋時發生問題。");
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (recipient) => {
    if (!currentUser) {
      Alert.alert("錯誤", "使用者未登入，無法傳送邀請。");
      return;
    }

    try {
      await addDoc(collection(db, 'friend_requests'), {
        from: currentUser.uid,
        fromName: currentUser.displayName || currentUser.email,
        to: recipient.id,
        toName: recipient.displayName || recipient.email, // 後端仍保留 email 作為備援
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('成功', `已傳送好友邀請給 ${getNameLabel(recipient)}`);
    } catch (error) {
      Alert.alert('失敗', '傳送邀請時發生錯誤');
      console.error("傳送好友邀請失敗:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>新增好友</Text>
      <TextInput
        placeholder="輸入對方的 Email 或暱稱"
        placeholderTextColor="#777"
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.input}
        autoCapitalize="none"
      />
      <Button
        title={loading ? '搜尋中...' : '搜尋好友'}
        onPress={handleSearch}
        disabled={!currentUser || loading}
      />

      {searchResults.map(user => (
        <View key={user.id} style={styles.resultItem}>
          {/* 只顯示名字；教練加上「 教練」 */}
          <Text>{getNameLabel(user)}</Text>
          <Button title="加好友" onPress={() => sendRequest(user)} />
        </View>
      ))}

      {searchResults.length === 0 && !loading && (
        <Text style={styles.noResultText}>沒有搜尋結果</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 20 },
  title: { fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: 'gray', padding: 10, marginBottom: 10, borderRadius: 5 },
  resultItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  noResultText: { textAlign: 'center', color: 'gray', marginTop: 10 },
});