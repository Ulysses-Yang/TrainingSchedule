// app/(app)/category.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  BackHandler,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { TouchableWithoutFeedback } from 'react-native';
import { Menu, MenuOptions, MenuOption, MenuTrigger, MenuProvider, renderers, withMenuContext } from 'react-native-popup-menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InteractionManager } from 'react-native';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { defaultCategories, defaultOptionsMap } from '../../constants/categoryDefaults';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// 底部面板：整合「快速選取 + 管理項目（新增/改名/刪除） + 備註 + 儲存」
function InlineCategorySheet({
  visible,
  onClose,
  categoryName,
  scheduleId,
  user,
  onSaved, // (catName, hasSelection) => void
}) {
  const { Popover } = renderers;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState({});

  const [query, setQuery] = useState('');
  const [newOption, setNewOption] = useState('');

  // 項目改名
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    if (!visible || !user || !categoryName) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const catId = `${categoryName}_${user.uid}`;
        const catRef = doc(db, 'categories', catId);
        const catSnap = await getDoc(catRef);

        let optionsFromDb = [];
        let notesFromDb = {};

        if (catSnap.exists()) {
          const data = catSnap.data();
          optionsFromDb = data.options || [];
          notesFromDb = data.notes || {};

          // options 為空就回填 defaultOptionsMap
          if ((!optionsFromDb || optionsFromDb.length === 0) && (defaultOptionsMap?.[categoryName]?.length > 0)) {
            optionsFromDb = defaultOptionsMap[categoryName];
            try {
              await updateDoc(catRef, { options: optionsFromDb });
            } catch {
              await setDoc(catRef, { options: optionsFromDb }, { merge: true });
            }
          }
        } else {
          const newData = {
            name: categoryName,
            options: defaultOptionsMap?.[categoryName] || [],
            notes: {},
            ownerId: user.uid,
          };
          await setDoc(catRef, newData);
          optionsFromDb = newData.options;
          notesFromDb = newData.notes;
        }

        setOptions(optionsFromDb);
        setNotes(notesFromDb);

        // 課表已選與備註（課表備註優先）
        let selectedFromSchedule = [];
        if (scheduleId) {
          const scheduleRef = doc(db, 'schedules', scheduleId);
          const scheduleSnap = await getDoc(scheduleRef);
          if (scheduleSnap.exists()) {
            const items = scheduleSnap.data().items || [];
            selectedFromSchedule = items
              .filter((i) => i.category === categoryName)
              .map((i) => i.label);

            const notesFromItems = items.reduce((acc, item) => {
              if (item.category === categoryName && item.note) acc[item.label] = item.note;
              return acc;
            }, {});
            setNotes((prev) => ({ ...prev, ...notesFromItems }));
          }
        }
        setSelected(selectedFromSchedule);
        setDirty(false);
      } catch (e) {
        console.error('載入失敗', e);
        Alert.alert('錯誤', '載入失敗，請檢查網路');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [visible, categoryName, scheduleId, user?.uid]);

  // 嘗試關閉：若有未儲存變更，跳出確認
  const requestClose = useCallback(() => {
    if (saving) return; // 儲存中避免關閉
    if (dirty) {
      Alert.alert('尚未儲存', '要繼續編輯還是放棄變更？', [
        { text: '繼續編輯', style: 'cancel' },
        {
          text: '放棄',
          style: 'destructive',
          onPress: () => {
            setDirty(false);
            onClose?.();
          },
        },
      ]);
    } else {
      onClose?.();
    }
  }, [dirty, saving, onClose]);

  // Android 實體返回鍵 → 關閉面板（帶確認）
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, requestClose]);

  const updateCategoryDoc = async (patch) => {
    const catId = `${categoryName}_${user.uid}`;
    const catRef = doc(db, 'categories', catId);
    try {
      await updateDoc(catRef, patch);
    } catch {
      await setDoc(catRef, patch, { merge: true });
    }
  };

  // 搜尋結果維持「目前順序」，只做過濾
  const displayedOptions = useMemo(() => {
    const q = (query || '').trim();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  }, [options, query]);

  const canReorder = !query.trim() && !loading; // 搜尋時停用拖曳排序
  const allFilteredSelected =
    displayedOptions.length > 0 && displayedOptions.every((o) => selected.includes(o));

  const toggleSelectAll = () => {
    setDirty(true);
    if (allFilteredSelected) {
      setSelected((prev) => prev.filter((i) => !displayedOptions.includes(i)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...displayedOptions])));
    }
  };

  const toggleSelection = (item) => {
    setDirty(true);
    setSelected((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };

  const addNewOption = async () => {
    const trimmed = (newOption || '').trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) return Alert.alert('錯誤', '項目已存在');

    const next = [...options, trimmed];
    setOptions(next);
    setNewOption('');
    setDirty(true);
    try {
      await updateCategoryDoc({ options: next });
    } catch (e) {
      console.error('新增項目失敗', e);
      Alert.alert('錯誤', '新增失敗');
    }
  };

  const openRenameModal = (item) => {
    setRenameTarget(item);
    setRenameText(item);
  };

  const confirmRename = async () => {
    const trimmed = (renameText || '').trim();
    if (!trimmed) return;
    if (trimmed !== renameTarget && options.includes(trimmed)) {
      Alert.alert('錯誤', '已存在相同名稱的項目');
      return;
    }

    const newOptions = options.map((opt) => (opt === renameTarget ? trimmed : opt));
    const newNotes = { ...notes };
    if (Object.prototype.hasOwnProperty.call(newNotes, renameTarget)) {
      newNotes[trimmed] = newNotes[renameTarget];
      delete newNotes[renameTarget];
    }

    setOptions(newOptions);
    setSelected((prev) => prev.map((i) => (i === renameTarget ? trimmed : i)));
    setNotes(newNotes);
    setRenameTarget(null);
    setDirty(true);

    try {
      await updateCategoryDoc({ options: newOptions, notes: newNotes });
    } catch (error) {
      console.error('改名失敗', error);
      Alert.alert('錯誤', '改名失敗');
    }
  };

  const deleteOption = (item) => {
    Alert.alert('刪除確認', `確定要刪除「${item}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const newOptions = options.filter((opt) => opt !== item);
          const newSelected = selected.filter((i) => i !== item);
          const newNotes = { ...notes };
          if (Object.prototype.hasOwnProperty.call(newNotes, item)) delete newNotes[item];

          setOptions(newOptions);
          setSelected(newSelected);
          setNotes(newNotes);
          setDirty(true);

          try {
            await updateCategoryDoc({ options: newOptions, notes: newNotes });
          } catch (error) {
            console.error('刪除失敗', error);
            Alert.alert('錯誤', '刪除失敗');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!scheduleId) {
      Alert.alert('錯誤', '缺少課表 ID');
      return;
    }

    try {
      setSaving(true);
      const scheduleRef = doc(db, 'schedules', scheduleId);
      const scheduleSnap = await getDoc(scheduleRef);

      let otherItems = [];
      if (scheduleSnap.exists()) {
        const items = scheduleSnap.data().items || [];
        otherItems = items.filter((item) => item.category !== categoryName);
      }

      const newItems = selected.map((label) => ({
        key: `${categoryName}-${label}-${Date.now()}`,
        category: categoryName,
        label,
        note: notes[label] || '',
      }));

      await setDoc(scheduleRef, { items: [...otherItems, ...newItems] }, { merge: true });
      await updateCategoryDoc({ notes });

      setDirty(false);
      onSaved?.(categoryName, selected.length > 0);
      onClose?.();
    } catch (e) {
      console.error('儲存失敗', e);
      Alert.alert('錯誤', '儲存失敗，請檢查網路');
    } finally {
      setSaving(false);
    }
  };

  // 拖曳排序完成：只在未搜尋時啟用，直接寫回 options
  const onDragEnd = ({ data }) => {
    setOptions(data);
    setDirty(true);
    updateCategoryDoc({ options: data }).catch(() => {});
  };

  // 單一項 UI（共用給 Draggable 與非 Draggable）
  const renderRow = ({ item, drag, isActive }) => {
    const isSelected = selected.includes(item);
    const hasNote = !!notes[item];

    const rowContent = (
      <View key={item} style={[styles.csItemCard, isActive && { opacity: 0.9 }]}>
        <View style={styles.csItemRow}>
          <Pressable
            onLongPress={canReorder ? drag : undefined}
            delayLongPress={120}
            onPress={() => toggleSelection(item)}
            style={styles.csRowLeft}
          >
            <View style={[styles.csCheckbox, isSelected && styles.csCheckboxChecked]}>
              {isSelected ? <Text style={styles.csCheckboxTick}>✓</Text> : null}
            </View>
            <Text numberOfLines={1} style={[styles.csItemText, isSelected && styles.csItemTextSelected]}>
              {item}
            </Text>
          </Pressable>

          <View style={styles.csRowRight}>
            {hasNote ? <Text style={styles.noteBadge}>📝</Text> : null}
            {/* <TouchableOpacity onPress={() => openRenameModal(item)} style={styles.csItemActionButton}>
              <Text style={styles.csItemActionButtonText}>改名</Text>
            </TouchableOpacity> */}
            <TouchableOpacity onPress={() => deleteOption(item)} style={[styles.csItemActionButton, styles.csItemDeleteButton]}>
              <Text style={[styles.csItemActionButtonText, { color: '#ef4444' }]}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isSelected && (
          <View style={styles.csNoteBox}>
            <TextInput
              value={notes[item] || ''}
              onChangeText={(t) => {
                setDirty(true);
                setNotes((prev) => ({ ...prev, [item]: t }));
              }}
              placeholder="新增備註（建議不超過20字）"
              placeholderTextColor="#9AA4B2"
              style={styles.csNoteInput}
              returnKeyType="done"
            />
          </View>
        )}
      </View>
    );
    if (drag) {
      return <ScaleDecorator>{rowContent}</ScaleDecorator>;
    }
    return rowContent;
  };

  return (
  <Modal transparent visible={visible} animationType="fade" onRequestClose={requestClose}>
    <View style={[styles.csOverlay, { paddingTop: Platform.OS === 'ios' ? insets.top + 32 : 10 }]}>
      <Pressable style={styles.csBackdrop} onPress={requestClose} />
      <MenuProvider skipInstanceCheck>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: 'height' })}
          keyboardVerticalOffset={Platform.select({ ios: 20, android: 0 })}
          style={styles.csCardWrap}
        >
          <View style={styles.csCard}>
            <View style={styles.csHeaderRow}>
              <Text style={styles.csTitle}>{categoryName || ''}</Text>
              <TouchableOpacity onPress={requestClose} style={styles.csCloseBtn}>
                <Text style={styles.csCloseText}>關閉</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.csToolbar}>
              <View style={styles.csSearchBox}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="搜尋項目..."
                  placeholderTextColor="#9AA4B2"
                  style={styles.csSearchInput}
                  returnKeyType="search"
                />
              </View>
              <View style={{ width: 8 }} />
              <TouchableOpacity onPress={toggleSelectAll} style={styles.csGhostBtn}>
                <Text style={styles.csGhostBtnText}>{allFilteredSelected ? '清空' : '全選'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.csAddRow}>
              <TextInput
                style={styles.csAddInput}
                placeholder="新增項目"
                placeholderTextColor="#9AA4B2"
                value={newOption}
                onChangeText={setNewOption}
                onSubmitEditing={addNewOption}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={addNewOption} style={styles.csAddBtn}>
                <Text style={styles.csAddBtnText}>新增</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                {loading ? (
                  <View style={[styles.csLoading, { flex: 1 }]}>
                    <ActivityIndicator size="large" color="#10b981" />
                  </View>
                ) : canReorder ? (
                  <DraggableFlatList
                    data={displayedOptions}
                    keyExtractor={(item) => item}
                    onDragEnd={onDragEnd}
                    activationDistance={12}
                    renderItem={(params) => renderRow(params)}
                    contentContainerStyle={{ paddingBottom: 10 }}
                  />
                ) : (
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 10 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {displayedOptions.length === 0 ? (
                      <View style={styles.csEmpty}>
                        <Text style={styles.csEmptyTitle}>沒有符合的項目</Text>
                        {options.length === 0 ? (
                          <Text style={styles.csEmptyText}>先在上方輸入並按「新增」吧！</Text>
                        ) : (
                          <Text style={styles.csEmptyText}>換個關鍵字試試看～</Text>
                        )}
                      </View>
                    ) : (
                      displayedOptions.map((item) =>
                        renderRow({ item, drag: undefined, isActive: false })
                      )
                    )}
                  </ScrollView>
                )}
              </GestureHandlerRootView>
            </View>
            <View style={[styles.csBottomBar, { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + 12 }]}>
              <TouchableOpacity
                style={[styles.csSaveBtn, (saving || !dirty) && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.csSaveBtnText}>{dirty ? '儲存' : '已儲存'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </MenuProvider>
    </View>
    <Modal
      transparent
      visible={!!renameTarget}
      animationType="fade"
      onRequestClose={() => setRenameTarget(null)}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 18, marginBottom: 12 }}>
              將「{renameTarget || ''}」改成：
            </Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="輸入新名稱"
              style={styles.modalInput}
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button title="取消" onPress={() => setRenameTarget(null)} />
              <View style={{ width: 10 }} />
              <Button title="確認" onPress={confirmRename} />
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  </Modal>
);
}

function CategoryScreen({ ctx }) {
  const menuActions = ctx?.menuActions;
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();

  const {
    isCreating,
    rawDate,
    formattedDate,
    scheduleId: scheduleIdFromParams,
    scheduleName,
    open: openCategoryParam, // 用於自動開啟某分類面板
  } = useLocalSearchParams();

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentScheduleId, setCurrentScheduleId] = useState(scheduleIdFromParams || null);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedStatus, setSelectedStatus] = useState({});
  const [editingScheduleName, setEditingScheduleName] = useState('');

  // 面板控制
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeCategoryName, setActiveCategoryName] = useState(null);

  const initializeDefaultCategories = async () => {
    if (!user) return;
    for (const cat of defaultCategories) {
      const catId = `${cat}_${user.uid}`;
      const catRef = doc(db, 'categories', catId);
      const catSnap = await getDoc(catRef);
      if (!catSnap.exists()) {
        await setDoc(catRef, {
          name: cat,
          options: defaultOptionsMap[cat] || [],
          notes: {},
          ownerId: user.uid,
        });
      }
    }
  };

  // 離開前提示
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert('要放棄此次編輯嗎？', '您有尚未儲存的變更，確定要離開嗎？', [
        { text: '繼續編輯', style: 'cancel' },
        { text: '放棄', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  // 載入分類與課表
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        if (!user) {
          Alert.alert('錯誤', '請先登入');
          return;
        }
        await initializeDefaultCategories();

        const qy = query(collection(db, 'categories'), where('ownerId', '==', user.uid));
        const querySnapshot = await getDocs(qy);
        const userCategories = querySnapshot.docs.map((docSnap) => docSnap.data().name);
        setCategories(userCategories);

        setEditingScheduleName(scheduleName || '未命名課表');
        let currentItems = [];
        let finalScheduleId = scheduleIdFromParams;

        if (!finalScheduleId) {
          const newScheduleRef = await addDoc(collection(db, 'schedules'), {
            name: scheduleName || '未命名課表',
            date: rawDate,
            items: [],
            ownerId: user.uid,
          });
          finalScheduleId = newScheduleRef.id;
          setCurrentScheduleId(finalScheduleId);
        } else {
          const scheduleRef = doc(db, 'schedules', finalScheduleId);
          const scheduleSnap = await getDoc(scheduleRef);
          if (scheduleSnap.exists()) {
            currentItems = scheduleSnap.data().items || [];
            setEditingScheduleName(scheduleSnap.data().name || '未命名課表');
          }
          setCurrentScheduleId(finalScheduleId);
        }

        const newSelectedStatus = {};
        userCategories.forEach((cat) => {
          newSelectedStatus[cat] = currentItems.some((item) => item.category === cat);
        });
        setSelectedStatus(newSelectedStatus);
      };

      loadData();
      return () => {
        try {
          menuActions?.closeMenu();
        } catch {}
      };
    }, [rawDate, scheduleIdFromParams, scheduleName, user?.uid])
  );

  useEffect(() => {
    if (!openCategoryParam || !currentScheduleId || sheetVisible) return;
    if (typeof openCategoryParam === 'string' && categories.includes(openCategoryParam)) {
      setActiveCategoryName(openCategoryParam);
      setSheetVisible(true);
    }
  }, [openCategoryParam, categories, currentScheduleId, sheetVisible]);

  const openInlinePicker = (cat) => {
    try {
      menuActions?.closeMenu();
    } catch {}
    Keyboard.dismiss();
    setActiveCategoryName(cat);
    setSheetVisible(true);
  };

  const handleFinishEditing = async () => {
    setHasUnsavedChanges(false);
    router.back();
  };

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return Alert.alert('錯誤', '無效名稱');

    try {
      const catId = `${trimmed}_${user.uid}`;
      await setDoc(doc(db, 'categories', catId), {
        name: trimmed,
        options: [],
        notes: {},
        ownerId: user.uid,
      });
      setCategories((prev) => [...prev, trimmed]);
      setNewCategory('');
      setSelectedStatus((prev) => ({ ...prev, [trimmed]: false }));
      setHasUnsavedChanges(true);
    } catch (error) {
      console.error('新增分類失敗', error);
      Alert.alert('錯誤', '新增失敗，請檢查網路');
    }
  };

  const confirmRestoreDefault = () => {
    Alert.alert('確認還原', '確定要清除所有選擇嗎？備註會保留。', [
      { text: '取消', style: 'cancel' },
      {
        text: '確定',
        onPress: async () => {
          try {
            if (currentScheduleId) {
              await updateDoc(doc(db, 'schedules', currentScheduleId), { items: [] });
              setSelectedStatus({});
              setHasUnsavedChanges(true);
              Alert.alert('✅ 已清除所有選擇');
            }
          } catch (error) {
            console.error('還原失敗', error);
            Alert.alert('❌ 還原失敗');
          }
        },
      },
    ]);
  };

  const getAutoFontSize = (text, baseSize, maxChars, minSize) => {
    if (text.length <= maxChars) return baseSize;
    const scale = Math.max(minSize / baseSize, maxChars / text.length);
    return Math.max(baseSize * scale, minSize);
  };

  const handleRenamePress = (category) => {
    setRenamingCategory(category);
    setNewCategoryName(category);

    // 使用 setTimeout 給予一個微小的延遲
    // 這可以確保彈出式選單完全關閉後，再顯示 Modal
    setTimeout(() => {
        setRenameModalVisible(true);
    }, 50); // 50 毫秒的延遲通常足夠
};

  const handleConfirmRename = async () => {
    const oldName = renamingCategory;
    const newName = newCategoryName.trim();
    if (!newName || categories.includes(newName)) return Alert.alert('錯誤', '無效名稱');

    try {
      const oldId = `${oldName}_${user.uid}`;
      const newId = `${newName}_${user.uid}`;
      const oldRef = doc(db, 'categories', oldId);
      const oldSnap = await getDoc(oldRef);
      if (oldSnap.exists()) {
        const data = oldSnap.data();
        await setDoc(doc(db, 'categories', newId), { ...data, name: newName });
        await deleteDoc(oldRef);
      }
      setRenameModalVisible(false);
      setRenamingCategory(null);

      const qy = query(collection(db, 'categories'), where('ownerId', '==', user.uid));
      const querySnapshot = await getDocs(qy);
      setCategories(querySnapshot.docs.map((docSnap) => docSnap.data().name));
      setHasUnsavedChanges(true);
    } catch (error) {
      console.error('改名失敗', error);
      Alert.alert('錯誤', '改名失敗');
    }
  };

  const handleDeleteCategory = async (categoryToDelete) => {
    Alert.alert('確認刪除', `您確定要刪除「${categoryToDelete}」嗎？相關資料將一併移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            const catId = `${categoryToDelete}_${user.uid}`;
            await deleteDoc(doc(db, 'categories', catId));
            setCategories((prev) => prev.filter((c) => c !== categoryToDelete));
            setHasUnsavedChanges(true);
          } catch (error) {
            console.error('刪除失敗', error);
            Alert.alert('錯誤', '刪除失敗');
          }
        },
      },
    ]);
  };

  return (
    // 使用 React.Fragment (<>) 作為根元素
    <>
      <MenuProvider>
        <View style={{ flex: 1, backgroundColor: '#c1ebfdff' }}>
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', android: 'height' })}
            style={{ flex: 1 }}
          >
            <View style={styles.container}>
              <View style={styles.newCategoryRow}>
                <TextInput
                  placeholder="新增分類"
                  placeholderTextColor="#aaa"
                  style={styles.input}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  onSubmitEditing={addCategory}
                  returnKeyType="done"
                />
                <Button title="新增" onPress={addCategory} />
              </View>

              <ScrollView
                contentContainerStyle={styles.scrollContainer}
                keyboardShouldPersistTaps="always"
                onScrollBeginDrag={Keyboard.dismiss}
              >
                {Array.from({ length: Math.ceil(categories.length / 3) }, (_, rowIndex) => {
                  const rowItems = categories.slice(rowIndex * 3, rowIndex * 3 + 3);
                  return (
                    <View key={rowIndex} style={styles.cardRow}>
                      {rowItems.map((cat) => {
                        const isSelected = selectedStatus[cat] || false;
                        const baseFontSize = 16;
                        const catagoryMinFontSize = 12;
                        const categoryFontSize = getAutoFontSize(cat, baseFontSize, 2, catagoryMinFontSize);

                        return (
                          <View key={cat} style={styles.card}>
                            <Pressable style={{ flex: 1 }} onPress={() => openInlinePicker(cat)}>
                              <View style={[styles.cardTitleArea, isSelected && styles.selectedCard]}>
                                <Text
                                  style={[
                                    styles.cardTitleText,
                                    isSelected && styles.selectedCardText,
                                    { fontSize: categoryFontSize },
                                  ]}
                                  numberOfLines={3}
                                  ellipsizeMode="tail"
                                >
                                  {cat}
                                </Text>
                              </View>
                            </Pressable>
                            
                            <Menu>
                              <MenuTrigger customStyles={{ triggerWrapper: styles.menuTrigger }}>
                                <Text style={styles.menuTriggerText}>⋮</Text>
                              </MenuTrigger>
                              <MenuOptions customStyles={{ optionsContainer: styles.popupMenuOptions, optionWrapper: styles.menuOption }}>
                                <MenuOption onSelect={() => handleRenamePress(cat)}>
                                  <Text style={styles.menuOptionText}>修改名稱</Text>
                                </MenuOption>
                                <MenuOption onSelect={() => handleDeleteCategory(cat)}>
                                  <Text style={[styles.menuOptionText, { color: '#ef4444' }]}>刪除分類</Text>
                                </MenuOption>
                              </MenuOptions>
                            </Menu>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>

          <View style={styles.bottomControlArea}>
            <TouchableOpacity style={styles.resetButton} onPress={confirmRestoreDefault}>
              <Text style={styles.resetButtonText}>重新製作</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.makeScheduleButton} onPress={handleFinishEditing}>
              <Text style={styles.makeScheduleText}>📋 完成編輯</Text>
            </TouchableOpacity>
          </View>

          <InlineCategorySheet
            visible={sheetVisible}
            onClose={() => setSheetVisible(false)}
            categoryName={activeCategoryName}
            scheduleId={currentScheduleId}
            user={user}
            onSaved={(catName, hasSelection) => {
              setSelectedStatus((prev) => ({ ...prev, [catName]: !!hasSelection }));
              setHasUnsavedChanges(true);
            }}
          />
        </View>
      </MenuProvider>

      {/* 將 Modal 放在所有元件之外，作為 Fragment 的直接子元件 */}
      <Modal
        transparent
        visible={isRenameModalVisible}
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>修改分類名稱</Text>
            <TextInput
              style={styles.textInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <View style={styles.modalButton}>
                <Button title="取消" onPress={() => setRenameModalVisible(false)} color="#888" />
              </View>
              <View style={styles.modalButton}>
                <Button title="儲存" onPress={handleConfirmRename} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
export default withMenuContext(CategoryScreen);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 10 },
  scrollContainer: { paddingBottom: 20, flexGrow: 1 },

  // Styles for Category Card Menu
  menuTrigger: {
    padding: 8,
  },
  menuTriggerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6b7280',
    lineHeight: 24,
  },
  menuOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuOptionText: {
    fontSize: 16,
    color: '#1f2937',
  },

  modalContainer: {
    // 使用絕對定位強制填滿螢幕，取代 flex: 1
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  textInput: {
    width: '100%', height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5,
    paddingHorizontal: 10, marginBottom: 20,
  },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  modalButton: { flex: 1, marginHorizontal: 5 },

  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 0 },
  card: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingLeft: 8,
    paddingVertical: 4,
    width: '30%',
    marginHorizontal: '1.5%',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleArea: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 4,
    justifyContent: 'center',
  },
  cardTitleText: { fontSize: 18, fontWeight: 'bold', color: '#000', textAlign: 'center' },
  selectedCard: { backgroundColor: '#14edafd7', borderRadius: 8 },
  selectedCardText: { color: '#065f46' },

  newCategoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginRight: 10, fontSize: 16,
  },

  bottomControlArea: {
    alignItems: 'center', flexDirection: 'row', justifyContent: 'space-around',
    paddingBottom: 40, paddingTop: 10, backgroundColor: '#c1ebfdff',
  },
  makeScheduleButton: {
    backgroundColor: '#3b82f6', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, alignItems: 'center',
  },
  makeScheduleText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  resetButton: {
    backgroundColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, alignItems: 'center',
  },
  resetButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '80%' },
  modalInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12,
  },

  noteBadge: { marginRight: 4, fontSize: 16 },

  csOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingTop: 10,
    pointerEvents: 'box-none',
  },
  csCardWrap: {
    flex: 1,
    width: '100%',
  },
  csBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1,
    pointerEvents: 'auto',
  },
  csCard: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F7FAFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: '#E5EAF0',
    position: 'relative',
    zIndex: 2,
  },

  csItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7EEF6',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'visible',
    position: 'relative',
    zIndex: 10,
    elevation: 6,
  },

  csHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF0',
  },
  csTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  csCloseBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E5E7EB', borderRadius: 8 },
  csCloseText: { color: '#111827', fontWeight: '600' },

  csToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  csSearchBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  csSearchInput: { fontSize: 16, color: '#0F172A' },
  csGhostBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2F7',
  },
  csGhostBtnText: { color: '#0F172A', fontWeight: '600' },

  csAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  csAddInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#0F172A',
  },
  csAddBtn: {
    marginLeft: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#10b981',
  },
  csAddBtnText: { color: '#FFFFFF', fontWeight: '700' },

  csLoading: { justifyContent: 'center', alignItems: 'center' },
  csEmpty: { alignItems: 'center', paddingVertical: 16 },
  csEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  csEmptyText: { marginTop: 6, color: '#475569' },

  csItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  csRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  csRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  csItemActionButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6'
  },
  csItemDeleteButton: {
    backgroundColor: '#FEE2E2',
  },
  csItemActionButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600'
  },
  csCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  csCheckboxChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  csCheckboxTick: { color: '#ffffff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  csItemText: { fontSize: 16, color: '#0F172A', flexShrink: 1 },
  csItemTextSelected: { fontWeight: '700' },

  csNoteBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  csNoteInput: { fontSize: 14, color: '#334155' },

  csBottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5EAF0',
    backgroundColor: '#F7FAFF',
  },
  csSaveBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  csSaveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  popupMenuOptions: {
    zIndex: 9999,
    elevation: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});