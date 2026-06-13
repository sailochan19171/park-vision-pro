import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors } from '../utils/colors';
import api from '../api/client';

interface Profile {
  code: string;
  name: string;
  userType: string;
  routeCode: string | null;
  mobile: string | null;
  email: string | null;
}

interface Stats {
  orders: number;
  revenue: number;
  visits: number;
}

interface AttendanceDay {
  attendanceDate: string;
  isPresent: boolean;
}

interface AssignedCustomer {
  customerCode: string;
  customerName: string | null;
  channelCode: string | null;
}

export default function TeamMemberDetailScreen() {
  const route = useRoute<any>();
  const { code } = route.params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats>({ orders: 0, revenue: 0, visits: 0 });
  const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
  const [customers, setCustomers] = useState<AssignedCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/team/members/${code}`);
      setProfile(data.profile);
      setStats(data.stats);
      setAttendanceDays(data.attendance);
      setCustomers(data.customers);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, [code]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const formatCurrency = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Build 7-day attendance strip
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const attendanceMap = new Map(attendanceDays.map((a) => [a.attendanceDate, a.isPresent]));

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 16, color: Colors.textSecondary }}>Member not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile header */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.profileName}>{profile.name}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{profile.userType}</Text>
        </View>
        {profile.routeCode && (
          <Text style={styles.profileDetail}>Route: {profile.routeCode}</Text>
        )}
        {profile.mobile && (
          <Text style={styles.profileDetail}>{profile.mobile}</Text>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.orders}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { fontSize: 20, color: Colors.primary }]}>
            {formatCurrency(stats.revenue)}
          </Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.visits}</Text>
          <Text style={styles.statLabel}>Visits</Text>
        </View>
      </View>
      <Text style={styles.statsSubtitle}>Last 7 days</Text>

      {/* 7-day attendance strip */}
      <Text style={styles.sectionTitle}>Attendance</Text>
      <View style={styles.attendanceStrip}>
        {last7Days.map((dateStr) => {
          const isPresent = attendanceMap.get(dateStr);
          const dayLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
          const color = isPresent === true ? Colors.success : isPresent === false ? Colors.danger : Colors.border;
          return (
            <View key={dateStr} style={styles.attendanceDay}>
              <View style={[styles.attendanceDot, { backgroundColor: color }]} />
              <Text style={styles.attendanceDayLabel}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>

      {/* Assigned customers */}
      <Text style={styles.sectionTitle}>Assigned Customers ({customers.length})</Text>
      {customers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No customers assigned</Text>
        </View>
      ) : (
        customers.map((c) => (
          <View key={c.customerCode} style={styles.customerCard}>
            <Text style={styles.customerName}>{c.customerName ?? c.customerCode}</Text>
            <View style={styles.customerMeta}>
              <Text style={styles.customerCode}>{c.customerCode}</Text>
              {c.channelCode && <Text style={styles.customerChannel}>{c.channelCode}</Text>}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  profileDetail: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  attendanceStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  attendanceDay: {
    alignItems: 'center',
    gap: 6,
  },
  attendanceDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  attendanceDayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  customerMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  customerCode: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  customerChannel: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
});
