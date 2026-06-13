import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import { v4 as uuidv4 } from 'uuid';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { Colors } from '../utils/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMode = 'Cash' | 'Cheque' | 'Bank Transfer' | 'UPI';

interface CustomerOutstanding {
  customerCode: string;
  customerName: string;
  outstandingAmount: number;
  lastOrderDate: number | null;
}

interface Collection {
  id: string;
  customerCode: string;
  customerName: string;
  amount: number;
  paymentMode: PaymentMode;
  referenceNumber: string;
  date: string;
  collectedAt: number;
  userCode: string;
}

interface PaymentFormState {
  amount: string;
  paymentMode: PaymentMode;
  referenceNumber: string;
  date: string;
}

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Cheque', 'Bank Transfer', 'UPI'];

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Payment Form Modal ────────────────────────────────────────────────────────

interface PaymentFormModalProps {
  visible: boolean;
  customer: CustomerOutstanding | null;
  onClose: () => void;
  onSave: (customer: CustomerOutstanding, form: PaymentFormState) => Promise<void>;
}

function PaymentFormModal({ visible, customer, onClose, onSave }: PaymentFormModalProps) {
  const today = todayDateString();
  const [form, setForm] = useState<PaymentFormState>({
    amount: '',
    paymentMode: 'Cash',
    referenceNumber: '',
    date: today,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm({
        amount: customer ? customer.outstandingAmount.toFixed(2) : '',
        paymentMode: 'Cash',
        referenceNumber: '',
        date: today,
      });
    }
  }, [visible, customer]);

  const handleSave = async () => {
    if (!customer) return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }
    if (!form.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid Date', 'Please enter date in YYYY-MM-DD format.');
      return;
    }
    if ((form.paymentMode === 'Cheque' || form.paymentMode === 'Bank Transfer') && !form.referenceNumber.trim()) {
      Alert.alert('Reference Required', `Please enter a reference number for ${form.paymentMode}.`);
      return;
    }
    setSaving(true);
    try {
      await onSave(customer, form);
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent hardwareAccelerated onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>{customer.customerName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Outstanding Banner */}
            <View style={styles.outstandingBanner}>
              <Icon name="alert-circle-outline" size={18} color="#D97706" />
              <Text style={styles.outstandingBannerText}>
                Outstanding: {formatCurrency(customer.outstandingAmount)}
              </Text>
            </View>

            {/* Amount */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Amount *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  value={form.amount}
                  onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>

            {/* Payment Mode */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Payment Mode *</Text>
              <View style={styles.paymentModeRow}>
                {PAYMENT_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.modeChip,
                      form.paymentMode === mode && styles.modeChipActive,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, paymentMode: mode }))}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={
                        mode === 'Cash' ? 'cash-outline'
                          : mode === 'Cheque' ? 'document-text-outline'
                          : mode === 'Bank Transfer' ? 'business-outline'
                          : 'phone-portrait-outline'
                      }
                      size={14}
                      color={form.paymentMode === mode ? Colors.white : Colors.primary}
                    />
                    <Text style={[
                      styles.modeChipText,
                      form.paymentMode === mode && styles.modeChipTextActive,
                    ]}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reference Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Reference Number
                {(form.paymentMode === 'Cheque' || form.paymentMode === 'Bank Transfer') && ' *'}
              </Text>
              <TextInput
                style={styles.textInput}
                value={form.referenceNumber}
                onChangeText={(t) => setForm((f) => ({ ...f, referenceNumber: t }))}
                placeholder={
                  form.paymentMode === 'Cheque' ? 'Cheque number'
                    : form.paymentMode === 'Bank Transfer' ? 'Transaction / UTR number'
                    : form.paymentMode === 'UPI' ? 'UPI transaction ID (optional)'
                    : 'Optional'
                }
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="characters"
              />
            </View>

            {/* Date */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date * (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                value={form.date}
                onChangeText={(t) => setForm((f) => ({ ...f, date: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.saveBtnText}>Save Collection</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [customers, setCustomers] = useState<CustomerOutstanding[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOutstanding | null>(null);
  const [formVisible, setFormVisible] = useState(false);

  const todayKey = `collections_${todayDateString()}`;

  // Load customers with outstanding amounts from WatermelonDB
  const loadCustomers = useCallback(async () => {
    try {
      const orders: any[] = await database
        .get('orders')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('status', Q.notEq(-1)), // exclude returns
        )
        .fetch();

      // Group by customer and sum totalAmount
      const customerMap = new Map<string, { name: string; total: number; lastDate: number | null }>();
      for (const order of orders) {
        const existing = customerMap.get(order.customerCode);
        if (!existing) {
          customerMap.set(order.customerCode, {
            name: order.customerName ?? order.customerCode,
            total: parseFloat(order.totalAmount) || 0,
            lastDate: order.trxDate ?? null,
          });
        } else {
          existing.total += parseFloat(order.totalAmount) || 0;
          if (order.trxDate && (!existing.lastDate || order.trxDate > existing.lastDate)) {
            existing.lastDate = order.trxDate;
          }
        }
      }

      // Load today's collections and subtract from outstanding
      const storedRaw = await AsyncStorage.getItem(todayKey);
      const todayCollections: Collection[] = storedRaw ? JSON.parse(storedRaw) : [];

      const collectedByCustomer = new Map<string, number>();
      for (const c of todayCollections) {
        collectedByCustomer.set(c.customerCode, (collectedByCustomer.get(c.customerCode) ?? 0) + c.amount);
      }

      const result: CustomerOutstanding[] = [];
      customerMap.forEach((val, code) => {
        const collected = collectedByCustomer.get(code) ?? 0;
        const outstanding = Math.max(0, val.total - collected);
        result.push({
          customerCode: code,
          customerName: val.name,
          outstandingAmount: outstanding,
          lastOrderDate: val.lastDate,
        });
      });

      result.sort((a, b) => b.outstandingAmount - a.outstandingAmount);
      setCustomers(result);
    } catch (e) {
      console.warn('CollectionScreen loadCustomers error', e);
    }
  }, [user?.code, todayKey]);

  // Load today's collections from AsyncStorage
  const loadCollections = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(todayKey);
      const data: Collection[] = raw ? JSON.parse(raw) : [];
      setCollections(data.sort((a, b) => b.collectedAt - a.collectedAt));
    } catch {
      setCollections([]);
    }
  }, [todayKey]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCustomers(), loadCollections()]);
    setLoading(false);
  }, [loadCustomers, loadCollections]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const handleSaveCollection = async (
    customer: CustomerOutstanding,
    form: PaymentFormState,
  ) => {
    const collection: Collection = {
      id: uuidv4(),
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      amount: parseFloat(form.amount),
      paymentMode: form.paymentMode,
      referenceNumber: form.referenceNumber.trim(),
      date: form.date,
      collectedAt: Date.now(),
      userCode: user?.code ?? '',
    };

    try {
      const raw = await AsyncStorage.getItem(todayKey);
      const existing: Collection[] = raw ? JSON.parse(raw) : [];
      existing.push(collection);
      await AsyncStorage.setItem(todayKey, JSON.stringify(existing));

      Alert.alert(
        'Collection Saved',
        `${formatCurrency(collection.amount)} recorded for ${customer.customerName}`,
        [{ text: 'OK' }],
      );
      setFormVisible(false);
      setSelectedCustomer(null);
      await loadAll();
    } catch (e) {
      Alert.alert('Error', 'Failed to save collection. Please try again.');
    }
  };

  // Summary calculations
  const totalCollected = collections.reduce((sum, c) => sum + c.amount, 0);
  const collectionCount = collections.length;

  // Filtered customers
  const filteredCustomers = customers.filter((c) =>
    searchQuery.trim() === '' ||
    c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.customerCode.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCustomerPress = (customer: CustomerOutstanding) => {
    setSelectedCustomer(customer);
    setFormVisible(true);
  };

  const renderCustomerItem = ({ item }: { item: CustomerOutstanding }) => (
    <TouchableOpacity
      style={styles.customerCard}
      onPress={() => handleCustomerPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.customerAvatarBox}>
        <Text style={styles.customerAvatarText}>
          {item.customerName?.[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <View style={styles.customerInfo}>
        <Text style={styles.customerName} numberOfLines={1}>{item.customerName}</Text>
        <Text style={styles.customerCode}>{item.customerCode}</Text>
        {item.lastOrderDate && (
          <Text style={styles.customerLastOrder}>
            Last order: {new Date(item.lastOrderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
        )}
      </View>
      <View style={styles.customerRight}>
        <Text style={[
          styles.outstandingAmount,
          item.outstandingAmount === 0 && styles.outstandingSettled,
        ]}>
          {formatCurrency(item.outstandingAmount)}
        </Text>
        <Text style={styles.outstandingLabel}>Outstanding</Text>
        <View style={[
          styles.collectBtn,
          item.outstandingAmount === 0 && styles.collectBtnSettled,
        ]}>
          <Text style={[
            styles.collectBtnText,
            item.outstandingAmount === 0 && styles.collectBtnTextSettled,
          ]}>
            {item.outstandingAmount === 0 ? 'Settled' : 'Collect'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCollectionItem = ({ item }: { item: Collection }) => (
    <View style={styles.collectionRow}>
      <View style={[styles.modeIcon, { backgroundColor: modeColor(item.paymentMode) + '20' }]}>
        <Icon name={modeIconName(item.paymentMode)} size={18} color={modeColor(item.paymentMode)} />
      </View>
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionCustomer} numberOfLines={1}>{item.customerName}</Text>
        <Text style={styles.collectionMeta}>
          {item.paymentMode}
          {item.referenceNumber ? ` · ${item.referenceNumber}` : ''}
        </Text>
        <Text style={styles.collectionTime}>{formatDate(item.collectedAt)}</Text>
      </View>
      <Text style={styles.collectionAmount}>{formatCurrency(item.amount)}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading collections...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Collection</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Icon name="cash-outline" size={28} color={Colors.primary} />
          <Text style={styles.summaryValue}>{formatCurrency(totalCollected)}</Text>
          <Text style={styles.summaryLabel}>Total Collected Today</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Icon name="receipt-outline" size={28} color={Colors.primary} />
          <Text style={styles.summaryValue}>{collectionCount}</Text>
          <Text style={styles.summaryLabel}>Transactions</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Icon name="people-outline" size={28} color={Colors.primary} />
          <Text style={styles.summaryValue}>{customers.length}</Text>
          <Text style={styles.summaryLabel}>Customers</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search customers..."
          placeholderTextColor={Colors.textSecondary}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && Platform.OS !== 'ios' && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.customerCode}
        renderItem={renderCustomerItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Customers with Outstanding</Text>
            {filteredCustomers.length === 0 && (
              <View style={styles.emptyBox}>
                <Icon name="checkmark-circle-outline" size={48} color={Colors.success} />
                <Text style={styles.emptyTitle}>All Clear!</Text>
                <Text style={styles.emptyText}>No outstanding amounts found.</Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          collections.length > 0 ? (
            <View style={styles.todaySection}>
              <Text style={styles.sectionTitle}>Today's Collections</Text>
              {collections.map((item) => (
                <React.Fragment key={item.id}>
                  {renderCollectionItem({ item })}
                </React.Fragment>
              ))}
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <PaymentFormModal
        visible={formVisible}
        customer={selectedCustomer}
        onClose={() => { setFormVisible(false); setSelectedCustomer(null); }}
        onSave={handleSaveCollection}
      />
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeIconName(mode: PaymentMode): string {
  switch (mode) {
    case 'Cash': return 'cash-outline';
    case 'Cheque': return 'document-text-outline';
    case 'Bank Transfer': return 'business-outline';
    case 'UPI': return 'phone-portrait-outline';
  }
}

function modeColor(mode: PaymentMode): string {
  switch (mode) {
    case 'Cash': return '#16A34A';
    case 'Cheque': return '#D97706';
    case 'Bank Transfer': return Colors.primary;
    case 'UPI': return '#7C3AED';
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // Header
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },

  // Summary Card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  summaryDivider: {
    width: 1,
    height: 48,
    backgroundColor: Colors.border,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: 44,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  // Customer Card
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  customerAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  customerInfo: {
    flex: 1,
    marginRight: 8,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  customerCode: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  customerLastOrder: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  customerRight: {
    alignItems: 'flex-end',
  },
  outstandingAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
  },
  outstandingSettled: {
    color: Colors.success,
  },
  outstandingLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  collectBtn: {
    marginTop: 6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  collectBtnSettled: {
    backgroundColor: Colors.success + '20',
  },
  collectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  collectBtnTextSettled: {
    color: Colors.success,
  },

  // Today's Collections
  todaySection: {
    marginTop: 8,
  },
  collectionRow: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  collectionInfo: {
    flex: 1,
  },
  collectionCustomer: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  collectionMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  collectionTime: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  collectionAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.success,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    maxWidth: 220,
  },
  outstandingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  outstandingBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    overflow: 'hidden',
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    paddingHorizontal: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    paddingVertical: 12,
    paddingRight: 12,
  },
  paymentModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    gap: 5,
  },
  modeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  modeChipTextActive: {
    color: Colors.white,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
