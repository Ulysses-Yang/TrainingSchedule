// components/SendScheduleModal.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Button, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Dimensions, Pressable,
  TextInput, Modal, Platform, ScrollView
} from 'react-native';
import {
  getFirestore, doc, getDoc, collection, writeBatch,
  documentId, query, where, getDocs,
  addDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp
} from 'firebase/firestore';
import BouncyCheckbox from 'react-native-bouncy-checkbox';

const { height: WIN_H, width: WIN_W } = Dimensions.get('window');
const CARD_H = Math.min(Math.round(WIN_H * 0.8), 640);

// UI Tokens
const UI = {
  primary: '#007AFF',
  text: '#111',
  subtext: '#667085',
  border: '#E8EAED',
  soft: '#F7F8FA',
  danger: '#D92D20',
  success: '#057A55',
  shadow: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
};

export default function SendScheduleModal({ visible, onClose, scheduleData, coachId, coachName }) {
  const db = getFirestore();

  // 基礎資料
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]); // [{id, name, memberIds: []}]
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // 選取狀態
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [selectedIndividuals, setSelectedIndividuals] = useState(new Set());
  const [deselectedIndividuals, setDeselectedIndividuals] = useState(new Set()); // 例外（從群組排除）

  // UI 狀態
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [newGroupName, setNewGroupName] = useState('');

  // 搜尋
  const [searchQuery, setSearchQuery] = useState('');

  // 加人到群組 Modal
  const [addMembersModal, setAddMembersModal] = useState({
    visible: false,
    groupId: null,
    selected: new Set(),
  });

  // 三點選單（Popover）
  const [friendMenu, setFriendMenu] = useState({
    friendId: null,
    visible: false,
    anchor: null, // { x, y, w, h }
  });
  const MENU_MAX_H = Math.min(200, Math.round(WIN_H * 0.6)); // 選單內容的最大高度

  useEffect(() => {
    if (!visible) {
      // 重置所有狀態
      setSelectedGroups(new Set());
      setSelectedIndividuals(new Set());
      setDeselectedIndividuals(new Set());
      setExpandedGroups(new Set());
      setNewGroupName('');
      setSearchQuery('');
      setErrorMsg(null);
      setFriends([]);
      setGroups([]);
      setLoading(false);
      setAddMembersModal({ visible: false, groupId: null, selected: new Set() });
      setFriendMenu({ friendId: null, visible: false, anchor: null });
    }
  }, [visible]);

  // 載入好友與群組
  useEffect(() => {
    if (!visible) return;
    if (!coachId) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const fetchFriends = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const userDocRef = doc(db, 'users', coachId);
        const userDoc = await getDoc(userDocRef);
        const friendUIDs = userDoc.exists() ? (userDoc.data()?.friends || []) : [];

        if (friendUIDs.length === 0) {
          setFriends([]);
        } else {
          const chunks = [];
          for (let i = 0; i < friendUIDs.length; i += 10) chunks.push(friendUIDs.slice(i, i + 10));

          const results = [];
          for (const ids of chunks) {
            const q = query(collection(db, 'users'), where(documentId(), 'in', ids));
            const snap = await getDocs(q);
            snap.forEach(d => results.push({ id: d.id, ...d.data() }));
          }
          // 依 displayName 排序
          results.sort((a, b) => {
            const A = (a.displayName || a.email || a.id || '').toLowerCase();
            const B = (b.displayName || b.email || b.id || '').toLowerCase();
            return A.localeCompare(B);
          });
          setFriends(results);
        }
      } catch (err) {
        console.error('載入好友失敗:', err);
        setErrorMsg('載入好友失敗，請稍後再試');
        setFriends([]);
      } finally {
        setLoading(false);
      }
    };

    const fetchGroups = async () => {
      if (!coachId) return setGroups([]);
      try {
        const snap = await getDocs(collection(db, 'users', coachId, 'groups'));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => {
          const A = (a.createdAt?.seconds || 0);
          const B = (b.createdAt?.seconds || 0);
          if (A !== B) return B - A;
          return (a.name || '').localeCompare(b.name || '');
        });
        setGroups(arr.map(g => ({ ...g, memberIds: Array.isArray(g.memberIds) ? g.memberIds : [] })));
      } catch (err) {
        console.error('載入群組失敗:', err);
      }
    };

    fetchFriends();
    fetchGroups();
  }, [visible, coachId, db]);

  // 角色判斷（中英文相容）
  const isCoachRole = (role = '') => {
    const r = role?.toString().trim().toLowerCase();
    return r === '教練' || r === 'coach' || r === 'trainer';
  };

  // 顯示名稱：教練才加「 教練」後綴；無暱稱時用 email 或 id
  const getNameLabel = (u) => {
    const base = (u?.displayName || u?.email || u?.id || '未設定名稱').toString().trim();
    return isCoachRole(u?.role) ? `${base} 教練` : base;
  };

  // 快速查詢用的 Map/Set
  const groupIdToMembers = useMemo(() => {
    const map = new Map();
    groups.forEach(g => map.set(g.id, new Set(g.memberIds || [])));
    return map;
  }, [groups]);

  const friendIdToGroups = useMemo(() => {
    const map = new Map();
    groups.forEach(g => {
      (g.memberIds || []).forEach(fid => {
        if (!map.has(fid)) map.set(fid, new Set());
        map.get(fid).add(g.id);
      });
    });
    return map;
  }, [groups]);

  // 未分組好友（沒有在任何 group 內）
  const ungroupedFriends = useMemo(() => {
    return friends.filter(f => !friendIdToGroups.get(f.id));
  }, [friends, friendIdToGroups]);

  // 搜尋結果
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const match = (u) => {
      const name = (u?.displayName || '').toLowerCase();
      const email = (u?.email || '').toLowerCase();
      const id = (u?.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    };
    const results = friends.filter(match);
    results.sort((a, b) => {
      const A = (a.displayName || a.email || a.id || '').toLowerCase();
      const B = (b.displayName || b.email || b.id || '').toLowerCase();
      return A.localeCompare(B);
    });
    return results;
  }, [friends, searchQuery]);

  // 計算「群組所選成員的聯集」
  const groupSelectedSet = useMemo(() => {
    const s = new Set();
    selectedGroups.forEach(gid => {
      const members = groupIdToMembers.get(gid);
      if (members) members.forEach(id => s.add(id));
    });
    return s;
  }, [selectedGroups, groupIdToMembers]);

  // 最終要發送的對象（集合）：(群組聯集 - 例外) + 個別選取
  const finalSelectedFriendIds = useMemo(() => {
    const base = new Set(groupSelectedSet);
    // 只對「群組來源」套用排除名單，不影響個別選取
    deselectedIndividuals.forEach(id => {
      if (base.has(id)) base.delete(id);
    });
    selectedIndividuals.forEach(id => base.add(id));
    return base;
  }, [groupSelectedSet, deselectedIndividuals, selectedIndividuals]);

  // 切換好友的「最終選取」狀態
  const toggleFriendFinal = (friendId) => {
    const groupsOfFriend = friendIdToGroups.get(friendId) || new Set();
    const includedByGroups = Array.from(groupsOfFriend).some(gid => selectedGroups.has(gid));
    const individuallySelected = selectedIndividuals.has(friendId);
    const isSelected = finalSelectedFriendIds.has(friendId);

    if (isSelected) {
      if (includedByGroups) {
        setDeselectedIndividuals(prev => {
          const next = new Set(prev);
          next.add(friendId);
          return next;
        });
        if (individuallySelected) {
          setSelectedIndividuals(prev => {
            const next = new Set(prev);
            next.delete(friendId);
            return next;
          });
        }
      } else {
        setSelectedIndividuals(prev => {
          const next = new Set(prev);
          next.delete(friendId);
          return next;
        });
      }
    } else {
      if (includedByGroups) {
        setDeselectedIndividuals(prev => {
          const next = new Set(prev);
          next.delete(friendId);
          return next;
        });
      } else {
        setSelectedIndividuals(prev => {
          const next = new Set(prev);
          next.add(friendId);
          return next;
        });
      }
    }
  };

  // 切換群組選取
  const toggleGroupSelect = (groupId) => {
    const membersSet = groupIdToMembers.get(groupId) || new Set();
    const members = Array.from(membersSet);

    if (members.length === 0) return; // 沒成員就不動作

    // 當前是否「已全選」
    const allSelected = members.every(id => finalSelectedFriendIds.has(id));

    if (allSelected) {
      // 全不選：關掉群組
      setSelectedGroups(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });

      // 移除這些成員的個別勾選
      setSelectedIndividuals(prev => {
        const next = new Set(prev);
        members.forEach(id => next.delete(id));
        return next;
      });

      // 清理例外
      setDeselectedIndividuals(prev => {
        const next = new Set(prev);
        members.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // 全選
      setSelectedGroups(prev => {
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });

      setDeselectedIndividuals(prev => {
        const next = new Set(prev);
        members.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  // 群組 Checkbox 勾選狀態（全選/部分/未選）
  const getGroupSelectionState = (groupId) => {
    const members = groupIdToMembers.get(groupId) || new Set();
    if (members.size === 0) return { all: false, partial: false, count: 0, total: 0 };

    const selected = Array.from(members).filter(id => finalSelectedFriendIds.has(id)).length;
    return {
      all: selected === members.size,
      partial: selected > 0 && selected < members.size,
      count: selected,
      total: members.size
    };
  };

  // 展開/收合群組
  const toggleExpandGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // 新增群組
  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (!coachId) return Alert.alert('錯誤', '尚未登入');

    try {
      const ref = await addDoc(collection(db, 'users', coachId, 'groups'), {
        name,
        memberIds: [],
        createdAt: serverTimestamp(),
      });
      setGroups(prev => [{ id: ref.id, name, memberIds: [], createdAt: { seconds: Math.floor(Date.now()/1000) } }, ...prev]);
      setNewGroupName('');
      setExpandedGroups(prev => new Set(prev).add(ref.id));
    } catch (err) {
      console.error('新增群組失敗:', err);
      Alert.alert('錯誤', '新增群組失敗，請稍後再試');
    }
  };

  // 將多位好友加入某群組
  const addMembersToGroup = async (groupId, memberIds) => {
    if (!coachId || !groupId || !memberIds?.length) return;
    try {
      const ref = doc(db, 'users', coachId, 'groups', groupId);
      await updateDoc(ref, { memberIds: arrayUnion(...memberIds) });
      // 本地同步
      setGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        const set = new Set([...(g.memberIds || []), ...memberIds]);
        return { ...g, memberIds: Array.from(set) };
      }));
    } catch (err) {
      console.error('加入群組失敗:', err);
      Alert.alert('錯誤', '加入群組失敗，請稍後再試');
    }
  };

  // 將某位好友自某群組移除
  const removeMemberFromGroup = async (groupId, friendId) => {
    if (!coachId || !groupId || !friendId) return;
    try {
      const ref = doc(db, 'users', coachId, 'groups', groupId);
      await updateDoc(ref, { memberIds: arrayRemove(friendId) });
      setGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        return { ...g, memberIds: (g.memberIds || []).filter(id => id !== friendId) };
      }));
      setDeselectedIndividuals(prev => {
        const next = new Set(prev);
        const stillCoveredBySelectedGroup =
          Array.from(friendIdToGroups.get(friendId) || []).some(gid => selectedGroups.has(gid));
        if (!stillCoveredBySelectedGroup) next.delete(friendId);
        return next;
      });
    } catch (err) {
      console.error('移除群組失敗:', err);
      Alert.alert('錯誤', '移除群組失敗，請稍後再試');
    }
  };

  // 發送通知（沿用原邏輯，套用 finalSelectedFriendIds）
  const handleSend = async () => {
    if (!coachId) return Alert.alert('錯誤', '目前尚未登入，無法發送');

    const targetIds = Array.from(finalSelectedFriendIds);
    if (targetIds.length === 0) return Alert.alert('提示', '請至少選擇一位要發送的對象');

    setLoading(true);
    const batch = writeBatch(db);

    const senderName = getNameLabel({ displayName: coachName, role: '教練' });
    targetIds.forEach(athleteId => {
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, {
        to: athleteId,
        from: coachId,
        fromName: senderName,
        type: 'NEW_SCHEDULE',
        message: '發送了一份課表給你',
        payload: {
          date: scheduleData?.date ?? null,
          name: scheduleData?.name ?? '未命名課表',
          items: scheduleData?.items ?? [],
        },
        status: 'pending',
        read: false,
        createdAt: new Date(),
      });
    });

    try {
      await batch.commit();
      Alert.alert('已送出', '已發送課表給選手。');
      onClose?.();
      setSelectedGroups(new Set());
      setSelectedIndividuals(new Set());
      setDeselectedIndividuals(new Set());
    } catch (error) {
      console.error('發送通知失敗:', error);
      Alert.alert('失敗', '發送過程中發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  // UI: 單一好友列（含勾選和三點選單按鈕）
  const FriendRow = ({ friend, inGroupId }) => {
    const checked = finalSelectedFriendIds.has(friend.id);
    const label = getNameLabel(friend);

    const moreBtnRef = useRef(null);

    return (
      <View style={styles.friendRow}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleFriendFinal(friend.id)} activeOpacity={0.8}>
          <BouncyCheckbox
            isChecked={checked}
            onPress={() => toggleFriendFinal(friend.id)}
            fillColor={UI.primary}
            disableBuiltInState
            text={label}
            textStyle={{ textDecorationLine: 'none', color: UI.text }}
            iconStyle={{ borderColor: UI.primary }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          ref={moreBtnRef}
          onPress={() => {
            // 量測錨點位置，打開浮動選單
            moreBtnRef.current?.measureInWindow?.((x, y, w, h) => {
              setFriendMenu({ friendId: friend.id, visible: true, anchor: { x, y, w, h } });
            });
          }}
          style={styles.moreBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
        >
          <Text style={{ fontSize: 18, color: UI.subtext }}>⋯</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // UI: 群組區塊
  const GroupBlock = ({ group }) => {
    const sel = getGroupSelectionState(group.id);
    const expanded = expandedGroups.has(group.id);

    const memberObjects = (group.memberIds || [])
      .map(id => friends.find(f => f.id === id))
      .filter(Boolean)
      .sort((a, b) => {
        const A = (a.displayName || a.email || a.id || '').toLowerCase();
        const B = (b.displayName || b.email || b.id || '').toLowerCase();
        return A.localeCompare(B);
      });

    return (
      <View style={styles.groupBlock}>
        <View style={styles.groupHeader}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleGroupSelect(group.id)} activeOpacity={0.8}>
            <BouncyCheckbox
              isChecked={sel.all}
              onPress={() => toggleGroupSelect(group.id)}
              fillColor={UI.primary}
              text={`${group.name}（${sel.count}/${sel.total}）`}
              textStyle={{ textDecorationLine: 'none', color: UI.text, fontWeight: '600' }}
              iconStyle={{ borderColor: UI.primary }}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => toggleExpandGroup(group.id)} style={styles.expandBtn} activeOpacity={0.7}>
            <Text style={{ color: UI.primary, fontWeight: '600' }}>
              {expanded ? '收合' : '展開'}
            </Text>
          </TouchableOpacity>
        </View>

        {expanded && (
          <View style={styles.groupBody}>
            <View style={styles.groupActions}>
              <Button
                title="新增選手"
                onPress={() => {
                  setAddMembersModal({
                    visible: true,
                    groupId: group.id,
                    selected: new Set(),
                  });
                }}
              />
            </View>

            {memberObjects.length === 0 ? (
              <Text style={styles.emptyText}>此群組目前沒有成員</Text>
            ) : (
              memberObjects.map(m => (
                <FriendRow
                  key={m.id}
                  friend={m}
                  inGroupId={group.id}
                />
              ))
            )}
          </View>
        )}
      </View>
    );
  };

  // 計算 Popover 位置
  const computeMenuPosition = (anchor, menuW = 260, menuMaxH = 320) => {
    if (!anchor) return { left: 16, top: 100, placement: 'bottom' };
    let left = Math.max(12, Math.min(anchor.x + anchor.w - menuW, WIN_W - menuW - 12));
    let top = anchor.y + anchor.h + 8;
    let placement = 'bottom';
    const roomBelow = WIN_H - (anchor.y + anchor.h);
    if (roomBelow < 180) {
      top = Math.max(12, anchor.y - (menuMaxH + 12));
      placement = 'top';
    }
    return { left, top, placement };
  };

  // 選單元件（Modal）
  const FriendActionMenu = () => {
    if (!friendMenu.visible) return null;

    const friend = friends.find(f => f.id === friendMenu.friendId);
    if (!friend) return null;

    const label = getNameLabel(friend);
    const pos = computeMenuPosition(friendMenu.anchor, 260, MENU_MAX_H); // 傳入選單最大高度
    const groupsOfFriend = Array.from(friendIdToGroups.get(friend.id) || []);
    const isSelected = finalSelectedFriendIds.has(friend.id);

    const removeOptions = groupsOfFriend
      .map(gid => groups.find(g => g.id === gid))
      .filter(Boolean);

    return (
      <Modal
        transparent
        visible
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setFriendMenu({ friendId: null, visible: false, anchor: null })}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setFriendMenu({ friendId: null, visible: false, anchor: null })}
        />

        {/* 外層容器：包「箭頭＋卡片」，避免裁切 */}
        <View style={[styles.menuContainer, { left: pos.left, top: pos.top }]}>
          {pos.placement === 'top'
            ? <View style={[styles.menuArrow, styles.menuArrowDown]} />
            : <View style={[styles.menuArrow, styles.menuArrowUp]} />
          }

          <View style={styles.menuCard}>
            {/* 標題列（固定區） */}
            <View style={styles.menuHeaderRow}>
              <Text style={styles.menuTitle} numberOfLines={1}>{label}</Text>
              <TouchableOpacity
                onPress={() => setFriendMenu({ friendId: null, visible: false, anchor: null })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 16, color: UI.subtext }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 可滾動內容區（被圓角裁切） */}
            <View style={styles.menuBodyClip}>
              <ScrollView
                style={{ maxHeight: MENU_MAX_H }}
                contentContainerStyle={{ paddingBottom: 8 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                showsVerticalScrollIndicator
              >
                <View style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>加入到群組</Text>
                  {groups.length === 0 ? (
                    <Text style={styles.menuHint}>目前沒有任何群組</Text>
                  ) : (
                    groups.map(g => {
                      const alreadyIn = (g.memberIds || []).includes(friend.id);
                      return (
                        <TouchableOpacity
                          key={g.id}
                          style={styles.menuItemRow}
                          onPress={async () => {
                            if (!alreadyIn) await addMembersToGroup(g.id, [friend.id]);
                            setFriendMenu({ friendId: null, visible: false, anchor: null });
                          }}
                          disabled={alreadyIn}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.menuItemText, alreadyIn && { color: '#999' }]}>{g.name}</Text>
                          <Text style={[styles.menuItemAffix, alreadyIn ? { color: UI.success } : { color: UI.primary }]}>
                            {alreadyIn ? '✓' : '加入'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                <View style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>從群組移除</Text>
                  {removeOptions.length === 0 ? (
                    <Text style={styles.menuHint}>此好友尚未在任何群組</Text>
                  ) : (
                    removeOptions.map(g => (
                      <TouchableOpacity
                        key={g.id}
                        style={styles.menuItemRow}
                        onPress={async () => {
                          await removeMemberFromGroup(g.id, friend.id);
                          setFriendMenu({ friendId: null, visible: false, anchor: null });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.menuItemText, { color: UI.danger }]}>{g.name}</Text>
                        <Text style={[styles.menuItemAffix, { color: UI.danger }]}>移除</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>選擇發送對象</Text>
          <Button title="關閉" onPress={onClose} />
        </View>

        <View style={styles.body}>
          {!coachId ? (
            <View style={styles.centerBox}>
              <Text style={styles.infoText}>尚未登入或尚未取得使用者，無法載入好友列表</Text>
            </View>
          ) : loading && !friends.length && !groups.length ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" />
              <Text style={styles.infoSubText}>載入中...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* 搜尋好友（取代原本的新增群組區塊） */}
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="搜尋好友（姓名、Email）"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor="#9AA0A6"
                />
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} activeOpacity={0.7}>
                    <Text style={styles.clearBtnText}>清除</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={{ flex: 1 }}>
                {searchQuery.trim().length > 0 ? (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>搜尋結果（{searchResults.length}）</Text>
                    </View>
                    {searchResults.length === 0 ? (
                      <Text style={styles.emptyText}>找不到符合的好友</Text>
                    ) : (
                      searchResults.map(f => (
                        <FriendRow key={f.id} friend={f} inGroupId={null} />
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {/* 群組標題列＋內嵌新增群組 */}
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>群組</Text>
                      <View style={styles.inlineAddWrap}>
                        <TextInput
                          style={styles.inlineInput}
                          placeholder="新群組名稱"
                          value={newGroupName}
                          onChangeText={setNewGroupName}
                          placeholderTextColor="#9AA0A6"
                        />
                        <TouchableOpacity
                          style={styles.inlineAddBtn}
                          onPress={handleCreateGroup}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.inlineAddBtnText}>新增</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 群組清單 */}
                    {groups.map(g => (
                      <GroupBlock key={g.id} group={g} />
                    ))}

                    {/* 未分組好友 */}
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>未分組</Text>
                    </View>
                    {ungroupedFriends.length === 0 ? (
                      <Text style={styles.emptyText}>沒有未分組的好友</Text>
                    ) : (
                      ungroupedFriends.map(f => (
                        <FriendRow key={f.id} friend={f} inGroupId={null} />
                      ))
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Button
            title={loading ? '發送中...' : `發送給 ${finalSelectedFriendIds.size} 位選手`}
            onPress={handleSend}
            disabled={loading || !coachId}
          />
        </View>
      </View>

      {/* 三點式好友選單（Popover） */}
      <FriendActionMenu />

      {/* 新增選手到群組 Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={addMembersModal.visible}
        onRequestClose={() => setAddMembersModal({ visible: false, groupId: null, selected: new Set() })}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddMembersModal({ visible: false, groupId: null, selected: new Set() })} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>選擇要加入的選手</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {(friends.filter(f => {
              // 排除已在該群組的成員
              const inThis = addMembersModal.groupId ? groupIdToMembers.get(addMembersModal.groupId)?.has(f.id) : false;
              return !inThis;
            })).map(f => {
              const checked = addMembersModal.selected.has(f.id);
              const label = getNameLabel(f);
              return (
                <TouchableOpacity
                  key={f.id}
                  style={styles.modalItem}
                  onPress={() => {
                    setAddMembersModal(prev => {
                      const next = new Set(prev.selected);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return { ...prev, selected: next };
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <BouncyCheckbox
                    isChecked={checked}
                    onPress={() => {
                      setAddMembersModal(prev => {
                        const next = new Set(prev.selected);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        return { ...prev, selected: next };
                      });
                    }}
                    fillColor={UI.primary}
                    text={label}
                    textStyle={{ textDecorationLine: 'none', color: UI.text }}
                    iconStyle={{ borderColor: UI.primary }}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 12 }}>
            <Button
              title="加入"
              onPress={async () => {
                const ids = Array.from(addMembersModal.selected);
                if (addMembersModal.groupId && ids.length) {
                  await addMembersToGroup(addMembersModal.groupId, ids);
                }
                setAddMembersModal({ visible: false, groupId: null, selected: new Set() });
              }}
            />
            <View style={{ height: 8 }} />
            <Button
              title="取消"
              color={Platform.OS === 'ios' ? '#d00' : undefined}
              onPress={() => setAddMembersModal({ visible: false, groupId: null, selected: new Set() })}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, elevation: 9999,
  },
  card: {
    width: '92%',
    height: CARD_H,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    ...UI.shadow,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderBottomWidth: 1, borderColor: UI.border
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  body: { flex: 1, minHeight: 0, backgroundColor: '#fff' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  infoText: { color: UI.subtext, fontSize: 16, textAlign: 'center' },
  infoSubText: { marginTop: 8, color: '#888' },
  errorText: { color: UI.danger, fontSize: 16, textAlign: 'center' },

  // 搜尋列（取代原本新增群組區）
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.soft
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: '#fff'
  },
  clearBtn: {
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EEF5FF',
    justifyContent: 'center'
  },
  clearBtnText: { color: UI.primary, fontWeight: '600' },

  // 群組
  groupBlock: { borderBottomWidth: 1, borderColor: UI.border, backgroundColor: '#fff' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  groupBody: { paddingHorizontal: 12, paddingBottom: 8 },
  groupActions: { marginBottom: 6, alignItems: 'center' },
  expandBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#EEF5FF' },

  // 區段標題
  sectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI.soft,
    borderTopWidth: 1,
    borderColor: UI.border
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI.soft,
    borderTopWidth: 1,
    borderColor: UI.border
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: UI.text },

  // 內嵌新增群組（和「群組」同一行）
  inlineAddWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  inlineInput: {
    width: 150,
    height: 40,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff'
  },
  inlineAddBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: UI.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  inlineAddBtnText: { color: '#fff', fontWeight: '700' },

  // 好友列
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff'
  },
  moreBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },

  // 空狀態
  emptyText: { textAlign: 'center', marginVertical: 10, fontSize: 15, color: '#8E8E93' },

  footer: { padding: 12, borderTopWidth: 1, borderColor: UI.border, backgroundColor: '#fff' },

  // 三點選單（Popover）
  menuOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'transparent'
  },
  menuContainer: {
    position: 'absolute',
    overflow: 'visible',
    zIndex: 10000,
  },
  menuCard: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI.border,
    paddingVertical: 0,
    paddingHorizontal: 0,
    ...UI.shadow,
    elevation: 12,
    zIndex: 1,
  },
  menuBodyClip: {
    overflow: 'hidden',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#fff',
  },
  menuArrow: {
    position: 'absolute',
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: UI.border,
    transform: [{ rotate: '45deg' }],
    elevation: 11,
  },
  // 如果選單在目標下方（正常向下展開），箭頭在卡片上緣
  menuArrowUp: { top: -6, right: 18 },
  // 如果選單在目標上方（往上展開），箭頭在卡片下緣
  menuArrowDown: { bottom: -6, right: 18 },
  menuHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 0,
    borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: '#fff'
  },
  menuTitle: { fontWeight: '700', color: UI.text, maxWidth: 200 },
  menuSection: { paddingTop: 8, borderTopWidth: 1, borderColor: UI.border, marginTop: 8, paddingHorizontal: 10 },
  menuSectionTitle: { fontSize: 12, color: UI.subtext, marginBottom: 6 },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  menuItemText: { fontSize: 14, color: UI.text, marginRight: 10 },
  menuItemAffix: { fontSize: 14, fontWeight: '600' },
  menuHint: { fontSize: 12, color: '#999', paddingVertical: 2, paddingHorizontal: 10 },

  // Modal（新增成員）
  modalOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  modalCard: {
    position: 'absolute',
    left: '6%', right: '6%', top: '18%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalItem: { paddingVertical: 4 },
});