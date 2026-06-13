import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';

const APPROVALS_KEY = 'approval_requests';

type TabType = 'PENDING' | 'APPROVED' | 'REJECTED';
type RequestType = 'ORDER' | 'RETURN' | 'CREDIT';
type StatusType = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ApprovalRequest {
  id: string;
  type: RequestType;
  requesterCode: string;
  requesterName: string;
  amount: number;
  currency: string;
  description: string;
  notes: string;
  status: StatusType;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  referenceCode?: string;
}

const TYPE_LABELS: Record<RequestType, string> = {
  ORDER: 'Order Approval',
  RETURN: 'Return Request',
  CREDIT: 'Credit Request',
};

const TYPE_ICONS: Record<RequestType, string> = {
  ORDER: 'cart-outline',
  RETURN: 'refresh-outline',
  CREDIT: 'cash-outline',
};

const TYPE_COLORS: Record<RequestType, string> = {
  ORDER: Colors.primary,
  RETURN: Colors.warning,
  CREDIT: '#7c3aed',
};

const STATUS_COLORS: Record<StatusType, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.success,
  REJECTED: Colors.danger,
};

function generateId(): string {
  return `appr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Seed demo data if empty
async function seedDemoData(userCode: string): Promise<void> {
  const raw = await AsyncStorage.getItem(APPROVALS_KEY);
  if (raw) return; // already seeded

  const demoRequests: ApprovalRequest[] = [
    {
      id: generateId(),
      type: 'ORDER',
      requesterCode: 'REP001',
      requesterName: 'Ahmed Al Farsi',
      amount: 15000,
      currency: 'AED',
      description: 'Large order above threshold for Al Maya Group',
      notes: 'Customer requested bulk discount. Order value exceeds AED 10,000 limit.',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      referenceCode: 'ORD-2026-0312',
    },
    {
      id: generateId(),
      type: 'RETURN',
      requesterCode: 'REP002',
      requesterName: 'Fatima Hassan',
      amount: 3200,
      currency: 'AED',
      description: 'Return of near-expiry Makhana packs from Carrefour Deira',
      notes: '48 units expiring in 30 days. Store refusing to accept delivery.',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      referenceCode: 'RET-2026-0089',
    },
    {
      id: generateId(),
      type: 'CREDIT',
      requesterCode: 'REP003',
      requesterName: 'Khalid Mohammed',
      amount: 8500,
      currency: 'AED',
      description: 'Credit note request for damaged goods — LuLu Hypermarket',
      notes: 'Goods were damaged in transit. Submitted with photo evidence.',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      referenceCode: 'CRD-2026-0045',
    },
    {
      id: generateId(),
      type: 'ORDER',
      requesterCode: 'REP001',
      requesterName: 'Ahmed Al Farsi',
      amount: 22000,
      currency: 'AED',
      description: 'Festive season bulk order — Ramadan promotion',
      notes: '',
      status: 'APPROVED',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      resolvedBy: userCode,
      resolutionNote: 'Approved for Ramadan bulk purchase.',
      referenceCode: 'ORD-2026-0298',
    },
    {
      id: generateId(),
      type: 'RETURN',
      requesterCode: 'REP004',
      requesterName: 'Sara Nasser',
      amount: 1100,
      currency: 'AED',
      description: 'Wrong SKU delivered to customer',
      notes: 'Driver delivered wrong product. Customer confirmed.',
      status: 'REJECTED',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      resolvedBy: userCode,
      resolutionNote: 'Insufficient evidence. Please re-submit with photos.',
      referenceCode: 'RET-2026-0077',
    },
  ];

  await AsyncStorage.setItem(APPROVALS_KEY, JSON.stringify(demoRequests));
}

export default function ApprovalScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<TabType>('PENDING');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state for approve/reject action
  const [actionModal, setActionModal] = useState<{
    visible: boolean;
    request: ApprovalRequest | null;
    action: 'APPROVED' | 'REJECTED' | null;
    note: string;
    saving: boolean;
  }>({
    visible: false,
    request: null,
    action: null,
    note: '',
    saving: false,
  });

  const loadRequests = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      await seedDemoData(user?.code ?? 'MANAGER');
      const raw = await AsyncStorage.getItem(APPROVALS_KEY);
      const parsed: ApprovalRequest[] = raw ? JSON.parse(raw) : [];
      // Sort by createdAt descending
      parsed.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRequests(parsed);
    } catch {
      Alert.alert('Error', 'Failed to load approval requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const tabCounts = useMemo(
    () => ({
      PENDING: requests.filter((r) => r.status === 'PENDING').length,
      APPROVED: requests.filter((r) => r.status === 'APPROVED').length,
      REJECTED: requests.filter((r) => r.status === 'REJECTED').length,
    }),
    [requests],
  );

  const filteredRequests = useMemo(
    () => requests.filter((r) => r.status === tab),
    [requests, tab],
  );

  const openAction = (request: ApprovalRequest, action: 'APPROVED' | 'REJECTED') => {
    setActionModal({ visible: true, request, action, note: '', saving: false });
  };

  const closeModal = () => {
    setActionModal({ visible: false, request: null, action: null, note: '', saving: false });
  };

  const handleConfirmAction = async () => {
    const { request, action, note } = actionModal;
    if (!request || !action) return;

    setActionModal((prev) => ({ ...prev, saving: true }));

    try {
      const raw = await AsyncStorage.getItem(APPROVALS_KEY);
      const all: ApprovalRequest[] = raw ? JSON.parse(raw) : [];
      const updated = all.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: action,
              resolvedAt: new Date().toISOString(),
              resolvedBy: user?.code ?? 'MANAGER',
              resolutionNote: note.trim() || undefined,
            }
          : r,
      );
      await AsyncStorage.setItem(APPROVALS_KEY, JSON.stringify(updated));
      setRequests(
        updated.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      closeModal();
      const label = action === 'APPROVED' ? 'approved' : 'rejected';
      Alert.alert('Done', `Request ${label} successfully.`);
    } catch {
      Alert.alert('Error', 'Failed to update request.');
      setActionModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const renderCard = ({ item }: { item: ApprovalRequest }) => {
    const typeColor = TYPE_COLORS[item.type];
    const statusColor = STATUS_COLORS[item.status];
    return (
      <View style={styles.card}>
        {/* Card left accent */}
        <View style={[styles.cardAccent, { backgroundColor: typeColor }]} />

        <View style={styles.cardBody}>
          {/* Top row: type icon + ref + status */}
          <View style={styles.cardTopRow}>
            <View style={[styles.typeIconWrap, { backgroundColor: `${typeColor}18` }]}>
              <Icon name={TYPE_ICONS[item.type]} size={18} color={typeColor} />
            </View>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTypeLabel}>{TYPE_LABELS[item.type]}</Text>
              {item.referenceCode ? (
                <Text style={styles.cardRefCode}>{item.referenceCode}</Text>
              ) : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>

          {/* Amount */}
          <Text style={styles.cardAmount}>
            {item.currency} {item.amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </Text>

          {/* Requester + date */}
          <View style={styles.cardMetaRow}>
            <Icon name="person-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.cardMetaText}>{item.requesterName}</Text>
            <Icon name="time-outline" size={13} color={Colors.textSecondary} style={{ marginLeft: 8 }} />
            <Text style={styles.cardMetaText}>{formatDateTime(item.createdAt)}</Text>
          </View>

          {/* Description */}
          {item.description ? (
            <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
          ) : null}

          {/* Notes */}
          {item.notes ? (
            <Text style={styles.cardNotes} numberOfLines={2}>{item.notes}</Text>
          ) : null}

          {/* Resolution info */}
          {item.status !== 'PENDING' && item.resolutionNote ? (
            <View style={styles.resolutionBlock}>
              <Icon
                name={item.status === 'APPROVED' ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={statusColor}
              />
              <Text style={[styles.resolutionNote, { color: statusColor }]}>
                {item.resolutionNote}
              </Text>
            </View>
          ) : null}

          {item.status !== 'PENDING' && item.resolvedAt ? (
            <Text style={styles.resolvedAt}>
              {item.status === 'APPROVED' ? 'Approved' : 'Rejected'} on{' '}
              {formatDateTime(item.resolvedAt)}
              {item.resolvedBy ? ` by ${item.resolvedBy}` : ''}
            </Text>
          ) : null}

          {/* Action buttons — only for pending */}
          {item.status === 'PENDING' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => openAction(item, 'REJECTED')}
                activeOpacity={0.8}
              >
                <Icon name="close" size={16} color={Colors.danger} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => openAction(item, 'APPROVED')}
                activeOpacity={0.8}
              >
                <Icon name="checkmark" size={16} color={Colors.white} />
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const TABS: TabType[] = ['PENDING', 'APPROVED', 'REJECTED'];
  const TAB_ICONS: Record<TabType, string> = {
    PENDING: 'hourglass-outline',
    APPROVED: 'checkmark-circle-outline',
    REJECTED: 'close-circle-outline',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Approvals</Text>
            <Text style={styles.headerSub}>
              {tabCounts.PENDING} pending request{tabCounts.PENDING !== 1 ? 's' : ''}
            </Text>
          </View>
          {tabCounts.PENDING > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{tabCounts.PENDING}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Icon
              name={TAB_ICONS[t]}
              size={16}
              color={tab === t ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </Text>
            {tabCounts[t] > 0 && (
              <View
                style={[
                  styles.tabCount,
                  {
                    backgroundColor:
                      t === 'PENDING'
                        ? Colors.warning
                        : t === 'APPROVED'
                        ? Colors.success
                        : Colors.danger,
                  },
                ]}
              >
                <Text style={styles.tabCountText}>{tabCounts[t]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading approvals...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadRequests(true)}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon
                name={
                  tab === 'PENDING'
                    ? 'hourglass-outline'
                    : tab === 'APPROVED'
                    ? 'checkmark-circle-outline'
                    : 'close-circle-outline'
                }
                size={56}
                color={Colors.border}
              />
              <Text style={styles.emptyTitle}>No {tab.toLowerCase()} requests</Text>
              <Text style={styles.emptySubtitle}>
                {tab === 'PENDING'
                  ? 'All caught up! No pending items.'
                  : `No requests have been ${tab.toLowerCase()} yet.`}
              </Text>
            </View>
          }
        />
      )}

      {/* Approve / Reject Modal */}
      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        hardwareAccelerated
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>
              {actionModal.action === 'APPROVED' ? 'Approve Request' : 'Reject Request'}
            </Text>

            {actionModal.request && (
              <View style={styles.modalPreview}>
                <Text style={styles.modalPreviewType}>
                  {TYPE_LABELS[actionModal.request.type]}
                </Text>
                <Text style={styles.modalPreviewAmount}>
                  {actionModal.request.currency}{' '}
                  {actionModal.request.amount.toLocaleString('en-US')}
                </Text>
                <Text style={styles.modalPreviewBy}>
                  by {actionModal.request.requesterName}
                </Text>
              </View>
            )}

            <Text style={styles.modalNoteLabel}>
              Note / Comments{' '}
              <Text style={styles.modalNoteOptional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.modalNoteInput}
              value={actionModal.note}
              onChangeText={(t) => setActionModal((prev) => ({ ...prev, note: t }))}
              placeholder={
                actionModal.action === 'APPROVED'
                  ? 'Add approval note...'
                  : 'Reason for rejection...'
              }
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeModal} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  {
                    backgroundColor:
                      actionModal.action === 'APPROVED' ? Colors.success : Colors.danger,
                  },
                ]}
                onPress={handleConfirmAction}
                disabled={actionModal.saving}
                activeOpacity={0.8}
              >
                {actionModal.saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Icon
                      name={actionModal.action === 'APPROVED' ? 'checkmark' : 'close'}
                      size={18}
                      color={Colors.white}
                    />
                    <Text style={styles.modalConfirmText}>
                      {actionModal.action === 'APPROVED' ? 'Confirm Approve' : 'Confirm Reject'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 12,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pendingBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.white,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  tabCount: {
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTypeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cardRefCode: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  cardNotes: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  resolutionBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 8,
  },
  resolutionNote: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  resolvedAt: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#fff5f5',
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.danger,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: Colors.success,
    ...Platform.select({
      ios: {
        shadowColor: Colors.success,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  modalPreview: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalPreviewType: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalPreviewAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  modalPreviewBy: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalNoteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  modalNoteOptional: {
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  modalNoteInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
    minHeight: 90,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 2,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
    }),
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
