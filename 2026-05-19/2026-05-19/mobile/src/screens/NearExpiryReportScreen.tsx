import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import database from '../db/database';
import { useAuthStore } from '../store/auth';

type FilterTab = 'today' | 'week' | 'all';

interface ExpiryRecord {
  id: string;
  itemName: string;
  category: string;
  quantity: number;
  uom: string;
  expiryDate: string;
  status: string;
  customerCode: string;
  visitedDate: number;
  userCode: string;
}

function getTodayRange(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return { start, end };
}

function getWeekRange(): { start: number; end: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  return { start: startOfWeek.getTime(), end };
}

function getExpiryStatusColor(status: string, expiryDate: string): string {
  if (status === 'expired') return Colors.danger;
  if (status === 'near_expiry') return Colors.warning;
  const exp = new Date(expiryDate).getTime();
  const now = Date.now();
  if (exp < now) return Colors.danger;
  if (exp - now < 30 * 24 * 60 * 60 * 1000) return Colors.warning;
  return Colors.primary;
}

function getExpiryStatusLabel(status: string): string {
  switch (status) {
    case 'expired':
      return 'Expired';
    case 'near_expiry':
      return 'Near Expiry';
    default:
      return 'OK';
  }
}

function formatExpiryDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NearExpiryReportScreen() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<FilterTab>('today');
  const [allRecords, setAllRecords] = useState<ExpiryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    if (!user?.code) {
      setLoading(false);
      return;
    }
    try {
      const results: any[] = await database
        .get('expiry_checks')
        .query(Q.where('user_code', user.code), Q.sortBy('visited_date', Q.desc))
        .fetch();

      const mapped: ExpiryRecord[] = results.map((r) => ({
        id: r.id,
        itemName: r.itemName ?? r.item_name ?? '',
        category: r.category ?? '',
        quantity: r.quantity ?? 0,
        uom: r.uom ?? 'PCS',
        expiryDate: r.expiryDate ?? r.expiry_date ?? '',
        status: r.status ?? '',
        customerCode: r.customerCode ?? r.customer_code ?? '',
        visitedDate: r.visitedDate ?? r.visited_date ?? 0,
        userCode: r.userCode ?? r.user_code ?? '',
      }));

      setAllRecords(mapped);
    } catch {
      setAllRecords([]);
    } finally {
      setLoading(false);
    }
  }, [user?.code]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadRecords();
    }, [loadRecords]),
  );

  const filteredRecords = useMemo(() => {
    if (activeTab === 'all') return allRecords;
    const range = activeTab === 'today' ? getTodayRange() : getWeekRange();
    return allRecords.filter((r) => r.visitedDate >= range.start && r.visitedDate <= range.end);
  }, [allRecords, activeTab]);

  const summary = useMemo(() => {
    const totalRecords = filteredRecords.length;
    const totalItems = filteredRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
    return { totalRecords, totalItems };
  }, [filteredRecords]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All' },
  ];

  const renderHeader = () => (
    <View>
      {/* Segmented Control */}
      <View style={styles.segmentContainer}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.segmentButton, activeTab === tab.key && styles.segmentButtonActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, activeTab === tab.key && styles.segmentTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary Bar */}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.totalRecords}</Text>
            <Text style={styles.summaryLabel}>Records</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: Colors.warning }]}>{summary.totalItems}</Text>
            <Text style={styles.summaryLabel}>Total Items</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item }: { item: ExpiryRecord }) => {
    const statusColor = getExpiryStatusColor(item.status, item.expiryDate);
    const isExpiredOrNear = item.status === 'expired' || item.status === 'near_expiry';

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.itemName || 'Unknown Item'}
            </Text>
            <Text style={styles.category} numberOfLines={1}>
              {item.category || 'Uncategorized'}
            </Text>
          </View>
          {isExpiredOrNear && (
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{getExpiryStatusLabel(item.status)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Qty:</Text>
            <Text style={styles.metaValue}>
              {item.quantity} {item.uom}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Expiry:</Text>
            <Text style={[styles.metaValue, { color: statusColor, fontWeight: '600' }]}>
              {formatExpiryDate(item.expiryDate)}
            </Text>
          </View>
          <Text style={styles.customerCode}>{item.customerCode}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Near Expiry Report</Text>
        <Text style={styles.subtitle}>Captured expiry check data</Text>
      </View>

      <FlatList
        data={loading ? [] : filteredRecords}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No expiry records found</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'all'
                  ? 'No expiry checks have been recorded yet'
                  : 'No records for the selected period'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.card,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  category: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    width: 50,
  },
  metaValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  customerCode: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
