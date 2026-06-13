import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import useAuthStore from '../store/auth';
import StoreActivityHeader from '../components/common/StoreActivityHeader';

type RouteParams = { PlanogramHistory: { customerCode: string; customerName: string; visitCode?: string } };

interface DateSummary {
  dateStart: number;
  dateLabel: string;
  total: number;
  approved: number;
  rejected: number;
  skipped: number;
  pending: number;
}

export default function PlanogramHistoryScreen() {
  const route = useRoute<RouteProp<RouteParams, 'PlanogramHistory'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<DateSummary[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      // Guard: empty user_code would match records saved without a user_code
      // (shared-device scenario), showing another rep's planogram history.
      if (!user?.code) return;
      try {
        const records: any[] = await database.get('planogram_executions')
          .query(
            Q.where('customer_code', customerCode),
            Q.where('user_code', user.code),
            Q.sortBy('performed_on', Q.desc)
          )
          .fetch();

        const groups = new Map<number, DateSummary>();

        for (const r of records) {
          const timestamp = r.performedOn ?? r._raw?.performed_on ?? 0;
          if (!timestamp) continue;

          const date = new Date(timestamp);
          date.setHours(0, 0, 0, 0);
          const dateStart = date.getTime();

          if (!groups.has(dateStart)) {
            const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            groups.set(dateStart, {
              dateStart,
              dateLabel: formatter.format(date),
              total: 0,
              approved: 0,
              rejected: 0,
              skipped: 0,
              pending: 0,
            });
          }

          const group = groups.get(dateStart)!;
          group.total += 1;
          
          const status = (r.approvalStatus ?? r._raw?.approval_status ?? 'pending').toLowerCase();
          if (status === 'approved') group.approved += 1;
          else if (status === 'rejected') group.rejected += 1;
          else if (status === 'skipped') group.skipped += 1;
          else group.pending += 1;
        }

        // Sort by newest date first
        const sorted = Array.from(groups.values()).sort((a, b) => b.dateStart - a.dateStart);
        setHistory(sorted);
      } catch (err) {
        console.warn('[PlanogramHistory] failed to load:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Subscribe to live updates so the counts refresh if a background sync updates statuses
    const subscription = database.get('planogram_executions')
      .query(Q.where('customer_code', customerCode))
      .observe()
      .subscribe(() => {
        fetchHistory();
      });

    return () => subscription.unsubscribe();
  }, [customerCode]);

  const handleNewPlanogram = () => {
    navigation.navigate('Planogram', { customerCode, customerName, visitCode });
  };

  const handleDatePress = (dateStart: number) => {
    navigation.navigate('Planogram', { customerCode, customerName, visitCode, targetDate: dateStart });
  };

  return (
    <View style={styles.container}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Planogram" />
      
      <View style={styles.content}>
        <TouchableOpacity style={styles.newButton} activeOpacity={0.8} onPress={handleNewPlanogram}>
          <Icon name="add-circle-outline" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.newButtonText}>New Planogram</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>History</Text>

        {loading ? (
          <ActivityIndicator color="#1a56db" style={{ marginTop: 40 }} />
        ) : history.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="time-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No planograms found for this store.</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={item => item.dateStart.toString()}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.historyCard}
                activeOpacity={0.7}
                onPress={() => handleDatePress(item.dateStart)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.dateLabel}>{item.dateLabel}</Text>
                  <Icon name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
                <Text style={styles.totalText}>{item.total} Planogram{item.total !== 1 ? 's' : ''}</Text>
                
                <View style={styles.badgesRow}>
                  {item.approved > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.badgeText, { color: '#166534' }]}>{item.approved} Accepted</Text>
                    </View>
                  )}
                  {item.rejected > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.badgeText, { color: '#991B1B' }]}>{item.rejected} Rejected</Text>
                    </View>
                  )}
                  {item.skipped > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
                      <Text style={[styles.badgeText, { color: '#475569' }]}>{item.skipped} Skipped</Text>
                    </View>
                  )}
                  {item.pending > 0 && (
                    <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.badgeText, { color: '#92400E' }]}>{item.pending} Pending</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a56db',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  listContainer: {
    paddingBottom: 40,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  totalText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
  },
});
