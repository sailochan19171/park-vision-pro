import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../utils/colors';
import api from '../api/client';

type TabType = 'PENDING' | 'APPROVED' | 'REJECTED';

interface GeoRequest {
  id: number;
  customerCode: string;
  customerName: string | null;
  latitude: string | null;
  longitude: string | null;
  status: string;
  submittedBy: string;
  submitterName: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
}

export default function LocationApprovalScreen() {
  const [tab, setTab] = useState<TabType>('PENDING');
  const [data, setData] = useState<GeoRequest[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async (status?: TabType) => {
    try {
      const { data: resp } = await api.get('/team/location-approvals', {
        params: { status: status ?? tab },
      });
      setCounts(resp.counts);
      setData(resp.data);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const switchTab = (t: TabType) => {
    setTab(t);
    setLoading(true);
    load(t);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Custom Modal-based reject flow — Alert.prompt is iOS-only and was a
  // silent no-op on Android, which is why the Reject button did nothing for
  // TLs. A Modal works on both platforms and matches the branded style.
  const [rejectTarget, setRejectTarget] = useState<GeoRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Shared branded "Alert !" popup. Matches the in-app style the user sees
  // elsewhere (customer location alert), not the native OS dialog.
  const [infoAlert, setInfoAlert] = useState<{ title: string; message: string; onOk?: () => void } | null>(null);
  const showInfo = (title: string, message: string, onOk?: () => void) =>
    setInfoAlert({ title, message, onOk });

  const handleApprove = (item: GeoRequest) => {
    Alert.alert(
      'Approve Location',
      `Approve new coordinates for ${item.customerName ?? item.customerCode}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActionLoading(item.id);
            try {
              await api.put(`/team/location-approvals/${item.id}`, { status: 'APPROVED' });
              showInfo('Alert !', 'Location approved successfully.', () => load());
            } catch {
              showInfo('Alert !', 'Failed to approve. Please try again.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (item: GeoRequest) => {
    setRejectReason('');
    setRejectTarget(item);
  };

  const submitReject = async () => {
    const item = rejectTarget;
    if (!item) return;
    const reason = rejectReason.trim();
    if (!reason) {
      showInfo('Alert !', 'Please enter a reason before rejecting.');
      return;
    }
    setActionLoading(item.id);
    setRejectTarget(null);
    try {
      await api.put(`/team/location-approvals/${item.id}`, { status: 'REJECTED', reason });
      showInfo('Alert !', 'Location rejected successfully.', () => load());
    } catch {
      showInfo('Alert !', 'Failed to reject. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const TABS: { key: TabType; label: string; count: number }[] = [
    { key: 'PENDING', label: 'Pending', count: counts.pending },
    { key: 'APPROVED', label: 'Approved', count: counts.approved },
    { key: 'REJECTED', label: 'Rejected', count: counts.rejected },
  ];

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            activeOpacity={0.7}
            onPress={() => switchTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, tab === t.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === t.key && styles.tabBadgeTextActive]}>
                  {t.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {data.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No {tab.toLowerCase()} requests</Text>
          </View>
        ) : (
          data.map((item) => (
            <View key={item.id} style={styles.requestCard}>
              <Text style={styles.customerName}>{item.customerName ?? item.customerCode}</Text>
              <Text style={styles.submitter}>
                Submitted by {item.submitterName ?? item.submittedBy}
              </Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              {item.latitude && item.longitude && (
                <Text style={styles.coords}>
                  {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}
                </Text>
              )}
              {item.rejectionReason && (
                <Text style={styles.rejectionReason}>Reason: {item.rejectionReason}</Text>
              )}

              {tab === 'PENDING' && (
                <View style={styles.actionRow}>
                  {actionLoading === item.id ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        activeOpacity={0.7}
                        onPress={() => handleApprove(item)}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        activeOpacity={0.7}
                        onPress={() => handleReject(item)}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Reject reason modal (cross-platform replacement for Alert.prompt) */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalHeading}>Reject Location</Text>
            <Text style={styles.modalBody}>
              Enter reason for rejecting {rejectTarget?.customerName ?? rejectTarget?.customerCode}.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason for rejection"
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRejectTarget(null)} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalRejectBtn} onPress={submitReject} activeOpacity={0.8}>
                <Text style={styles.modalRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Branded "Alert !" popup (matches the style used elsewhere in-app) */}
      <Modal visible={!!infoAlert} transparent animationType="fade" onRequestClose={() => { const cb = infoAlert?.onOk; setInfoAlert(null); cb?.(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertHeading}>{infoAlert?.title ?? 'Alert !'}</Text>
            <Text style={styles.alertBody}>{infoAlert?.message}</Text>
            <TouchableOpacity
              style={styles.alertOkBtn}
              onPress={() => { const cb = infoAlert?.onOk; setInfoAlert(null); cb?.(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.alertOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  tabBadge: {
    backgroundColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: Colors.primaryDark,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
  requestCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  submitter: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  date: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  coords: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
    marginTop: 4,
  },
  rejectionReason: {
    fontSize: 13,
    color: Colors.danger,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  rejectBtnText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Modals ────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  modalBox: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 10,
    paddingTop: 22, paddingBottom: 0, paddingHorizontal: 0,
    overflow: 'hidden',
  },
  modalHeading: {
    paddingHorizontal: 22, fontSize: 20, fontWeight: '700',
    color: '#111827', marginBottom: 10,
  },
  modalBody: { paddingHorizontal: 22, fontSize: 14, color: '#4B5563', marginBottom: 14 },
  modalInput: {
    marginHorizontal: 22, borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top',
    fontSize: 14, color: '#111827', marginBottom: 18,
  },
  modalBtnRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  modalCancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  modalRejectBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#DC2626', borderBottomRightRadius: 10,
  },
  modalRejectText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Branded "Alert !" popup — mirrors the screenshot the user referenced.
  alertBox: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 10,
    paddingTop: 22, overflow: 'hidden',
  },
  alertHeading: { paddingHorizontal: 22, fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  alertBody: { paddingHorizontal: 22, fontSize: 16, color: '#374151', marginBottom: 20, lineHeight: 22 },
  alertOkBtn: {
    backgroundColor: '#1E3A8A', paddingVertical: 16, alignItems: 'center',
  },
  alertOkText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});
