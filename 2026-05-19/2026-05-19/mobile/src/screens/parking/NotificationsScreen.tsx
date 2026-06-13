import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { ui, Tag, Empty } from './common';
import useLive from '../../store/liveStore';
import { parkingApi, Notif } from '../../api/parking';
import { BRAND } from '../../config';

export default function NotificationsScreen() {
  const snapshot = useLive((s) => s.snapshot);
  const refresh  = useLive((s) => s.refresh);
  const [refreshing, setRefreshing] = useState(false);

  const onManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  const markRead = async (n: Notif) => {
    if (n.read) return;
    try { await parkingApi.markRead(n.id); await refresh(); } catch { /* ignore */ }
  };

  const rows = snapshot?.notifications || [];

  return (
    <View style={ui.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h1}>Alerts</Text>
          {snapshot && <Tag text={`${snapshot.unread} new`} tone={snapshot.unread > 0 ? 'success' : 'neutral'} />}
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={ui.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onManualRefresh} />}
        ListEmptyComponent={<Empty text="No alerts yet." />}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.85} onPress={() => markRead(item)}>
            <View style={[ui.card, !item.read && { borderColor: BRAND.primary, borderWidth: 2 }]}>
              <View style={ui.spaceBetween}>
                <Text style={ui.h3}>{item.title}</Text>
                <Tag text={item.kind} tone={item.read ? 'neutral' : 'success'} />
              </View>
              {!!item.body && <Text style={[ui.body, { marginTop: 6 }]}>{item.body}</Text>}
              <Text style={[ui.muted, { marginTop: 6 }]}>{item.created_at}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
