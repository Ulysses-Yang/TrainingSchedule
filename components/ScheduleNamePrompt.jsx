import React, { useState } from 'react';
import { View, Text, Modal, TextInput, Button, StyleSheet, Pressable } from 'react-native';

export default function ScheduleNamePrompt({ visible, onClose, onSubmit }) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText(''); // 清空輸入框
    }
  };

  const handleClose = () => {
    setText(''); // 清空輸入框
    onClose();
  };

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.container}>
          <Text style={styles.title}>新增課表</Text>
          <Text style={styles.subtitle}>請輸入新課表的名稱</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：大學訓練課表、高中訓練課表"
            value={text}
            onChangeText={setText}
            autoFocus={true}
            onSubmitEditing={handleSubmit} // 按下鍵盤確認鍵時提交
          />
          <View style={styles.buttonRow}>
            <View style={styles.buttonWrapper}>
              <Button title="取消" onPress={handleClose} color="#666" />
            </View>
            <View style={styles.buttonWrapper}>
              <Button title="確定" onPress={handleSubmit} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  buttonWrapper: {
    marginLeft: 10,
  },
});