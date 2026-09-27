import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext'; 

export default function PendingRequests() {
  const [requests, setRequests] = useState([]);
  const [processingIds, setProcessingIds] = useState([]);
  const [userNames, setUserNames] = useState({}); // 快取發送者的 displayName
  const [userRoles, setUserRoles] = useState({}); // 快取發送者的 role（新增）

  const { user, db, functions } = useAuth();

  // 判斷角色是否為教練（中英文相容）
  const isCoachRole = (role = '') => {
    const r = role?.toString().trim().toLowerCase();
    return r === '教練' || r === 'coach' || r === 'trainer';
  };

  // 產生顯示名稱：若為教練就加上「 教練」
  const getNameLabel = (uid) => {
    const name = userNames[uid] || '新使用者';
    const role = userRoles[uid];
    return isCoachRole(role) ? `${name} 教練` : name;
  };

  useEffect(() => {
    if (!user || !db) {
      setRequests([]);
      return;
    }
    
    const q = query(
      collection(db, 'friend_requests'),
      where('to', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const reqs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(reqs);

      // 直接抓取每個發送者的 displayName 與 role（數量通常不大，簡單可靠）
      try {
        const fetched = await Promise.all(reqs.map(async (req) => {
          try {
            const uSnap = await getDoc(doc(db, 'users', req.from));
            if (uSnap.exists()) {
              const data = uSnap.data();
              return {
                uid: req.from,
                displayName: data.displayName || '新使用者',
                role: data.role || '',
              };
            }
          } catch (e) {
            console.error('查詢用戶資料失敗：', e);
          }
          return { uid: req.from, displayName: '新使用者', role: '' };
        }));

        // 合併進快取
        setUserNames(prev => {
          const next = { ...prev };
          fetched.forEach(({ uid, displayName }) => { next[uid] = displayName; });
          return next;
        });
        setUserRoles(prev => {
          const next = { ...prev };
          fetched.forEach(({ uid, role }) => { next[uid] = role; });
          return next;
        });
      } catch (e) {
        console.error('批次查詢發送者資料失敗：', e);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  const handleRequest = async (request, newStatus) => {
    if (processingIds.includes(request.id)) return;

    setProcessingIds(ids => [...ids, request.id]);
    setRequests(current => current.filter(req => req.id !== request.id));

    try {
      const functionName = newStatus === 'accepted' ? 'acceptFriendRequest' : 'declineFriendRequest';
      const callFunction = httpsCallable(functions, functionName);
      await callFunction({ requestId: request.id });

      // 若要提示可用下面（依角色會自動帶上「教練」）
      // const label = getNameLabel(request.from);
      // const alertTitle = newStatus === 'accepted' ? '成功' : '已拒絕';
      // const alertMessage = newStatus === 'accepted'
      //   ? `您已和 ${label} 成為好友`
      //   : `您已拒絕 ${label} 的好友邀請`;
      // Alert.alert(alertTitle, alertMessage);

    } catch (error) {
      console.error("處理好友邀請時出錯:", error);
      Alert.alert(
        "處理失敗",
        `發生錯誤，請稍後再試。\n訊息: ${error.message}`
      );
      // 復原列表
      setRequests(current => [...current, request]);
    } finally {
      setProcessingIds(currentIds => currentIds.filter(id => id !== request.id));
    }
  };

  if (!user || requests.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>好友邀請</Text>
        <Text>目前沒有待處理的好友邀請。</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>好友邀請</Text>
      {requests.map(req => (
        <View key={req.id} style={styles.requestItem}>
          <Text>{getNameLabel(req.from)} 想加您為好友</Text>
          <View style={styles.buttonGroup}>
            <Button 
              title="接受" 
              onPress={() => handleRequest(req, 'accepted')} 
              disabled={processingIds.includes(req.id)}
            />
            <Button 
              title="拒絕" 
              onPress={() => handleRequest(req, 'declined')} 
              color="red"
              disabled={processingIds.includes(req.id)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 20, padding: 10, backgroundColor: '#fff8e1', borderRadius: 5 },
  title: { fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
  requestItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  buttonGroup: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 5 },
});