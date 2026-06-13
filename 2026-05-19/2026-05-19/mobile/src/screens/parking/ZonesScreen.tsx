import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ui, Tag, Empty } from './common';
import useLive from '../../store/liveStore';
import useDriverAuth from '../../store/driverAuth';
import { BRAND } from '../../config';

export default function ZonesScreen() {
  const snapshot = useLive((s) => s.snapshot);
  const refresh  = useLive((s) => s.refresh);
  const user = useDriverAuth((s) => s.user);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');

  const onManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  const myPlate = (user?.primary_plate || '').toUpperCase();
  const zones = useMemo(() => {
    const all = snapshot?.zones || [];
    const q = filter.trim().toLowerCase();
    return q
      ? all.filter((z) =>
          z.zone.toLowerCase().includes(q) ||
          (z.region || '').toLowerCase().includes(q) ||
          z.recent.some((r) => r.vehicle.toLowerCase().includes(q)))
      : all;
  }, [snapshot, filter]);

  if (!snapshot) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onManualRefresh} />}
    >
      <View style={ui.spaceBetween}>
        <Text style={ui.h1}>Zone-wise Gate Entry</Text>
        <Tag text={`Live · ${snapshot.server_time.slice(11, 19)}`} tone="success" />
      </View>
      <Text style={[ui.muted, { marginBottom: 12 }]}>
        Real-time occupancy and the latest gate entries at every parking zone.
      </Text>

      <TextInput
        style={ui.input}
        placeholder="Search zone, region, or plate"
        value={filter}
        onChangeText={setFilter}
        placeholderTextColor={BRAND.muted}
      />

      {zones.length === 0 && <Empty text="No zones match." />}

      {zones.map((z) => {
        const full = z.capacity > 0 && z.available === 0;
        const tone: 'success' | 'warning' | 'danger' =
          full ? 'danger' : (z.capacity > 0 && z.available <= 5) ? 'warning' : 'success';
        const isMyZone = !!myPlate && z.recent.some((r) => r.vehicle.toUpperCase() === myPlate);
        return (
          <View key={z.zone} style={[ui.card, isMyZone && { borderColor: BRAND.primary, borderWidth: 2 }]}>
            <View style={ui.spaceBetween}>
              <View style={{ flex: 1 }}>
                <Text style={ui.h3}>{z.zone}</Text>
                {!!z.region && <Text style={ui.muted}>{z.region}</Text>}
              </View>
              <Tag
                text={z.capacity > 0 ? `${z.available} / ${z.capacity}` : `${z.occupied} parked`}
                tone={tone}
              />
            </View>

            <View style={[ui.row, { marginTop: 10, gap: 10 }]}>
              <Stat label="Occupied"  value={z.occupied} />
              <Stat label="Entries / hr" value={z.entries_last_hour} />
              <Stat label="Exits / hr"  value={z.exits_last_hour} />
            </View>

            <View style={ui.divider} />
            <Text style={ui.label}>Recent gate entries</Text>
            {z.recent.length === 0 ? (
              <Text style={ui.muted}>No entries yet in the last hour.</Text>
            ) : (
              z.recent.map((r) => {
                const isMine = !!myPlate && r.vehicle.toUpperCase() === myPlate;
                return (
                  <View key={r.id} style={[ui.spaceBetween, { paddingVertical: 6 }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[ui.h3, isMine && { color: BRAND.primary }]}>
                        {r.vehicle} {isMine ? '· You' : ''}
                      </Text>
                      <Text style={ui.muted}>{r.entry_at.slice(11, 19)} · {r.mode}</Text>
                    </View>
                    <Tag
                      text={r.still_parked ? 'IN' : 'OUT'}
                      tone={r.still_parked ? 'success' : 'neutral'}
                    />
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{
      flex: 1, backgroundColor: BRAND.bg, borderRadius: 8,
      paddingVertical: 8, paddingHorizontal: 10,
      borderWidth: 1, borderColor: BRAND.border, alignItems: 'center',
    }}>
      <Text style={[ui.muted, { fontSize: 11, marginBottom: 2 }]}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: BRAND.text }}>{value}</Text>
    </View>
  );
}
