import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import { storeService } from '../services/auth/../stores/storeService';
import api from '../api/client';
import NumericKeypad from '../components/common/NumericKeypad';
import database from '../db/database';
import { buildPriceMap } from '../services/priceLookup';
import { pushSync } from '../services/syncService';
import { verifyUserActiveNow } from '../services/realtimeSync';

import { itemImageUrl } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

type RouteParams = {
  Order: {
    customerCode: string;
    customerName: string;
    priceList: string;
  };
};

interface OrderItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  packSize: string;
  price: number;
  mrp: number | null;
  setPrice: number | null;
  uom: string;
  taxKey: string | null;
  imagePath: string | null;
  qty: number;
  isMsl: boolean;
  mslMinQty: number;
  mslMaxQty: number;
}

function extractPackSize(name: string): string {
  const match = name.match(/(\d+\s*[gGkKmMlL]+)/);
  return match ? match[1].trim() : '';
}

export default function OrderScreen() {
  const route = useRoute<RouteProp<RouteParams, 'Order'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, priceList = 'GT' } = route.params;

  const [items, setItems] = useState<OrderItem[]>([]);
  const [mslItemCodes, setMslItemCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('ALL');

  const ensureData = useCallback(async () => {
    const localItemCount = await database.get('items').query().fetchCount();
    if (localItemCount === 0) {
      try {
        const { data } = await storeService.getItems(500);
        const rows = data.data ?? data;
        if (Array.isArray(rows)) {
          await storeService.upsertItems(rows);
        }
      } catch {
        // Offline
      }
    }

    const localPriceCount = await database.get('prices').query().fetchCount();
    if (localPriceCount === 0) {
      try {
        const { data } = await storeService.getPrices(500);
        const rows = data.data ?? data;
        if (Array.isArray(rows)) {
          await storeService.upsertPrices(rows);
        }
      } catch {
        // Offline
      }
    }
  }, []);

  const loadItems = useCallback(async () => {
    await ensureData();

    const allItems: any[] = await database
      .get('items')
      .query(Q.where('is_active', true))
      .fetch();

    // Region-preferred price map: (priceList, customer region) → (priceList, base)
    // → (GT, region) → (GT, base). The customer's region drives regional overrides.
    const [cust]: any[] = await database
      .get('customers')
      .query(Q.where('code', customerCode))
      .fetch();
    const regionCode: string | null = cust?._raw?.region_code ?? null;
    const priceMap = await buildPriceMap(database, priceList, regionCode);

    // Load MSL items for this customer's chain (priceList = chain code).
    // STRICT: only show SKUs assigned to the customer's chain. If the chain
    // has no MSL entries, the list is empty — no fallback. Normalize so
    // "7 Eleven" matches "7-Eleven", etc.
    let mslMap = new Map<string, { minQty: number; maxQty: number }>();
    try {
      const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');
      const normalizedPriceList = normalize(priceList);

      const allMsl: any[] = await database
        .get('selling_skus')
        .query()
        .fetch();

      const matched = allMsl.filter((r: any) =>
        normalize(r.groupCode ?? '') === normalizedPriceList,
      );

      for (const r of matched) {
        if (!mslMap.has(r.itemCode)) {
          mslMap.set(r.itemCode, { minQty: r.minQty ?? 1, maxQty: r.maxQty ?? 9999 });
        }
      }
      setMslItemCodes(new Set(mslMap.keys()));
    } catch {
      setMslItemCodes(new Set());
    }

    // Strict filter: only items in this chain's MSL.
    const orderItems: OrderItem[] = allItems
      .filter((item: any) => mslMap.has(item.code))
      .map((item: any) => {
        const msl = mslMap.get(item.code)!;
        return {
          code: item.code,
          name: item.name,
          category: item.category ?? 'Other',
          brand: item.brand ?? '',
          packSize: extractPackSize(item.name),
          price: Number(priceMap.get(item.code)?.price ?? 0),
          mrp: (priceMap.get(item.code)?.mrp ?? null) as number | null,
          setPrice: (priceMap.get(item.code)?.setPrice ?? null) as number | null,
          uom: item.baseUom,
          taxKey: item.taxKey,
          imagePath: item.imagePath ?? null,
          qty: 0,
          isMsl: true,
          mslMinQty: msl.minQty,
          mslMaxQty: msl.maxQty,
        };
      });

    orderItems.sort((a, b) => a.name.localeCompare(b.name));
    setItems(orderItems);

    setLoading(false);
  }, [priceList, customerCode, ensureData]);

  useEffect(() => {
    loadItems();
    // Reload when any master table the catalog depends on changes, so backend
    // edits reflect on this open screen via the 5 s background sync without a
    // manual sync: prices (selling price), items (activate/deactivate), and
    // selling_skus (chain item mapping — add/remove SKUs for the chain).
    // Debounced so a multi-batch sync burst coalesces into a single reload.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { loadItems(); }, 400);
    };
    const subs = [
      database.collections.get('prices').changes.subscribe(reload),
      database.collections.get('items').changes.subscribe(reload),
      database.collections.get('selling_skus').changes.subscribe(reload),
    ];
    return () => {
      if (debounce) clearTimeout(debounce);
      subs.forEach((s) => s.unsubscribe());
    };
  }, [loadItems]);

  // Derive categories from data
  const categories = useMemo(() => {
    const catSet = new Set(items.map((i) => i.category));
    return ['ALL', ...Array.from(catSet).sort()];
  }, [items]);

  // Items filtered by selected category
  const categoryFiltered = useMemo(() => {
    if (selectedCategory === 'ALL') return items;
    return items.filter((i) => i.category === selectedCategory);
  }, [items, selectedCategory]);

  // Derive sub-filters (MSL + pack sizes) from category-filtered items
  const subFilters = useMemo(() => {
    const sizes = new Set(categoryFiltered.map((i) => i.packSize).filter(Boolean));
    const filters = ['ALL'];
    if (mslItemCodes.size > 0) filters.push('MSL');
    filters.push(...Array.from(sizes).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numA - numB;
    }));
    return filters;
  }, [categoryFiltered, mslItemCodes]);

  // Final filtered items (category + sub-filter)
  const filteredItems = useMemo(() => {
    if (selectedSubFilter === 'ALL') return categoryFiltered;
    if (selectedSubFilter === 'MSL') {
      return categoryFiltered.filter((i) => mslItemCodes.has(i.code));
    }
    return categoryFiltered.filter((i) => i.packSize === selectedSubFilter);
  }, [categoryFiltered, selectedSubFilter, mslItemCodes]);

  // Reset sub-filter when category changes
  useEffect(() => {
    setSelectedSubFilter('ALL');
  }, [selectedCategory]);

  const updateQty = useCallback((code: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code
          ? { ...item, qty: Math.max(0, item.qty + delta) }
          : item,
      ),
    );
  }, []);

  const setQty = useCallback((code: string, qty: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code ? { ...item, qty: Math.max(0, qty) } : item,
      ),
    );
  }, []);

  // Numeric keypad state
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadItem, setKeypadItem] = useState<{ code: string; name: string; qty: number } | null>(null);

  const openKeypad = useCallback((code: string, name: string, currentQty: number) => {
    setKeypadItem({ code, name, qty: currentQty });
    setKeypadVisible(true);
  }, []);

  const orderLines = useMemo(() => items.filter((i) => i.qty > 0), [items]);
  const subtotal = useMemo(
    () => orderLines.reduce((sum, i) => sum + i.price * i.qty, 0),
    [orderLines],
  );
  // GST/tax removed — Farmley does not apply tax on products in the mobile app
  const taxAmount = 0;
  const totalAmount = subtotal;

  const formatCurrency = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const handlePlaceOrder = async () => {
    if (orderLines.length === 0) {
      Alert.alert('Empty Order', 'Add at least one item to place an order.');
      return;
    }

    // Re-verify user is still active on the server before finalizing —
    // catches admin deactivations that happen between the 5-min throttled
    // realtimeSync checks. Force-logs out if deactivated.
    const stillActive = await verifyUserActiveNow();
    if (!stillActive) return;

    // Zero-price block — any line with price <= 0 is invalid. Without this
    // the user can submit a free order if the price master is missing or
    // misconfigured, which lands a bad record in the backend.
    const zeroPriceLines = orderLines.filter((l) => l.qty > 0 && (!l.price || l.price <= 0));
    if (zeroPriceLines.length > 0) {
      const names = zeroPriceLines.map((l) => l.name).join('\n');
      Alert.alert(
        'Zero Price',
        `These items have no price configured — order cannot be placed:\n\n${names}`,
      );
      return;
    }

    // Check MSL min qty violations
    const mslViolations = orderLines.filter(
      (l) => l.isMsl && l.mslMinQty > 1 && l.qty < l.mslMinQty,
    );
    if (mslViolations.length > 0) {
      const names = mslViolations.map((v) => `${v.name} (min: ${v.mslMinQty})`).join('\n');
      Alert.alert(
        'MSL Minimum Quantity',
        `These MSL items are below minimum order quantity:\n\n${names}\n\nContinue anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => executePlaceOrder() },
        ],
      );
      return;
    }

    executePlaceOrder();
  };

  const executePlaceOrder = async () => {

    setPlacing(true);
    const appTrxId = uuidv4();
    const now = Date.now();

    try {
      await database.write(async () => {
        const order = await database.get('orders').create((rec: any) => {
          rec._raw.id = appTrxId;
          rec.appTrxId = appTrxId;
          rec.serverTrxCode = null;
          rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode;
          rec.customerName = customerName;
          rec.trxDate = now;
          rec.totalAmount = totalAmount;
          rec.linesCount = orderLines.length;
          rec.status = 1;
          rec.routeCode = user?.routeCode ?? null;
          rec.geoLat = null;
          rec.geoLng = null;
          rec.isSynced = false;
        });

        for (let i = 0; i < orderLines.length; i++) {
          const line = orderLines[i];
          await database.get('order_lines').create((rec: any) => {
            rec._raw.id = `${appTrxId}_line_${i + 1}`;
            rec.order.id = order.id;
            rec.lineNo = i + 1;
            rec.itemCode = line.code;
            rec.itemName = line.name;
            rec.quantity = line.qty;
            rec.priceUsed = line.price;
            rec.taxPct = 0;
            rec.uom = line.uom;
          });
        }
      });

      pushSync().catch(() => {});
      Alert.alert('Order Placed', `${orderLines.length} items — ${formatCurrency(totalAmount)}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save order locally.');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="order-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerCustomer} numberOfLines={1}>
          {customerName}
        </Text>
        <Text style={styles.headerPriceList}>Price list: {priceList}</Text>
      </View>

      {/* Main Content: Sidebar + Products */}
      <View style={styles.mainContent}>
        {/* Left Sidebar — Category Filter */}
        <ScrollView
          style={styles.sidebar}
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            const catItems = cat === 'ALL' ? items : items.filter((i) => i.category === cat);
            const catOrderCount = catItems.filter((i) => i.qty > 0).length;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.sidebarText, isActive && styles.sidebarTextActive]}
                  numberOfLines={2}
                >
                  {cat}
                </Text>
                {catOrderCount > 0 && (
                  <View style={styles.sidebarBadge}>
                    <Text style={styles.sidebarBadgeText}>{catOrderCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Right Side — Sub-filter + Products */}
        <View style={styles.productArea}>
          {/* Horizontal Sub-filter Chips */}
          <ScrollView
            horizontal
            style={styles.chipBar}
            contentContainerStyle={styles.chipBarContent}
            showsHorizontalScrollIndicator={false}
          >
            {subFilters.map((sf) => {
              const isActive = selectedSubFilter === sf;
              return (
                <TouchableOpacity
                  key={sf}
                  style={[styles.chip, isActive && styles.chipActive]}
                  onPress={() => setSelectedSubFilter(sf)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {sf}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product List */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.code}
            testID="order-product-list"
            renderItem={({ item, index }) => (
              <View style={[styles.itemRow, item.qty > 0 && styles.itemRowActive]}>
                <View style={styles.itemNameRow}>
                  {item.imagePath ? (
                    <Image
                      source={{ uri: itemImageUrl(item.imagePath) ?? '' }}
                      style={styles.itemThumb}
                      resizeMode="cover"
                      testID={`product-image-${index}`}
                    />
                  ) : (
                    <View style={[styles.itemThumbFallback, { backgroundColor: Colors.primaryLight }]}>
                      <Text style={styles.itemThumbLetter}>
                        {(item.category ?? item.name)?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {mslItemCodes.has(item.code) && (
                    <View style={styles.mslBadge}>
                      <Text style={styles.mslBadgeText}>MSL</Text>
                    </View>
                  )}
                </View>
                <View style={styles.itemBottom}>
                  <View style={styles.priceRow}>
                    {item.mrp != null && item.mrp > item.price && (
                      <Text style={styles.mrpText}>MRP {formatCurrency(item.mrp)}</Text>
                    )}
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {formatCurrency(item.price)}/{item.uom}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, item.qty === 0 && styles.stepperBtnDisabled]}
                      onPress={() => updateQty(item.code, -1)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.stepperBtnText,
                          item.qty === 0 && styles.stepperBtnTextDisabled,
                        ]}
                      >
                        −
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openKeypad(item.code, item.name, item.qty)} activeOpacity={0.7} testID={`qty-display-${index}`}>
                      <Text style={[styles.stepperQty, item.qty > 0 && styles.stepperQtyActive]}>
                        {item.qty}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updateQty(item.code, 1)}
                      activeOpacity={0.7}
                      testID={`add-product-${index}`}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={styles.productList}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>No products match this filter</Text>
              </View>
            }
          />
        </View>
      </View>

      {/* Bottom Order Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomItems}>
            {orderLines.length} item{orderLines.length !== 1 ? 's' : ''} ·{' '}
            {orderLines.reduce((s, i) => s + i.qty, 0)} units
            {''}
          </Text>
          <Text style={styles.bottomTotal}>{formatCurrency(totalAmount)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.placeOrderBtn, orderLines.length === 0 && styles.placeOrderBtnDisabled]}
          activeOpacity={0.7}
          onPress={handlePlaceOrder}
          disabled={placing || orderLines.length === 0}
        >
          {placing ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.placeOrderText}>Place Order</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Numeric Keypad */}
      <NumericKeypad
        visible={keypadVisible}
        value={keypadItem?.qty ?? 0}
        title={keypadItem?.name ?? 'Enter Quantity'}
        subtitle="Tap a number or use quick values"
        onConfirm={(val) => {
          if (keypadItem) setQty(keypadItem.code, val);
          setKeypadVisible(false);
        }}
        onClose={() => setKeypadVisible(false)}
      />
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDEBAR_WIDTH = Math.round(SCREEN_WIDTH * 0.18);

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
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  headerPriceList: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // Main layout: sidebar + product area
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },

  // Left sidebar
  sidebar: {
    width: SIDEBAR_WIDTH,
    maxWidth: SIDEBAR_WIDTH,
    minWidth: SIDEBAR_WIDTH,
    backgroundColor: Colors.card,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  sidebarContent: {
    paddingVertical: 2,
  },
  sidebarItem: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  sidebarItemActive: {
    backgroundColor: Colors.primaryLight,
    borderLeftColor: Colors.primary,
  },
  sidebarText: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  sidebarTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  sidebarBadge: {
    marginTop: 2,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  sidebarBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.white,
  },

  // Right product area
  productArea: {
    flex: 1,
  },

  // Horizontal chip bar
  chipBar: {
    maxHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryDark,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    // Reserve descender room INSIDE the line box so Android doesn't clip the
    // 'g' in weight chips like "200 g" (renders as "200 ɑ" without this).
    lineHeight: 18,
    includeFontPadding: true,
  },
  chipTextActive: {
    color: Colors.white,
  },

  // Product list
  productList: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 100,
  },
  itemRow: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  itemRowActive: {
    borderColor: Colors.primary,
    backgroundColor: '#f0fdf4',
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  itemThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.background,
  },
  itemThumbFallback: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemThumbLetter: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
    flex: 1,
  },
  mslBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  mslBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: 8,
    gap: 6,
  },
  mrpText: {
    fontSize: 11,
    color: '#9CA3AF',
    textDecorationLine: 'line-through' as const,
    fontWeight: '500' as const,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.primaryDark,
    fontWeight: '600' as const,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.primary,
  },
  stepperBtnTextDisabled: {
    color: Colors.textSecondary,
  },
  stepperQty: {
    width: 30,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  stepperQtyActive: {
    color: Colors.text,
  },
  emptyList: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: SIDEBAR_WIDTH + 1,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomInfo: {
    flex: 1,
  },
  bottomItems: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  bottomTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  placeOrderBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  placeOrderBtnDisabled: {
    opacity: 0.4,
  },
  placeOrderText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
