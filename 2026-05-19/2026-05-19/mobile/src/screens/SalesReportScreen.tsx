import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Platform, Alert, Modal, Image, KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import database from '../db/database';
import useAuthStore from '../store/auth';
import { pushSync } from '../services/syncService';
import { verifyUserActiveNow, verifyCustomerStillActive } from '../services/realtimeSync';
import Icon from 'react-native-vector-icons/Ionicons';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import NumericKeypad from '../components/common/NumericKeypad';
import { useBottomInset } from '../utils/safeBottom';
import { validatePriceInput, formatPriceInput, showPriceValidationError } from '../utils/priceValidation';

import { itemImageUrl } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

interface ProductRow {
  code: string;
  name: string;
  qty: number;
  unitPrice: number;
  mrp: number | null;
  setPrice: number | null;
  imagePath: string | null;
  category: string;
}

export default function SalesReportScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((s) => s.user);
  const customerCode = route.params?.customerCode ?? '';
  const customerName = route.params?.customerName ?? '';
  const visitCode = route.params?.visitCode ?? '';
  const routedPriceList = route.params?.priceList ?? '';
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrderNo, setSuccessOrderNo] = useState('');
  const [editingPrice, setEditingPrice] = useState<{ code: string; value: string } | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [listView, setListView] = useState(false);
  const [isMultiSubmitChannel, setIsMultiSubmitChannel] = useState(false);

  // Check if sales report already submitted today for this customer
  useEffect(() => {
    (async () => {
      try {
        const customers = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        const customer = customers[0] as any;
        const channelCode = customer?.channelCode ?? customer?._raw?.channel_code ?? '';
        
        let validChannels = ['GT'];
        try {
          const settings = await database.get('app_settings').query(Q.where('key', 'MULTI_SUBMIT_CHANNELS')).fetch();
          if (settings.length > 0) {
            const rawVal = (settings[0] as any).value;
            validChannels = rawVal.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        } catch (err) {
          console.warn('[SalesReport] Failed to fetch settings', err);
        }

        if (validChannels.includes(channelCode)) {
          setIsMultiSubmitChannel(true);
          return;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const existing = await database.get('orders').query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
          Q.where('status', 100), // Sales Report status
          Q.where('trx_date', Q.gte(todayStart.getTime())),
          Q.where('trx_date', Q.lte(todayEnd.getTime())),
        ).fetchCount();
        if (existing > 0) {
          setAlreadySubmitted(true);
          Alert.alert(
            'Alert !',
            'You have already submitted the daily sales report for this customer today.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        }
      } catch (e) {
        console.warn('[SalesReport] Duplicate check failed:', e);
      }
    })();
  }, [customerCode, user?.code]);

  const loadProducts = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Get opening stocks for this customer today
      const stocks: any[] = await database.get('opening_stocks').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('stock_date', today),
        ...(customerCode ? [Q.where('customer_code', customerCode)] : []),
      ).fetch();

      // 1.5 Get multi-submit channels for price fallback
      let multiChannels = ['GT'];
      try {
        const settings = await database.get('app_settings').query(Q.where('key', 'MULTI_SUBMIT_CHANNELS')).fetch();
        if (settings.length > 0) {
          multiChannels = (settings[0] as any).value.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e) {}

      if (stocks.length === 0) {
        setProducts([]);
        // Tell the user where to go — without this alert, the empty list
        // looked like a sync glitch instead of a missing prerequisite.
        Alert.alert(
          'Opening Stock Required',
          'No opening stock entered for this customer today. Please add the stock quantity from the Opening Stock screen first.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
          { cancelable: false },
        );
        return;
      }

      // 2. Resolve customer's price list.
      // Prefer the fresh value passed from the store/journey screen so a stale
      // local customer row does not blank out prices for the visit.
      let custPriceList = routedPriceList ? String(routedPriceList).trim() : '';
      let custRegion: string | null = null;
      if (customerCode) {
        const custs: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        if (custs.length > 0) {
          custRegion = custs[0]._raw?.region_code ?? null;
          if (!custPriceList) custPriceList = custs[0].priceList ?? custs[0].customerGroup ?? '';
        }
      }

      // 3. Build price lookup (price, mrp, setPrice)
      const allPrices: any[] = await database.get('prices').query(Q.where('is_active', true)).fetch();
      // Region-preferred per (item, priceList): the customer's regional override
      // wins over the base row; rows for other regions are ignored.
      const priceLookup = new Map<string, Map<string, { price: number; mrp: number | null; setPrice: number | null }>>();
      for (const p of allPrices) {
        const rRegion: string | null = p._raw?.region_code ?? null;
        if (rRegion !== null && rRegion !== custRegion) continue; // skip other regions
        if (!priceLookup.has(p.itemCode)) priceLookup.set(p.itemCode, new Map());
        const plKey = (p.priceList || '').toUpperCase().trim();
        const m = priceLookup.get(p.itemCode)!;
        const isRegionMatch = rRegion !== null && rRegion === custRegion;
        // region match always wins; otherwise only set base if nothing there yet
        if (isRegionMatch || !m.has(plKey)) {
          m.set(plKey, {
            price: p.price,
            mrp: p._raw?.mrp ?? null,
            setPrice: p._raw?.set_price ?? null,
          });
        }
      }

      // 4. Get item images
      const allItems: any[] = await database.get('items').query().fetch();
      const itemMap = new Map<string, any>();
      for (const i of allItems) itemMap.set(i.code, i);

      // 5. Build product rows — unique items only, qty starts at 0 (user adds from here)
      const seen = new Set<string>();
      const result: ProductRow[] = [];
      for (const stock of stocks) {
        const code = stock.itemCode ?? '';
        if (seen.has(code)) continue;
        seen.add(code);

        let unitPrice = 0;
        let mrp: number | null = null;
        const itemPrices = priceLookup.get(code);
        if (itemPrices) {
          // Selling price is resolved STRICTLY by the customer's own
          // price_list (chain). No GT or multi-channel fallback — each
          // chain shows its own price. If the customer's chain doesn't
          // have a row for this item, the report shows 0 / "—" and
          // surfaces it in console.warn so the data team can backfill
          // the missing (item, price_list) entry in the master.
          const targetCustPl = custPriceList ? custPriceList.toUpperCase().trim() : '';
          const priceData = targetCustPl ? itemPrices.get(targetCustPl) : undefined;
          if (priceData) {
            // Numeric coercion: Postgres `numeric` columns serialise
            // as strings over the wire; pullPrices on the backend
            // already parseFloats, but coercing here is belt-and-
            // braces against stale rows synced before that fix.
            unitPrice = Number(priceData.price) || 0;
            mrp = priceData.mrp != null ? Number(priceData.mrp) : null;
          } else {
            // Customer's chain has no row for this item — log so we
            // can identify which (item, price_list) pairs need backfill
            // in the master table.
            console.warn(
              '[SalesReport] No price for item', code,
              '— customer priceList =', custPriceList || '(empty)',
              ', available priceLists for item:',
              Array.from(itemPrices.keys()).join(', ') || '(none)',
            );
          }
        } else {
          console.warn('[SalesReport] No prices in local DB for item', code, '— prices sync may be incomplete');
        }

        const item = itemMap.get(code);
        result.push({
          code,
          name: stock.itemName ?? code,
          qty: 0,
          unitPrice,
          mrp,
          // Set Price starts as null (empty) — reps must explicitly enter
          // an override before submitting. Used by the missingPrice guard
          // below and by the card render to show an empty Set Price slot +
          // un-struck Selling Price until the rep taps the edit pencil.
          setPrice: null,
          imagePath: item?.imagePath ?? null,
          category: stock.category ?? item?.category ?? '',
        });
      }
      result.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(result);
    } catch (err) {
      console.warn('[SalesReport] Load error:', err);
    }
  }, [user?.code, customerCode, routedPriceList]);

  useFocusEffect(useCallback(() => { loadProducts(); }, [loadProducts]));

  const setQty = (code: string, qty: number) => {
    setProducts(prev => prev.map(p => p.code === code ? { ...p, qty: Math.max(0, qty) } : p));
  };

  // The pencil edits the Set Price (operative), not the read-only Selling Price.
  const updatePrice = (code: string, newPrice: number) => {
    setProducts(prev => prev.map(p => p.code === code ? { ...p, setPrice: newPrice } : p));
  };

  const handlePriceChange = (code: string, value: string) => {
    const validation = validatePriceInput(value);
    if (!validation.isValid) {
      showPriceValidationError(validation);
      return;
    }
    const formattedValue = validation.formattedValue || value;
    setProducts(prev => prev.map(p => p.code === code ? { ...p, setPrice: parseFloat(formattedValue) || 0 } : p));
  };

  const filtered = searchText
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchText.toLowerCase()) ||
        p.code.toLowerCase().includes(searchText.toLowerCase()))
    : products;

  const addedProducts = filtered.filter(p => p.qty > 0);
  const totalProducts = addedProducts.length;
  const totalQty = addedProducts.reduce((s, p) => s + p.qty, 0);
  const totalValue = addedProducts.reduce((s, p) => s + (p.qty * (p.setPrice ?? p.unitPrice)), 0);

  const handlePreview = () => {
    if (totalQty === 0) {
      Alert.alert('Alert!', 'Please add at least one product.');
      return;
    }
    setShowPreview(true);
  };

  const removeProduct = (code: string) => {
    setProducts(prev => prev.map(p => p.code === code ? { ...p, qty: 0 } : p));
  };

  const [submitting, setSubmitting] = useState(false);
  // Synchronous double-submit guard. The `submitting` STATE alone can't stop
  // rapid taps because setState is async — by the time it re-renders and
  // disables the button, several taps have already fired their async order
  // writes, each with a fresh uuid, producing the duplicate orders reps saw
  // in the MTD summary. A ref flips synchronously on the first tap, so every
  // extra tap (and any second Alert that slipped through) returns immediately.
  const submittingRef = useRef(false);

  const handleContinue = () => {
    if (submittingRef.current) return; // a submit is already in flight
    if (totalQty === 0) {
      Alert.alert('Alert!', 'Please add at least one product.');
      return;
    }
    // Block submission of any row whose selling price is still 0 — without
    // this guard, users were saving daily sales reports with zero unit
    // prices, which corrupts revenue totals downstream.
    const missingPrice = addedProducts.filter(p => !p.setPrice || p.setPrice <= 0);
    if (missingPrice.length > 0) {
      const sample = missingPrice.slice(0, 3).map(p => p.name).join(', ');
      const more = missingPrice.length > 3 ? `, +${missingPrice.length - 3} more` : '';
      Alert.alert(
        'Set Price Required',
        `Set a price (greater than 0) for: ${sample}${more}. Tap the pencil icon next to Set Price to edit it.`,
      );
      return;
    }
    const promptText = isMultiSubmitChannel 
      ? 'Do you want to proceed with confirming this sales capture?'
      : 'You are allowed to create only one daily sales report per day. Do you want to proceed with confirming this sales capture?';

    // Lock the guard BEFORE opening the dialog so rapid extra taps on either
    // Continue button can't stack a second confirmation Alert — each re-entry
    // returns at the submittingRef check at the top of handleContinue. It's
    // released again only if the rep cancels; once they confirm and the save
    // succeeds it stays locked, so no duplicate order reaches the MTD summary.
    submittingRef.current = true;
    Alert.alert(
      'Alert !',
      promptText,
      [
        { text: 'No', style: 'cancel', onPress: () => { submittingRef.current = false; } },
        {
          text: 'Yes',
          onPress: async () => {
            setSubmitting(true);
            // Pre-submit gate: verify the user is still active on the
            // server (forces logout if deactivated) and the customer is
            // not blocked/deactivated locally. The local customer record
            // is kept fresh by the 5 s background sync, so a web-portal
            // deactivation reaches the device within ~10 s.
            try {
              const userOk = await verifyUserActiveNow();
              if (!userOk) { submittingRef.current = false; setSubmitting(false); return; }
              const cust = await verifyCustomerStillActive(customerCode);
              if (!cust.ok) {
                submittingRef.current = false;
                setSubmitting(false);
                const name = cust.customerName ?? customerCode;
                const msg = cust.reason === 'blocked'
                  ? `${name} has been blocked. The sales report cannot be submitted.`
                  : cust.reason === 'deactivated'
                    ? `${name} has been deactivated. The sales report cannot be submitted.`
                    : `${name} is no longer available.`;
                Alert.alert('Customer Not Available', msg);
                return;
              }
            } catch (_e) { /* don't block on transient errors */ }
            try {
              const appTrxId = uuidv4();
              const now = Date.now();

              await database.write(async () => {
                // Create order header
                const order = await database.get('orders').create((rec: any) => {
                  rec._raw.id = appTrxId;
                  rec.appTrxId = appTrxId;
                  rec.serverTrxCode = null;
                  rec.userCode = user?.code ?? '';
                  rec.customerCode = customerCode;
                  rec.customerName = customerName;
                  rec.trxDate = now;
                  rec.totalAmount = totalValue;
                  rec.linesCount = addedProducts.length;
                  rec.status = 100; // Draft/Sales Report
                  rec.routeCode = user?.routeCode ?? null;
                  rec.geoLat = null;
                  rec.geoLng = null;
                  rec.isSynced = false;
                });

                // Create order lines
                for (let i = 0; i < addedProducts.length; i++) {
                  const p = addedProducts[i];
                  await database.get('order_lines').create((rec: any) => {
                    rec._raw.id = `${appTrxId}_line_${i + 1}`;
                    rec.order.id = order.id;
                    rec.lineNo = i + 1;
                    rec.itemCode = p.code;
                    rec.itemName = p.name;
                    rec.quantity = p.qty;
                    rec.priceUsed = p.setPrice ?? p.unitPrice;
                    rec.taxPct = 0;
                    rec.uom = 'EA';
                  });
                }
              });

              // Sync to server
              pushSync().catch(() => {});

              // Generate order number from user code
              const orderCount = await database.get('orders').query(
                Q.where('user_code', user?.code ?? ''),
              ).fetchCount();
              const orderNo = `${user?.code ?? 'ORD'}${String(orderCount).padStart(7, '0')}`;
              setSuccessOrderNo(orderNo);
              setShowPreview(false);
              // Small delay to let preview modal close before showing success
              setTimeout(() => setShowSuccess(true), 300);
              // Success: keep the guard LOCKED. Do NOT reset submittingRef
              // here — a second confirmation Alert that stacked up from extra
              // taps before the button disabled would otherwise pass the
              // (reset) guard and create a DUPLICATE order in the MTD summary,
              // which is exactly the multi-submit reps reported. The success
              // modal now takes over; the guard is only ever released on the
              // failure paths below so a genuine error still allows a retry.
            } catch (err: any) {
              console.error('[SalesReport] Save error:', err);
              Alert.alert('Error', err?.message ?? 'Failed to save sales report.');
              // Release ONLY on failure so the rep can retry.
              submittingRef.current = false;
              setSubmitting(false);
            }
          },
        },
      ],
      // Non-dismissable: the only ways out are No (which releases the guard)
      // or Yes (which proceeds). Prevents an Android back-tap from dismissing
      // the dialog without a callback and leaving the guard stuck locked.
      { cancelable: false },
    );
  };

  const renderProduct = ({ item }: { item: ProductRow }) => {
    const imgUrl = item.imagePath ? itemImageUrl(item.imagePath) ?? '' : null;
    const isAdded = item.qty > 0;

    return (
      <View style={st.card}>
        {/* Image */}
        <View style={st.imgContainer}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={st.img} resizeMode="contain" />
          ) : (
            <View style={st.imgPlaceholder}>
              <Icon name="image-outline" size={40} color="#D1D5DB" />
              <Text style={{ fontSize: 11, color: '#D1D5DB', marginTop: 4 }}>No image</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={st.cardBody}>
          {/* numberOfLines={3} + fixed height enforces a uniform name slot
              across every card. Names longer than 3 lines truncate with
              an ellipsis instead of pushing the Add button down — reps
              reported that 3-line names misaligned the Add button vs
              their 2-line-name neighbours in the grid. */}
          <Text style={st.itemName} numberOfLines={3} ellipsizeMode="tail">{item.name}</Text>

          {/* MRP — always renders a fixed-height row whether the SKU
              has an MRP on file or not, so the Add button below sits at
              the same baseline as its neighbours in the grid. The
              previous minHeight version still collapsed because an
              empty Text node has zero natural height; using a single
              Text with an explicit height + a non-breaking space
              fallback gives the row a guaranteed visible bound. */}
          <Text
            style={{ fontSize: 11, color: '#9CA3AF', height: 16, lineHeight: 14, marginBottom: 2 }}
            numberOfLines={1}
          >
            {item.mrp != null ? `MRP ₹${item.mrp}` : ' '}
          </Text>

          {/* Set Price slot is EMPTY until the rep taps the pencil and
              enters a value. The moment a Set Price exists, Selling Price
              gets struck through to signal the override is now operative.
              Layout slot is always present so cards stay uniform height
              regardless of override state. Pencil pre-fills the keypad
              with the current Set Price when one exists (to nudge), or
              empty when no override yet (so the rep types fresh, not
              edits the catalogue value). */}
          {(() => {
            const hasOverride = item.setPrice != null;
            return (
              <>
                <View style={st.priceRow}>
                  <Text style={st.priceLabel}>Selling Price: </Text>
                  <Text style={[st.priceValue, hasOverride && st.struck]}>₹{item.unitPrice}</Text>
                </View>
                <View style={st.priceRow}>
                  <Text style={st.priceLabel}>Set Price: </Text>
                  <Text style={st.priceValue}>{hasOverride ? `₹${item.setPrice}` : ''}</Text>
                  <TouchableOpacity
                    style={st.editIcon}
                    onPress={() => setEditingPrice({ code: item.code, value: hasOverride ? String(item.setPrice) : '' })}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="pencil" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}

          {/* Add / Qty Controls */}
          {!isAdded ? (
            <TouchableOpacity
              style={st.addBtn}
              onPress={() => setQty(item.code, 1)}
              activeOpacity={0.8}
            >
              <Text style={st.addBtnText}>Add</Text>
            </TouchableOpacity>
          ) : (
            <View style={st.qtyControls}>
              <TouchableOpacity
                style={st.qtyBtn}
                onPress={() => setQty(item.code, item.qty - 1)}
                activeOpacity={0.7}
              >
                <Icon name="remove" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TextInput
                style={st.qtyInput}
                value={String(item.qty)}
                onChangeText={(t) => setQty(item.code, parseInt(t) || 0)}
                keyboardType="numeric"
                selectTextOnFocus
              />
              <TouchableOpacity
                style={st.qtyBtn}
                onPress={() => setQty(item.code, item.qty + 1)}
                activeOpacity={0.7}
              >
                <Icon name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (alreadySubmitted) {
    return <View style={st.container} />;
  }

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Daily Sales Report" />

      {/* Search */}
      <View style={st.searchRow}>
        <View style={st.searchBar}>
          <Icon name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            style={st.searchInput}
            placeholder="Search by item description"
            placeholderTextColor="#9CA3AF"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
        <TouchableOpacity style={st.listViewBtn} activeOpacity={0.7} onPress={() => setListView(!listView)}>
          <Icon name={listView ? 'grid-outline' : 'list-outline'} size={18} color="#1a3178" />
          <Text style={st.listViewText}>{listView ? 'Grid View' : 'List View'}</Text>
        </TouchableOpacity>
      </View>

      {/* Product Grid / List */}
      {filtered.length > 0 ? (
        listView ? (
          <FlatList
            key="list"
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => {
              const imgUrl = item.imagePath ? itemImageUrl(item.imagePath) ?? '' : null;
              return (
                <View style={st.listCard}>
                  {imgUrl ? (
                    <Image source={{ uri: imgUrl }} style={st.listImg} resizeMode="contain" />
                  ) : (
                    <View style={st.listImgPlaceholder}><Icon name="image-outline" size={24} color="#D1D5DB" /></View>
                  )}
                  <View style={st.listInfo}>
                    <Text style={st.listName} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                    {/* List view mirrors the grid: Set Price slot is empty
                        until the rep enters an override, at which point
                        Selling gets struck through. Pencil pre-fills the
                        keypad with the current Set Price when one exists,
                        or empty when it doesn't. */}
                    {(() => {
                      const hasOverride = item.setPrice != null;
                      return (
                        <>
                          <Text style={[st.listPrice, hasOverride && st.struck]}>Selling ₹{item.unitPrice}{item.mrp != null ? `  MRP ₹${item.mrp}` : ''}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={st.listPrice}>{hasOverride ? `Set ₹${item.setPrice}` : 'Set'}</Text>
                            <TouchableOpacity
                              onPress={() => setEditingPrice({ code: item.code, value: hasOverride ? String(item.setPrice) : '' })}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              testID={`list-edit-price-${item.code}`}
                            >
                              <Icon name="pencil" size={14} color="#6B7280" />
                            </TouchableOpacity>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                  {item.qty === 0 ? (
                    <TouchableOpacity style={st.listAddBtn} onPress={() => setQty(item.code, 1)} activeOpacity={0.8}>
                      <Text style={st.listAddText}>Add</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={st.listQtyRow}>
                      <TouchableOpacity style={st.listQtyBtn} onPress={() => setQty(item.code, item.qty - 1)}><Icon name="remove" size={16} color="#FFF" /></TouchableOpacity>
                      <Text style={st.listQtyText}>{item.qty}</Text>
                      <TouchableOpacity style={st.listQtyBtn} onPress={() => setQty(item.code, item.qty + 1)}><Icon name="add" size={16} color="#FFF" /></TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
            contentContainerStyle={st.gridContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            key="grid"
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={renderProduct}
            numColumns={2}
            columnWrapperStyle={st.gridRow}
            contentContainerStyle={st.gridContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        <View style={st.emptyArea}>
          <Icon name="document-text-outline" size={48} color="#D1D5DB" />
          <Text style={st.emptyText}>No sales data found</Text>
        </View>
      )}

      {/* Bottom Bar */}
      <View style={st.bottomBar}>
        <View style={st.totalRow}>
          <View>
            <Text style={st.totalLabel}>Total Secondary Sales Value</Text>
            <Text style={st.totalSub}>Products: {totalProducts}    Qty: {totalQty}</Text>
          </View>
          <Text style={st.totalValue}>{totalValue.toLocaleString('en-IN')}</Text>
        </View>
        <View style={st.btnRow}>
          <TouchableOpacity style={st.previewBtn} onPress={handlePreview} activeOpacity={0.7}>
            <Text style={st.previewBtnText}>Preview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.continueBtn, submitting && { opacity: 0.6 }]} onPress={handleContinue} activeOpacity={0.8} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={st.continueBtnText}>Continue</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit Price Keypad */}
      <NumericKeypad
        visible={!!editingPrice}
        value={editingPrice ? parseFloat(editingPrice.value) || 0 : 0}
        title="Set Price"
        onConfirm={(val) => { if (editingPrice) updatePrice(editingPrice.code, val); setEditingPrice(null); }}
        onClose={() => setEditingPrice(null)}
        onChangeText={(val) => { if (editingPrice) handlePriceChange(editingPrice.code, val); }}
      />

      {/* Preview Full Screen */}
      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={st.previewContainer}>
          {/* Header */}
          <View style={st.previewHeader}>
            <Text style={st.previewTitle}>Daily Sales Report Preview</Text>
          </View>

          {/* Product Cards */}
          <FlatList
            data={addedProducts}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ padding: 16, paddingBottom: 180 }}
            renderItem={({ item: p }) => (
              <View style={st.previewCard}>
                <View style={{ flex: 1 }}>
                  <Text style={st.previewItemName}>{p.name}</Text>
                  <View style={st.previewDetailsRow}>
                    <View style={st.previewDetail}>
                      <Text style={st.previewDetailLabel}>Set Price</Text>
                      <Text style={st.previewDetailValue}>{p.setPrice ?? p.unitPrice}</Text>
                    </View>
                    <View style={st.previewDetail}>
                      <Text style={st.previewDetailLabel}>Order Qty</Text>
                      <Text style={st.previewDetailValue}>{p.qty}</Text>
                    </View>
                    <View style={st.previewDetail}>
                      <Text style={st.previewDetailLabel}>Total Price</Text>
                      <Text style={st.previewDetailValue}>{(p.qty * (p.setPrice ?? p.unitPrice)).toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={st.previewDeleteBtn}
                  onPress={() => { removeProduct(p.code); if (addedProducts.length <= 1) setShowPreview(false); }}
                  activeOpacity={0.7}
                >
                  <Icon name="trash-outline" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No products added</Text>
              </View>
            }
          />

          {/* Bottom Bar */}
          <View style={st.bottomBar}>
            <View style={st.totalRow}>
              <View>
                <Text style={st.totalLabel}>Total Secondary Sales Value</Text>
                <Text style={st.totalSub}>Products: {totalProducts}    Qty: {totalQty}</Text>
              </View>
              <Text style={st.totalValue}>{totalValue.toLocaleString('en-IN')}</Text>
            </View>
            <View style={st.btnRow}>
              <TouchableOpacity style={st.previewBtn} onPress={() => setShowPreview(false)} activeOpacity={0.7}>
                <Text style={st.previewBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.continueBtn} onPress={handleContinue} activeOpacity={0.8}>
                <Text style={st.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={st.successOverlay}>
          <View style={st.successBox}>
            <Text style={st.successTitle}>Success</Text>
            <View style={st.successCheckWrap}>
              <View style={st.successCheckCircle}>
                <Text style={st.successCheckMark}>{'\u2713'}</Text>
              </View>
            </View>
            <Text style={st.successMsg}>Today Sales Captured successfully</Text>
            <Text style={st.successOrderNo}>
              Order No <Text style={{ fontWeight: '700' }}>{successOrderNo}</Text>
            </Text>
            <TouchableOpacity
              style={st.successDoneBtn}
              onPress={() => {
                setShowSuccess(false);
                navigation.navigate('CustomerDashboard', {
                  customerCode, customerName, visitCode, salesReportDone: true,
                });
              }}
              activeOpacity={0.85}
            >
              <Text style={st.successDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4, gap: 10 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 10, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: '#E5E7EB', gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  listViewBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF0FF',
    borderRadius: 8, paddingHorizontal: 12, height: 44, gap: 6,
  },
  listViewText: { fontSize: 13, fontWeight: '600', color: '#1a3178' },

  // Grid
  gridContent: { paddingHorizontal: 12, paddingBottom: 200 },
  gridRow: { justifyContent: 'space-between' },

  // Card
  card: {
    width: '48%', backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  imgContainer: { height: 140, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
  img: { width: '85%', height: '85%' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  // Card body
  cardBody: { padding: 12 },
  // Fixed 3-line height (3 × 18 lineHeight = 54). Combined with
  // numberOfLines={3} + ellipsizeMode='tail' on the Text, every card
  // reserves the same vertical space for the name regardless of how
  // long the actual name is — so Add buttons across the grid sit on
  // the same baseline.
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 18, height: 54 },

  // Price row
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  priceLabel: { fontSize: 13, color: '#6B7280' },
  priceValue: { fontSize: 14, fontWeight: '800', color: '#111827' },
  editIcon: { marginLeft: 8, padding: 4 },
  // "Set Price" link rendered next to Selling Price BEFORE a rep overrides
  // the catalogue price. Replaces the bare pencil icon which reps said was
  // unclear about what tapping it would do. Small chip styling so it
  // reads as a tappable affordance.
  setPriceLink: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#EEF2FF' },
  setPriceLinkText: { fontSize: 12, fontWeight: '700', color: '#1a3178' },
  // Read-only Selling Price: muted + struck through. Set Price turns green once edited.
  sellingMuted: { color: '#9CA3AF', fontWeight: '500' },
  struck: { textDecorationLine: 'line-through' },
  priceEdited: { color: '#16a34a' },

  // Add button
  addBtn: {
    marginTop: 12, backgroundColor: '#1a3178', borderRadius: 10, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Qty controls
  qtyControls: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    backgroundColor: '#1a3178', borderRadius: 10, height: 40, overflow: 'hidden',
  },
  qtyBtn: {
    width: 44, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  qtyInput: {
    flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700',
    color: '#FFFFFF', padding: 0, height: 40,
  },

  // Empty
  emptyArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },

  // Bottom
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  totalSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  previewBtn: {
    flex: 1, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#1a3178', backgroundColor: '#FFFFFF',
  },
  previewBtnText: { fontSize: 16, fontWeight: '700', color: '#1a3178' },
  continueBtn: {
    flex: 1, backgroundColor: '#1a3178', borderRadius: 12, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Edit Price Input
  editPriceInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 12, fontSize: 18, fontWeight: '700', color: '#111827',
    backgroundColor: '#F9FAFB', textAlign: 'center', marginVertical: 16,
  },

  // Preview Screen
  previewContainer: { flex: 1, backgroundColor: '#F3F4F6' },
  previewHeader: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 14,
    borderBottomWidth: 2, borderBottomColor: '#1a3178',
  },
  previewTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  previewCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  previewItemName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  previewDetailsRow: { flexDirection: 'row', gap: 24 },
  previewDetail: {},
  previewDetailLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 3 },
  previewDetailValue: { fontSize: 15, fontWeight: '800', color: '#1a3178' },
  previewDeleteBtn: { padding: 8, marginLeft: 8 },

  // Success modal
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  successBox: { backgroundColor: '#FFFFFF', borderRadius: 20, width: '100%', padding: 28, alignItems: 'center' },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 20, alignSelf: 'flex-start' },
  successCheckWrap: { marginBottom: 20 },
  successCheckCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  successCheckMark: { color: '#FFFFFF', fontSize: 44, fontWeight: '700' },
  successMsg: { fontSize: 18, fontWeight: '700', color: '#1a3178', textAlign: 'center', marginBottom: 8 },
  successOrderNo: { fontSize: 15, color: '#6B7280', marginBottom: 28 },
  successDoneBtn: { backgroundColor: '#1a3178', borderRadius: 12, height: 52, width: '100%', alignItems: 'center', justifyContent: 'center' },
  successDoneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // List view styles
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  listImg: { width: 50, height: 50, borderRadius: 8 },
  listImgPlaceholder: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  listInfo: { flex: 1, marginLeft: 12 },
  listName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  listPrice: { fontSize: 12, color: '#6B7280' },
  listAddBtn: { backgroundColor: '#1a3178', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  listAddText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  listQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listQtyBtn: { backgroundColor: '#1a3178', borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  listQtyText: { fontSize: 16, fontWeight: '700', color: '#111827', minWidth: 24, textAlign: 'center' },
});
