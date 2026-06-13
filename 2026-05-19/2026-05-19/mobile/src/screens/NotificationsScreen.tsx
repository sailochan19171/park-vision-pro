import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import useAuthStore from '../store/auth';
import useSyncStore from '../store/sync';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  icon: string;
  timestamp: number;
}

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function typeColor(type: Notification['type']): string {
  switch (type) {
    case 'success': return '#059669';
    case 'warning': return '#F59E0B';
    case 'alert': return '#EF4444';
    default: return '#1a56db';
  }
}

export default function NotificationsScreen() {
  const user = useAuthStore((s) => s.user);
  const { pendingCount } = useSyncStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const buildNotifications = useCallback(async () => {
    if (!user?.code) return;
    const userCode = user.code;
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const notifs: Notification[] = [];

    // --- Today's visits ---
    const visits: any[] = await database.get('customer_visits').query(
      Q.where('user_code', userCode),
      Q.where('checkin_time', Q.gte(todayMs)),
    ).fetch();

    for (const v of visits) {
      const custName = v.customerName || v.customerCode;
      if (v.status === 'checked_in' || v.status === 'completed') {
        notifs.push({
          id: `visit_${v.id}`,
          title: 'Store Check-in',
          body: `Checked in at ${custName}`,
          type: 'success',
          icon: '📍',
          timestamp: v.checkinTime,
        });
      }
      if (v.checkoutTime) {
        notifs.push({
          id: `checkout_${v.id}`,
          title: 'Store Check-out',
          body: `Checked out from ${custName} (${v.durationMins || 0} mins)`,
          type: 'info',
          icon: '🏁',
          timestamp: v.checkoutTime,
        });
      }
    }

    // --- Today's orders ---
    const orders: any[] = await database.get('orders').query(
      Q.where('user_code', userCode),
      Q.where('trx_date', Q.gte(todayMs)),
    ).fetch();

    for (const o of orders) {
      const custName = o.customerName || o.customerCode;
      const amt = parseFloat(o.totalAmount) || 0;
      notifs.push({
        id: `order_${o.id}`,
        title: 'Order Placed',
        body: `${custName} — AED ${amt.toFixed(2)} (${o.linesCount} items)`,
        type: 'success',
        icon: '🛒',
        timestamp: o.trxDate,
      });
    }

    // --- Today's store checks ---
    const storeChecks: any[] = await database.get('store_checks').query(
      Q.where('user_code', userCode),
      Q.where('check_date', Q.gte(todayMs)),
    ).fetch();

    for (const sc of storeChecks) {
      notifs.push({
        id: `sc_${sc.id}`,
        title: 'Store Check Completed',
        body: `${sc.customerName || sc.customerCode} — ${sc.totalCount} items checked`,
        type: 'info',
        icon: '✅',
        timestamp: sc.checkDate,
      });
    }

    // --- Today's expiry checks ---
    const expiryChecks: any[] = await database.get('expiry_checks').query(
      Q.where('user_code', userCode),
    ).fetch();
    const todayExpiry = expiryChecks.filter((e: any) => {
      const d = new Date(e.visitedDate);
      return d >= todayStart;
    });

    for (const ec of todayExpiry) {
      notifs.push({
        id: `exp_${ec.id}`,
        title: 'Expiry Check',
        body: `${ec.itemName || ec.itemCode} — Qty: ${ec.quantity}, Expiry: ${ec.expiryDate}`,
        type: 'warning',
        icon: '⚠️',
        timestamp: new Date(ec.visitedDate).getTime(),
      });
    }

    // --- Today's competitor observations ---
    const compObs: any[] = await database.get('competitor_observations').query(
      Q.where('user_code', userCode),
      Q.where('observed_on', Q.gte(todayMs)),
    ).fetch();

    for (const co of compObs) {
      notifs.push({
        id: `comp_${co.id}`,
        title: 'Competitor Observed',
        body: `${co.brandName}${co.productName ? ' — ' + co.productName : ''} at ${co.customerCode}`,
        type: 'info',
        icon: '👀',
        timestamp: co.observedOn,
      });
    }

    // --- Today's OSOI photos ---
    const osoiPhotos: any[] = await database.get('osoi_photos').query(
      Q.where('user_code', userCode),
      Q.where('captured_on', Q.gte(todayMs)),
    ).fetch();

    for (const p of osoiPhotos) {
      notifs.push({
        id: `osoi_${p.id}`,
        title: 'Photo Captured',
        body: `${p.assetType} photo at ${p.customerCode}`,
        type: 'info',
        icon: '📸',
        timestamp: p.capturedOn,
      });
    }

    // --- Today's planogram executions ---
    const plano: any[] = await database.get('planogram_executions').query(
      Q.where('user_code', userCode),
      Q.where('performed_on', Q.gte(todayMs)),
    ).fetch();

    for (const pe of plano) {
      notifs.push({
        id: `plano_${pe.id}`,
        title: pe.isFollowed ? 'Planogram Compliant' : 'Planogram Non-Compliant',
        body: `Store: ${pe.customerCode}`,
        type: pe.isFollowed ? 'success' : 'alert',
        icon: pe.isFollowed ? '✅' : '❌',
        timestamp: pe.performedOn,
      });
    }

    // --- Today's PO captures ---
    const poCaptures: any[] = await database.get('po_captures').query(
      Q.where('user_code', userCode),
      Q.where('captured_on', Q.gte(todayMs)),
    ).fetch();

    for (const po of poCaptures) {
      notifs.push({
        id: `po_${po.id}`,
        title: 'PO Captured',
        body: `PO# ${po.poNumber} — AED ${(parseFloat(po.totalAmount) || 0).toFixed(2)}`,
        type: 'info',
        icon: '📋',
        timestamp: po.capturedOn,
      });
    }

    // --- Attendance ---
    const attendance: any[] = await database.get('attendance_records').query(
      Q.where('user_code', userCode),
      Q.where('attendance_date', todayStart.toISOString().split('T')[0]),
    ).fetch();

    if (attendance.length > 0) {
      notifs.push({
        id: `att_${attendance[0].id}`,
        title: 'Day Started',
        body: `Attendance marked for today`,
        type: 'success',
        icon: '☀️',
        timestamp: todayMs + 1,
      });
    }

    // --- Sync status ---
    const unsyncedOrders = await database.get('orders').query(
      Q.where('user_code', userCode),
      Q.where('is_synced', false),
    ).fetchCount();
    const unsyncedVisits = await database.get('customer_visits').query(
      Q.where('user_code', userCode),
      Q.where('is_synced', false),
    ).fetchCount();
    const totalUnsynced = unsyncedOrders + unsyncedVisits;

    if (totalUnsynced > 0) {
      notifs.push({
        id: 'sync_pending',
        title: 'Sync Pending',
        body: `${totalUnsynced} item${totalUnsynced > 1 ? 's' : ''} waiting to sync (${unsyncedOrders} orders, ${unsyncedVisits} visits)`,
        type: 'warning',
        icon: '🔄',
        timestamp: now,
      });
    }

    // Sort by timestamp descending (newest first)
    notifs.sort((a, b) => b.timestamp - a.timestamp);
    setNotifications(notifs);
  }, [user?.code]);

  useEffect(() => {
    buildNotifications();
  }, [buildNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await buildNotifications();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <View style={[s.card, { borderLeftColor: typeColor(item.type) }]}>
      <View style={s.cardRow}>
        <Text style={s.cardIcon}>{item.icon}</Text>
        <View style={s.cardContent}>
          <Text style={s.cardTitle}>{item.title}</Text>
          <Text style={s.cardBody}>{item.body}</Text>
        </View>
        <Text style={s.cardTime}>{getRelativeTime(item.timestamp)}</Text>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Summary header */}
      <View style={s.summaryRow}>
        <View style={[s.summaryCard, { backgroundColor: '#EFF6FF' }]}>
          <Text style={s.summaryValue}>{notifications.filter(n => n.type === 'success').length}</Text>
          <Text style={s.summaryLabel}>Completed</Text>
        </View>
        <View style={[s.summaryCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={s.summaryValue}>{notifications.filter(n => n.type === 'warning').length}</Text>
          <Text style={s.summaryLabel}>Warnings</Text>
        </View>
        <View style={[s.summaryCard, { backgroundColor: '#F0FDF4' }]}>
          <Text style={s.summaryValue}>{notifications.length}</Text>
          <Text style={s.summaryLabel}>Total</Text>
        </View>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[s.list, notifications.length === 0 && s.listEmpty]}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>No activity yet</Text>
            <Text style={s.emptySub}>Start your day and visit stores to see live notifications</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1a56db']} tintColor="#1a56db" />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  summaryCard: {
    flex: 1, borderRadius: 12, padding: 14, alignItems: 'center',
    ...Platform.select({ android: { elevation: 1 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 } }),
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  summaryLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  listEmpty: { flex: 1, justifyContent: 'center' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 4,
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardIcon: { fontSize: 22, marginRight: 12, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 3 },
  cardBody: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  cardTime: { fontSize: 11, color: '#9CA3AF', marginLeft: 8, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 40 },
});
