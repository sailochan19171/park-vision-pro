import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import { v4 as uuidv4 } from 'uuid';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { pushSync } from '../services/syncService';
import { Colors } from '../utils/colors';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReturnReason = 'Damaged' | 'Expired' | 'Wrong Product' | 'Quality Issue' | 'Customer Refused';

const RETURN_REASONS: ReturnReason[] = [
  'Damaged',
  'Expired',
  'Wrong Product',
  'Quality Issue',
  'Customer Refused',
];

interface VisitedCustomer {
  customerCode: string;
  customerName: string;
  visitDate: number;
}

interface OrderLineItem {
  lineId: string;
  orderId: string;
  orderDate: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  priceUsed: number;
  uom: string;
}

interface ReturnLineState {
  lineId: string;
  orderId: string;
  itemCode: string;
  itemName: string;
  originalQty: number;
  returnQty: number;
  priceUsed: number;
  uom: string;
  returnReason: ReturnReason | null;
  orderDate: number;
}

function formatCurrency(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─── Reason Picker Modal ──────────────────────────────────────────────────────

interface ReasonPickerProps {
  visible: boolean;
  selected: ReturnReason | null;
  onSelect: (reason: ReturnReason) => void;
  onClose: () => void;
}

function ReasonPickerModal({ visible, selected, onSelect, onClose }: ReasonPickerProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Select Return Reason</Text>
          {RETURN_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              style={[styles.pickerOption, selected === reason && styles.pickerOptionSelected]}
              onPress={() => { onSelect(reason); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.pickerOptionText,
                selected === reason && styles.pickerOptionTextSelected,
              ]}>
                {reason}
              </Text>
              {selected === reason && (
                <Icon name="checkmark" size={18} color={Colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Step 1: Customer Selector ────────────────────────────────────────────────

interface CustomerSelectorProps {
  customers: VisitedCustomer[];
  selected: VisitedCustomer | null;
  onSelect: (c: VisitedCustomer) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function CustomerSelector({
  customers,
  selected,
  onSelect,
  searchQuery,
  onSearchChange,
}: CustomerSelectorProps) {
  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          searchQuery.trim() === '' ||
          c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.customerCode.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [customers, searchQuery],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search customers visited today..."
          placeholderTextColor={Colors.textSecondary}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && Platform.OS !== 'ios' && (
          <TouchableOpacity onPress={() => onSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Icon name="storefront-outline" size={52} color={Colors.border} />
          <Text style={styles.emptyTitle}>No Customers Found</Text>
          <Text style={styles.emptyText}>
            {customers.length === 0
              ? 'No customer visits recorded today.'
              : 'No customers match your search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.customerCode}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.customerCard,
                selected?.customerCode === item.customerCode && styles.customerCardSelected,
              ]}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.customerAvatarBox,
                selected?.customerCode === item.customerCode && styles.customerAvatarBoxSelected,
              ]}>
                <Text style={[
                  styles.customerAvatarText,
                  selected?.customerCode === item.customerCode && styles.customerAvatarTextSelected,
                ]}>
                  {item.customerName?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.customerInfoFlex}>
                <Text style={styles.customerName} numberOfLines={1}>{item.customerName}</Text>
                <Text style={styles.customerCode}>{item.customerCode}</Text>
                <Text style={styles.visitTime}>
                  Visited: {new Date(item.visitDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </Text>
              </View>
              {selected?.customerCode === item.customerCode && (
                <Icon name="checkmark-circle" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Step 2: Item Return Form ─────────────────────────────────────────────────

interface ReturnItemRowProps {
  item: ReturnLineState;
  onUpdateQty: (lineId: string, delta: number) => void;
  onSetReason: (lineId: string, reason: ReturnReason) => void;
  onToggleSelected: (lineId: string) => void;
  selected: boolean;
}

function ReturnItemRow({
  item,
  onUpdateQty,
  onSetReason,
  onToggleSelected,
  selected,
}: ReturnItemRowProps) {
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);

  const lineValue = item.returnQty * item.priceUsed;

  return (
    <View style={[styles.returnItemCard, selected && styles.returnItemCardSelected]}>
      {/* Item Header */}
      <TouchableOpacity
        style={styles.returnItemHeader}
        onPress={() => onToggleSelected(item.lineId)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Icon name="checkmark" size={14} color={Colors.white} />}
        </View>
        <View style={styles.itemNameCol}>
          <Text style={styles.returnItemName} numberOfLines={2}>{item.itemName}</Text>
          <Text style={styles.returnItemMeta}>
            {item.itemCode} · {item.uom} · {formatCurrency(item.priceUsed)}
          </Text>
          <Text style={styles.returnItemOrderDate}>
            Order: {new Date(item.orderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <View style={styles.itemOrigQtyBox}>
          <Text style={styles.itemOrigQtyLabel}>Ordered</Text>
          <Text style={styles.itemOrigQtyValue}>{item.originalQty}</Text>
        </View>
      </TouchableOpacity>

      {/* Return Qty + Reason (only when selected) */}
      {selected && (
        <View style={styles.returnControls}>
          {/* Quantity Stepper */}
          <View style={styles.returnQtyRow}>
            <Text style={styles.returnQtyLabel}>Return Qty</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepperBtn, item.returnQty === 0 && styles.stepperBtnDisabled]}
                onPress={() => onUpdateQty(item.lineId, -1)}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepperBtnText, item.returnQty === 0 && styles.stepperBtnTextDisabled]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={[styles.stepperQty, item.returnQty > 0 && styles.stepperQtyActive]}>
                {item.returnQty}
              </Text>
              <TouchableOpacity
                style={[styles.stepperBtn, item.returnQty >= item.originalQty && styles.stepperBtnDisabled]}
                onPress={() => onUpdateQty(item.lineId, 1)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.stepperBtnText,
                  item.returnQty >= item.originalQty && styles.stepperBtnTextDisabled,
                ]}>
                  +
                </Text>
              </TouchableOpacity>
            </View>
            {item.returnQty > 0 && (
              <Text style={styles.returnLineValue}>
                = {formatCurrency(lineValue)}
              </Text>
            )}
          </View>

          {/* Return Reason Dropdown */}
          <TouchableOpacity
            style={[styles.reasonSelector, !item.returnReason && styles.reasonSelectorEmpty]}
            onPress={() => setReasonPickerOpen(true)}
            activeOpacity={0.7}
          >
            <Icon name="alert-circle-outline" size={16} color={item.returnReason ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.reasonSelectorText, !item.returnReason && styles.reasonSelectorTextEmpty]}>
              {item.returnReason ?? 'Select return reason *'}
            </Text>
            <Icon name="chevron-down" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>

          <ReasonPickerModal
            visible={reasonPickerOpen}
            selected={item.returnReason}
            onSelect={(r) => onSetReason(item.lineId, r)}
            onClose={() => setReasonPickerOpen(false)}
          />
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReturnOrderScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<1 | 2>(1);
  const [visitedCustomers, setVisitedCustomers] = useState<VisitedCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<VisitedCustomer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load customers visited today
  const loadVisitedCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const visits: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('checkin_time', Q.gte(todayStart())),
          Q.sortBy('checkin_time', Q.desc),
        )
        .fetch();

      // Deduplicate by customerCode, keep latest visit
      const seen = new Set<string>();
      const customers: VisitedCustomer[] = [];
      for (const v of visits) {
        if (!seen.has(v.customerCode)) {
          seen.add(v.customerCode);
          customers.push({
            customerCode: v.customerCode,
            customerName: v.customerName ?? v.customerCode,
            visitDate: v.checkinTime,
          });
        }
      }
      setVisitedCustomers(customers);
    } catch (e) {
      console.warn('ReturnOrderScreen loadVisitedCustomers error', e);
    } finally {
      setLoadingCustomers(false);
    }
  }, [user?.code]);

  useFocusEffect(
    useCallback(() => {
      loadVisitedCustomers();
    }, [loadVisitedCustomers]),
  );

  // Load order lines for selected customer
  const loadCustomerOrderLines = useCallback(async (customer: VisitedCustomer) => {
    setLoadingItems(true);
    setReturnLines([]);
    setSelectedLineIds(new Set());
    try {
      // Get all orders for this customer by the current user
      const orders: any[] = await database
        .get('orders')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customer.customerCode),
          Q.where('status', Q.notEq(-1)), // exclude existing returns
          Q.sortBy('trx_date', Q.desc),
        )
        .fetch();

      if (orders.length === 0) {
        setReturnLines([]);
        setLoadingItems(false);
        return;
      }

      // Load lines for all orders
      const orderIds = orders.map((o: any) => o.id);
      const allLines: any[] = await database
        .get('order_lines')
        .query(Q.where('order_id', Q.oneOf(orderIds)))
        .fetch();

      // Build a date map from orders
      const orderDateMap = new Map<string, number>(
        orders.map((o: any) => [o.id, o.trxDate ?? Date.now()]),
      );

      // Deduplicate by itemCode: merge quantities, keep latest price
      const itemMap = new Map<string, ReturnLineState>();
      for (const line of allLines) {
        const orderId = line._raw?.order_id ?? (line as any).order?.id ?? '';
        const existingLine = Array.from(itemMap.values()).find(
          (r) => r.itemCode === line.itemCode,
        );
        if (existingLine) {
          existingLine.originalQty += line.quantity ?? 0;
        } else {
          itemMap.set(line.id, {
            lineId: line.id,
            orderId,
            itemCode: line.itemCode,
            itemName: line.itemName ?? line.itemCode,
            originalQty: line.quantity ?? 0,
            returnQty: 1,
            priceUsed: line.priceUsed ?? 0,
            uom: line.uom ?? 'PCS',
            returnReason: null,
            orderDate: orderDateMap.get(orderId) ?? Date.now(),
          });
        }
      }

      const lines = Array.from(itemMap.values()).sort((a, b) =>
        a.itemName.localeCompare(b.itemName),
      );
      setReturnLines(lines);
    } catch (e) {
      console.warn('ReturnOrderScreen loadCustomerOrderLines error', e);
      Alert.alert('Error', 'Failed to load order history for this customer.');
    } finally {
      setLoadingItems(false);
    }
  }, [user?.code]);

  const handleCustomerSelect = (customer: VisitedCustomer) => {
    setSelectedCustomer(customer);
  };

  const handleProceedToItems = async () => {
    if (!selectedCustomer) {
      Alert.alert('Select Customer', 'Please select a customer to proceed.');
      return;
    }
    setStep(2);
    await loadCustomerOrderLines(selectedCustomer);
  };

  const handleToggleSelected = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  const handleUpdateQty = useCallback((lineId: string, delta: number) => {
    setReturnLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId
          ? { ...line, returnQty: Math.max(0, Math.min(line.originalQty, line.returnQty + delta)) }
          : line,
      ),
    );
  }, []);

  const handleSetReason = useCallback((lineId: string, reason: ReturnReason) => {
    setReturnLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId ? { ...line, returnReason: reason } : line,
      ),
    );
  }, []);

  // Computed return summary
  const selectedLines = useMemo(
    () => returnLines.filter((l) => selectedLineIds.has(l.lineId) && l.returnQty > 0),
    [returnLines, selectedLineIds],
  );

  const totalReturnValue = useMemo(
    () => selectedLines.reduce((sum, l) => sum + l.returnQty * l.priceUsed, 0),
    [selectedLines],
  );

  const totalReturnItems = useMemo(
    () => selectedLines.reduce((sum, l) => sum + l.returnQty, 0),
    [selectedLines],
  );

  // Validate and submit
  const handleSubmitReturn = async () => {
    if (!selectedCustomer) return;

    if (selectedLines.length === 0) {
      Alert.alert('No Items Selected', 'Please select at least one item to return.');
      return;
    }

    const missingReason = selectedLines.find((l) => !l.returnReason);
    if (missingReason) {
      Alert.alert(
        'Reason Required',
        `Please select a return reason for: ${missingReason.itemName}`,
      );
      return;
    }

    const zeroQty = selectedLines.find((l) => l.returnQty === 0);
    if (zeroQty) {
      Alert.alert('Invalid Quantity', `Return quantity cannot be zero for: ${zeroQty.itemName}`);
      return;
    }

    Alert.alert(
      'Confirm Return',
      `Return ${totalReturnItems} item(s) worth ${formatCurrency(totalReturnValue)} for ${selectedCustomer.customerName}?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: executeReturn },
      ],
    );
  };

  const executeReturn = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    const appTrxId = uuidv4();
    const now = Date.now();

    try {
      await database.write(async () => {
        // Create the return order with negative totalAmount and status -1
        const returnOrder = await database.get('orders').create((rec: any) => {
          rec._raw.id = appTrxId;
          rec.appTrxId = appTrxId;
          rec.serverTrxCode = null;
          rec.userCode = user?.code ?? '';
          rec.customerCode = selectedCustomer.customerCode;
          rec.customerName = selectedCustomer.customerName;
          rec.trxDate = now;
          rec.totalAmount = -Math.abs(totalReturnValue);
          rec.linesCount = selectedLines.length;
          rec.status = -1; // -1 = return order
          rec.routeCode = user?.routeCode ?? null;
          rec.geoLat = null;
          rec.geoLng = null;
          rec.isSynced = false;
        });

        for (let i = 0; i < selectedLines.length; i++) {
          const line = selectedLines[i];
          await database.get('order_lines').create((rec: any) => {
            rec._raw.id = `${appTrxId}_ret_${i + 1}`;
            rec.order.id = returnOrder.id;
            rec.lineNo = i + 1;
            rec.itemCode = line.itemCode;
            rec.itemName = `[RETURN: ${line.returnReason}] ${line.itemName}`;
            rec.quantity = -Math.abs(line.returnQty);
            rec.priceUsed = line.priceUsed;
            rec.taxPct = 0;
            rec.uom = line.uom;
          });
        }
      });

      // Push sync after save
      pushSync().catch(() => {});

      Alert.alert(
        'Return Saved',
        `Return order created for ${selectedCustomer.customerName}.\n${selectedLines.length} item(s) · ${formatCurrency(totalReturnValue)}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      console.warn('ReturnOrderScreen executeReturn error', e);
      Alert.alert('Error', 'Failed to save return order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (step === 2) {
              setStep(1);
            } else {
              navigation.goBack();
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Return Order</Text>
          <Text style={styles.headerSubtitle}>
            {step === 1 ? 'Step 1 of 2 — Select Customer' : 'Step 2 of 2 — Select Items'}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Step Indicator */}
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, styles.stepDotActive]}>
          <Icon name="person" size={14} color={Colors.white} />
        </View>
        <View style={[styles.stepLine, step === 2 && styles.stepLineActive]} />
        <View style={[styles.stepDot, step === 2 && styles.stepDotActive, step < 2 && styles.stepDotInactive]}>
          <Icon name="cube" size={14} color={step === 2 ? Colors.white : Colors.textSecondary} />
        </View>
      </View>

      {/* Step 1: Customer Selection */}
      {step === 1 && (
        <>
          {loadingCustomers ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading today's visits...</Text>
            </View>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <CustomerSelector
                customers={visitedCustomers}
                selected={selectedCustomer}
                onSelect={handleCustomerSelect}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </View>
          )}

          {/* Proceed Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.proceedBtn, !selectedCustomer && styles.proceedBtnDisabled]}
              onPress={handleProceedToItems}
              disabled={!selectedCustomer}
              activeOpacity={0.8}
            >
              <Text style={styles.proceedBtnText}>
                {selectedCustomer
                  ? `Continue with ${selectedCustomer.customerName}`
                  : 'Select a Customer to Continue'}
              </Text>
              {selectedCustomer && <Icon name="arrow-forward" size={18} color={Colors.white} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Step 2: Item Selection */}
      {step === 2 && selectedCustomer && (
        <>
          {/* Customer Badge */}
          <View style={styles.customerBadge}>
            <Icon name="storefront-outline" size={16} color={Colors.primary} />
            <Text style={styles.customerBadgeName} numberOfLines={1}>{selectedCustomer.customerName}</Text>
            <Text style={styles.customerBadgeCode}>{selectedCustomer.customerCode}</Text>
          </View>

          {/* Return Summary Banner */}
          {selectedLines.length > 0 && (
            <View style={styles.summaryBanner}>
              <View style={styles.summaryBannerItem}>
                <Text style={styles.summaryBannerValue}>{selectedLines.length}</Text>
                <Text style={styles.summaryBannerLabel}>SKUs</Text>
              </View>
              <View style={styles.summaryBannerDivider} />
              <View style={styles.summaryBannerItem}>
                <Text style={styles.summaryBannerValue}>{totalReturnItems}</Text>
                <Text style={styles.summaryBannerLabel}>Total Units</Text>
              </View>
              <View style={styles.summaryBannerDivider} />
              <View style={styles.summaryBannerItem}>
                <Text style={[styles.summaryBannerValue, { color: Colors.danger }]}>
                  {formatCurrency(totalReturnValue)}
                </Text>
                <Text style={styles.summaryBannerLabel}>Return Value</Text>
              </View>
            </View>
          )}

          {loadingItems ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading order history...</Text>
            </View>
          ) : returnLines.length === 0 ? (
            <View style={styles.center}>
              <Icon name="document-outline" size={52} color={Colors.border} />
              <Text style={styles.emptyTitle}>No Previous Orders</Text>
              <Text style={styles.emptyText}>
                No order lines found for {selectedCustomer.customerName}.
              </Text>
            </View>
          ) : (
            <FlatList
              data={returnLines}
              keyExtractor={(item) => item.lineId}
              renderItem={({ item }) => (
                <ReturnItemRow
                  item={item}
                  selected={selectedLineIds.has(item.lineId)}
                  onUpdateQty={handleUpdateQty}
                  onSetReason={handleSetReason}
                  onToggleSelected={handleToggleSelected}
                />
              )}
              contentContainerStyle={styles.returnListContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.selectHintRow}>
                  <Icon name="information-circle-outline" size={15} color={Colors.textSecondary} />
                  <Text style={styles.selectHintText}>
                    Tap an item to select it for return, then adjust quantity and reason.
                  </Text>
                </View>
              }
              ListFooterComponent={<View style={{ height: 120 }} />}
            />
          )}

          {/* Bottom Submit Bar */}
          <View style={styles.bottomBar}>
            <View style={styles.submitSummary}>
              {selectedLines.length > 0 ? (
                <>
                  <Text style={styles.submitSummaryQty}>
                    {selectedLines.length} SKU{selectedLines.length !== 1 ? 's' : ''} · {totalReturnItems} unit{totalReturnItems !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.submitSummaryValue}>{formatCurrency(totalReturnValue)}</Text>
                </>
              ) : (
                <Text style={styles.submitSummaryEmpty}>No items selected</Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (selectedLines.length === 0 || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmitReturn}
              disabled={selectedLines.length === 0 || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Icon name="return-up-back-outline" size={18} color={Colors.white} />
                  <Text style={styles.submitBtnText}>Submit Return</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
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
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  // Step Indicator
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 0,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotInactive: {
    backgroundColor: Colors.border,
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: Colors.primary,
  },

  // Customer Selector
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginTop: 12,
    marginBottom: 8,
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
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 14,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  // Customer Card
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  customerCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  customerAvatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerAvatarBoxSelected: {
    backgroundColor: Colors.primary,
  },
  customerAvatarText: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.primary,
  },
  customerAvatarTextSelected: {
    color: Colors.white,
  },
  customerInfoFlex: {
    flex: 1,
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
  visitTime: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Customer Badge (step 2)
  customerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  customerBadgeName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    flex: 1,
  },
  customerBadgeCode: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Return Summary Banner
  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryBannerItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryBannerValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryBannerLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  summaryBannerDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },

  // Hint
  selectHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  selectHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Return List
  returnListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Return Item Card
  returnItemCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  returnItemCardSelected: {
    borderColor: Colors.primary,
  },
  returnItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  itemNameCol: {
    flex: 1,
  },
  returnItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
  },
  returnItemMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  returnItemOrderDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  itemOrigQtyBox: {
    alignItems: 'center',
    flexShrink: 0,
  },
  itemOrigQtyLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  itemOrigQtyValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },

  // Return Controls
  returnControls: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 10,
    backgroundColor: Colors.primaryLight + '80',
  },
  returnQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  returnQtyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    width: 80,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    fontSize: 20,
    fontWeight: '500',
    color: Colors.primary,
  },
  stepperBtnTextDisabled: {
    color: Colors.textSecondary,
  },
  stepperQty: {
    width: 34,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  stepperQtyActive: {
    color: Colors.text,
  },
  returnLineValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.danger,
    marginLeft: 4,
  },
  reasonSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    gap: 8,
  },
  reasonSelectorEmpty: {
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  reasonSelectorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  reasonSelectorTextEmpty: {
    color: Colors.textSecondary,
    fontWeight: '400',
  },

  // Reason Picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pickerSheet: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  pickerOptionText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: SAFE_BOTTOM_PADDING,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 6 },
    }),
  },
  proceedBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  proceedBtnDisabled: {
    opacity: 0.4,
  },
  proceedBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  submitSummary: {
    marginBottom: 10,
  },
  submitSummaryQty: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  submitSummaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.danger,
  },
  submitSummaryEmpty: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  submitBtn: {
    backgroundColor: Colors.danger,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: Colors.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});
