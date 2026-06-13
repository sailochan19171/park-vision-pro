import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

interface Props {
  title: string;
  showBack?: boolean;
  rightIcon?: string;
  onRightPress?: () => void;
  backgroundColor?: string;
  textColor?: string;
}

export default function CustomHeader({ title, showBack = true, rightIcon, onRightPress, backgroundColor = '#1a56db', textColor = '#fff' }: Props) {
  const navigation = useNavigation();
  return (
    <View style={[s.header, { backgroundColor }]}>
      {showBack ? (
        <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={textColor} />
        </TouchableOpacity>
      ) : <View style={s.btn} />}
      <Text style={[s.title, { color: textColor }]} numberOfLines={1}>{title}</Text>
      {rightIcon ? (
        <TouchableOpacity style={s.btn} onPress={onRightPress}>
          <Icon name={rightIcon} size={22} color={textColor} />
        </TouchableOpacity>
      ) : <View style={s.btn} />}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 34, paddingBottom: 14, paddingHorizontal: 16,
  },
  btn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
