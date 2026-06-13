import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const sc = (size: number) => (SCREEN_WIDTH / 375) * size;

interface Props {
  onMenuPress: () => void;
  logoWidth?: number;
  logoHeight?: number;
}

export default function FarmleyHeader({ onMenuPress, logoWidth = 165, logoHeight = 45 }: Props) {
  return (
    <View style={styles.headerWrapper}>
      <View style={styles.whiteHeader}>
        <TouchableOpacity
          style={styles.hamburgerBtn}
          onPress={onMenuPress}
          activeOpacity={0.7}
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image 
            source={require('../../assets/farmley_logo.png')} 
            style={{ width: logoWidth, height: logoHeight }} 
            resizeMode="contain" 
          />
        </View>

        {/* Placeholder to balance the header */}
        <View style={{ width: sc(40) }} />
      </View>
      <View style={styles.blueLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: '#FFFFFF',
  },
  whiteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? sc(50) : (StatusBar.currentHeight ?? 24) + 4,
    paddingHorizontal: sc(16),
    paddingBottom: sc(6),
    backgroundColor: '#FFFFFF',
  },
  hamburgerBtn: {
    width: sc(36),
    height: sc(36),
    justifyContent: 'center',
  },
  hamburgerLine: {
    height: 1.5,
    width: 22,
    backgroundColor: '#374151',
    marginVertical: 3,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  blueLine: {
    height: 3,
    backgroundColor: '#1a3a8f',
  },
});
