// components/FriendList.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import {
  getFirestore, collection, query, where, onSnapshot, doc, getDocs, documentId
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function FriendList() {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const db = getFirestore();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      async (userDoc) => {
        try {
          const friendUIDs = userDoc.exists() ? (userDoc.data()?.friends || []) : [];

          if (!friendUIDs.length) {
            setFriends([]);
            setLoading(false);
            return;
          }

          // Firestore 'in' 一次最多 10 筆，分批查詢
          const chunks = [];
          for (let i = 0; i < friendUIDs.length; i += 10) {
            chunks.push(friendUIDs.slice(i, i + 10));
          }

          const collected = [];
          for (const ids of chunks) {
            const qRef = query(collection(db, 'users'), where(documentId(), 'in', ids));
            const snap = await getDocs(qRef);
            snap.forEach(d => collected.push({ id: d.id, ...d.data() }));
          }

          // 排序一下（顯示名稱/Email/ID）
          collected.sort((a, b) => {
            const A = (a.displayName || a.email || a.id || '').toLowerCase();
            const B = (b.displayName || b.email || b.id || '').toLowerCase();
            return A.localeCompare(B);
          });

          setFriends(collected);
        } catch (err) {
          console.error('監聽好友列表失敗:', err);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('監聽好友列表失敗:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  if (loading) {
    return <ActivityIndicator style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>我的好友</Text>
      {friends.length > 0 ? (
        friends.map(friend => {
          const baseName = friend.displayName || friend.email || friend.id;
          // 若是教練 → 顯示「姓名 教練」
          const nameWithRole = friend.role === '教練' ? `${baseName} 教練` : baseName;
          return (
            <View key={friend.id} style={styles.friendItem}>
              <Text>{nameWithRole}</Text>
            </View>
          );
        })
      ) : (
        <Text>還沒有好友，快去加一些吧！</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 20 },
  title: { fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
  friendItem: { padding: 10, backgroundColor: '#f0f0f0', borderRadius: 5, marginBottom: 5 },
});