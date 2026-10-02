// app/(app)/schedule.jsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Keyboard,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Swipeable } from "react-native-gesture-handler";
dayjs.locale("zh-tw");

import { Feather } from "@expo/vector-icons";
import "react-native-get-random-values";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { Platform } from "react-native";
import SendScheduleModal from "../../components/SendScheduleModal";
import { useAuth } from "../../context/AuthContext";

// 樣式表 (保持不變)
const styles = StyleSheet.create({
  container: { flex: 1, padding: 8, backgroundColor: "#fff" },
  centerTitleContainer: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  title: { fontSize: 28, fontWeight: "bold" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  dateDisplay: { padding: 12, backgroundColor: "#f0f0f0", borderRadius: 8 },
  dateText: { fontSize: 16, color: "#333", fontWeight: "500" },
  targetText: { fontSize: 16, color: "#666", fontWeight: "500" },
  itemContainer: {
    height: 40, // 這裡的 height 只是個預設值，會被動態高度覆蓋
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
  },
  itemRow: { flex: 1, flexDirection: "row", alignItems: "center" },
  orderNumber: {
    width: 24,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
    color: "#333",
  },
  categoryColumn: {
    flex: 0.8,
    paddingHorizontal: 4,
    backgroundColor: "#ffffffff",
  },
  labelColumn: { flex: 2, paddingHorizontal: 4, backgroundColor: "#ffffffff" },
  noteColumn: { flex: 3, paddingHorizontal: 4, backgroundColor: "#7fdee9ff" },
  dragHandleColumn: { width: 30, alignItems: "center" },
  categoryText: { fontWeight: "600", color: "#888", fontSize: 10 },
  labelText: { fontWeight: "900", color: "#4545f5ff", fontSize: 15 }, // 這是基本字體大小
  noteInline: { color: "#555", fontStyle: "italic", fontSize: 13 }, // 這是基本字體大小
  dragHandle: { fontSize: 24, color: "#ccc" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: { fontSize: 20, fontWeight: "bold", color: "#aaa" },
  emptyHint: { fontSize: 16, color: "#ccc", marginTop: 8 },
  headerContainer: {
    height: 100,
    backgroundColor: "#f8f8f8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingTop: 40,
    paddingHorizontal: 10,
  },
  headerLeft: {
    width: 50,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRight: {
    width: 50,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 2,
  },
  headerMenuTrigger: {
    padding: 10,
  },
  menuOptions: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  menuOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  menuOptionText: {
    fontSize: 16,
    color: "#333",
  },
  disabledMenuOptionText: {
    fontSize: 16,
    color: "#aaa",
  },
  rightAction: {
    backgroundColor: "#dd2c00",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
  },
  actionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});

const RightActions = ({ onPress }) => {
  return (
    <Pressable onPress={onPress}>
      <View style={styles.rightAction}>
        <Text style={styles.actionText}>刪除</Text>
      </View>
    </Pressable>
  );
};

// ScheduleList 子元件 (✨ 這裡有修改 ✨)
const ScheduleList = React.memo(({ items, onDragEnd, onDeleteItem }) => {
  const swipeableRefs = useRef({});

  // ✨ 1. 新增：計算動態字體大小的輔助函數
  /**
   * 根據項目總數計算每個項目的動態高度
   * @param {number} itemCount - 項目總數
   * @param {object} options - 選項
   * @param {number} options.baseHeight - 基本高度
   * @param {number} options.minHeight - 最小高度
   * @param {number} options.threshold - 開始縮小高度的項目數量閾值
   * @param {number} options.reductionFactor - 每增加一個項目，高度減少的值
   * @returns {number} - 計算後的高度
   * 根據文字長度計算字體大小
   * @param {string} text - 要計算的文字
   * @param {object} options - 選項
   * @param {number} options.baseSize - 基本字體大小
   * @param {number} options.minSize - 最小字體大小
   * @param {number} options.threshold - 開始縮小字體的字數閾值
   * @returns {number} - 計算後的字體大小
   */

  const getDynamicItemHeight = (
    itemCount,
    { baseHeight, minHeight, threshold, reductionFactor },
  ) => {
    if (itemCount <= threshold) {
      return baseHeight;
    }
    // 項目數量超過閾值後，每增加 1 個項目，高度減少 reductionFactor
    const newHeight = baseHeight - (itemCount - threshold) * reductionFactor;
    // 確保高度不小於 minHeight
    return Math.max(newHeight, minHeight);
  };

  // ✨ 2. 在元件渲染前計算出所有項目應用的統一高度
  const itemHeight = getDynamicItemHeight(items.length, {
    baseHeight: 40, // 對應 styles.itemContainer.height
    minHeight: 30, // 最小高度，避免太小不易操作
    threshold: 10, // 當項目超過 10 個時開始縮小
    reductionFactor: 1, // 每多一個項目，高度減少 1
  });

  const getDynamicFontSize = (text, { baseSize, minSize, threshold }) => {
    const length = text ? text.length : 0;
    if (length <= threshold) {
      return baseSize;
    }
    // 字數超過閾值後，每增加 2 個字，字體大小減少 2
    const newSize = baseSize - Math.floor((length - threshold) / 2) * 2;
    // 確保字體大小不小於 minSize
    return Math.max(newSize, minSize);
  };

  const renderItem = useCallback(
    ({ item, drag, isActive }) => {
      const index = items.findIndex((i) => i.key === item.key);

      const categoryFontSize = getDynamicFontSize(item.category, {
        baseSize: 10, // 對應 styles.caText.fontSize
        minSize: 6, // 最小字體大小
        threshold: 3, // 字數超過 8 個字時開始縮小
      });

      // ✨ 2. 新增：為 label 和 note 計算動態字體大小
      const labelFontSize = getDynamicFontSize(item.label, {
        baseSize: 15, // 對應 styles.labelText.fontSize
        minSize: 10, // 最小字體大小
        threshold: 3, // 字數超過 3 個字時開始縮小
      });

      const noteFontSize = getDynamicFontSize(item.note, {
        baseSize: 13, // 對應 styles.noteInline.fontSize
        minSize: 10, // 最小字體大小
        threshold: 15, // 備註字數超過 15 個字時開始縮小
      });

      const swipeableRowRef = useRef(null);

      const handleDelete = () => {
        // 在執行刪除邏輯前先關閉 swipeable
        swipeableRowRef.current?.close();
        onDeleteItem(item);
      };

      return (
        <Swipeable
          ref={(ref) => {
            swipeableRefs.current[item.key] = ref;
          }}
          renderRightActions={() => <RightActions onPress={handleDelete} />}
          overshootRight={false} // 防止滑動超過
          containerStyle={{
            marginBottom: 5,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 8,
            overflow: "hidden", // 確保圓角能裁切掉內部的直角
          }}
        >
          <ScaleDecorator>
            <Pressable
              onLongPress={drag}
              delayLongPress={200}
              style={[
                styles.itemContainer,
                {
                  height: itemHeight, // 在這裡應用計算出來的高度
                  backgroundColor: isActive ? "#f0f0f0" : "#fff",
                },
              ]}
            >
              <View style={styles.itemRow}>
                <Text style={styles.orderNumber}>{index + 1}.</Text>
                <View style={styles.categoryColumn}>
                  <Text
                    style={[
                      styles.categoryText,
                      { fontSize: categoryFontSize },
                    ]}
                    numberOfLines={2}
                  >
                    {item.category}
                  </Text>
                </View>
                <View style={styles.labelColumn}>
                  {/* ✨ 3. 修改：應用動態字體大小 */}
                  <Text
                    style={[styles.labelText, { fontSize: labelFontSize }]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                </View>
                <View style={styles.noteColumn}>
                  {/* ✨ 3. 修改：應用動態字體大小 */}
                  <Text
                    style={[styles.noteInline, { fontSize: noteFontSize }]}
                    numberOfLines={2}
                  >
                    {item.note ? `(${item.note})` : ""}
                  </Text>
                </View>
                <View style={styles.dragHandleColumn}>
                  <Text style={styles.dragHandle}>≡</Text>
                </View>
              </View>
            </Pressable>
          </ScaleDecorator>
        </Swipeable>
      );
    },
    [items, itemHeight, onDeleteItem],
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>今天沒有課表</Text>
        <Text style={styles.emptyHint}>點擊右上角以編輯項目</Text>
      </View>
    );
  }

  return (
    <DraggableFlatList
      data={items}
      onDragEnd={onDragEnd}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: 20 }}
    />
  );
});

export default function ScheduleScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { date, scheduleId } = useLocalSearchParams();
  const [items, setItems] = useState([]);
  const [scheduleName, setScheduleName] = useState("");
  const [targetGroup, setTargetGroup] = useState("");
  const [scheduleDate, setScheduleDate] = useState(date);
  const [loading, setLoading] = useState(true);
  const [isSendModalVisible, setSendModalVisible] = useState(false);
  const db = getFirestore();
  const { user } = useAuth(); // user 會在登入後自動更新
  const formattedDate = scheduleDate
    ? dayjs(scheduleDate).format("YYYY年 M月 D日 (dddd)")
    : "讀取中...";

  const [userRole, setUserRole] = useState(null);
  const [coachDisplayName, setCoachDisplayName] = useState("");
  const [isExportModalVisible, setExportModalVisible] = useState(false);
  // 相容中英文
  const isCoach = useMemo(() => {
    const r = (userRole || "").toString().trim().toLowerCase();
    return r === "教練" || r === "coach" || r === "trainer";
  }, [userRole]);

  useEffect(() => {
    if (user?.uid) {
      const userDocRef = doc(db, "users", user.uid);
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserRole(data.role);
          setCoachDisplayName((data.displayName || "").trim());
        }
      });
    }
  }, [user?.uid]);

  const handleEditPress = useCallback(() => {
    setTimeout(() => {
      Keyboard.dismiss();
      router.push({
        pathname: "/category",
        params: { rawDate: date, formattedDate, scheduleId, scheduleName },
      });
    }, 80); // 讓 PopupMenu 有時間完全關閉（特別是 Samsung）
  }, [router, date, scheduleId, scheduleName, formattedDate]);

  const handleCopyPress = useCallback(() => {
    if (!scheduleId) return;
    setTimeout(() => {
      router.push({
        pathname: "/copy-schedule",
        params: { sourceScheduleId: scheduleId },
      });
    }, 80);
  }, [router, scheduleId]);

  const handleSendPress = useCallback(() => {
    if (!isCoach) return; // 不是教練，不動作（選手根本看不到這個選項）
    if ((items?.length ?? 0) === 0) return; // 沒內容，不動作（顯示為 disabled）
    // 避免 Android 上 Menu 還未關閉導致 Modal 蓋不起來
    setTimeout(() => setSendModalVisible(true), 80);
  }, [isCoach, items?.length]);

  // ✨ 產生課表的 HTML（PDF/Word 共用）
  const buildScheduleHTML = useCallback(
    ({ name, dateStr, targetGroup, items }) => {
      const escapeHTML = (s = "") =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const rows = (items || [])
        .map((it, idx) => {
          const note = it?.note ? `(${it.note})` : "";
          return `
        <tr>
          <td style="padding:8px; text-align:center;">${idx + 1}</td>
          <td style="padding:8px;">${escapeHTML(it?.category || "")}</td>
          <td style="padding:8px; font-weight:600; color:#4545f5;">${escapeHTML(it?.label || "")}</td>
          <td style="padding:8px; color:#555; font-style:italic;">${escapeHTML(note)}</td>
        </tr>
      `;
        })
        .join("");

      return `
  <!DOCTYPE html>
  <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHTML(name || "課表")}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", "PingFang TC", "Heiti TC", "Microsoft JhengHei", sans-serif; margin: 24px; color: #333; }
        h1 { margin: 0 0 4px 0; font-size: 24px; text-align: center; }
        .meta { margin: 0 0 16px 0; color: #666; text-align: center; }
        table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; }
        th { background: #f7f7f7; text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
        td { border-top: 1px solid #eee; vertical-align: top; }
      </style>
    </head>
    <body>
      <h1>${escapeHTML(name || "課表")}</h1>
      <p class="meta">${escapeHTML(dateStr || "")}</p>
      <table>
        <thead>
          <tr>
            <th style="width: 60px; text-align:center;">#</th>
            <th style="width: 20%;">分類</th>
            <th style="width: 40%;">項目</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" style="padding: 12px; text-align:center; color:#999;">今天沒有課表</td></tr>`}
        </tbody>
      </table>
    </body>
  </html>
  `;
    },
    [],
  );

  // ✨ 檔名清理
  const sanitizeFilename = (name = "課表") =>
    name.replace(/[\\/:*?"<>|]/g, "").trim() || "課表";

  // ✨ 匯出為 PDF
  const exportScheduleAsPDF = useCallback(async () => {
    try {
      const dateStr = scheduleDate
        ? dayjs(scheduleDate).format("YYYY/MM/DD (ddd)")
        : formattedDate;
      const html = buildScheduleHTML({
        name: scheduleName,
        dateStr,
        targetGroup,
        items,
      });

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");

        if (!printWindow) {
          throw new Error("列印視窗被瀏覽器封鎖，請允許此網站開啟彈出視窗。");
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();

        // 等新視窗完成排版後再開啟列印視窗
        setTimeout(() => {
          printWindow.print();
        }, 300);

        return;
      }

      await Print.printAsync({ html });
    } catch (e) {
      console.error("PDF 匯出失敗", e);
      Alert.alert("錯誤", "匯出 PDF 失敗，請稍後再試。");
    }
  }, [
    items,
    scheduleDate,
    scheduleName,
    formattedDate,
    targetGroup,
    buildScheduleHTML,
  ]);

  // ✨ 匯出為 Word（以 HTML 方式輸出 .doc，Word 可正常開啟）
  const exportScheduleAsDocx = useCallback(async () => {
    try {
      const dateStr = scheduleDate
        ? dayjs(scheduleDate).format("YYYY/MM/DD (ddd)")
        : formattedDate;

      const headerPara = (text, opts = {}) =>
        new Paragraph({ children: [new TextRun({ text, ...opts })] });

      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            children: [headerPara("#", { bold: true })],
            width: { size: 800, type: WidthType.DXA },
          }),
          new TableCell({
            children: [headerPara("分類", { bold: true })],
            width: { size: 2000, type: WidthType.DXA },
          }),
          new TableCell({
            children: [headerPara("項目", { bold: true })],
            width: { size: 4000, type: WidthType.DXA },
          }),
          new TableCell({
            children: [headerPara("備註", { bold: true })],
            width: { size: 4000, type: WidthType.DXA },
          }),
        ],
      });

      const rows = (items || []).map(
        (it, idx) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(String(idx + 1))] }),
              new TableCell({ children: [new Paragraph(it?.category || "")] }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: it?.label || "",
                        bold: true,
                        color: "4545F5",
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                children: [new Paragraph(it?.note ? `(${it.note})` : "")],
              }),
            ],
          }),
      );

      const doc = new Document({
        styles: {
          default: {
            document: { run: { font: "Noto Sans TC" } },
            heading1: { run: { font: "Noto Sans TC" } },
          },
        },
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: scheduleName || "課表",
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: targetGroup ? `${dateStr}` : dateStr,
                    color: "666666",
                  }),
                ],
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [headerRow, ...rows],
              }),
            ],
          },
        ],
      });

      const filename = `${sanitizeFilename(scheduleName || "課表")}_${dayjs(
        scheduleDate || new Date(),
      ).format("YYYYMMDD")}.docx`;

      if (Platform.OS === "web") {
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }

      const base64 = await Packer.toBase64String(doc);
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          dialogTitle: "分享 DOCX",
          UTI: "org.openxmlformats.wordprocessingml.document",
        });
      } else {
        Alert.alert("已匯出", `檔案已儲存至：\n${fileUri}`);
      }
    } catch (e) {
      console.error("DOCX 匯出失敗", e);
      Alert.alert("錯誤", "匯出 DOCX 失敗，請稍後再試。");
    }
  }, [items, scheduleName, scheduleDate, formattedDate, targetGroup]);

  // ✨ 點「匯出課表」時，讓使用者選 PDF 或 Word
  const handleExportPress = useCallback(() => {
    setExportModalVisible(true);
  }, []);

  const updateItemsInStorage = useCallback(
    async (newItems) => {
      if (!scheduleId) return; // 保護
      try {
        const scheduleDocRef = doc(db, "schedules", scheduleId);
        await setDoc(scheduleDocRef, { items: newItems }, { merge: true });
      } catch (error) {
        console.error("更新項目順序到 Firestore 失敗", error);
      }
    },
    [scheduleId, db],
  );

  const saveSchedule = useCallback(async () => {
    try {
      const dateKey = `schedule_${date}`;
      const dailySchedulesJSON = await AsyncStorage.getItem(dateKey);
      let dailySchedules = dailySchedulesJSON
        ? JSON.parse(dailySchedulesJSON)
        : [];

      const scheduleIndex = dailySchedules.findIndex(
        (s) => s.id === scheduleId,
      );

      if (scheduleIndex > -1) {
        dailySchedules[scheduleIndex].items = items;
        dailySchedules[scheduleIndex].name = scheduleName;
        await AsyncStorage.setItem(dateKey, JSON.stringify(dailySchedules));
        Alert.alert("成功", "課表已儲存");
      } else {
        Alert.alert("錯誤", "找不到要儲存的課表。");
      }
    } catch (error) {
      console.error("儲存課表失敗", error);
      Alert.alert("錯誤", "無法儲存課表");
    }
  }, [date, scheduleId, items, scheduleName]);

  const handleDeleteItem = useCallback(
    (itemToDelete) => {
      Alert.alert("確認刪除", `確定要刪除 "${itemToDelete.label}" 嗎？`, [
        { text: "取消", style: "cancel" },
        {
          text: "確定",
          onPress: async () => {
            // 從目前畫面的 state 中移除，UI 立即更新
            const newItems = items.filter(
              (item) => item.key !== itemToDelete.key,
            );
            setItems(newItems);

            try {
              // 2. 更新 Firestore 中的課表文件
              const scheduleDocRef = doc(db, "schedules", scheduleId);
              await updateDoc(scheduleDocRef, {
                items: newItems, // 直接用更新後的 items 陣列覆蓋舊的
              });
              console.log(`Firestore 課表 ${scheduleId} 中的項目已移除。`);

              // 3. (假設性) 更新來源分類的 isSelected 狀態
              // 這裡假設您的分類項目儲存在一個 'categories' 集合中
              // 並且每個文件是一個分類，裡面有 items 陣列
              // 如果您的分類結構不同，請對應修改
              if (itemToDelete.category && itemToDelete.label) {
                const categoryDocRef = doc(
                  db,
                  "categories",
                  itemToDelete.category,
                );
                const categoryDoc = await getDoc(categoryDocRef);
                if (categoryDoc.exists()) {
                  const categoryData = categoryDoc.data();
                  const categoryItems = categoryData.items || [];
                  const updatedCategoryItems = categoryItems.map((item) =>
                    item.name === itemToDelete.label
                      ? { ...item, isSelected: false }
                      : item,
                  );

                  await updateDoc(categoryDocRef, {
                    items: updatedCategoryItems,
                  });
                  console.log(
                    `分類 ${itemToDelete.category} 中的項目 "${itemToDelete.label}" 已在 Firestore 中取消勾選。`,
                  );
                }
              }
            } catch (error) {
              console.error("從 Firestore 刪除項目失敗", error);
              Alert.alert("錯誤", "資料更新失敗，請稍後再試。");
              // 如果出錯，可以考慮把刪掉的項目加回來，恢復 UI
              // setItems(items);
            }
          },
          style: "destructive",
        },
      ]);
    },
    [items, scheduleId, db],
  ); // ✨ 記得加入 db 依賴

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <View style={styles.headerContainer}>
          {/* 左上：返回鍵 */}
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else router.back();
              }}
              style={styles.headerMenuTrigger}
              hitSlop={8}
              accessibilityLabel="返回"
            >
              <Feather name="arrow-left" size={28} color="#007AFF" />
            </Pressable>
          </View>

          {/* 中間：標題與日期 */}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {scheduleName}
            </Text>
            <Text style={styles.headerSubtitle}>{formattedDate}</Text>
          </View>

          {/* 右上：Menu Trigger */}
          <View style={styles.headerRight}>
            <Menu>
              <MenuTrigger style={styles.headerMenuTrigger}>
                <Feather name="edit" size={28} color="#007AFF" />
              </MenuTrigger>
              <MenuOptions
                customStyles={{ optionsContainer: styles.menuOptions }}
              >
                <MenuOption
                  onSelect={handleEditPress}
                  customStyles={{ optionWrapper: styles.menuOption }}
                >
                  <Text style={styles.menuOptionText}>編輯課表</Text>
                </MenuOption>
                <MenuOption
                  onSelect={handleCopyPress}
                  disabled={items.length === 0}
                  customStyles={{ optionWrapper: styles.menuOption }}
                >
                  <Text
                    style={
                      items.length === 0
                        ? styles.disabledMenuOptionText
                        : styles.menuOptionText
                    }
                  >
                    複製課表
                  </Text>
                </MenuOption>
                {isCoach && (
                  <MenuOption
                    onSelect={handleSendPress}
                    disabled={(items?.length ?? 0) === 0}
                    customStyles={{ optionWrapper: styles.menuOption }}
                  >
                    <Text
                      style={
                        (items?.length ?? 0) === 0
                          ? styles.disabledMenuOptionText
                          : styles.menuOptionText
                      }
                    >
                      發送課表
                    </Text>
                  </MenuOption>
                )}
                <MenuOption
                  onSelect={handleExportPress}
                  disabled={(items?.length ?? 0) === 0}
                  customStyles={{ optionWrapper: styles.menuOption }}
                >
                  <Text
                    style={
                      (items?.length ?? 0) === 0
                        ? styles.disabledMenuOptionText
                        : styles.menuOptionText
                    }
                  >
                    匯出課表
                  </Text>
                </MenuOption>
              </MenuOptions>
            </Menu>
          </View>
        </View>
      ),
    });
  }, [
    navigation,
    scheduleName,
    formattedDate,
    items,
    scheduleId,
    handleEditPress,
    handleCopyPress,
    handleSendPress,
    handleExportPress,
    router,
  ]);
  useFocusEffect(
    useCallback(() => {
      const loadSchedule = async () => {
        if (!scheduleId) {
          // 如果沒有 scheduleId (例如，從日曆新建一個課表)，則不執行讀取
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          const scheduleDocRef = doc(db, "schedules", scheduleId);
          const docSnap = await getDoc(scheduleDocRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setItems(data.items || []);
            setScheduleName(data.name || "未命名課表");
            setScheduleDate(data.date); // 更新日期 state
          } else {
            Alert.alert("錯誤", "找不到該課表，可能已被刪除。", [
              { text: "好", onPress: () => router.back() },
            ]);
          }
        } catch (error) {
          console.error("從 Firestore 讀取特定課表失敗", error);
        } finally {
          setLoading(false);
        }
      };

      loadSchedule();
    }, [scheduleId, db]),
  );

  useEffect(() => {
    AsyncStorage.getItem("targetGroup").then((value) => {
      if (value) setTargetGroup(value);
    });
  }, []);

  const handleDragEnd = useCallback(
    ({ data }) => {
      setItems(data);
      updateItemsInStorage(data);
    },
    [updateItemsInStorage],
  );

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.container}>
        <View style={{ flexDirection: "row", marginLeft: 0 }}>
          <Text style={{ flex: 0.6 }} />
          <Text style={{ flex: 0.9 }}>分類</Text>
          <Text style={{ flex: 2 }}>項目</Text>
          <Text style={{ flex: 3 }}>備註</Text>
        </View>
        <View style={{ flex: 1 }}>
          {/* ✨ 修改：傳遞 onDeleteItem 處理函式 */}
          <ScheduleList
            items={items}
            onDragEnd={handleDragEnd}
            onDeleteItem={handleDeleteItem}
          />
        </View>
        <SendScheduleModal
          visible={isSendModalVisible}
          onClose={() => setSendModalVisible(false)}
          scheduleData={{ name: scheduleName, date: scheduleDate, items }}
          coachId={user?.uid}
          coachName={coachDisplayName || user?.displayName || "教練"} // ← 修改
        />
      </View>
      <Modal
        transparent
        visible={isExportModalVisible}
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <Pressable
            onPress={() => setExportModalVisible(false)}
            style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
          />

          <View
            style={{
              width: "85%",
              maxWidth: 360,
              padding: 20,
              borderRadius: 12,
              backgroundColor: "#fff",
              zIndex: 1,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: "bold", marginBottom: 16 }}
            >
              選擇匯出格式
            </Text>

            <Button
              title="匯出 PDF"
              onPress={() => {
                setExportModalVisible(false);
                exportScheduleAsPDF();
              }}
            />

            <View style={{ height: 10 }} />

            <Button
              title="匯出 Word (.docx)"
              onPress={() => {
                setExportModalVisible(false);
                exportScheduleAsDocx();
              }}
            />

            <View style={{ height: 10 }} />

            <Button title="取消" onPress={() => setExportModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
