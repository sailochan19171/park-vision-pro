import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import database from '../db/database';
import { buildPriceMap } from '../services/priceLookup';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition } from '../services/locationService';
import { useWatermark } from '../hooks/useWatermark';
import PhotoThumbnail from '../components/common/PhotoThumbnail';
import { pushSync } from '../services/syncService';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import StoreActivityHeader from '../components/common/StoreActivityHeader';

import { itemImageUrl } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

type RouteParams = {
  POCapture: {
    customerCode: string;
    customerName: string;
    visitCode: string;
    priceList?: string;
  };
};

interface ProductItem {
  code: string;
  name: string;
  price: number;
  uom: string;
  imagePath: string | null;
  selected: boolean;
  qty: number;
}

export default function POCaptureScreen() {
  const route = useRoute<RouteProp<RouteParams, 'POCapture'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode, priceList } = route.params;

  const [poNumber, setPoNumber] = useState('');
  const [poImagePath, setPoImagePath] = useState<string | null>(null);
  const [poImageTs, setPoImageTs] = useState<number | null>(null);
  const [poImageLat, setPoImageLat] = useState<number | null>(null);
  const [poImageLng, setPoImageLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Synchronous guard — prevents a double-tap on Complete from writing
  // two separate WatermelonDB rows before the first setSaving(true)
  // re-render can disable the button.
  const savingRef = useRef(false);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Items modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());
  // Item codes that are part of an already-submitted/completed PO for this
  // visit. These are LOCKED — a completed record must not lose products, so
  // the rep can't uncheck/remove them in the Add Items modal. Populated from
  // the saved po_capture_items in the submitted-state restore effect below.
  const [lockedCodes, setLockedCodes] = useState<Set<string>>(new Set());
  const { clearDraft } = useActivityDrafts();
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);

  // Customer-dashboard activity screens never carry forward an in-progress
  // draft anymore. Capturing a photo, editing a qty, adding or removing a
  // row — all of it is in-memory until the rep taps Complete. If they
  // navigate away first, the next visit starts fresh (or, if a Complete
  // landed on a previous visit, it loads from the local DB row below).
  // This effect also wipes any stale draft a previous build wrote so the
  // first launch after upgrading doesn't resurrect old captures.
  useEffect(() => { clearDraft(customerCode, 'POCapture'); }, [customerCode, clearDraft]);

  // Load the submitted PO state from the local DB so a re-open after a
  // successful Complete restores the photo + line items the rep just
  // saved. Runs once items are loaded so we can correctly mark each row
  // as selected with its saved qty/price.
  useEffect(() => {
    if (items.length === 0) return;
    (async () => {
      try {
        const rows: any[] = await database.get('po_captures').query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
          Q.where('visit_code', visitCode),
        ).fetch();
        const submitted = rows[0];
        if (!submitted) return;
        setPoNumber(submitted.poNumber ?? submitted._raw?.po_number ?? '');
        const img = submitted.imagePath ?? submitted._raw?.image_path ?? null;
        if (img) {
          setPoImagePath(img);
          const ts = submitted.capturedOn ?? submitted._raw?.captured_on;
          if (ts) setPoImageTs(Number(ts));
          const lat = submitted.geoLat ?? submitted._raw?.geo_lat;
          const lng = submitted.geoLng ?? submitted._raw?.geo_lng;
          if (lat != null) setPoImageLat(Number(lat));
          if (lng != null) setPoImageLng(Number(lng));
        }
        const poId = submitted.appTrxId ?? submitted._raw?.app_trx_id ?? submitted.id;
        const lineRows: any[] = await database.get('po_capture_items').query(
          Q.where('po_capture_id', poId),
        ).fetch();
        if (lineRows.length > 0) {
          const byCode = new Map<string, { qty: number; price: number }>();
          for (const l of lineRows) {
            const code = l.itemCode ?? l._raw?.item_code ?? '';
            if (!code) continue;
            byCode.set(code, {
              qty: Number(l.quantity ?? l._raw?.quantity ?? 0),
              price: Number(l.price ?? l._raw?.price ?? 0),
            });
          }
          setItems(prev => prev.map(p => {
            const saved = byCode.get(p.code);
            if (saved) return { ...p, qty: saved.qty, price: saved.price, selected: saved.qty > 0 };
            return p;
          }));
          // Lock every product that was part of the submitted PO so it can't
          // be removed from the completed record.
          setLockedCodes(new Set(Array.from(byCode.keys())));
        }
      } catch (e) { console.warn('[POCapture] load submitted state failed:', e); }
    })();
  }, [items.length > 0 ? 'loaded' : 'loading']);

  const loadItems = useCallback(async () => {
    try {
      const allItems: any[] = await database
        .get('items')
        .query(Q.where('is_active', true))
        .fetch();

      // Region-preferred price map (regional override → base → GT).
      const [cust]: any[] = await database
        .get('customers')
        .query(Q.where('code', customerCode))
        .fetch();
      const regionCode: string | null = cust?._raw?.region_code ?? null;
      const priceMap = await buildPriceMap(database, priceList, regionCode);

      const productItems: ProductItem[] = allItems.map((item: any) => ({
        code: item.code,
        name: item.name,
        price: priceMap.get(item.code)?.price ?? 0,
        uom: item.baseUom ?? 'PCS',
        imagePath: item.imagePath ?? null,
        selected: false,
        qty: 0,
      }));
      productItems.sort((a, b) => a.name.localeCompare(b.name));
      // Preserve the rep's in-progress PO lines (selected + qty + any edited
      // price) across a re-run. loadItems re-fires whenever the `prices`
      // collection changes (background 15 s sync) — the previous version
      // rebuilt every row with selected=false / qty=0, which silently wiped
      // the line items the rep had already added or restored after a revisit,
      // making the whole list "disappear" mid-capture. Merge by item code so
      // a price refresh still updates pricing for untouched rows but never
      // clears an active line. On the first load (prev empty) there's nothing
      // to preserve and the submitted-state effect restores from the DB.
      setItems(prev => {
        if (prev.length === 0) return productItems;
        const prevByCode = new Map(prev.map(p => [p.code, p]));
        return productItems.map(np => {
          const old = prevByCode.get(np.code);
          return old && old.selected
            ? { ...np, selected: true, qty: old.qty, price: old.price }
            : np;
        });
      });
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [priceList, customerCode]);

  useEffect(() => { 
    loadItems(); 
    const sub = database.collections.get('prices').changes.subscribe(() => {
      loadItems();
    });
    return () => sub.unsubscribe();
  }, [loadItems]);

  const orderLines = useMemo(() => items.filter((i) => i.selected), [items]);
  const totalAmount = useMemo(
    () => orderLines.reduce((sum, i) => sum + i.price * i.qty, 0),
    [orderLines],
  );

  const formatCurrency = (n: number) =>
    '\u20B9' + n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Add Items modal helpers
  const openAddModal = () => {
    setTempSelected(new Set(items.filter(i => i.selected).map(i => i.code)));
    setAddSearch('');
    setAddModalVisible(true);
  };

  const filteredModalItems = useMemo(() => {
    if (!addSearch.trim()) return items;
    const q = addSearch.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }, [items, addSearch]);

  const toggleTempSelect = (code: string) => {
    // A product that belongs to the already-submitted PO can't be unchecked —
    // removing it would wipe it from the completed record. Block the deselect
    // and tell the rep why. Adding new (non-locked) items still works.
    if (lockedCodes.has(code) && tempSelected.has(code)) {
      Alert.alert(
        'Already Submitted',
        'This product is part of a completed PO and cannot be removed.',
      );
      return;
    }
    setTempSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const confirmAddItems = () => {
    setItems(prev => prev.map(item => {
      // Locked (submitted) items always stay selected, even if some state
      // glitch dropped them from tempSelected — defence in depth so a
      // completed record can never lose a product.
      const keep = tempSelected.has(item.code) || lockedCodes.has(item.code);
      return {
        ...item,
        selected: keep,
        qty: keep ? (item.qty || 0) : 0,
      };
    }));
    setAddModalVisible(false);
  };

  const updateQty = (code: string, val: string) => {
    const num = parseInt(val, 10) || 0;
    setItems(prev => prev.map(i => i.code === code ? { ...i, qty: Math.max(0, num) } : i));
  };

  const updatePrice = (code: string, val: string) => {
    const num = parseFloat(val) || 0;
    setItems(prev => prev.map(i => i.code === code ? { ...i, price: Math.max(0, num) } : i));
  };

  // Re-entrancy guard so a fast double-tap on the camera button doesn't
  // stack up multiple capture flows (which on some Android devices ended
  // up showing two camera intents one after another).
  const capturingRef = useRef(false);

  const handleCaptureImage = async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    try {
      // Open the camera and start the GPS fix IN PARALLEL. Previously
      // we awaited getCurrentPosition before calling capturePhoto, so
      // the camera lens opening was gated on a GPS lookup that can take
      // a few seconds indoors — that was the "slow / laggy" complaint.
      // Doing them in parallel makes the camera UI appear immediately.
      const photoPromise = capturePhoto();
      const gpsPromise = getCurrentPosition(false).catch(() => null);

      const photo = await photoPromise;
      if (!photo) return;

      let pos: { lat: number; lng: number } | null = await gpsPromise;
      if (!pos) {
        try { pos = await getCurrentPosition(true); } catch (e) { console.warn('[PO]', e); }
      }
      const lat = pos?.lat ?? null;
      const lng = pos?.lng ?? null;

      const ts = Date.now();
      const stampedUri = await burnWatermark(photo.uri, ts, lat, lng);
      setPoImagePath(stampedUri);
      setPoImageTs(ts);
      setPoImageLat(lat);
      setPoImageLng(lng);
    } finally {
      capturingRef.current = false;
    }
  };

  const handleDeleteImage = () => {
    setPoImagePath(null);
    setPoImageTs(null);
    setPoImageLat(null);
    setPoImageLng(null);
  };

  const handleSubmit = async () => {
    if (savingRef.current) return; // synchronous double-tap guard
    if (!poImagePath) {
      Alert.alert('Required', 'Please capture an image of the PO.');
      return;
    }
    if (!poNumber.trim()) {
      Alert.alert('Required', 'Please enter a PO Number.');
      return;
    }
    if (orderLines.length === 0) {
      Alert.alert('Required', 'Add at least one line item.');
      return;
    }
    // All selected items must have qty > 0. A zero-qty line passes the
    // length check above but then fails the backend's Zod .positive()
    // validation, causing the entire PO to be rejected silently and
    // never appear in the portal report.
    const zeroQtyItem = orderLines.find(i => i.qty <= 0);
    if (zeroQtyItem) {
      Alert.alert('Required', `Please enter a quantity for "${zeroQtyItem.name}".`);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    const now = Date.now();

    try {
      // Look up an existing PO capture for this user + customer + visit so a
      // re-submit (the edit path) overrides the existing row instead of
      // creating a duplicate. Without this every edit added a fresh row in
      // both the mobile DB and the business reports.
      const existingPo: any[] = await database.get('po_captures').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
        Q.where('visit_code', visitCode),
      ).fetch();
      const existing = existingPo[0];
      const appTrxId = existing?.appTrxId ?? existing?._raw?.app_trx_id ?? uuidv4();

      await database.write(async () => {
        if (existing) {
          await existing.update((rec: any) => {
            rec.poNumber = poNumber.trim();
            rec.imagePath = poImagePath;
            rec.totalAmount = totalAmount;
            rec.capturedOn = now;
            rec.geoLat = poImageLat;
            rec.geoLng = poImageLng;
            rec.status = 0;
            rec.isSynced = false;
          });
          // Replace the line set entirely so removed/edited items are reflected.
          const oldLines: any[] = await database.get('po_capture_items').query(
            Q.where('po_capture_id', appTrxId),
          ).fetch();
          for (const oldLine of oldLines) {
            await oldLine.destroyPermanently();
          }
        } else {
          await database.get('po_captures').create((rec: any) => {
            rec._raw.id = appTrxId;
            rec.appTrxId = appTrxId;
            rec.userCode = user?.code ?? '';
            rec.customerCode = customerCode;
            rec.visitCode = visitCode;
            rec.poNumber = poNumber.trim();
            rec.imagePath = poImagePath;
            rec.totalAmount = totalAmount;
            rec.capturedOn = now;
            rec.geoLat = poImageLat;
            rec.geoLng = poImageLng;
            rec.status = 0;
            rec.isSynced = false;
          });
        }

        for (const line of orderLines) {
          await database.get('po_capture_items').create((rec: any) => {
            rec._raw.id = `${appTrxId}_${line.code}`;
            rec.poCaptureId = appTrxId;
            rec.itemCode = line.code;
            rec.itemName = line.name;
            rec.quantity = line.qty;
            rec.price = line.price;
            rec.uom = line.uom;
          });
        }
      });

      pushSync().catch(() => {});
      // Successful Complete = the photo + line state is now committed
      // server-side. Drop the draft so a revisit reflects the just-
      // submitted state (loaded from the po_captures row) rather than
      // resurrecting the pre-submit draft.
      clearDraft(customerCode, 'POCapture');
      Alert.alert('Success', 'PO captured successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save PO capture.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#1a3a8f" />
        <Text style={st.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={st.container} testID="po-capture-screen">
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="PO Capture" />
      {/* Header Row: Capture PO + Add button */}
      <View style={st.headerRow}>
        <TouchableOpacity style={st.addBtn} onPress={openAddModal} activeOpacity={0.8}>
          <Text style={st.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* PO Image + PO Number Card */}
        <View style={st.poCard}>
          <View style={st.poCardRow}>
            {/* Left: Capture Image */}
            <View>
              <Text style={st.poCardLabel}>Capture Image of PO *</Text>
              <View style={st.poImageRow}>
                {poImagePath ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <PhotoThumbnail
                      photo={{ uri: poImagePath, timestamp: poImageTs ?? undefined, latitude: poImageLat, longitude: poImageLng, customerCode, customerName }}
                      size={90}
                      onRetake={handleCaptureImage}
                      onRemove={handleDeleteImage}
                      showDeleteBeside
                      style={{ width: 90, height: 70, borderRadius: 8 }}
                    />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={st.captureBox} onPress={handleCaptureImage} activeOpacity={0.7}>
                      <View style={st.captureInner}>
                        <MCIcon name="camera-outline" size={28} color="#6B7280" />
                        <Text style={st.captureText}>Capture Image</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            {/* Right: PO Number */}
            <View style={{ flex: 1, marginLeft: 20 }}>
              <Text style={st.poCardLabel}>PO Number *</Text>
              <TextInput
                style={st.poInput}
                placeholder="Enter PO Number"
                placeholderTextColor="#9CA3AF"
                value={poNumber}
                onChangeText={setPoNumber}
                autoCapitalize="characters"
                autoCorrect={false}
                testID="po-number-input"
              />
            </View>
          </View>
        </View>

        {/* Items Table */}
        {orderLines.length > 0 && (
          <View style={st.tableContainer}>
            {/* Table Header. The Item Code / Description column gets the
                widest flex slot because product names + SKU codes have to
                share it; the numeric columns each get a fixed slot wide
                enough to hold the boxed input + its currency value without
                squeezing the description. */}
            <View style={st.tableHeader}>
              <Text style={[st.tableHeaderText, st.colName]}>Item Code / Description</Text>
              <Text style={[st.tableHeaderText, st.colQty, { textAlign: 'center' }]}>Qty</Text>
              <Text style={[st.tableHeaderText, st.colPrice, { textAlign: 'center' }]}>Price</Text>
              <Text style={[st.tableHeaderText, st.colValue, { textAlign: 'right' }]}>PO Value</Text>
            </View>

            {/* Table Rows */}
            {orderLines.map((item, idx) => (
              <View key={item.code} style={[st.tableRow, idx < orderLines.length - 1 && st.tableRowBorder]}>
                <View style={st.colName}>
                  <Text style={st.itemCodeText} numberOfLines={1}>{item.code}</Text>
                  <Text style={st.itemNameText} numberOfLines={3}>{item.name}</Text>
                </View>
                <View style={[st.colQty, { alignItems: 'center' }]}>
                  <TextInput
                    style={st.tableCellInput}
                    keyboardType="numeric"
                    value={item.qty > 0 ? String(item.qty) : ''}
                    onChangeText={(v) => updateQty(item.code, v)}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <View style={[st.colPrice, { alignItems: 'center' }]}>
                  <TextInput
                    style={st.tableCellInput}
                    keyboardType="numeric"
                    value={item.price > 0 ? String(item.price) : ''}
                    onChangeText={(v) => updatePrice(item.code, v)}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                {/* PO Value = qty × price — derived, read-only. */}
                <Text style={[st.tableCell, st.colValue, { textAlign: 'right', fontWeight: '600' }]}>
                  {formatCurrency(item.qty * item.price)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom: Total + Complete */}
      <View style={st.bottomBar}>
        <Text style={st.totalText}>Total PO Value: {formatCurrency(totalAmount)}</Text>
        <TouchableOpacity
          style={[st.completeBtn, saving && { opacity: 0.7 }]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={st.completeBtnText}>Complete</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Add Items Modal ── */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Add Items</Text>

            {/* Search */}
            <View style={st.modalSearchRow}>
              <Icon name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={st.modalSearchInput}
                placeholder="Search by Item Item Description"
                placeholderTextColor="#9CA3AF"
                value={addSearch}
                onChangeText={setAddSearch}
                autoCorrect={false}
                testID="item-search-input"
              />
            </View>

            {/* Item List */}
            <FlatList
              data={filteredModalItems}
              keyExtractor={(item) => item.code}
              style={st.modalList}
              testID="item-list"
              renderItem={({ item, index }) => {
                const checked = tempSelected.has(item.code);
                const locked = lockedCodes.has(item.code);
                return (
                  <TouchableOpacity
                    style={st.modalItem}
                    onPress={() => toggleTempSelect(item.code)}
                    activeOpacity={0.7}
                    testID={`item-row-${index}`}
                  >
                    <View style={[st.checkbox, checked && st.checkboxChecked, locked && { opacity: 0.55 }]} testID={`item-checkbox-${index}`}>
                      {checked && <Icon name={locked ? 'lock-closed' : 'checkmark'} size={14} color="#fff" />}
                    </View>
                    {item.imagePath ? (
                      <Image
                        source={{ uri: itemImageUrl(item.imagePath) ?? '' }}
                        style={st.modalItemImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={st.modalItemImgPlaceholder}>
                        <Text style={st.modalItemImgText}>{item.name[0]}</Text>
                      </View>
                    )}
                    <Text style={st.modalItemName} numberOfLines={2}>{item.name}</Text>
                    {locked && <Text style={st.submittedTag}>Submitted</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ color: '#9CA3AF' }}>No items found</Text>
                </View>
              }
            />

            {/* Cancel / OK */}
            <View style={st.modalBtnRow}>
              <TouchableOpacity
                style={st.modalCancelBtn}
                onPress={() => setAddModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={st.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={st.modalOkBtn}
                onPress={confirmAddItems}
                activeOpacity={0.8}
              >
                <Text style={st.modalOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#6B7280' },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  addBtn: {
    backgroundColor: '#1a3a8f',
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // PO Card
  poCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  poCardRow: { flexDirection: 'row' },
  poCardLabel: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 10 },
  poImageRow: { flexDirection: 'row', alignItems: 'center' },
  captureBox: {
    width: 90,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  captureInner: { alignItems: 'center' },
  captureText: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  capturedImg: { width: 90, height: 70, borderRadius: 8 },
  poInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },

  // Table
  tableContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8EDF5',
    paddingVertical: 10,
    paddingHorizontal: 10,
    columnGap: 8,
  },
  tableHeaderText: { fontSize: 12, fontWeight: '700', color: '#1a3a8f' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    columnGap: 8,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableCell: { fontSize: 12, color: '#374151', lineHeight: 17 },
  // Column slots — flex weights tuned so the SKU code + multi-line name
  // get room without the Qty / Price input boxes overlapping. The Qty
  // and Price slots are wider than their inputs so the centered TextInput
  // sits with breathing space on each side.
  // flexShrink:0 on the fixed-width columns prevents React Native's flex
  // algorithm from collapsing them when the row has a long name column.
  colName: { flex: 2.4, paddingRight: 4 },
  colQty: { width: 56, flexShrink: 0 },
  colPrice: { width: 72, flexShrink: 0 },
  colValue: { flex: 1.2, flexShrink: 0 },
  // Item code on its own line in bold, description below in regular weight
  // — was rendering only the name and the rep couldn't tell which SKU was
  // which when two products had similar descriptions.
  itemCodeText: { fontSize: 11, fontWeight: '700', color: '#1a3a8f', marginBottom: 2 },
  itemNameText: { fontSize: 12, color: '#374151', lineHeight: 16 },
  tableCellInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    width: '100%',
    height: 34,
    textAlign: 'center',
    fontSize: 13,
    color: '#111827',
    paddingVertical: 0,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },

  // Bottom
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalText: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  completeBtn: {
    backgroundColor: '#1a3a8f',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Add Items Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  modalList: { flex: 1 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  checkboxChecked: {
    backgroundColor: '#9CA3AF',
    borderColor: '#9CA3AF',
  },
  modalItemImg: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#F3F4F6' },
  modalItemImgPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalItemImgText: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  modalItemName: { flex: 1, fontSize: 14, color: '#111827' },
  submittedTag: { fontSize: 10, fontWeight: '700', color: '#16a34a', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6, overflow: 'hidden' },
  modalBtnRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalCancelBtn: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  modalCancelText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  modalOkBtn: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a3a8f',
  },
  modalOkText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
