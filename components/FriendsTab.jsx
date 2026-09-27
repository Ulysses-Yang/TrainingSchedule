// components/FriendsTab.jsx
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

// 引入我們的好友系統元件
import FriendSearch from './FriendSearch';
import PendingRequests from './PendingRequests';
import FriendList from './FriendList';
// ✨ 1. 移除 getAuth，父元件不應再關心認證細節
// import { getAuth } from 'firebase/auth';

export default function FriendsTab() {
  // ✨ 2. 移除所有認證相關的程式碼，讓子元件自己處理
  
  return (
    <ScrollView style={styles.container}>
      {/* 這三個子元件現在會各自從 AuthContext 獲取使用者資訊 */}
      <PendingRequests />
      <FriendSearch />
      <FriendList />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#fff',
  },
});