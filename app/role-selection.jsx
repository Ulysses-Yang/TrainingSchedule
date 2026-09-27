// app/role-selection.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const db = getFirestore();

  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState(null);
  const [step, setStep] = useState('choose'); // choose | coachForm | pending | approved | rejected
  const [orgName, setOrgName] = useState('');
  const [app, setApp] = useState(null); // coach application doc
  const displayName = useMemo(() => (userDoc?.displayName || user?.displayName || ''), [userDoc, user]);

  // 監聽使用者與教練申請文件
  useEffect(() => {
    if (!user) {
      Alert.alert('錯誤', '找不到使用者資訊，請重新登入。');
      router.replace('/(auth)/login');
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setUserDoc(data);

      // 若已有角色（無論是選手或已成為教練）→ 直接導至主畫面
      if (data?.role) {
        router.replace('/(app)');
      }
    }, (err) => {
      console.error('讀取使用者資料失敗:', err);
      Alert.alert('錯誤', '無法載入用戶資料，請稍後再試。');
    });

    // 監聽申請文件（id = uid）
    const appRef = doc(db, 'coach_applications', user.uid);
    const unsubApp = onSnapshot(appRef, (snap) => {
      if (!snap.exists()) {
        setApp(null);
        // 尚未申請 → 停在 choose 或 coachForm
        setStep(prev => (prev === 'pending' || prev === 'approved' || prev === 'rejected') ? 'choose' : prev);
      } else {
        const data = { id: snap.id, ...snap.data() };
        setApp(data);
        if (data.status === 'pending') setStep('pending');
        else if (data.status === 'approved') setStep('approved');
        else if (data.status === 'rejected') {
          setStep('rejected');
          // 被拒後保留上次的 orgName 方便編輯
          if (data.orgName) setOrgName(data.orgName);
        }
      }
    }, (err) => {
      console.error('讀取教練申請失敗:', err);
    });

    setLoading(false);
    return () => {
      unsubUser?.();
      unsubApp?.();
    };
  }, [user?.uid]);

  // 選擇角色：選手直接寫入；教練進入表單
  const chooseAthlete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: '選手',
        coachId: null,
      });
      router.replace('/(app)');
    } catch (e) {
      console.error('設定選手失敗:', e);
      Alert.alert('設定失敗', '無法儲存您的身分，請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const chooseCoach = () => {
    setStep('coachForm');
  };

  const confirmChooseAthlete = () => {
  Alert.alert(
    '確定身分',
    '選擇身分後就不能再更改。\n你將以「選手」身分使用。',
    [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: chooseAthlete },
    ]
  );
};

const confirmChooseCoach = () => {
  Alert.alert(
    '確定嗎？',
    '選擇身分後就不能再更改。\n你將以「教練」身分進入申請流程。',
    [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: () => setStep('coachForm') },
    ]
  );
};

const confirmActivateCoach = () => {
  Alert.alert(
    '最後確認',
    '啟用教練身分後就不能改回選手，確定要啟用嗎？',
    [
      { text: '取消', style: 'cancel' },
      { text: '啟用', style: 'destructive', onPress: activateCoachRole },
    ]
  );
};

  // 送出教練申請（先檢查狀態，再決定是否寫入）
