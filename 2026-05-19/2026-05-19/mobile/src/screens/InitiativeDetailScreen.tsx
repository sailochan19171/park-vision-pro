import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import database from '../db/database';

type RouteParams = {
  InitiativeDetail: {
    initiativeId: string;
    title: string;
    customerCode?: string;
    customerName?: string;
    visitCode?: string;
  };
};

interface InitiativeData {
  id: string;
  title: string;
  type: string;
  startDate: number;
  endDate: number;
  description: string;
}

interface Execution {
  id: string;
  executedOn: number;
  status: string;
  notes: string;
}

const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  campaign: { bg: '#dbeafe', text: '#1d4ed8' },
  sampling: { bg: '#dcfce7', text: '#15803d' },
  display: { bg: '#ffedd5', text: '#c2410c' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: '#dcfce7', text: '#15803d' },
  partial: { bg: '#ffedd5', text: '#c2410c' },
  skipped: { bg: '#f3f4f6', text: '#6b7280' },
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${new Date(startMs).toLocaleDateString('en-US', opts)} - ${new Date(endMs).toLocaleDateString('en-US', opts)}`;
}

export default function InitiativeDetailScreen() {
  const route = useRoute<RouteProp<RouteParams, 'InitiativeDetail'>>();
  const navigation = useNavigation<any>();
  const { initiativeId, title, customerCode, customerName, visitCode } = route.params;

  const [initiative, setInitiative] = useState<InitiativeData | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const initiativeRecords = await database
        .get('initiatives')
        .query(Q.where('id', initiativeId))
        .fetch();

      if (initiativeRecords.length > 0) {
        const r: any = initiativeRecords[0];
        setInitiative({
          id: r.id,
          title: r.title,
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
          description: r.description,
        });
      }

      const queryConditions = [Q.where('initiative_id', initiativeId)];
      if (customerCode) {
        queryConditions.push(Q.where('customer_code', customerCode));
      }

      const execRecords = await database
        .get('initiative_executions')
        .query(...queryConditions, Q.sortBy('executed_on', Q.desc))
        .fetch();

      const mapped: Execution[] = execRecords.map((r: any) => ({
        id: r.id,
        executedOn: r.executedOn,
        status: r.status,
        notes: r.notes ?? '',
      }));
      setExecutions(mapped);
    } catch (err) {
      console.error('InitiativeDetailScreen loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [initiativeId, customerCode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!initiative) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>Initiative not found.</Text>
      </View>
    );
  }

  const badgeColor =
    TYPE_BADGE_COLORS[initiative.type] ?? { bg: '#f3f4f6', text: '#374151' };
  const lastExecution = executions[0] ?? null;
  const recentFive = executions.slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title Card */}
      <View style={styles.titleCard}>
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>{initiative.title}</Text>
          <View style={[styles.typeBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.typeBadgeText, { color: badgeColor.text }]}>
              {initiative.type.charAt(0).toUpperCase() + initiative.type.slice(1)}
            </Text>
          </View>
        </View>
        <Text style={styles.dateRange}>
          {formatDateRange(initiative.startDate, initiative.endDate)}
        </Text>
        <Text style={styles.description}>{initiative.description}</Text>
      </View>

      {/* Progress Card */}
      <View style={styles.progressCard}>
        <Text style={styles.sectionTitle}>Store Progress</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressStat}>
            <Text style={styles.progressValue}>{executions.length}</Text>
            <Text style={styles.progressLabel}>
              Execution{executions.length !== 1 ? 's' : ''} at this store
            </Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressStat}>
            <Text style={styles.progressValue}>
              {lastExecution ? formatDate(lastExecution.executedOn) : 'Never'}
            </Text>
            <Text style={styles.progressLabel}>Last Executed</Text>
          </View>
        </View>
      </View>

      {/* Execute Button */}
      {customerCode ? (
        <TouchableOpacity
          style={styles.executeBtn}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('InitiativeExecution', {
              initiativeId,
              customerCode,
              customerName,
              visitCode,
            })
          }
        >
          <Text style={styles.executeBtnText}>Execute Initiative</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.noCustomerNote}>
          <Text style={styles.noCustomerText}>
            Open this initiative from a customer visit to record an execution.
          </Text>
        </View>
      )}

      {/* History */}
      {recentFive.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
            Recent Executions
          </Text>
          {recentFive.map((exec) => {
            const sc = STATUS_COLORS[exec.status] ?? STATUS_COLORS.skipped;
            return (
              <View key={exec.id} style={styles.historyCard}>
                <View style={styles.historyRow}>
                  <Text style={styles.historyDate}>{formatDate(exec.executedOn)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.text }]}>
                      {exec.status.charAt(0).toUpperCase() + exec.status.slice(1)}
                    </Text>
                  </View>
                </View>
                {exec.notes !== '' && (
                  <Text style={styles.historyNotes} numberOfLines={2}>
                    {exec.notes}
                  </Text>
                )}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  titleCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    ...cardShadow,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 10,
  },
  titleText: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateRange: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  progressCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 14,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressStat: {
    flex: 1,
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  executeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  executeBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  noCustomerNote: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 8,
  },
  noCustomerText: {
    fontSize: 13,
    color: '#92400e',
    textAlign: 'center',
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    ...cardShadow,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  historyNotes: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
});
