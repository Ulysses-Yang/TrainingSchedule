// app/(app)/index.jsx
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { getAuth, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import FriendsTab from "../../components/FriendsTab";
import { useAuth } from "../../context/AuthContext";

export default function CalendarScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [scheduleMarks, setScheduleMarks] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [currentMonth, setCurrentMonth] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [isFriendsModalVisible, setFriendsModalVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");

  const { user: currentUser } = useAuth();
  const db = getFirestore();

  const displayRole = useMemo(() => {
    const raw = (role || "").toString().trim();
    const lower = raw.toLowerCase();
    if (lower === "coach" || lower === "trainer") return "教練";
    if (lower === "athlete" || lower === "player") return "選手";
    if (raw === "教練" || raw === "選手") return raw;
    return "";
  }, [role]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="設定"
        >
          <Ionicons name="settings-outline" size={22} color="#007AFF" />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => setFriendsModalVisible(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          accessibilityRole="button"
          accessibilityLabel="好友管理"
        >
          <View style={{ position: "relative" }}>
            <Ionicons name="people" size={20} color="#007AFF" />
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pendingCount > 99 ? "99+" : String(pendingCount)}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ color: "#007AFF", fontWeight: "700" }}>好友管理</Text>
        </TouchableOpacity>
      ),
      // 不覆蓋 headerRight，保留 _layout.jsx 的通知鈴鐺
    });
  }, [navigation, pendingCount, router]);

  useFocusEffect(
    useCallback(() => {
      if (!currentUser) {
        setPendingCount(0);
        return;
      }
      const q = query(
        collection(db, "friend_requests"),
        where("to", "==", currentUser.uid),
        where("status", "==", "pending"),
      );
      const unsubscribe = onSnapshot(
        q,
        (snap) => setPendingCount(snap.size),
        (err) => {
          console.error("監聽好友邀請失敗:", err);
          setPendingCount(0);
        },
      );
      return () => unsubscribe();
    }, [currentUser?.uid]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!currentUser) {
        setDisplayName("");
        setRole("");
        return;
      }
      const userRef = doc(db, "users", currentUser.uid);
      const unsubscribe = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const name =
          data.displayName ||
          currentUser.displayName ||
          (currentUser.email ? currentUser.email.split("@")[0] : "") ||
          "使用者";
        setDisplayName(name);
        setRole(data.role || data.identity || "");
      });
      return () => unsubscribe();
    }, [currentUser?.uid]),
  );

  useFocusEffect(
    useCallback(() => {
      const loadMarkedDates = async () => {
        if (!currentUser) {
          console.log("AuthContext: 等待使用者資訊，暫不載入課表...");
          return;
        }
        console.log(
          `AuthContext: 使用者資訊已就緒 (${currentUser.uid})，開始載入課表。`,
        );
        try {
          const schedulesRef = collection(db, "schedules");
          const q = query(
            schedulesRef,
            where("ownerId", "==", currentUser.uid),
          );
          const querySnapshot = await getDocs(q);

          const newMarks = {};
          querySnapshot.forEach((doc) => {
            const schedule = doc.data();
            const date = schedule.date;
            if (!newMarks[date]) {
              newMarks[date] = { dots: [] };
            }
            newMarks[date].dots.push({ color: "#00adf5" });
          });
          setScheduleMarks(newMarks);
        } catch (error) {
          console.error("從 Firestore 載入課表標記失敗:", error);
        }
      };
      loadMarkedDates();
    }, [currentUser]),
  );

  const finalMarkedDates = useMemo(() => {
    const combinedMarks = { ...scheduleMarks };
    if (selectedDate) {
      combinedMarks[selectedDate] = {
        ...(combinedMarks[selectedDate] || {}),
        selected: true,
        selectedColor: "#e91e63",
        customStyles: { text: { color: "white", fontWeight: "bold" } },
      };
    }
    const todayString = dayjs().format("YYYY-MM-DD");
    if (todayString !== selectedDate) {
      combinedMarks[todayString] = {
        ...(combinedMarks[todayString] || {}),
        customStyles: {
          ...((combinedMarks[todayString] || {}).customStyles || {}),
          text: { color: "#e21559ff", fontWeight: "bold" },
        },
      };
    }
    return combinedMarks;
  }, [scheduleMarks, selectedDate]);

  // 點擊日曆日期：移動紅點並導頁
  const onDayPress = useCallback(
    (day) => {
      const dateStr = day.dateString;
      setSelectedDate(dateStr);
      setCurrentMonth(dateStr); // 若點到跨月的日期，讓標題月份也跟著更新
      router.push({ pathname: "/schedules-list", params: { date: dateStr } });
    },
    [router],
  );

  const handleLogout = async () => {
    try {
      setFriendsModalVisible(false);
      await signOut(getAuth());
      router.replace("/(auth)/login");
    } catch (e) {
      console.error("登出失敗:", e);
      Alert.alert("登出失敗", "請稍後再試");
    }
  };

  // 小工具：跳到指定日期，只更新月曆與選取，不導頁
  const goToDate = useCallback((dateObj) => {
    // [修改] 這個函式現在只更新 currentMonth 與 selectedDate，不再做 router.push
    const newDateStr = dayjs(dateObj).format("YYYY-MM-DD");
    setCurrentMonth(newDateStr);
    setSelectedDate(newDateStr);
  }, []); // [修改] 移除 router 依賴

  // 創建今日課表 - 保留原行為（仍會導頁）
  const createTodaySchedule = () => {
    const today = dayjs().format("YYYY-MM-DD");
    setSelectedDate(today);
    setCurrentMonth(today);
    setTimeout(() => {
      router.push({ pathname: "/schedules-list", params: { date: today } });
    }, 100);
  };

  // 日期選擇器：iOS 與 Android 分流
  const handleDateChange = (event, date) => {
    if (Platform.OS === "android") {
      // [新增] Android：處理「今天」中立按鈕
      if (event.type === "neutralButtonPressed") {
        const today = new Date();
        setTempDate(today); // 更新 value -> 對話框內會跳到今天
        return;
      }
      // Android 會出現原生的「確定/取消」
      if (event.type === "set" && date) {
        setShowDatePicker(false);
        setTempDate(date);
        goToDate(date); // 只更新選取與月份，不導頁
      } else {
        // dismissed
        setShowDatePicker(false);
      }
      return;
    }
    // iOS：先暫存，等按自訂「完成」再更新
    if (date) {
      setTempDate(date);
    }
  };

  const handleDatePickerConfirm = () => {
    setShowDatePicker(false);
    goToDate(tempDate); // 只更新選取與月份，不導頁
  };

  // [新增] iOS：一鍵跳到今天（不關閉選擇器）
  const handleTodayPressIOS = () => {
    setTempDate(new Date());
  };

  // 自訂日曆標題
  const renderCustomHeader = (date) => {
    const headerDate = dayjs(date.toString());
    const month = headerDate.format("M月");
    const year = headerDate.format("YYYY年");

    return (
      <TouchableOpacity
        onPress={() => {
          setTempDate(headerDate.toDate());
          setShowDatePicker(true);
        }}
        style={styles.header}
      >
        <Text style={styles.headerText}>{`${year} ${month}`}</Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color="#007AFF"
          style={{ marginLeft: 5 }}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.userBar}>
        <Ionicons name="person-circle-outline" size={26} color="#333" />
        <Text style={styles.userBarText}>
          {displayName}
          {displayRole ? ` ${displayRole}` : ""}
        </Text>
      </View>
      <Text style={styles.subtitle}>選擇日期製作課表 哈囉</Text>

      {/* 創建今日課表按鈕 */}
      <View style={styles.todaySection}>
        <TouchableOpacity
          style={styles.createTodayButton}
          onPress={createTodaySchedule}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.createTodayButtonText}>創建今日課表</Text>
        </TouchableOpacity>
      </View>

      {/* 日期選擇器：iOS 用自訂 Modal；Android 用原生彈窗 */}
      {Platform.OS === "ios" ? (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            {/* 重點：iOS 獨有的較小 padding + 避免裁切 */}
            <View style={[styles.pickerContainer, styles.iosPickerContainer]}>
              <Text style={styles.pickerTitle}>選擇日期</Text>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                locale="zh-Hant"
                themeVariant="light" // 只在 iOS：強制亮色，避免白字白底
                textColor="#111111" // 只在 iOS：指定輪盤字色
                accentColor="#007AFF" // 只在 iOS：選中高亮色
                style={styles.iosPicker} // 只在 iOS：給足高度，避免被裁切
              />
              <View style={styles.pickerButtons}>
                <TouchableOpacity
                  style={[styles.pickerButton, styles.todayButton]}
                  onPress={handleTodayPressIOS}
                >
                  <Text style={styles.todayButtonText}>回到今天</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pickerButton, styles.cancelButton]}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.cancelButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickerButton, styles.confirmButton]}
                  onPress={handleDatePickerConfirm}
                >
                  <Text style={styles.confirmButtonText}>完成</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            locale="zh-Hant"
            neutralButtonLabel="回到今天" // [新增] Android：原生對話框內的「今天」按鈕
          />
        )
      )}

      <Calendar
        key={currentMonth}
        current={currentMonth}
        onMonthChange={(month) => {
          setCurrentMonth(month.dateString);
          setSelectedDate("");
        }}
        renderHeader={renderCustomHeader}
        markingType={"multi-dot"}
        markedDates={finalMarkedDates}
        onDayPress={onDayPress}
        theme={{
          headerTextColor: "#007AFF",
          textHeaderFontSize: 18,
          textHeaderFontWeight: "bold",
          arrowColor: "#007AFF",
          todayTextColor: "#e91e63",
          "stylesheet.calendar.header": {
            week: {
              marginTop: 5,
              flexDirection: "row",
              justifyContent: "space-between",
            },
            dayHeader: { color: "#233f55ff", fontWeight: "600" },
          },
        }}
      />

      <Modal
        animationType="slide"
        visible={isFriendsModalVisible}
        onRequestClose={() => setFriendsModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>好友管理</Text>
            <TouchableOpacity onPress={() => setFriendsModalVisible(false)}>
              <Ionicons name="close-circle" size={30} color="#ccc" />
            </TouchableOpacity>
          </View>
          <FriendsTab />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const BADGE_MIN = 16;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 30,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  userBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 8,
    marginBottom: 6,
  },
  userBarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  todaySection: {
    alignItems: "center",
    marginBottom: 16,
  },
  createTodayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#69c5efff",
    borderRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createTodayButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007AFF",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 20,
    width: "85%",
    maxWidth: 350,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 15,
    color: "#333",
  },
  pickerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 10,
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  // [新增] iOS：今天按鈕樣式
  todayButton: {
    backgroundColor: "#e8f4ff",
    borderWidth: 1,
    borderColor: "#b9dcff",
  },
  todayButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#f1f3f4",
  },
  confirmButton: {
    backgroundColor: "#007AFF",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    paddingVertical: 16,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#ffecec",
    borderWidth: 1,
    borderColor: "#ffbdbd",
  },
  logoutText: {
    color: "#d00",
    fontWeight: "700",
    fontSize: 16,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: BADGE_MIN,
    height: BADGE_MIN,
    paddingHorizontal: 4,
    borderRadius: BADGE_MIN / 2,
    backgroundColor: "#FF3B30",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  iosPickerContainer: Platform.select({
    ios: {
      paddingHorizontal: 12, // iOS 縮小 padding，避免內容被擠
      paddingVertical: 12,
      backgroundColor: "#fff",
      overflow: "visible", // iOS 避免輪盤邊緣被切到
    },
    android: {},
  }),
  iosPicker: Platform.select({
    ios: {
      width: "100%",
      height: 216, // iOS 輪盤建議高度（接近原生）
      backgroundColor: "transparent",
      alignSelf: "stretch",
    },
    android: {},
  }),
});
