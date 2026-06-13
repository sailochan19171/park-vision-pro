import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Platform, ActivityIndicator, Alert, Image, Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import database from '../db/database';
import { pushSync } from '../services/syncService';
import { verifyUserActiveNow, verifyCustomerStillActive } from '../services/realtimeSync';
import { useBottomInset } from '../utils/safeBottom';
import NumericKeypad from '../components/common/NumericKeypad';
import StoreActivityHeader from '../components/common/StoreActivityHeader';

import { itemImageUrl } from '../config';

type RouteParams = { ExpiryCheck: { customerCode: string; customerName: string; visitCode: string } };

interface ExpiryItem {
  code: string;
  name: string;
  uom: string;
  imagePath: string | null;
  qty: number;
  expiryDate: string;
  selected: boolean;
}

interface AddedItem {
  // Unique per row so the same product can sit in the list more than once
  // with different qty + expiry — reps regularly need to log e.g. 12 units
  // expiring next month and 4 units expiring three months out for the same
  // SKU. Using item code as the row key collapsed those into a single row.
  id: string;
  code: string;
  name: string;
  qty: number;
  expiryDate: string;
  submitted?: boolean;
}

// ─── Simple Calendar Picker (no native module needed) ─────────────────────────
function CalendarPicker({ initialDate, onSelect, onCancel }: { initialDate: Date; onSelect: (d: Date) => void; onCancel: () => void }) {
  // Reps need to log already-expired stock too, so past dates are valid.
  // The picker no longer clamps to today.
  const [viewDate, setViewDate] = useState(new Date(initialDate));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  if (weeks.length > 0) {
    const lastWeek = weeks[weeks.length - 1];
    while (lastWeek.length < 7) lastWeek.push(null);
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <View>
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth}>
          <Icon name="chevron-back" size={22} color="#1a56db" />
        </TouchableOpacity>
        <Text style={cal.monthText}>{monthName}</Text>
        <TouchableOpacity onPress={nextMonth}><Icon name="chevron-forward" size={22} color="#1a56db" /></TouchableOpacity>
      </View>
      <View style={cal.weekHeader}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <Text key={d} style={cal.weekDay}>{d}</Text>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={cal.weekRow}>
          {week.map((day, di) => (
            <TouchableOpacity
              key={di}
              style={[cal.dayCell, selectedDay === day && cal.dayCellActive]}
              onPress={() => day && setSelectedDay(day)}
              disabled={!day}
            >
              <Text
                style={[
                  cal.dayText,
                  selectedDay === day && cal.dayTextActive,
                  !day && { color: 'transparent' },
                ]}
              >
                {day ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={cal.actions}>
        <TouchableOpacity style={cal.cancelBtn} onPress={onCancel}><Text style={cal.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[cal.okBtn, !selectedDay && { opacity: 0.5 }]} onPress={() => {
          if (selectedDay) onSelect(new Date(year, month, selectedDay));
        }}>
          <Text style={cal.okText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12 },
  monthText: { fontSize: 17, fontWeight: '700', color: '#111827' },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
  weekDay: { width: 36, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#6B7280' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  dayCell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayCellActive: { backgroundColor: '#1a56db' },
  dayText: { fontSize: 14, color: '#111827' },
  dayTextActive: { color: '#FFFFFF', fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 12, paddingHorizontal: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  okBtn: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#1a56db', borderRadius: 8 },
  okText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});

export default function ExpiryCheckScreen() {
  const route = useRoute<RouteProp<RouteParams, 'ExpiryCheck'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;
  const bottomInset = useBottomInset(16);

  const [allItems, setAllItems] = useState<ExpiryItem[]>([]);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadItem, setKeypadItem] = useState<{ id: string; code: string; name: string; qty: number } | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [datePickerRowId, setDatePickerRowId] = useState<string | null>(null);
  const [datePickerDate, setDatePickerDate] = useState(new Date());
  const [completed, setCompleted] = useState(false);
  const { clearDraft } = useActivityDrafts();

  // Show ONLY rows that have been completed/submitted on previous visits to
  // this customer today. The rep explicitly asked that anything they were
  // mid-way through adding (qty / expiry typed but no Complete tap) NOT
  // survive a back-navigation — only the rows that hit Complete should
  // come back when they re-open the screen. So we no longer restore a
  // draft here; the in-progress list starts empty every mount.
  useEffect(() => {
    (async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      try {
        const saved: any[] = await database.get('expiry_checks').query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
          Q.where('visited_date', todayStr),
        ).fetch();
        const fromDb: AddedItem[] = saved.map((s: any) => ({
          id: s.id ?? s._raw?.id ?? uuidv4(),
          code: s.itemCode ?? s._raw?.item_code ?? '',
          name: s.itemName ?? s._raw?.item_name ?? '',
          qty: Number(s.quantity ?? s._raw?.quantity ?? 0),
          expiryDate: s.expiryDate ?? s._raw?.expiry_date ?? '',
          submitted: true,
        }));
        if (fromDb.length > 0) setAddedItems(fromDb);
      } catch (e) { console.warn('[ExpiryCheck] load failed:', e); }
    })();
    // One-time cleanup of any draft a previous build wrote — we don't
    // restore from it anymore but stale entries linger forever otherwise.
    clearDraft(customerCode, 'ExpiryCheck');
  }, [customerCode, user?.code, clearDraft]);

  // Re-tryable product loader. The previous version ran once with no
  // try/catch and no retry, so on slower Android phones it silently landed
  // on an EMPTY list whenever a transient condition hit during the load:
  //   - the selling_skus (MSL) table being momentarily empty because the
  //     background sync clears it (delete-all) before re-inserting — this
  //     is the #1 cause of "Add shows no products" on some Android devices;
  //   - this customer's row / the items master not synced yet;
  //   - a WatermelonDB (JSI) query hiccup throwing mid-load.
  // With no retry the screen got stuck on that empty result until the rep
  // backed out and re-entered. Now we retry on each transient condition
  // (up to ~12 s) and only accept an empty list once the data is genuinely
  // there but this chain has no MSL SKUs. The full-screen spinner is
  // released after the first attempt so the rep can use the screen while
  // background retries keep filling the list.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadItems = useCallback(async (attempt = 0) => {
    const MAX_ATTEMPTS = 8;
    const RETRY_MS = 1500;
    if (!mountedRef.current) return;

    let items: any[] = [];
    const allowedCodes = new Set<string>();
    let needsRetry = false;
    try {
      items = await database.get('items').query(Q.where('is_active', true)).fetch();
      if (items.length === 0 && attempt < MAX_ATTEMPTS) {
        needsRetry = true;
      } else {
        // Resolve customer's chain (priceList → customerGroup) and the
        // SKUs assigned to it via MSL. STRICT: only show those SKUs.
        const customers: any[] = await database
          .get('customers')
          .query(Q.where('code', customerCode))
          .fetch();
        if (customers.length === 0 && attempt < MAX_ATTEMPTS) {
          needsRetry = true;
        } else {
          const custGroup = customers[0]?.priceList ?? customers[0]?.customerGroup ?? '';
          const normalize = (str: string) => str.toLowerCase().replace(/[\s\-_]/g, '');
          const normalizedGroup = normalize(custGroup);

          const allMsl: any[] = await database.get('selling_skus').query().fetch();
          if (allMsl.length === 0 && attempt < MAX_ATTEMPTS) {
            // MSL table momentarily empty — almost certainly the destructive
            // selling_skus sync (delete-all + reinsert) running right now.
            needsRetry = true;
          } else {
            for (const r of allMsl) {
              if (normalize(r.groupCode ?? '') === normalizedGroup) allowedCodes.add(r.itemCode);
            }
            // MSL has rows but none for this chain yet (the chain's rows may
            // land a beat later) — retry a few times, then accept empty.
            if (allowedCodes.size === 0 && attempt < 3) needsRetry = true;
          }
        }
      }
    } catch (e) {
      console.warn('[ExpiryCheck] item load failed (attempt ' + attempt + '):', e);
      if (attempt < MAX_ATTEMPTS) needsRetry = true;
    }

    if (needsRetry) {
      // Release the full-screen spinner after the first attempt so the rep
      // isn't blocked; keep retrying in the background to fill the list.
      if (mountedRef.current && attempt === 0) setLoading(false);
      setTimeout(() => { loadItems(attempt + 1); }, RETRY_MS);
      return;
    }

    if (!mountedRef.current) return;
    setAllItems(
      items
        .filter((i: any) => allowedCodes.has(i.code))
        .map((i: any) => ({
          code: i.code, name: i.name, uom: i.baseUom ?? 'EA',
          imagePath: i.imagePath ?? null, qty: 0, expiryDate: '', selected: false,
        })),
    );
    setLoading(false);
  }, [customerCode]);

  useEffect(() => { loadItems(0); }, [loadItems]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }, [allItems, search]);

  const handleAddSelected = () => {
    const selected = allItems.filter(i => i.selected);
    if (selected.length === 0) { Alert.alert('No Items', 'Select at least one item.'); return; }
    // Each selected SKU becomes a fresh row with its own uuid so the same
    // product can be added multiple times (different expiry batches). The
    // old `existingCodes` dedup blocked that — a rep wanting two rows of
    // the same item with different expiry dates was stuck.
    const newItems: AddedItem[] = selected.map(i => ({
      id: uuidv4(), code: i.code, name: i.name, qty: 0, expiryDate: '',
    }));
    setAddedItems(prev => [...prev, ...newItems]);
    // Reset selections AND the search box so the next Add tap opens with
    // the full SKU list. Without resetting search, reps who used the
    // search to find their first batch saw an "empty" modal on the
    // second open because the stale filter was still narrowing the list.
    setAllItems(prev => prev.map(i => ({ ...i, selected: false })));
    setSearch('');
    setShowAddModal(false);
  };

  const toggleSelect = (code: string) => {
    setAllItems(prev => prev.map(i => i.code === code ? { ...i, selected: !i.selected } : i));
  };

  const handleSubmit = async () => {
    const validItems = addedItems.filter(i => i.qty > 0);
    if (validItems.length === 0) { Alert.alert('No Data', 'Please add items with quantity before submitting.'); return; }
    const missingDates = validItems.filter(i => !i.expiryDate);
    if (missingDates.length > 0) { Alert.alert('Missing Dates', `Please set expiry date for: ${missingDates.map(i => i.name).join(', ')}`); return; }

    // Pre-submit gate: server-side user-active + local customer-active.
    try {
      const userOk = await verifyUserActiveNow();
      if (!userOk) return;
      const cust = await verifyCustomerStillActive(customerCode);
      if (!cust.ok) {
        const name = cust.customerName ?? customerName ?? customerCode;
        const msg = cust.reason === 'blocked'
          ? `${name} has been blocked. Expiry check cannot be submitted.`
          : cust.reason === 'deactivated'
            ? `${name} has been deactivated. Expiry check cannot be submitted.`
            : `${name} is no longer available.`;
        Alert.alert('Customer Not Available', msg);
        return;
      }
    } catch (_e) { /* don't block on transient errors */ }

    setSaving(true);
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      // Upsert by ROW id — the row id was generated when the rep tapped Add
      // (or carried over from a prior submitted row loaded on mount), so the
      // same item code can legitimately appear multiple times (different
      // expiry batches) and each row maps to its own server record.
      const allExisting: any[] = await database.get('expiry_checks').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
        Q.where('visited_date', todayStr),
      ).fetch();
      const existingById = new Map<string, any>();
      for (const rec of allExisting) {
        const rid = rec.id ?? rec._raw?.id ?? '';
        if (rid) existingById.set(rid, rec);
      }
      await database.write(async () => {
        for (const item of validItems) {
          const existing = existingById.get(item.id);
          if (existing) {
            await existing.update((rec: any) => {
              rec.itemName = item.name;
              rec.quantity = item.qty;
              rec.expiryDate = item.expiryDate || todayStr;
              rec.visitCode = visitCode;
              rec.status = 'checked';
              rec.isSynced = false;
            });
          } else {
            await database.get('expiry_checks').create((rec: any) => {
              rec._raw.id = item.id; rec.appTrxId = item.id; rec.userCode = user?.code ?? '';
              rec.customerCode = customerCode; rec.visitCode = visitCode;
              rec.itemCode = item.code; rec.itemName = item.name;
              rec.quantity = item.qty; rec.uom = 'EA';
              rec.expiryDate = item.expiryDate || todayStr;
              rec.visitedDate = todayStr; rec.status = 'checked'; rec.isSynced = false;
            });
          }
        }
      });
      pushSync().catch(() => {});
      setCompleted(true);
    } catch (err: any) { Alert.alert('Error', err?.message ?? 'Failed.'); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1a56db" /></View>;

  return (
    <View style={s.container}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Ageing / Expiry" />
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => {
            // Always open the picker with a blank search and no stale
            // selections from a prior session — otherwise reps occasionally
            // saw an empty Add modal because the previous search filter
            // was still in effect.
            setSearch('');
            setAllItems(prev => prev.map(i => ({ ...i, selected: false })));
            setShowAddModal(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Table Header — Delete column (header label + divider + row
          cell) is hidden when every row is already submitted, so a
          completed expiry check doesn't display an unactionable
          column. Reappears as soon as the user adds a new item. */}
      {(() => {
        const showDeleteCol = addedItems.some(i => !i.submitted);
        return (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.thText, { flex: 1 }]}>Item Code / Description</Text>
              <Text style={s.thDivider}>|</Text>
              <Text style={[s.thText, { width: 40, textAlign: 'center' }]}>Qty</Text>
              <Text style={s.thDivider}>|</Text>
              <Text style={[s.thText, { width: 90, textAlign: 'center' }]}>Expiry Date</Text>
              {showDeleteCol && (
                <>
                  <Text style={s.thDivider}>|</Text>
                  <Text style={[s.thText, { width: 50, textAlign: 'center' }]}>Delete</Text>
                </>
              )}
            </View>

            <FlatList
              data={addedItems}
              keyExtractor={item => item.id}
              renderItem={({ item, index }) => (
                <View style={[s.row, index % 2 === 0 && s.rowAlt]}>
                  {/* Full code + name — never truncated. Reps were missing
                      the tail of long SKU names with the old numberOfLines=2 cap. */}
                  <Text style={s.rowName}>{item.code}{'\n'}{item.name}</Text>
                  <TouchableOpacity style={[s.qtyBox, item.qty > 0 && s.qtyBoxActive]} onPress={() => {
                    setKeypadItem({ id: item.id, code: item.code, name: item.name, qty: item.qty });
                    setKeypadVisible(true);
                  }}>
                    <Text style={[s.qtyText, item.qty > 0 && s.qtyTextActive]}>{item.qty}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dateBox, item.expiryDate ? s.dateBoxFilled : null]} onPress={() => {
                    // Require a non-zero quantity before the user can set an
                    // expiry date for the item.
                    if (!item.qty || item.qty <= 0) {
                      Alert.alert('Enter Quantity', 'Please enter the quantity for this item before selecting an expiry date.');
                      return;
                    }
                    setDatePickerRowId(item.id);
                    setDatePickerDate(item.expiryDate ? new Date(item.expiryDate) : new Date());
                  }}>
                    <Text style={[s.dateText, item.expiryDate ? s.dateTextFilled : null]}>{item.expiryDate || 'Set date'}</Text>
                  </TouchableOpacity>
                  {showDeleteCol && (
                    item.submitted ? (
                      <View style={s.delBtn} />
                    ) : (
                      <TouchableOpacity
                        style={s.delBtn}
                        onPress={() => {
                          setAddedItems(prev => prev.filter(i => i.id !== item.id));
                        }}
                      >
                        <Icon name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View style={s.empty}><Text style={s.emptyText}>No data available.</Text></View>
              }
              contentContainerStyle={[s.list, addedItems.length === 0 && { flex: 1, justifyContent: 'center' }]}
            />
          </>
        );
      })()}

      {/* Complete Button */}
      <View style={[s.bottomBar, { paddingBottom: bottomInset }]}>
        <TouchableOpacity style={[s.submitBtn, addedItems.length === 0 && { opacity: 0.5 }]} onPress={handleSubmit} activeOpacity={0.8} disabled={saving || addedItems.length === 0}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Complete</Text>}
        </TouchableOpacity>
      </View>

      {/* Add Items Modal */}
      <Modal visible={showAddModal} animationType="fade" transparent hardwareAccelerated>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add Items</Text>
            <View style={s.modalSearch}>
              <Icon name="search" size={18} color="#9CA3AF" />
              <TextInput style={s.modalSearchInput} placeholder="Search by Item Code / Item Description" placeholderTextColor="#9CA3AF" value={search} onChangeText={setSearch} autoCorrect={false} />
            </View>

            <FlatList
              data={filteredItems}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.modalRow} onPress={() => toggleSelect(item.code)} activeOpacity={0.7}>
                  <View style={[s.checkbox, item.selected && s.checkboxActive]}>
                    {item.selected && <Icon name="checkmark" size={14} color="#1a56db" />}
                  </View>
                  <View style={s.modalImgBox}>
                    {item.imagePath ? (
                      <Image source={{ uri: itemImageUrl(item.imagePath) ?? '' }} style={s.modalImg} resizeMode="cover" />
                    ) : (
                      <View style={s.modalImgPlaceholder}><Text style={s.modalImgText}>{item.name[0]}</Text></View>
                    )}
                  </View>
                  <Text style={s.modalItemName}>{item.name}</Text>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
              style={s.modalList}
              ListEmptyComponent={
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: search.trim() ? 0 : 14, paddingHorizontal: 16 }}>
                    {search.trim()
                      ? 'No products match your search.'
                      : 'No products loaded yet. They may still be syncing to this device.'}
                  </Text>
                  {!search.trim() && (
                    <TouchableOpacity style={s.okBtn} onPress={() => loadItems(0)} activeOpacity={0.8}>
                      <Text style={s.okText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowAddModal(false); setSearch(''); }}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.okBtn} onPress={handleAddSelected}>
                <Text style={s.okText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Calendar Date Picker Modal */}
      <Modal visible={datePickerRowId !== null} transparent animationType="fade">
        <TouchableOpacity style={s.calOverlay} activeOpacity={1} onPress={() => setDatePickerRowId(null)}>
          <View style={s.calModal} onStartShouldSetResponder={() => true}>
            <CalendarPicker
              initialDate={datePickerDate}
              onSelect={(date) => {
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                setAddedItems(prev => prev.map(i => i.id === datePickerRowId ? { ...i, expiryDate: dateStr } : i));
                setDatePickerRowId(null);
              }}
              onCancel={() => setDatePickerRowId(null)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Completed Overlay */}
      {completed && (
        <Modal visible transparent animationType="fade">
          <View style={s.completedOverlay}>
            <View style={s.completedCard}>
              <View style={s.completedIconBox}>
                <Icon name="checkmark-circle" size={80} color="#059669" />
              </View>
              <Text style={s.completedTitle}>Completed!</Text>
              <Text style={s.completedSub}>{addedItems.filter(i => i.qty > 0).length} expiry item(s) saved successfully</Text>
              <TouchableOpacity style={s.completedBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
                <Text style={s.completedBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Numeric Keypad */}
      <NumericKeypad
        visible={keypadVisible}
        value={keypadItem?.qty ?? 0}
        title={keypadItem?.name ?? 'Qty'}
        subtitle="Enter expiry quantity"
        onConfirm={(val) => {
          if (keypadItem) setAddedItems(prev => prev.map(i => i.id === keypadItem.id ? { ...i, qty: val } : i));
          setKeypadVisible(false);
        }}
        onClose={() => setKeypadVisible(false)}
        onPrev={(val) => {
          if (!keypadItem) return;
          // Persist the typed value for the current row, then step back to
          // the previous row. Wraps the keypad's Prev/Next pairing —
          // OpeningStock + PhysicalStock already render both arrows but
          // Ageing/Expiry only wired Next, so reps couldn't undo a mis-tap
          // on the row above without dismissing and re-tapping the qty.
          setAddedItems(prev => prev.map(i => i.id === keypadItem.id ? { ...i, qty: val } : i));
          const currentIndex = addedItems.findIndex(item => item.id === keypadItem.id);
          if (currentIndex > 0) {
            const prevItem = addedItems[currentIndex - 1];
            setKeypadItem({ id: prevItem.id, code: prevItem.code, name: prevItem.name, qty: prevItem.qty });
          }
        }}
        onNext={(val) => {
          if (!keypadItem) return;
          // 1. Persist the value the user just typed for the current row.
          setAddedItems(prev => prev.map(i => i.id === keypadItem.id ? { ...i, qty: val } : i));
          // 2. Advance to the next row, or close the keypad if we're already
          //    on the last one (saving the value above counts as confirming).
          const currentIndex = addedItems.findIndex(item => item.id === keypadItem.id);
          if (currentIndex !== -1 && currentIndex < addedItems.length - 1) {
            const nextItem = addedItems[currentIndex + 1];
            setKeypadItem({ id: nextItem.id, code: nextItem.code, name: nextItem.name, qty: nextItem.qty });
          } else {
            setKeypadVisible(false);
          }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#1a3a8f', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10 },
  thText: { fontSize: 12, fontWeight: '700', color: '#1a3a8f' },
  thDivider: { color: '#93C5FD', marginHorizontal: 4 },

  list: { paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowAlt: { backgroundColor: '#F9FAFB' },
  rowName: { flex: 1, fontSize: 12, color: '#111827', lineHeight: 16 },
  qtyBox: { width: 40, height: 34, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  qtyBoxActive: { borderColor: '#1a56db', backgroundColor: '#EFF6FF' },
  qtyText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  qtyTextActive: { color: '#1a56db' },
  dateBox: { width: 85, height: 34, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  dateText: { fontSize: 11, color: '#6B7280' },
  delBtn: { width: 40, alignItems: 'center' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  submitBtn: { backgroundColor: '#1a3a8f', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Add Items Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 40 },
  modal: { backgroundColor: '#FFF', borderRadius: 16, flex: 1, overflow: 'hidden' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  modalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 16, paddingHorizontal: 12, height: 44, gap: 8, marginBottom: 8 },
  modalSearchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  modalList: { flex: 1 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxActive: { borderColor: '#1a56db', backgroundColor: '#EFF6FF' },
  modalImgBox: { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', marginRight: 10 },
  modalImg: { width: 44, height: 44 },
  modalImgPlaceholder: { width: 44, height: 44, backgroundColor: '#EFF6FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  modalImgText: { fontSize: 16, fontWeight: '700', color: '#1a56db' },
  modalItemName: { flex: 1, fontSize: 14, color: '#111827', lineHeight: 19 },
  modalActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  cancelBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', backgroundColor: '#F3F4F6' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  okBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', backgroundColor: '#1a3a8f' },
  okText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  calOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  calModal: { backgroundColor: '#FFF', borderRadius: 16, padding: 12 },

  dateBoxFilled: { borderColor: '#059669', backgroundColor: '#F0FDF4' },
  dateTextFilled: { color: '#059669', fontWeight: '600' },

  // Completed overlay
  completedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  completedCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 30, alignItems: 'center', width: '100%' },
  completedIconBox: { marginBottom: 16 },
  completedTitle: { fontSize: 24, fontWeight: '800', color: '#059669', marginBottom: 8 },
  completedSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  completedBtn: { backgroundColor: '#1a3a8f', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  completedBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
