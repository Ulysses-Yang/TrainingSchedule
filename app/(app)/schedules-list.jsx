//app/(app)/schedules-list
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw"; // 確保中文語系已載入
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import "react-native-get-random-values";
dayjs.locale("zh-tw");

// ✨ 步驟 1: 引入 react-native-popup-menu 的相關元件 ✨
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";

// 樣式表 (新增了 menu 和 modal 的樣式)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f8ff" },
  safeArea: { flex: 1 },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#e6f3ff",
    borderBottomWidth: 1,
    borderBottomColor: "#cce7ff",
  },
  dateText: { fontSize: 20, fontWeight: "bold", color: "#005a9e" }, // 稍微縮小字體以適應排版,
  listContentContainer: { paddingHorizontal: 16, paddingVertical: 5 },
  itemContainer: {
    backgroundColor: "white",
    borderRadius: 10,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  itemPressable: { flexDirection: "row", alignItems: "center", padding: 10 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 18, fontWeight: "600", color: "#333" },
  makerNote: { fontSize: 14, color: "#8E8E93", fontWeight: "400" },
  itemCount: { fontSize: 14, color: "#777", marginTop: 4 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: { fontSize: 18, color: "#999" },
  // ✨ 新增的菜單觸發器樣式 ✨
  menuTrigger: { paddingHorizontal: 12, paddingVertical: 16 },
  menuTriggerText: { fontSize: 24, fontWeight: "bold", color: "#aab" },
  // ✨ 新增的 Modal 樣式 (用於修改名稱) ✨
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalView: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15 },
  textInput: {
    width: "100%",
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: { flex: 1, marginHorizontal: 5 },
  addButtonContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});

