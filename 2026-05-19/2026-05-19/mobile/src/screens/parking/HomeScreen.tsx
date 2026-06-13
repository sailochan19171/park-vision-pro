import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ui, Tag, Empty } from './common';
import { parkingApi, Facility } from '../../api/parking';
import { BRAND } from '../../config';
import useDriverAuth from '../../store/driverAuth';
import useLive from '../../store/liveStore';

export default function HomeScreen({ navigation }: any) {
  const user = useDriverAuth((s) => s.user);
  // Reload facilities whenever the live tick bumps — so availability counts
  // refresh in lockstep with the rest of the live snapshot.
  const tick = useLive((s) => s.tick);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await parkingApi.facilities();
      setFacilities(rows);
    } catch (e: any) {
      Alert.alert('Could not load facilities', e?.message || 'Try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, tick]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = facilities.filter((f) =>
    !filter.trim() ||
    f.name.toLowerCase().includes(filter.toLowerCase()) ||
    f.region.toLowerCase().includes(filter.toLowerCase()) ||
    (f.location || '').toLowerCase().includes(filter.toLowerCase()));

  const renderItem = ({ item }: { item: Facility }) => {
    const full = item.capacity > 0 && item.available === 0;
    const tone: 'success' | 'warning' | 'danger' =
      full ? 'danger' : item.available <= 5 ? 'warning' : 'success';
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigation.navigate('FacilityDetail', { facilityId: item.id })}
      >
        <View style={ui.card}>
          <View style={ui.spaceBetween}>
            <Text style={ui.h3}>{item.name}</Text>
            <Tag text={`${item.available} / ${item.capacity}`} tone={tone} />
          </View>
          {!!item.region && <Text style={ui.muted}>{item.region}</Text>}
          {!!item.location && <Text style={[ui.muted, { marginTop: 4 }]}>{item.location}</Text>}
          <View style={ui.divider} />
          <View style={ui.spaceBetween}>
            <Text style={ui.muted}>
              {Object.values(item.tariffs)
                .map((t) => `${t.type}: ₹${t.rate}/${t.model === 'Hourly' ? 'hr' : t.model.toLowerCase()}`)
                .join('   ')}
            </Text>
            <Text style={{ color: BRAND.primary, fontWeight: '700' }}>{full ? 'Full' : 'Book →'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={ui.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Text style={ui.h1}>Hi {user?.name?.split(' ')[0] || 'there'} 👋</Text>
        <Text style={[ui.muted, { marginBottom: 12 }]}>Real-time availability across all facilities.</Text>
        <TextInput
          style={ui.input}
          placeholder="Search facility, region or address"
          value={filter}
          onChangeText={setFilter}
          placeholderTextColor={BRAND.muted}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={loading ? null : <Empty text="No facilities match your search." />}
      />
    </View>
  );
}
