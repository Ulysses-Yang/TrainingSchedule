// copy-schedule.jsx
import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// ✨ 需安裝：@react-native-community/datetimepicker
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import "react-native-get-random-values";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";

// iOS 專用樣式
const iosStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerContainer: {
    backgroundColor: "#FFF", // 確保是白底
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    width: "90%",
    maxHeight: "85%",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    flexShrink: 0,
  },
  dateHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dateDisplayText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#007AFF",
    flexShrink: 0,
  },
  todayIndicator: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#28a745",
    marginLeft: 8,
  },
  // iOS 內嵌輪盤式 DatePicker
  iosDatePicker: {
    width: "100%",
    height: 216, // UIPickerView 標準高度
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 15,
    flexShrink: 0,
  },
  buttonContainer: {
    flex: 1,
    marginHorizontal: 10,
  },
});

// Android 專用樣式
const androidStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerContainer: {
    backgroundColor: "white",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    width: "90%",
    maxHeight: "85%",
    alignItems: "center",
    elevation: 5,
    position: "relative",
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    flexShrink: 0,
  },
  dateHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dateDisplayText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#007AFF",
    flexShrink: 0,
  },
  todayIndicator: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#28a745",
    marginLeft: 8,
  },
  // Android 用一個按鈕打開原生日曆 Modal
  androidDateButton: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FAFAFA",
  },
  androidDateButtonText: {
    textAlign: "center",
    fontSize: 16,
    color: "#333",
  },
  androidHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#888",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 15,
    flexShrink: 0,
  },
  buttonContainer: {
    flex: 1,
    marginHorizontal: 10,
  },
});

// 依平台選擇樣式
const styles = Platform.OS === "ios" ? iosStyles : androidStyles;

