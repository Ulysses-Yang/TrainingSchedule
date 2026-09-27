// app/(admin)/coach-approvals.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, TextInput, Alert, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';

export default function CoachApprovalsScreen() {
  const { user } = useAuth();
  const db = getFirestore();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingApps, setPendingApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const reviewerName = useMemo(() => user?.displayName || user?.email || '管理員', [user]);

  useFocusEffect(React.useCallback(() => {
  console.log('coach-approvals focused');
  return () => console.log('coach-approvals blurred');
}, []));

  useEffect(() => {
  let mounted = true;
  const check = async () => {
    if (!user) { setChecking(false); setIsAdmin(false); return; }

    let ok = false;

    try {
      await user.reload?.();
      await user.getIdToken?.(true);
      const token = await user.getIdTokenResult(true);
      if (!mounted) return;
      ok = !!token.claims?.admin;
      console.log('claims:', token.claims);
    } catch (e) {
      console.error('取得 token/claims 失敗:', e);
    }

    if (!ok) {
      try {
        const db = getFirestore();
        const snap = await getDoc(doc(db, 'admins', user.uid));
        const data = snap.exists() ? snap.data() : null;
        const activeVal = data?.active;
        // 兼容布林 true、字串 "true"、數字 1（只是保底，根本解是把欄位修回布林）
        ok = (activeVal === true) || (activeVal === 'true') || (activeVal === 1);
        console.log('fallback admins active:', ok, 'admins doc:', data);
      } catch (e) {
        console.error('檢查 admins 文件失敗:', e);
      }
    }

    if (mounted) {
      setIsAdmin(ok);
      setChecking(false);
    }
  };
  check();
  return () => { mounted = false; };
}, [user?.uid]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, 'coach_applications'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('讀取申請失敗:', err));
    return () => unsub();
  }, [isAdmin]);

  const approve = async (uid) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'coach_applications', uid), {
        status: 'approved',
        reviewedBy: reviewerName,
        reviewedAt: serverTimestamp(),
      });
      // Functions 會自動發通知
    } catch (e) {
      console.error('核准失敗:', e);
      Alert.alert('錯誤', '核准失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const reject = async (uid, reason) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'coach_applications', uid), {
        status: 'rejected',
        reason: reason || '未提供',
        reviewedBy: reviewerName,
        reviewedAt: serverTimestamp(),
      });
      // Functions 會自動發通知
    } catch (e) {
      console.error('駁回失敗:', e);
      Alert.alert('錯誤', '駁回失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.hint}>檢查權限中...</Text></View>;
  }
  if (!isAdmin) {
    return <View style={styles.center}><Text style={styles.title}>沒有權限</Text><Text style={styles.hint}>此頁僅限管理員使用。</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>教練身分審核</Text>
      {pendingApps.length === 0 ? (
        <Text style={styles.hint}>目前沒有待審申請</Text>
      ) : pendingApps.map(app => (
        <AppCard key={app.id} app={app} onApprove={approve} onReject={reject} loading={loading} />
      ))}
    </ScrollView>
  );
}

function AppCard({ app, onApprove, onReject, loading }) {
  const [reason, setReason] = useState('');
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{app.userName || app.id}</Text>
      <Text style={styles.org}>單位：{app.orgName || '—'}</Text>
      <View style={styles.row}>
        <Button title="核准" onPress={() => onApprove(app.id)} disabled={loading} />
        <View style={{ width: 8 }} />
        <TextInput
          style={styles.input}
          placeholder="駁回原因（選填）"
          value={reason}
          onChangeText={setReason}
        />
        <View style={{ width: 8 }} />
        <Button title="駁回" color="#d00" onPress={() => onReject(app.id, reason)} disabled={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  hint: { color: '#666', marginTop: 8 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12, backgroundColor: '#fff' },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  org: { color: '#333', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
});