const submitCoachApplication = async () => {
  if (!user) return;
  const name = orgName.trim();
  if (!name) {
    Alert.alert('提示', '請輸入您任職的學校或單位');
    return;
  }
  setLoading(true);
  try {
    const appRef = doc(db, 'coach_applications', user.uid);
    const snap = await getDoc(appRef);

    if (!snap.exists()) {
      // 新建：符合 create 規則
      await setDoc(appRef, {
        userId: user.uid,
        userName: displayName || user.email || '未命名使用者',
        orgName: name,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      Alert.alert('已送出', '您的申請已進行審理');
      setStep('pending');
      return;
    }

    // 已存在 → 依狀態處理
    const curr = snap.data();
    if (curr.status === 'pending') {
      setStep('pending');
      Alert.alert('已送出', '您的申請正在審理中。');
      return;
    }
    if (curr.status === 'approved') {
      setStep('approved');
      Alert.alert('已通過', '您的申請已通過，請按下方按鈕啟用教練身分。');
      return;
    }
    if (curr.status === 'rejected') {
      // 重新申請：只允許改 status、orgName、updatedAt（符合規則）
      await updateDoc(appRef, {
        status: 'pending',
        orgName: name,
        updatedAt: serverTimestamp(),
      });
      Alert.alert('已送出', '您的申請已重新送出，等待審理');
      setStep('pending');
      return;
    }

    // 其他未知狀態（保險起見）
    Alert.alert('提示', '目前無法送出申請，請稍後再試或聯繫管理員。');
  } catch (e) {
    console.error('提交教練申請失敗:', e);
    Alert.alert('失敗', '送出申請時發生錯誤，請稍後再試');
  } finally {
    setLoading(false);
  }
};

  // 重新申請（被拒後）：只更新規則允許的欄位
const resubmitCoachApplication = async () => {
  if (!user) return;
  const name = orgName.trim();
  if (!name) {
    Alert.alert('提示', '請輸入您任職的學校或單位');
    return;
  }
  setLoading(true);
  try {
    const appRef = doc(db, 'coach_applications', user.uid);
    await updateDoc(appRef, {
      status: 'pending',
      orgName: name,
      updatedAt: serverTimestamp(),
    });
    Alert.alert('已送出', '您的申請已重新送出，等待審理');
    setStep('pending');
  } catch (e) {
    console.error('重新申請失敗:', e);
    Alert.alert('失敗', '重新申請時發生錯誤，請稍後再試');
  } finally {
    setLoading(false);
  }
};

  // 審核通過後，使用教練身分（實際寫入 users.role = 教練）
  const activateCoachRole = async () => {
    if (!user || !app) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: '教練',
        coachOrg: app.orgName || '',
        // 可選：coachVerified: true,
      });
      // 成功後會被上面的 user onSnapshot 偵測到 role 存在並導向 /(app)
      // 若你想直接導向 index.jsx，也可以：
      router.replace('/(app)');
    } catch (e) {
      console.error('啟用教練身分失敗:', e);
      Alert.alert('失敗', '啟用教練身分時發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>正在載入...</Text>
      </View>
    );
  }

  // UI 狀態渲染
  return (
    <View style={styles.container}>
      {step === 'choose' && (
        <>
          <Text style={styles.title}>請選擇您的身分</Text>
          <Text style={styles.subtitle}></Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.roleButton, styles.coachBtn]}
              onPress={confirmChooseCoach}
              activeOpacity={0.85}
            >
              <Ionicons name="school-outline" size={28} color="#fff" />
              <Text style={styles.roleButtonText}>教練</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.roleButton, styles.athleteBtn]}
              onPress={confirmChooseAthlete}
              activeOpacity={0.85}
            >
              <Ionicons name="barbell-outline" size={28} color="#fff" />
              <Text style={styles.roleButtonText}>選手</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'coachForm' && (
        <>
          <Text style={styles.title}>教練身分申請</Text>
          <Text style={styles.subtitle}>請輸入您任職的學校或單位</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：明志國中 田徑隊"
            placeholderTextColor='#c4c4c4ff'
            value={orgName}
            onChangeText={setOrgName}
          />
          <View style={styles.buttonContainer}>
            <Button title="申請權限" onPress={submitCoachApplication} />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="返回" color="#888" onPress={() => setStep('choose')} />
          </View>
        </>
      )}

      {step === 'pending' && (
        <>
          <Text style={styles.title}>您的申請已進行審理</Text>
          <Text style={styles.subtitleSmall}>
            我們已收到您的教練身分申請（{app?.orgName || orgName}）。審核通過後，您將可啟用教練身分。
          </Text>
          <View style={styles.buttonContainer}>
            <Button title="返回" color="#888" onPress={() => setStep('choose')} />
          </View>
        </>
      )}

      {step === 'approved' && (
        <>
          <Text style={styles.title}>申請通過</Text>
          <Text style={styles.subtitleSmall}>
            您的教練身分已通過審核（{app?.orgName}）。
          </Text>
          <View style={styles.buttonContainer}>
            <Button
              title={`以 ${displayName || '我'} 教練的身分使用`}
              onPress={activateCoachRole}
            />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="返回" color="#888" onPress={() => setStep('choose')} />
          </View>
        </>
      )}

      {step === 'rejected' && (
        <>
          <Text style={styles.title}>申請未通過</Text>
          {app?.reason ? (
            <Text style={styles.subtitleSmall}>原因：{app.reason}</Text>
          ) : (
            <Text style={styles.subtitleSmall}>很抱歉，您的申請未通過。</Text>
          )}
          <Text style={[styles.subtitleSmall, { marginTop: 10 }]}>可調整內容後重新申請：</Text>
          <TextInput
            style={styles.input}
            placeholder="學校或單位"
            value={orgName}
            onChangeText={setOrgName}
          />
          <View style={styles.buttonContainer}>
            <Button title="重新申請" onPress={resubmitCoachApplication} />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="返回" color="#888" onPress={() => setStep('choose')} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor:'#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: -60, marginBottom: 20, textAlign: 'center' },
  subtitle: { fontSize: 16, color: 'gray', marginBottom: 24, textAlign: 'center' },
  subtitleSmall: { fontSize: 14, color: 'gray', marginBottom: 16, textAlign: 'center' },
  input: {
    width: '85%',
    height: 48,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  buttonContainer: { width: '85%', marginVertical: 6 },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    borderRadius: 14,
    paddingHorizontal: 16,

    // 陰影/浮起效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  coachBtn: {
    backgroundColor: '#007AFF', // iOS 藍
  },
  athleteBtn: {
    backgroundColor: '#10B981', // 綠色
  },
  roleButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 10, // 與圖示間距
  },
  loadingText: { marginTop: 10, fontSize: 16, color: 'gray' },
});