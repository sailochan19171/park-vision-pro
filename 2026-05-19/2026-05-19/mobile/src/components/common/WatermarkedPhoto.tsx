import React from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';

interface WatermarkedPhotoProps {
  uri: string;
  timestamp?: string;
  latitude?: string;
  longitude?: string;
  userName?: string;
  customerName?: string;
  width?: number;
  height?: number;
  borderRadius?: number;
}

export default function WatermarkedPhoto({
  uri,
  timestamp,
  latitude,
  longitude,
  userName,
  customerName,
  width = 300,
  height = 300,
  borderRadius = 12,
}: WatermarkedPhotoProps) {
  const now = new Date();
  const ts = timestamp || now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  return (
    <View style={[s.container, { width, height, borderRadius }]}>
      <Image source={{ uri }} style={[s.image, { width, height, borderRadius }]} resizeMode="contain" />
      <View style={[s.overlay, { borderBottomLeftRadius: borderRadius, borderBottomRightRadius: borderRadius }]}>
        <Text style={s.text}>📅 {ts}</Text>
        {(latitude && longitude && latitude !== '—') && (
          <Text style={s.text}>📍 {latitude}, {longitude}</Text>
        )}
        {userName && <Text style={s.text}>👤 {userName}</Text>}
        {customerName && <Text style={s.text}>🏪 {customerName}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    ...Platform.select({
      android: { fontFamily: 'monospace' },
      ios: { fontFamily: 'Courier' },
    }),
  },
});
