import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS: Record<string, { bg: string; text: string }> = {
  success: { bg: '#DCFCE7', text: '#15803D' },
  warning: { bg: '#FEF3C7', text: '#B45309' },
  error: { bg: '#FEE2E2', text: '#DC2626' },
  info: { bg: '#DBEAFE', text: '#1D4ED8' },
  neutral: { bg: '#F3F4F6', text: '#6B7280' },
};

interface Props { label: string; variant?: keyof typeof COLORS; }

export default function StatusBadge({ label, variant = 'neutral' }: Props) {
  const c = COLORS[variant] || COLORS.neutral;
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  text: { fontSize: 12, fontWeight: '700' },
});
