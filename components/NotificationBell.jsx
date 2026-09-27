// components/NotificationBell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, orderBy, setDoc, writeBatch } from 'firebase/firestore';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-tw';
import { useAuth } from '../context/AuthContext';
import { InteractionManager } from 'react-native';

dayjs.extend(relativeTime);
dayjs.locale('zh-tw');

export default function NotificationBell() {
  const router = useRouter();
  const db = getFirestore();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigatingRef = useRef(false);

  // 先關 Modal 再導航，避免被遮住
  const openScreen = (pathOrObj, { replace = false } = {}) => {
  if (navigatingRef.current) return;
  navigatingRef.current = true;

  setModalVisible(false);

  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      try {
        replace ? router.replace(pathOrObj) : router.push(pathOrObj);
      } finally {
        // 略等一下再解除防重入
        setTimeout(() => { navigatingRef.current = false; }, 300);
      }
    }, 80);
  });
};

  // 檢查 admin claims
  useEffect(() => {
    let mounted = true;
    const fetchClaims = async () => {
      if (!user?.uid) { setIsAdmin(false); return; }
      try {
        const token = await user.getIdTokenResult(true);
        if (!mounted) return;
        setIsAdmin(!!token.claims?.admin);
      } catch {
        setIsAdmin(false);
      }
    };
    fetchClaims();
    return () => { mounted = false; };
  }, [user?.uid]);

  // 訂閱我的通知
  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('to', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        setNotifications(arr);
        setUnreadCount(arr.filter(n => !n.read).length);
        setLoading(false);
      },
      (err) => {
        console.error('監聽通知失敗:', err);
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user?.uid, db]);

  const markRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (e) {
      console.error('更新通知狀態失敗:', e);
    }
  };

  const handleMarkReadAndOpen = async (notification) => {
    if (!user?.uid) return;
    if (!notification.read) await markRead(notification.id);

    if (notification.resourceId) {
      // 你的檔案是 app/(app)/schedule.jsx → 路徑是 /schedule
      // 傳入 params 會變成查詢參數或 navigation params，頁面用 useLocalSearchParams 取值
      openScreen({ pathname: '/schedule', params: { scheduleId: notification.resourceId } });
    }
  };

  const handleOpenApprovals = async (notification) => {
    if (!user?.uid) return;
    if (!notification.read) await markRead(notification.id);
    // coach-approvals 在 (admin) 群組 → 路徑是 /coach-approvals
    openScreen('/coach-approvals', { replace: true });
  };

  const handleClearAll = () => {
    if (!user?.uid) return;
    if (!notifications.length) {
      Alert.alert('沒有通知', '目前沒有可以清除的通知');
      return;
    }
    Alert.alert(
      '確認清除',
      '這會刪除你帳號中的所有通知，且無法復原。確定要繼續嗎？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            try {
              const BATCH_LIMIT = 450;
              for (let i = 0; i < notifications.length; i += BATCH_LIMIT) {
                const chunk = notifications.slice(i, i + BATCH_LIMIT);
                const batch = writeBatch(db);
                chunk.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
                await batch.commit();
              }
              Alert.alert('完成', '所有通知已清除');
            } catch (e) {
              console.error('清除所有通知失敗:', e);
              Alert.alert('失敗', '清除通知時發生錯誤，請稍後再試');
            }
          },
        },
      ]
    );
  };

  // 按「加入課表」：用通知 payload 建立課表，更新通知為 accepted
  const handleAcceptSchedule = async (notification) => {
    if (!user?.uid) return;
    const payload = notification?.payload;
    if (!payload) {
      Alert.alert('錯誤', '缺少課表內容，無法加入。');
      return;
    }
    try {
      const schedulesCol = collection(db, 'schedules');
      const newScheduleRef = doc(schedulesCol);
      await setDoc(newScheduleRef, {
        id: newScheduleRef.id,
        ownerId: user.uid,
        creatorId: notification.from,
        creatorName: notification.fromName || '教練',
        date: payload.date ?? null,
        name: payload.name ?? '未命名課表',
        items: Array.isArray(payload.items) ? payload.items : [],
        createdAt: new Date(),
      });
      await updateDoc(doc(db, 'notifications', notification.id), {
        status: 'accepted',
        read: true,
        resourceId: newScheduleRef.id,
        handledAt: new Date(),
      });
      Alert.alert('已加入', '課表已加入你的課表列表。');
    } catch (e) {
      console.error('加入課表失敗:', e);
      Alert.alert('失敗', '加入課表時發生錯誤，請稍後再試');
    }
  };

  // 整列點擊導頁
  const onItemPress = async (item) => {
    if (!user?.uid) return;
    if (!item.read) await markRead(item.id);

    if (item.type === 'COACH_APPLICATION_SUBMITTED') {
  openScreen('/coach-approvals', { replace: true });
  return;
}
    if (item.resourceId) {
      openScreen({ pathname: '/schedule', params: { scheduleId: item.resourceId } });
      return;
    }
    // 其他類型：僅標記已讀
  };

  const renderItem = ({ item }) => {
    const createdAt = item.createdAt?.toDate?.() ?? (item.createdAt instanceof Date ? item.createdAt : new Date());
    const type = item.type;

    let line = item.message || '通知';
    if (type === 'NEW_SCHEDULE') {
      const rawName = (item.fromName || '教練').trim();
      const nameWithSuffix = rawName.endsWith('教練') ? rawName : `${rawName} 教練`;
      line = `${nameWithSuffix} ${item.message || '發送了一份課表給你'}`;
    } else if (type === 'COACH_APPLICATION_SUBMITTED' && isAdmin) {
      const name = item?.payload?.userName || item?.payload?.applicantId || '使用者';
      const org = item?.payload?.orgName ? `（${item.payload.orgName}）` : '';
      line = `新的教練身分申請：${name}${org}`;
    } else if (type === 'COACH_APPLICATION_APPROVED' || type === 'COACH_APPLICATION_REJECTED') {
      line = item.message || line;
    }

    const isNewSchedule = type === 'NEW_SCHEDULE';
    const isAccepted = item.status === 'accepted';
    const isApplicationSubmitted = type === 'COACH_APPLICATION_SUBMITTED' && isAdmin;

    return (
      <TouchableOpacity
        style={styles.notificationItem}
        activeOpacity={0.7}
        onPress={() => onItemPress(item)}
      >
        {!item.read && <View style={styles.unreadDot} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.notificationText, !item.read && styles.unreadText]}>{line}</Text>
          <Text style={styles.notificationTime}>{dayjs(createdAt).fromNow()}</Text>

          {isNewSchedule && !isAccepted && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAcceptSchedule(item)}>
                <Text style={styles.primaryBtnText}>加入課表</Text>
              </TouchableOpacity>
            </View>
          )}

          {isNewSchedule && isAccepted && item.resourceId && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleMarkReadAndOpen(item)}>
                <Text style={styles.secondaryBtnText}>查看課表</Text>
              </TouchableOpacity>
            </View>
          )}

          {isApplicationSubmitted && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => handleOpenApprovals(item)}>
                <Text style={styles.primaryBtnText}>前往審核</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={styles.bellContainer}
        disabled={!user?.uid}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="通知"
        accessibilityHint="開啟通知中心"
      >
        <View style={{ position: 'relative' }}>
          <Ionicons name="notifications-outline" size={28} color="#333" />
          {user?.uid && unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{displayCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Modal animationType="slide" transparent={false} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>通知中心</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={handleClearAll}
                disabled={loading || notifications.length === 0}
                style={{ paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 }}
              >
                <Text style={[styles.clearAllBtnText, (loading || notifications.length === 0) && { color: '#bbb' }]}>
                  清除全部
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={30} color="#333" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 50 }} size="large" />
          ) : (
            <FlatList
              data={notifications}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.emptyText}>沒有任何通知</Text>}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const BADGE_MIN = 16;

const styles = StyleSheet.create({
  bellContainer: { padding: 5, marginRight: 10 },
  badge: {
    position: 'absolute',
    right: -6, top: -4, minWidth: BADGE_MIN, height: BADGE_MIN, paddingHorizontal: 4,
    borderRadius: BADGE_MIN / 2, backgroundColor: '#FF3B30', borderWidth: 1, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  notificationItem: {
    padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center',
  },
  clearAllBtnText: { color: '#007AFF', fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF', marginRight: 10 },
  notificationText: { fontSize: 16, color: '#666' },
  unreadText: { fontWeight: 'bold', color: '#000' },
  notificationTime: { fontSize: 12, color: 'gray', marginTop: 4 },
  actionsRow: { flexDirection: 'row', marginTop: 10, gap: 10 },
  primaryBtn: { backgroundColor: '#007AFF', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#f1f1f1', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  secondaryBtnText: { color: '#333', fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: 'gray' },
});