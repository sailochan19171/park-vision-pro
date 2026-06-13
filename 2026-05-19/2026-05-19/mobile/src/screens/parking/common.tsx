import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle,
} from 'react-native';
import { BRAND } from '../../config';

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.bg },
  pad:    { padding: 16 },
  card: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1, borderColor: BRAND.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  h1: { fontSize: 22, fontWeight: '800', color: BRAND.text, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: BRAND.text, marginBottom: 8 },
  h3: { fontSize: 15, fontWeight: '700', color: BRAND.text },
  body: { fontSize: 14, color: BRAND.text, lineHeight: 20 },
  muted: { color: BRAND.muted, fontSize: 13 },
  label: { fontSize: 12, color: BRAND.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  input: {
    backgroundColor: '#fff', borderColor: BRAND.border, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: BRAND.text, marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: BRAND.bg, borderWidth: 1, borderColor: BRAND.border,
    fontSize: 12, color: BRAND.text, fontWeight: '600', overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: BRAND.border, marginVertical: 12 },
});

export function Button({
  title, onPress, loading, disabled, kind = 'primary', style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}) {
  const palette = kind === 'primary'
    ? { bg: BRAND.primary, fg: '#fff', bd: BRAND.primary }
    : kind === 'danger'
      ? { bg: BRAND.danger, fg: '#fff', bd: BRAND.danger }
      : { bg: '#fff', fg: BRAND.primary, bd: BRAND.primary };
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        {
          backgroundColor: palette.bg, borderColor: palette.bd, borderWidth: 1,
          borderRadius: 8, paddingVertical: 12, alignItems: 'center',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={palette.fg} />
        : <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Tag({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const map = {
    neutral: { bg: '#eef2ff', fg: '#3b3f8a' },
    success: { bg: '#dcfce7', fg: '#166534' },
    warning: { bg: '#fef3c7', fg: '#92400e' },
    danger:  { bg: '#fee2e2', fg: '#991b1b' },
  } as const;
  const p = map[tone];
  return (
    <Text style={[ui.pill, { backgroundColor: p.bg, color: p.fg, borderColor: p.bg }]}>{text}</Text>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <Text style={{ color: BRAND.muted, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Brand({ size = 28 }: { size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: size, fontWeight: '800', color: BRAND.primary, letterSpacing: 0.5 }}>
        Vay<Text style={{ color: BRAND.accent }}>Access</Text>
      </Text>
      <Text style={{ color: BRAND.muted, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
        Smart Parking Solutions
      </Text>
    </View>
  );
}
