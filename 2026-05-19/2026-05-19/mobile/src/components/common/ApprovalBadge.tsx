import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  status: string | null | undefined;
  size?: 'sm' | 'md';
}

// Single source of truth for the per-row Pending / Approved / Rejected /
// Skipped pill that appears next to admin-reviewable captures (OSOI,
// Planogram, etc.). The approval status mirrors what the web portal stores
// on the corresponding backend row.
export default function ApprovalBadge({ status, size = 'sm' }: Props) {
  const s = (status ?? 'pending').toLowerCase();
  const meta =
    s === 'approved' ? { label: 'Approved', bg: '#DCFCE7', fg: '#166534' } :
    s === 'rejected' ? { label: 'Rejected', bg: '#FEE2E2', fg: '#991B1B' } :
    s === 'skipped'  ? { label: 'Skipped',  bg: '#F1F5F9', fg: '#475569' } :
                       { label: 'Pending',  bg: '#FEF3C7', fg: '#92400E' };

  const padV = size === 'md' ? 4 : 2;
  const padH = size === 'md' ? 8 : 6;
  const fontSize = size === 'md' ? 11 : 10;

  return (
    <View style={[styles.pill, { backgroundColor: meta.bg, paddingVertical: padV, paddingHorizontal: padH }]}>
      <Text style={[styles.text, { color: meta.fg, fontSize }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 999 },
  text: { fontWeight: '700', letterSpacing: 0.2 },
});
