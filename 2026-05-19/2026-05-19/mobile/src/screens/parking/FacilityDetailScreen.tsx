import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { ui, Button, Tag } from './common';
import { parkingApi, Facility } from '../../api/parking';
import { BRAND } from '../../config';

export default function FacilityDetailScreen({ route, navigation }: any) {
  const facilityId: number = route.params.facilityId;
  const [f, setF] = useState<Facility | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await parkingApi.facility(facilityId);
      setF(row);
    } finally {
      setRefreshing(false);
    }
  }, [facilityId]);

  useEffect(() => { load(); }, [load]);

  if (!f) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  const full = f.capacity > 0 && f.available === 0;
  const tone: 'success' | 'warning' | 'danger' =
    full ? 'danger' : f.available <= 5 ? 'warning' : 'success';

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={ui.card}>
        <View style={ui.spaceBetween}>
          <Text style={ui.h1}>{f.name}</Text>
          <Tag text={full ? 'Full' : `${f.available} free`} tone={tone} />
        </View>
        {!!f.region && <Text style={ui.muted}>{f.region}</Text>}
        {!!f.location && <Text style={[ui.body, { marginTop: 8 }]}>{f.location}</Text>}
        <View style={ui.divider} />
        <View style={ui.spaceBetween}>
          <Text style={ui.body}>Capacity</Text>
          <Text style={ui.h3}>{f.capacity}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Occupied</Text>
          <Text style={ui.h3}>{f.occupied}</Text>
        </View>
        <View style={[ui.spaceBetween, { marginTop: 6 }]}>
          <Text style={ui.body}>Available</Text>
          <Text style={[ui.h3, { color: full ? BRAND.danger : BRAND.success }]}>{f.available}</Text>
        </View>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Tariffs</Text>
        {Object.values(f.tariffs).length === 0 && <Text style={ui.muted}>No tariffs configured yet.</Text>}
        {Object.values(f.tariffs).map((t) => (
          <View key={t.id} style={[ui.spaceBetween, { paddingVertical: 6 }]}>
            <Text style={ui.body}>{t.type} · {t.model}</Text>
            <Text style={ui.h3}>₹{t.rate}{t.model === 'Hourly' ? '/hr' : ''}</Text>
          </View>
        ))}
      </View>

      <Button
        title={full ? 'Facility Full' : 'Reserve a Slot'}
        onPress={() => navigation.navigate('Reserve', { facilityId: f.id })}
        disabled={full}
      />
    </ScrollView>
  );
}
