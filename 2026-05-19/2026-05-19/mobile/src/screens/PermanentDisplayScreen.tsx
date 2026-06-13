import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import database from '../db/database';

type RouteParams = {
  PermanentDisplay: {
    customerCode: string;
    customerName: string;
    visitCode?: string;
  };
};

interface DisplayRecord {
  id: string;
  displayType: string;
  locationDescription: string;
  lastCheckStatus: 'compliant' | 'non_compliant' | 'never';
  lastCheckedOn: number | null;
}

function getStatusStyle(status: DisplayRecord['lastCheckStatus']): {
  bg: string;
  text: string;
  label: string;
} {
  switch (status) {
    case 'compliant':
      return { bg: '#dcfce7', text: '#15803d', label: 'Compliant' };
    case 'non_compliant':
      return { bg: '#fef2f2', text: Colors.danger, label: 'Non-Compliant' };
    default:
      return { bg: '#f3f4f6', text: '#6b7280', label: 'Not Checked' };
  }
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PermanentDisplayScreen() {
  const route = useRoute<RouteProp<RouteParams, 'PermanentDisplay'>>();
  const navigation = useNavigation<any>();
  const { customerCode, customerName, visitCode } = route.params;

  const [displays, setDisplays] = useState<DisplayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const records = await database
        .get('permanent_displays')
        .query(
          Q.where('customer_code', customerCode),
          Q.where('is_active', true),
        )
        .fetch();

      const mapped: DisplayRecord[] = await Promise.all(
        records.map(async (r: any) => {
          const checks = await database
            .get('permanent_display_checks')
            .query(
              Q.where('display_id', r.id),
              Q.sortBy('checked_on', Q.desc),
              Q.take(1),
            )
            .fetch();

          let lastCheckStatus: DisplayRecord['lastCheckStatus'] = 'never';
          let lastCheckedOn: number | null = null;

          if (checks.length > 0) {
            const lastCheck: any = checks[0];
            lastCheckStatus = lastCheck.isCompliant ? 'compliant' : 'non_compliant';
            lastCheckedOn = lastCheck.checkedOn;
          }

          return {
            id: r.id,
            displayType: r.displayType,
            locationDescription: r.locationDescription ?? '',
            lastCheckStatus,
            lastCheckedOn,
          };
        }),
      );

      setDisplays(mapped);
    } catch (err) {
      console.error('PermanentDisplayScreen loadData error:', err);
    }
  }, [customerCode]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const renderItem = ({ item }: { item: DisplayRecord }) => {
    const statusStyle = getStatusStyle(item.lastCheckStatus);
    return (
      <View style={styles.displayCard}>
        <View style={styles.displayInfo}>
          <Text style={styles.displayType}>{item.displayType}</Text>
          {item.locationDescription !== '' && (
            <Text style={styles.locationDesc} numberOfLines={2}>
              {item.locationDescription}
            </Text>
          )}
          <View style={styles.cardFooter}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                {statusStyle.label}
              </Text>
            </View>
            {item.lastCheckedOn !== null && (
              <Text style={styles.lastCheckedText}>
                Last: {formatDate(item.lastCheckedOn)}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.checkBtn}
          activeOpacity={0.75}
          onPress={() =>
            navigation.navigate('PermanentDisplayCheck', {
              displayId: item.id,
              customerCode,
              customerName,
              visitCode,
              displayType: item.displayType,
            })
          }
        >
          <Text style={styles.checkBtnText}>Check{'\n'}Display</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Customer Header */}
      <View style={styles.customerHeader}>
        <Text style={styles.customerName}>{customerName}</Text>
        <Text style={styles.customerCode}>{customerCode}</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displays}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            displays.length === 0 && styles.listContentEmpty,
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
              <Text style={styles.emptyTitle}>No permanent displays</Text>
              <Text style={styles.emptySubtitle}>
                No permanent displays registered for this store.
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
  customerHeader: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  customerCode: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  displayCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...cardShadow,
  },
  displayInfo: {
    flex: 1,
    marginRight: 12,
  },
  displayType: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  locationDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lastCheckedText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  checkBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  checkBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
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
