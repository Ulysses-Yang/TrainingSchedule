// /custom/name.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Button,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { TouchableWithoutFeedback } from 'react-native';
import { Menu, MenuOptions, MenuOption, MenuTrigger, withMenuContext } from 'react-native-popup-menu';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useAuth } from '../../../context/AuthContext';
import { useHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const defaultOptionsMap = {
  熱身: [],
  技術訓練: [],
  跑: [],
  上肢: ['雙槓前後擺上', '單槓暴力上'],
  重量: ['臥推', '半蹲', '臀推'],
};

function CustomCategory({ ctx }) {
  const menuActions = ctx?.menuActions;
  const { name, scheduleId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();

  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [newOption, setNewOption] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [activeNoteItem, setActiveNoteItem] = useState(null);
  const [draftNote, setDraftNote] = useState('');

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('custom'); // 'custom' | 'alpha'

  const { user } = useAuth();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      try { menuActions?.closeMenu(); } catch {}
      Keyboard.dismiss();
      return () => { try { menuActions?.closeMenu(); } catch {} };
    }, [menuActions])
  );

  // 提示尚未儲存時離開
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges) return;

      e.preventDefault();
      Alert.alert(
        '要放棄此次編輯嗎？',
        '您有尚未儲存的變更，確定要離開嗎？',
        [
          { text: '繼續編輯', style: 'cancel' },
          {
            text: '放棄',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  // 載入資料
  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        Alert.alert('錯誤', '請先登入');
        setLoading(false);
        return;
      }

      try {
        const catId = `${name}_${user.uid}`;
        const catRef = doc(db, 'categories', catId);
        const catSnap = await getDoc(catRef);
        let categoryData = {};
        if (catSnap.exists()) {
          categoryData = catSnap.data();
          let opts = categoryData.options || [];
          if ((!opts || opts.length === 0) && (defaultOptionsMap[name]?.length > 0)) {
            opts = defaultOptionsMap[name];
            await updateDoc(catRef, { options: opts });
          }
          setOptions(opts);
          setNotes(categoryData.notes || {});
        } else {
          categoryData = {
            name,
            options: defaultOptionsMap[name] || [],
            notes: {},
            ownerId: user.uid,
          };
          await setDoc(catRef, categoryData);
          setOptions(categoryData.options || []);
          setNotes(categoryData.notes || {});
        }

        // 載入選取狀態
        if (scheduleId) {
          const scheduleRef = doc(db, 'schedules', scheduleId);
          const scheduleSnap = await getDoc(scheduleRef);
          if (scheduleSnap.exists()) {
            const items = scheduleSnap.data().items || [];
            const selectedItems = items
              .filter(item => item.category === name)
              .map(item => item.label);

            setSelected(selectedItems);

            // 合併 notes（以課表中的為優先）
            const notesFromItems = items.reduce((acc, item) => {
              if (item.category === name && item.note) acc[item.label] = item.note;
              return acc;
            }, {});
            setNotes(prev => ({ ...prev, ...notesFromItems }));
          }
        }
      } catch (e) {
        console.error('載入資料失敗', e);
        Alert.alert('錯誤', '載入失敗，請檢查網路');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [name, scheduleId, user?.uid]);

  const toggleSelection = (item) => {
    setHasUnsavedChanges(true);
    setSelected(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const openRenameModal = (item) => {
    setRenameTarget(item);
    setRenameText(item);
  };

  const addNewOption = async () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      Alert.alert('錯誤', '項目已存在');
      return;
    }

    const newOptionsList = [...options, trimmed];
    setOptions(newOptionsList);
    setNewOption('');
    setHasUnsavedChanges(true);

    try {
      await updateCategory({ options: newOptionsList });
    } catch (error) {
      console.error('儲存新選項失敗', error);
      Alert.alert('錯誤', '新增失敗');
    }
  };

  const deleteOption = (item) => {
    Alert.alert('刪除確認', `確定要刪除「${item}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const newOptions = options.filter(opt => opt !== item);
          setOptions(newOptions);
          if (selected.includes(item)) setSelected(prev => prev.filter(i => i !== item));
          setHasUnsavedChanges(true);

          try {
            await updateCategory({ options: newOptions });
          } catch (error) {
            console.error('刪除失敗', error);
            Alert.alert('錯誤', '刪除失敗');
          }
        },
      },
    ]);
  };

  const confirmRename = async () => {
    const trimmed = renameText.trim();
    if (!trimmed) return;
    if (trimmed !== renameTarget && options.includes(trimmed)) {
      Alert.alert('錯誤', '已存在相同名稱的項目');
      return;
    }

    const newOptions = options.map(opt => (opt === renameTarget ? trimmed : opt));
    setOptions(newOptions);
    if (selected.includes(renameTarget)) {
      setSelected(prev => prev.map(i => (i === renameTarget ? trimmed : i)));
    }
    const newNotes = { ...notes };
    if (Object.prototype.hasOwnProperty.call(newNotes, renameTarget)) {
      newNotes[trimmed] = newNotes[renameTarget];
      delete newNotes[renameTarget];
    }
    setNotes(newNotes);
    setHasUnsavedChanges(true);

    try {
      await updateCategory({ options: newOptions, notes: newNotes });
    } catch (error) {
      console.error('改名失敗', error);
      Alert.alert('錯誤', '改名失敗');
    }
    setRenameTarget(null);
  };

  const openNoteModal = (item) => {
    setActiveNoteItem(item);
    setDraftNote(notes[item] || '');
    setNoteModalVisible(true);
  };

  const saveNoteFromModal = () => {
    if (!activeNoteItem) return;
    setNotes(prev => ({ ...prev, [activeNoteItem]: draftNote }));
    setHasUnsavedChanges(true);
    setNoteModalVisible(false);
  };

  const updateCategory = async (updates) => {
    const catId = `${name}_${user.uid}`;
    const catRef = doc(db, 'categories', catId);
    await updateDoc(catRef, updates);
  };

  const handleConfirm = async () => {
    if (!scheduleId) {
      Alert.alert('錯誤', '缺少課表 ID');
      return;
    }

    try {
      setSaving(true);
      const scheduleRef = doc(db, 'schedules', scheduleId);
      const scheduleSnap = await getDoc(scheduleRef);
      if (scheduleSnap.exists()) {
        const currentItems = scheduleSnap.data().items || [];
        const otherItems = currentItems.filter(item => item.category !== name);
        const newItems = selected.map(label => ({
          key: `${name}-${label}-${Date.now()}`,
          category: name,
          label,
          note: notes[label] || '',
        }));
        await updateDoc(scheduleRef, { items: [...otherItems, ...newItems] });
      }

      await updateCategory({ notes });

      setHasUnsavedChanges(false);
      try { menuActions?.closeMenu(); } catch {}
      setTimeout(() => { if (router.canGoBack()) router.back(); }, 100);
    } catch (error) {
      console.error('儲存失敗', error);
      Alert.alert('錯誤', '儲存失敗，請檢查網路');
    } finally {
      setSaving(false);
    }
  };

  // 顯示用排序 + 搜尋
  const displayedOptions = useMemo(() => {
    const base = sortMode === 'alpha'
      ? [...options].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      : options;
    const q = query.trim();
    if (!q) return base;
    return base.filter(opt => opt.toLowerCase().includes(q.toLowerCase()));
  }, [options, query, sortMode]);

  const selectedCount = selected.length;
  const allFilteredSelected = displayedOptions.length > 0 && displayedOptions.every(o => selected.includes(o));

  const toggleSelectAll = () => {
    setHasUnsavedChanges(true);
    if (allFilteredSelected) {
      // 取消目前篩選出的全部
      setSelected(prev => prev.filter(i => !displayedOptions.includes(i)));
    } else {
      // 將目前篩選出的全部加入
      setSelected(prev => Array.from(new Set([...prev, ...displayedOptions])));
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: '#F7FAFF' }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.container}>
            {/* Header / 工具列 */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.screenTitle}>{name}</Text>
                <Text style={styles.subtitle}>已選 {selectedCount} 項</Text>
              </View>
              <View style={styles.sortToggleWrap}>
                <Pressable
                  onPress={() => setSortMode(prev => (prev === 'custom' ? 'alpha' : 'custom'))}
                  style={styles.sortToggle}
                >
                  <Text style={styles.sortToggleText}>
                    {sortMode === 'custom' ? '自訂順序' : 'A → Z'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 搜尋 + 全選/清空 */}
            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="搜尋項目..."
                  placeholderTextColor="#9AA4B2"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </View>
              <View style={styles.toolbarRight}>
                <TouchableOpacity onPress={toggleSelectAll} style={styles.ghostButton}>
                  <Text style={styles.ghostButtonText}>{allFilteredSelected ? '清空' : '全選'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 新增項目 */}
            <View style={styles.newOptionRow}>
              <TextInput
                style={styles.input}
                placeholder="新增項目"
                placeholderTextColor="#9AA4B2"
                value={newOption}
                onChangeText={setNewOption}
                onSubmitEditing={addNewOption}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={addNewOption} style={styles.addButton}>
                <Text style={styles.addButtonText}>新增</Text>
              </TouchableOpacity>
            </View>

            {/* 清單 */}
            <ScrollView
              contentContainerStyle={{ paddingBottom: 140 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {displayedOptions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>沒有符合的項目</Text>
                  {options.length === 0 ? (
                    <Text style={styles.emptyText}>先在上方輸入名稱並按「新增」吧！</Text>
                  ) : (
                    <Text style={styles.emptyText}>換個關鍵字試試看～</Text>
                  )}
                </View>
              ) : (
                displayedOptions.map((item) => {
                  const isSelected = selected.includes(item);
                  const hasNote = !!notes[item];

                  return (
                    <View key={item} style={styles.card}>
                      <Pressable
                        onPress={() => toggleSelection(item)}
                        style={[styles.cardHeader]}
                      >
                        <View style={styles.leftPart}>
                          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                            {isSelected ? <Text style={styles.checkboxTick}>✓</Text> : null}
                          </View>
                          <Text numberOfLines={1} style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                            {item}
                          </Text>
                        </View>
                        <View style={styles.rightPart}>
                          {hasNote ? <Text style={styles.noteBadge}>📝</Text> : null}
                          <Menu>
                            <MenuTrigger style={styles.menuTrigger}>
                              <Text style={[styles.menuTriggerText]}>⋮</Text>
                            </MenuTrigger>
                            <MenuOptions>
                              <MenuOption onSelect={() => openRenameModal(item)}>
                                <Text style={{ color: '#2563EB', padding: 10 }}>修改名稱</Text>
                              </MenuOption>
                              <MenuOption onSelect={() => deleteOption(item)}>
                                <Text style={{ color: '#DC2626', padding: 10 }}>刪除項目</Text>
                              </MenuOption>
                            </MenuOptions>
                          </Menu>
                        </View>
                      </Pressable>

                      {isSelected && (
                        <Pressable onPress={() => openNoteModal(item)} style={styles.notePill}>
                          <Text
                            numberOfLines={2}
                            style={[styles.notePillText, !hasNote && { color: '#9AA4B2' }]}
                          >
                            {hasNote ? notes[item] : '新增備註（點此輸入）'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>

        {/* 底部儲存 */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.confirmButton, (!hasUnsavedChanges || saving) && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!hasUnsavedChanges || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmButtonText}>{hasUnsavedChanges ? '儲存變更' : '已儲存'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 改名 Modal */}
      {renameTarget && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
          style={styles.renameModalOverlay}
        >
          <View style={styles.renameModalContent}>
            <Text style={{ fontSize: 18, marginBottom: 12 }}>將「{renameTarget}」改成：</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="輸入新名稱"
              style={styles.renameModalInput}
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button title="取消" onPress={() => setRenameTarget(null)} />
              <View style={{ width: 10 }} />
              <Button title="確認" onPress={confirmRename} />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 備註 Modal */}
      <Modal
        transparent
        visible={noteModalVisible}
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.noteModalOverlay}>
              <View style={styles.noteModalContent}>
                <Text style={styles.noteModalTitle}>
                  {name}｜{activeNoteItem || ''}
                </Text>

                <TextInput
                  style={styles.noteModalInput}
                  multiline
                  placeholder="輸入備註...(盡量不超過20字)"
                  placeholderTextColor="#999"
                  value={draftNote}
                  onChangeText={setDraftNote}
                  autoFocus
                  returnKeyType="done"
                  blurOnSubmit={false}
                  scrollEnabled
                />

                <View style={styles.modalButtonRow}>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Button title="儲存" onPress={saveNoteFromModal} />
                  </View>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
export default withMenuContext(CustomCategory);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#F7FAFF',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
  },

  sortToggleWrap: { marginLeft: 10 },
  sortToggle: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortToggleText: {
    color: '#0F172A',
    fontSize: 12,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    fontSize: 16,
    color: '#0F172A',
  },
  toolbarRight: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ghostButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2F7',
  },
  ghostButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },

  newOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  addButton: {
    marginLeft: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#10b981',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 卡片式項目
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7EEF6',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftPart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  rightPart: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  checkbox: {
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
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checkboxTick: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 16,
  },

  itemText: {
    fontSize: 16,
    color: '#0F172A',
    flexShrink: 1,
  },
  itemTextSelected: {
    fontWeight: '700',
  },

  noteBadge: {
    marginRight: 10,
    fontSize: 16,
  },

  menuTrigger: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuTriggerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#64748B',
  },

  // 備註 pill
  notePill: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notePillText: {
    fontSize: 14,
    color: '#334155',
  },

  // 底部儲存
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#F7FAFF',
    borderTopWidth: 1,
    borderTopColor: '#E5EAF0',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  // 改名
  renameModalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  renameModalContent: {
    backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '85%',
  },
  renameModalInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12
  },

  // 備註 modal
  noteModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 16,
  },
  noteModalContent: {
    width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 12, padding: 16,
  },
  noteModalTitle: {
    fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center',
  },
  noteModalInput: {
    minHeight: 60, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10,
    fontSize: 16, textAlignVertical: 'top', backgroundColor: '#fafafa',
  },
  modalButtonRow: {
    flexDirection: 'row', marginTop: 14,
  },
});