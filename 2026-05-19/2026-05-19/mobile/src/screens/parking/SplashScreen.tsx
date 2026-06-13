import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { BRAND } from '../../config';
import { Brand } from './common';

export default function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: BRAND.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Brand size={36} />
      <ActivityIndicator size="large" color={BRAND.primary} style={{ marginTop: 24 }} />
    </View>
  );
}
