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
import useAuthStore from '../store/auth';
import database from '../db/database';

type RouteParams = {
  SurveyList: {
    customerCode?: string;
    customerName?: string;
    visitCode?: string;
  };
};

type TabFilter = 'all' | 'pending' | 'completed';

interface SurveyItem {
  id: string;
  title: string;
  description: string;
  endDate: number;
  questionsJson: string;
  isCompleted: boolean;
  completedOn: number | null;
}

function formatDueDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getQuestionCount(questionsJson: string): number {
  try {
    const parsed = JSON.parse(questionsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default function SurveyListScreen() {
  const route = useRoute<RouteProp<RouteParams, 'SurveyList'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params ?? {};

  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const surveyRecords = await database
        .get('surveys')
        .query(Q.where('is_active', true))
        .fetch();

      const mapped: SurveyItem[] = await Promise.all(
        surveyRecords.map(async (r: any) => {
          const responses = await database
            .get('survey_responses')
            .query(
              Q.where('survey_id', r.id),
              Q.where('user_code', user?.code ?? ''),
            )
            .fetch();

          const isCompleted = responses.length > 0;
          const completedOn: number | null =
            isCompleted ? (responses[0] as any).completedOn : null;

          return {
            id: r.id,
            title: r.title,
            description: r.description ?? '',
            endDate: r.endDate,
            questionsJson: r.questionsJson ?? '[]',
            isCompleted,
            completedOn,
          };
        }),
      );

      setSurveys(mapped);
    } catch (err) {
      console.error('SurveyListScreen loadData error:', err);
    }
  }, [user?.code]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = surveys.filter((s) => {
    if (activeTab === 'pending') return !s.isCompleted;
    if (activeTab === 'completed') return s.isCompleted;
    return true;
  });

  const renderItem = ({ item }: { item: SurveyItem }) => {
    const questionCount = getQuestionCount(item.questionsJson);
    const now = Date.now();
    const isOverdue = item.endDate < now && !item.isCompleted;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate('SurveyExecute', {
            surveyId: item.id,
            title: item.title,
            customerCode: customerCode ?? '',
            customerName: customerName ?? '',
            visitCode,
          })
        }
        disabled={item.isCompleted}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.isCompleted ? (
              <View style={styles.completedBadge}>
                <Text style={styles.completedBadgeText}>Done</Text>
              </View>
            ) : (
              <View style={[styles.pendingBadge, isOverdue && styles.overdueBadge]}>
                <Text style={[styles.pendingBadgeText, isOverdue && styles.overdueBadgeText]}>
                  {isOverdue ? 'Overdue' : 'Pending'}
                </Text>
              </View>
            )}
          </View>

          {item.description !== '' && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>
              Due: {formatDueDate(item.endDate)}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>
              {questionCount} question{questionCount !== 1 ? 's' : ''}
            </Text>
            {item.isCompleted && item.completedOn !== null && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>
                  Completed {formatDueDate(item.completedOn)}
                </Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const TABS: { key: TabFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            activeOpacity={0.7}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
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
              <Text style={styles.emptyTitle}>
                {activeTab === 'completed'
                  ? 'No completed surveys'
                  : 'No surveys found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'pending'
                  ? 'All surveys have been completed.'
                  : 'Pull down to refresh.'}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
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
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginBottom: 12,
    ...cardShadow,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  completedBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  pendingBadge: {
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  overdueBadge: {
    backgroundColor: '#fef2f2',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.warning,
  },
  overdueBadgeText: {
    color: Colors.danger,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaDot: {
    fontSize: 12,
    color: Colors.border,
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