export default function CopyScheduleScreen() {
  const router = useRouter();
  const {
    sourceScheduleId,
    sourceDate,
    itemsToCopy: itemsToCopyJSON,
    scheduleNameToCopy,
  } = useLocalSearchParams();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [copiedName, setCopiedName] = useState(
    scheduleNameToCopy || "未命名課表",
  );
  const [copySuccessDate, setCopySuccessDate] = useState(null);
  useEffect(() => {
    let canceled = false;
    const bootstrap = async () => {
      // 相容舊邏輯：直接用 JSON 傳進來
      if (itemsToCopyJSON) {
        try {
          const parsed = JSON.parse(itemsToCopyJSON);
          if (!canceled) setItems(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error("解析課表失敗", e);
        }
        return;
      }
      // 新邏輯：用 sourceScheduleId 從 Firestore 抓
      if (sourceScheduleId) {
        try {
          const snap = await getDoc(
            doc(db, "schedules", String(sourceScheduleId)),
          );
          if (!canceled && snap.exists()) {
            const data = snap.data();
            setItems(data.items || []);
            setCopiedName(data.name || "未命名課表");
          }
        } catch (e) {
          console.error("讀取來源課表失敗", e);
        }
      }
    };
    bootstrap();
    return () => {
      canceled = true;
    };
  }, [sourceScheduleId, itemsToCopyJSON]);

  // 日期狀態（單一 Date 物件即可）
  const initialTargetDate = useMemo(() => dayjs(), []);
  const [tempDate, setTempDate] = useState(initialTargetDate.toDate());

  // 限制可選日期範圍：與原本 30 年視窗一致（從今年 -10 到 +19）
  const currentYear = new Date().getFullYear();
  const minDate = useMemo(
    () => new Date(currentYear - 10, 0, 1),
    [currentYear],
  );
  const maxDate = useMemo(
    () => new Date(currentYear + 19, 11, 31),
    [currentYear],
  );

  const selectedDateDisplay = useMemo(() => {
    return dayjs(tempDate).locale("zh-tw").format("YYYY年 M月 D日 (dddd)");
  }, [tempDate]);

  const isToday = useMemo(() => {
    return dayjs().isSame(dayjs(tempDate), "day");
  }, [tempDate]);

  // Android 控制 DatePicker 顯示
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  // 確認複製
  const handleCopyConfirm = useCallback(async () => {
    if (items.length === 0) {
      Alert.alert("錯誤", "沒有課表可以複製。");
      return;
    }
    if (!user?.uid) {
      Alert.alert("錯誤", "請先登入");
      return;
    }

    const destinationDate = dayjs(tempDate);
    const destDateStr = destinationDate.format("YYYY-MM-DD");

    try {
      await addDoc(collection(db, "schedules"), {
        ownerId: user.uid,
        creatorId: user.uid,
        creatorName: user.displayName || "",
        date: destDateStr, // 關鍵：要是 YYYY-MM-DD 字串
        name: copiedName || "未命名課表",
        items: items,
        createdAt: serverTimestamp(),
      });

      setCopySuccessDate(destDateStr);
    } catch (error) {
      console.error("複製課表失敗", error);
      Alert.alert("錯誤", "複製課表時發生問題");
    }
  }, [items, tempDate, router, scheduleNameToCopy, user?.uid, copiedName]);

  const handleViewCopiedDate = useCallback(() => {
    if (!copySuccessDate) return;
    router.replace({
      pathname: "/schedules-list",
      params: { date: copySuccessDate },
    });
  }, [copySuccessDate, router]);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        onPress={() => router.back()}
      />
      <View style={styles.pickerContainer}>
        <Text style={styles.title}>選擇要複製到的日期</Text>

        <View style={styles.dateHeaderContainer}>
          <Text style={styles.dateDisplayText}>{selectedDateDisplay}</Text>
          {isToday && <Text style={styles.todayIndicator}>(今天)</Text>}
        </View>

        {Platform.OS === "web" ? (
          React.createElement("input", {
            type: "date",
            value: dayjs(tempDate).format("YYYY-MM-DD"),
            min: dayjs(minDate).format("YYYY-MM-DD"),
            max: dayjs(maxDate).format("YYYY-MM-DD"),
            onChange: (event) => {
              if (event.target.value) {
                setTempDate(dayjs(event.target.value).toDate());
              }
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 12px",
              border: "1px solid #DDD",
              borderRadius: 10,
              backgroundColor: "#FAFAFA",
              fontSize: 16,
              color: "#333",
            },
          })
        ) : Platform.OS === "ios" ? (
          <DateTimePicker
            mode="date"
            display="spinner"
            value={tempDate}
            onChange={(_, date) => {
              if (date) setTempDate(date);
            }}
            minimumDate={minDate}
            maximumDate={maxDate}
            locale="zh-Hant"
            themeVariant="light"
            textColor="#111111"
            accentColor="#007AFF"
            style={styles.iosDatePicker}
          />
        ) : (
          <>
            <Pressable
              style={styles.androidDateButton}
              onPress={() => setShowAndroidPicker(true)}
            >
              <Text style={styles.androidDateButtonText}>選擇日期</Text>
            </Pressable>

            <Text style={styles.androidHint}>點擊上方按鈕開啟日期選擇器</Text>

            {showAndroidPicker && (
              <DateTimePicker
                mode="date"
                display="calendar"
                value={tempDate}
                onChange={(event, date) => {
                  setShowAndroidPicker(false);
                  if (event.type === "set" && date) {
                    setTempDate(date);
                  }
                }}
                minimumDate={minDate}
                maximumDate={maxDate}
              />
            )}
          </>
        )}
        <View style={styles.buttonRow}>
          <View style={styles.buttonContainer}>
            <Button title="取消" onPress={() => router.back()} color="#888" />
          </View>
          <View style={styles.buttonContainer}>
            <Button title="確認複製" onPress={handleCopyConfirm} />
          </View>
        </View>
      </View>
      <Modal
        transparent
        visible={!!copySuccessDate}
        animationType="fade"
        onRequestClose={() => router.back()}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 360,
              padding: 20,
              borderRadius: 12,
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
              複製成功
            </Text>
            <Text style={{ color: "#555", marginBottom: 20 }}>
              已將課表複製到 {dayjs(copySuccessDate).format("YYYY年M月D日")}。
            </Text>
            <View style={styles.buttonRow}>
              <View style={styles.buttonContainer}>
                <Button title="留在此頁" onPress={() => router.back()} color="#888" />
              </View>
              <View style={styles.buttonContainer}>
                <Button title="查看該日期" onPress={handleViewCopiedDate} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
