import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ui, Tag, Empty } from './common';
import { parkingApi, Reservation } from '../../api/parking';
import { BRAND } from '../../config';

type Row =
  | { kind: 'session'; id: number; plate: string; zone: string; entryAt: number | null; exitAt: number | null; total: number; isActive: boolean }
  | { kind: 'res'; res: Reservation };

export default function HistoryScreen({ navigation }: any) {
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [hist, res] = await Promise.all([
        parkingApi.history(),
        parkingApi.reservations(),
      ]);
      const merged: Row[] = [
        ...hist.map((s) => ({
          kind: 'session' as const,
          id: s.id,
          plate: s.vehicle,
          zone: s.zone,
          entryAt: s.entryAt,
          exitAt: s.exitAt,
          total: s.total,
          isActive: s.isActive,
        })),
        ...res.map((r) => ({ kind: 'res' as const, res: r })),
      ].sort((a, b) => {
        const ta = a.kind === 'session' ? (a.entryAt || 0) : new Date(a.res.start_at).getTime();
        const tb = b.kind === 'session' ? (b.entryAt || 0) : new Date(b.res.start_at).getTime();
        return tb - ta;
      });
      setRows(merged);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Row }) => {
    if (item.kind === 'session') {
      const entry = item.entryAt ? new Date(item.entryAt).toLocaleString() : '—';
      const exit  = item.exitAt  ? new Date(item.exitAt).toLocaleString()  : (item.isActive ? 'Still parked' : '—');
      return (
        <View style={ui.card}>
          <View style={ui.spaceBetween}>
            <Text style={ui.h3}>{item.plate}</Text>
            <Tag text={item.isActive ? 'PARKED' : 'COMPLETED'} tone={item.isActive ? 'success' : 'neutral'} />
          </View>
          <Text style={[ui.muted, { marginTop: 4 }]}>{item.zone}</Text>
          <View style={ui.divider} />
          <View style={ui.spaceBetween}>
            <Text style={ui.muted}>Entry</Text><Text style={ui.body}>{entry}</Text>
          </View>
          <View style={[ui.spaceBetween, { marginTop: 4 }]}>
            <Text style={ui.muted}>Exit</Text><Text style={ui.body}>{exit}</Text>
          </View>
          {item.total > 0 && (
            <View style={[ui.spaceBetween, { marginTop: 4 }]}>
              <Text style={ui.muted}>Paid</Text>
              <Text style={[ui.h3, { color: BRAND.primary }]}>₹{item.total}</Text>
            </View>
          )}
        </View>
      );
    }
    const r = item.res;
    const tone =
      r.status === 'confirmed' ? 'success'
      : r.status === 'cancelled' ? 'danger'
      : r.status === 'consumed' ? 'neutral'
      : 'warning';
    return (
      <TouchableOpacity activeOpacity={0.85}
        onPress={() => navigation.navigate('ReservationDetail', { reservation: r })}>
        <View style={ui.card}>
          <View style={ui.spaceBetween}>
            <Text style={ui.h3}>{r.yard}</Text>
            <Tag text={r.status.toUpperCase()} tone={tone as any} />
          </View>
          <Text style={[ui.muted, { marginTop: 4 }]}>{r.vehicle_plate} · {r.vehicle_type}</Text>
          <Text style={[ui.muted, { marginTop: 4 }]}>{r.start_at} → {r.end_at}</Text>
          {r.amount > 0 && (
            <Text style={[ui.h3, { color: BRAND.primary, marginTop: 4 }]}>₹{r.amount} · {r.payment_method || '—'}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={ui.screen}>
      <FlatList
        data={rows}
        keyExtractor={(it, i) => (it.kind === 'session' ? `s${it.id}` : `r${it.res.id}`) + `-${i}`}
        renderItem={renderItem}
        contentContainerStyle={ui.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Empty text="No parking history yet." />}
      />
    </View>
  );
}
