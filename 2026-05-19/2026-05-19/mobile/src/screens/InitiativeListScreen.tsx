import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import database from '../db/database';
import api from '../api/client';

type RouteParams = {
  InitiativeList: {
    customerCode?: string;
    customerName?: string;
    visitCode?: string;
  };
};

type FilterType = 'all' | 'campaign' | 'sampling' | 'display';

interface Initiative {
  id: string;
  title: string;
  type: string;
  startDate: number;
  endDate: number;
  description: string;
  isActive: boolean;
}

const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  campaign: { bg: '#dbeafe', text: '#1d4ed8' },
  sampling: { bg: '#dcfce7', text: '#15803d' },
  display: { bg: '#ffedd5', text: '#c2410c' },
};

function formatDateRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(startMs).toLocaleDateString('en-US', opts);
  const end = new Date(endMs).toLocaleDateString('en-US', opts);
  return `${start} - ${end}`;
}

export default function InitiativeListScreen() {
  const route = useRoute<RouteProp<RouteParams, 'InitiativeList'>>();
  const navigation = useNavigation<any>();
  const { customerCode, customerName, visitCode } = route.params ?? {};

  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFromDB = useCallback(async () => {
    try {
      const records = await database
        .get('initiatives')
        .query(Q.where('is_active', true), Q.sortBy('end_date', Q.asc))
        .fetch();

      const mapped: Initiative[] = records.map((r: any) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        description: r.description,
        isActive: r.isActive,
      }));
      setInitiatives(mapped);
    } catch (err) {
      console.error('InitiativeListScreen loadFromDB error:', err);
    }
  }, []);

  useEffect(() => {
    loadFromDB().finally(() => setLoading(false));
  }, [loadFromDB]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api.get('/initiatives', { params: { isActive: true } });
      const data: any[] = response.data?.data ?? response.data ?? [];

      await database.write(async () => {
        for (const item of data) {
          const existing = await database
            .get('initiatives')
            .query(Q.where('id', item.id))
            .fetch();

          if (existing.length > 0) {
            await existing[0].update((rec: any) => {
              rec.title = item.title;
              rec.type = item.type;
              rec.startDate = item.startDate ?? item.start_date;
              rec.endDate = item.endDate ?? item.end_date;
              rec.description = item.description ?? '';
              rec.isActive = true;
            });
          } else {
            await database.get('initiatives').create((rec: any) => {
              rec._raw.id = item.id;
              rec.title = item.title;
              rec.type = item.type;
              rec.startDate = item.startDate ?? item.start_date;
              rec.endDate = item.endDate ?? item.end_date;
              rec.description = item.description ?? '';
              rec.isActive = true;
            });
          }
        }
      });

      await loadFromDB();
    } catch (err) {
      Alert.alert('Sync Failed', 'Could not fetch initiatives. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [loadFromDB]);

  const filtered = initiatives.filter((item) => {
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesSearch =
      searchText.trim() === '' ||
      item.title.toLowerCase().includes(searchText.toLowerCase());
    return matchesType && matchesSearch;
  });

  const renderItem = ({ item }: { item: Initiative }) => {
    const badgeColor = TYPE_BADGE_COLORS[item.type] ?? { bg: '#f3f4f6', text: '#374151' };
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate('InitiativeDetail', {
            initiativeId: item.id,
            title: item.title,
            customerCode,
            customerName,
            visitCode,
          })
        }
      >
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: badgeColor.bg }]}>
              <Text style={[styles.typeBadgeText, { color: badgeColor.text }]}>
                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={styles.dateRange}>
            {formatDateRange(item.startDate, item.endDate)}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'campaign', label: 'Campaign' },
    { key: 'sampling', label: 'Sampling' },
  ];

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search initiatives..."
          placeholderTextColor={Colors.textSecondary}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.filterChip,
              filterType === opt.key && styles.filterChipActive,
            ]}
            activeOpacity={0.7}
            onPress={() => setFilterType(opt.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterType === opt.key && styles.filterChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            filtered.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active initiatives</Text>
              <Text style={styles.emptySubtitle}>
                Pull down to sync the latest initiatives from the server.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryLight,
    overflow: 'hidden',
    ...cardShadow,
  },
  cardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateRange: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