export default function SchedulesListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [schedules, setSchedules] = useState([]);
  const [currentDate, setCurrentDate] = useState(
    params.date || dayjs().format("YYYY-MM-DD"),
  );
  const [loading, setLoading] = useState(true);
  // ✨ 步驟 2: 新增用於修改名稱 Modal 的 state ✨
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingSchedule, setRenamingSchedule] = useState(null);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("");
  const [newName, setNewName] = useState("");
  const { user: currentUser } = useAuth();
  const db = getFirestore();

  useFocusEffect(
    useCallback(() => {
      // ✨ 3. 檢查 currentUser 是否存在，這是關鍵！
      if (!currentUser) {
        console.log("Schedules-List: 等待使用者資訊...");
        return; // 如果未登入，不執行任何操作
      }

      const dateToLoad = params.date || currentDate;
      if (dateToLoad !== currentDate) {
        setCurrentDate(dateToLoad);
      }

      console.log(
        `正在從 Firestore 為使用者 ${currentUser.uid} 載入 ${dateToLoad} 的課表...`,
      );
      setLoading(true);

      // ✨ 4. 建立 Firestore 查詢，並使用 onSnapshot 即時監聽
      const schedulesRef = collection(db, "schedules");
      const q = query(
        schedulesRef,
        where("ownerId", "==", currentUser.uid), // 只撈取自己的課表
        where("date", "==", dateToLoad), // 只撈取特定日期的課表
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const loadedSchedules = querySnapshot.docs.map((doc) => ({
            id: doc.id, // 使用 Firestore 的文件 ID
            ...doc.data(),
          }));
          setSchedules(loadedSchedules);
          setLoading(false);
        },
        (error) => {
          // 這就是您之前看到的 "監聽通知失敗" 錯誤的來源
          console.error("監聽課表失敗:", error);
          Alert.alert("錯誤", "無法載入課表資料，請檢查您的網路連線。");
          setLoading(false);
        },
      );

      // 清理函式：當畫面失焦時，取消監聽，節省資源
      return () => unsubscribe();
    }, [currentUser, params.date, currentDate]), // 依賴項加入 currentUser
  );

  const changeDate = (amount) => {
    const newDate = dayjs(currentDate).add(amount, "day").format("YYYY-MM-DD");
    // 當手動切換日期時，我們使用 router.setParams 來更新 URL，這會觸發 useFocusEffect
    router.setParams({ date: newDate });
  };

  const openAddScheduleModal = () => {
    setNewScheduleName(""); // 清空上次輸入的內容
    setAddModalVisible(true);
  };
  const handleConfirmAddSchedule = async () => {
    const trimmedName = newScheduleName.trim();
    if (!trimmedName || !currentUser) {
      Alert.alert("錯誤", "課表名稱不能為空或使用者未登入。");
      return;
    }

    try {
      await addDoc(collection(db, "schedules"), {
        ownerId: currentUser.uid, // 儲存擁有者 ID
        creatorId: currentUser.uid,
        creatorName: currentUser.displayName || "",
        date: currentDate, // 儲存日期
        name: trimmedName,
        items: [], // 初始項目為空陣列
        createdAt: serverTimestamp(),
      });
      setAddModalVisible(false);
    } catch (error) {
      console.error("新增課表到 Firestore 失敗:", error);
      Alert.alert("錯誤", "新增課表失敗。");
    }
  };

  // ✨ 步驟 3: 新增刪除課表的函式 ✨
  const handleDeleteSchedule = (scheduleId) => {
    const deleteSchedule = async () => {
      try {
        await deleteDoc(doc(db, "schedules", scheduleId));
      } catch (error) {
        console.error("刪除課表失敗：", error);

        if (Platform.OS === "web") {
          window.alert("刪除課表失敗，請檢查網路連線或 Firestore 權限。");
        } else {
          Alert.alert(
            "錯誤",
            "刪除課表失敗，請檢查網路連線或 Firestore 權限。",
          );
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("確定要刪除這份課表嗎？此操作無法復原。")) {
        void deleteSchedule();
      }
      return;
    }

    Alert.alert("確認刪除", "確定要刪除這份課表嗎？此操作無法復原。", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: deleteSchedule,
      },
    ]);
  };

  // ✨ 步驟 4: 新增觸發修改名稱 Modal 的函式 ✨
  const handleRenamePress = (schedule) => {
    setRenamingSchedule(schedule);
    setNewName(schedule.name);
    setRenameModalVisible(true);
  };

  // ✨ 步驟 5: 新增確認修改名稱的函式 ✨
  const handleConfirmRename = async () => {
    if (!newName.trim() || !renamingSchedule) {
      Alert.alert("錯誤", "名稱不能為空。");
      return;
    }
    try {
      const scheduleDocRef = doc(db, "schedules", renamingSchedule.id);
      await updateDoc(scheduleDocRef, {
        name: newName.trim(),
      });
      setRenameModalVisible(false);
      setRenamingSchedule(null);
    } catch (error) {
      console.error("更新課表名稱失敗:", error);
      Alert.alert("錯誤", "更新失敗。");
    }
  };

  const renderItem = ({ item }) => {
    const formatCoachName = (name) => {
      const raw = (name || "教練").trim();
      return raw.endsWith("教練") ? raw : `${raw}教練`;
    };

    const isCoachMade = !!item.creatorId && item.creatorId !== item.ownerId;

    return (
      <View style={styles.itemContainer}>
        <View style={styles.itemPressable}>
          <Pressable
            style={styles.itemContent}
            onPress={() =>
              router.push({
                pathname: "/schedule",
                params: {
                  date: currentDate,
                  scheduleId: item.id,
                  scheduleName: item.name,
                },
              })
            }
          >
            {/* 單一標題：只有教練製作才加註 */}
            <Text
              style={styles.itemName}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.name || "未命名課表"}
              {isCoachMade && (
                <>
                  {"   "}
                  <Text style={styles.makerNote}>
                    ({formatCoachName(item.creatorName)}製作)
                  </Text>
                </>
              )}
            </Text>

            <Text style={styles.itemCount}>
              已選取 {item.items?.length || 0} 個項目
            </Text>
          </Pressable>

          <Menu>
            <MenuTrigger style={styles.menuTrigger}>
              <Text style={styles.menuTriggerText}>⋮</Text>
            </MenuTrigger>
            <MenuOptions>
              <MenuOption onSelect={() => handleRenamePress(item)}>
                <Text style={{ color: "blue", padding: 8 }}>修改名稱</Text>
              </MenuOption>
              <MenuOption onSelect={() => handleDeleteSchedule(item.id)}>
                <Text style={{ color: "red", padding: 8 }}>刪除課表</Text>
              </MenuOption>
            </MenuOptions>
          </Menu>
        </View>
      </View>
    );
  };

  // ✨ 步驟 7: 將整個畫面用 MenuProvider 包起來 ✨
  return (
    <View style={styles.container}>
      <View style={styles.dateHeader}>
        <TouchableOpacity onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {dayjs(currentDate).format("YYYY年 M月 D日")}
        </Text>
        <TouchableOpacity onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={28} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.addButtonContainer}>
        <Button
          title="新增課表"
          onPress={openAddScheduleModal}
          color="#007AFF"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={styles.emptyContainer} />
      ) : (
        <FlatList
          data={schedules}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                今天沒有課表，點擊上方按鈕新增一個吧！
              </Text>
            </View>
          )}
        />
      )}

      {/* 修改名稱用的 Modal */}
      <Modal
        transparent={true}
        visible={isRenameModalVisible}
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>修改課表名稱</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="請輸入新名稱"
              autoFocus={true}
            />
            <View style={styles.modalButtonRow}>
              <View style={styles.modalButton}>
                <Button
                  title="取消"
                  onPress={() => setRenameModalVisible(false)}
                  color="#888"
                />
              </View>
              <View style={styles.modalButton}>
                <Button title="儲存" onPress={handleConfirmRename} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {/* 「新增課表」的 Modal */}
      <Modal
        transparent={true}
        visible={isAddModalVisible}
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>新增課表</Text>
            <TextInput
              style={styles.textInput}
              value={newScheduleName}
              onChangeText={setNewScheduleName}
              placeholder="請輸入課表名稱"
              placeholderTextColor="#777"
              autoFocus={true}
            />
            <View style={styles.modalButtonRow}>
              <View style={styles.modalButton}>
                <Button
                  title="取消"
                  onPress={() => setAddModalVisible(false)}
                  color="#888"
                />
              </View>
              <View style={styles.modalButton}>
                <Button title="確定" onPress={handleConfirmAddSchedule} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
