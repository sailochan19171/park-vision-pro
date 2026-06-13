import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { ui, Tag, Button, Empty } from './common';
import useLive from '../../store/liveStore';
import { Reservation } from '../../api/parking';
import { BRAND } from '../../config';

function fmtElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ActiveSessionScreen({ navigation }: any) {
  const snapshot = useLive((s) => s.snapshot);
  const refresh  = useLive((s) => s.refresh);
  const lastError = useLive((s) => s.lastError);

  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // 1-second wall-clock tick so the elapsed counter ticks even when the
  // server snapshot hasn't refreshed yet (server polls happen every 5s).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  if (!snapshot) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BRAND.primary} />
        {lastError && <Text style={[ui.muted, { marginTop: 12 }]}>{lastError}</Text>}
      </View>
    );
  }

  const active = snapshot.active;
  const upcoming = snapshot.reservations
    .filter((r) => r.status === 'confirmed' && new Date(r.end_at) >= new Date())
    .sort((x, y) => x.start_at.localeCompare(y.start_at))[0] as Reservation | undefined;

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onManualRefresh} />}
    >
      <View style={ui.spaceBetween}>
        <Text style={ui.h1}>My Parking</Text>
        <Tag text={`Live · ${snapshot.server_time.slice(11, 19)}`} tone="success" />
      </View>

      <View style={ui.card}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Currently Parked</Text>
          {active ? <Tag text="LIVE" tone="success" /> : <Tag text="—" />}
        </View>
        {active ? (
          <>
            <View style={[ui.spaceBetween, { marginTop: 10 }]}>
              <Text style={ui.body}>Vehicle</Text>
              <Text style={ui.h3}>{active.vehicle}</Text>
            </View>
            <View style={[ui.spaceBetween, { marginTop: 6 }]}>
              <Text style={ui.body}>Zone</Text>
              <Text style={ui.h3}>{active.zone}</Text>
            </View>
            <View style={[ui.spaceBetween, { marginTop: 6 }]}>
              <Text style={ui.body}>Entry</Text>
              <Text style={ui.h3}>
                {active.entryAt ? new Date(active.entryAt).toLocaleString() : '—'}
              </Text>
            </View>
            <View style={ui.divider} />
            <View style={{ alignItems: 'center' }}>
              <Text style={ui.label}>Elapsed</Text>
              <Text style={{ fontSize: 36, fontWeight: '800', color: BRAND.primary, marginTop: 4 }}>
                {active.entryAt ? fmtElapsed(now - active.entryAt) : '—'}
              </Text>
            </View>
          </>
        ) : (
          <Empty text="No active parking session. The dashboard will update the moment you enter the gate." />
        )}
      </View>

      <View style={ui.card}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h2}>Next Reservation</Text>
          {upcoming ? <Tag text={upcoming.status.toUpperCase()} tone="success" /> : <Tag text="—" />}
        </View>
        {upcoming ? (
          <>
            <View style={[ui.spaceBetween, { marginTop: 10 }]}>
              <Text style={ui.body}>Facility</Text>
              <Text style={ui.h3}>{upcoming.yard}</Text>
            </View>
            <View style={[ui.spaceBetween, { marginTop: 6 }]}>
              <Text style={ui.body}>Plate</Text>
              <Text style={ui.h3}>{upcoming.vehicle_plate}</Text>
            </View>
            <View style={[ui.spaceBetween, { marginTop: 6 }]}>
              <Text style={ui.body}>Window</Text>
              <Text style={ui.h3}>{upcoming.start_at} → {upcoming.end_at}</Text>
            </View>
            <View style={ui.divider} />
            <Button title="Show Entry QR" onPress={() => navigation.navigate('QRPass')} />
          </>
        ) : (
          <Empty text="No upcoming reservations. Tap Find Parking to book one." />
        )}
      </View>

      {snapshot.unread > 0 && (
        <View style={[ui.card, { backgroundColor: '#fff7e6', borderColor: BRAND.warning }]}>
          <Text style={[ui.h3, { color: BRAND.text }]}>
            {snapshot.unread} new alert{snapshot.unread > 1 ? 's' : ''}
          </Text>
          <Text style={[ui.body, { marginTop: 4, color: BRAND.muted }]}>
            Check the Alerts tab to read them.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
