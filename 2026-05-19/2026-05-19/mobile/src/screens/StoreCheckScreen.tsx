import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import MapView from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import api from '../api/client';
import database from '../db/database';
import { pushSync } from '../services/syncService';
import NumericKeypad from '../components/common/NumericKeypad';

import { itemImageUrl } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

type RouteParams = {
  StoreCheck: {
    customerCode: string;
    customerName: string;
    visitCode?: string;
  };
};

interface CheckItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  imagePath: string | null;
  shelfQty: number;
  storeQty: number;
  isAvailable: boolean;
  isMsl: boolean;
}

export default function StoreCheckScreen() {
  const route = useRoute<RouteProp<RouteParams, 'StoreCheck'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;

  const [items, setItems] = useState<CheckItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMslOnly, setShowMslOnly] = useState(true);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { clearDraft } = useActivityDrafts();

  useEffect(() => {
    async function loadCoords() {
      try {
        const customers: any[] = await database
          .get('customers')
          .query(Q.where('code', customerCode))
          .fetch();
        if (customers.length > 0) {
          const c = customers[0];
          if (c.latitude && c.longitude && c.latitude !== 0 && c.longitude !== 0) {
            setCustomerCoords({ lat: parseFloat(c.latitude), lng: parseFloat(c.longitude) });
          }
        }
      } catch (e) { console.warn("[App]", e); }
    }
    loadCoords();
  }, [customerCode]);

  const handleNavigate = useCallback(() => {
    if (!customerCoords) return;
    const { lat, lng } = customerCoords;
    const label = encodeURIComponent(customerName);
    if (Platform.OS === 'ios') {
      const gmaps = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      Linking.canOpenURL(gmaps)
        .then((ok) => Linking.openURL(ok ? gmaps : `maps:0,0?q=${label}@${lat},${lng}`))
        .catch(() => Linking.openURL(`maps:0,0?q=${label}@${lat},${lng}`));
    } else {
      const intentUrl =
        `intent://maps.google.com/maps?daddr=${lat},${lng}&mode=d` +
        `#Intent;scheme=https;package=com.google.android.apps.maps;end`;
      Linking.openURL(intentUrl).catch(() =>
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
      );
    }
  }, [customerCoords, customerName]);

  const ensureItems = useCallback(async () => {
    const localCount = await database.get('items').query().fetchCount();
    if (localCount === 0) {
      try {
        const { data } = await api.get('/items', { params: { pageSize: 500 } });
        const rows = data.data ?? data;
        if (Array.isArray(rows)) {
          await database.write(async () => {
            for (const item of rows) {
              await database.get('items').create((rec) => {
                rec._raw.id = `item_${item.code}`;
                (rec as any).serverId = item.id?.toString() ?? '';
                (rec as any).code = item.code;
                (rec as any).name = item.name;
                (rec as any).brand = item.brand ?? null;
                (rec as any).category = item.category ?? null;
                (rec as any).division = item.division ?? null;
                (rec as any).baseUom = item.baseUom ?? 'PCS';
                (rec as any).taxKey = item.taxKey ?? null;
                (rec as any).imagePath = item.imagePath ?? null;
                (rec as any).isActive = item.isActive ?? true;
                (rec as any).serverUpdatedAt = Date.now();
              });
            }
          });
        }
      } catch {
        // Offline — use whatever local data exists
      }
    }
  }, []);

  // Re-tryable loader. Retries on any of: items master empty, this
  // customer's row not synced yet, MSL master empty, or MSL has rows
  // for other chains but not this customer's chain yet. Up to ~12 s
  // total before accepting an empty list as the real answer.
  const loadItems = useCallback(async (attempt = 0) => {
    const MAX_ATTEMPTS = 8;
    const RETRY_MS = 1500;

    await ensureItems();
    const allItems: any[] = await database
      .get('items')
      .query(Q.where('is_active', true))
      .fetch();

    if (allItems.length === 0 && attempt < MAX_ATTEMPTS) {
      setTimeout(() => { loadItems(attempt + 1); }, RETRY_MS);
      return;
    }

    // Load MSL for this customer's chain. STRICT: only show SKUs assigned
    // to the chain. If the chain has no MSL entries, the list is empty —
    // no fallback.
    let mslCodes = new Set<string>();
    let needsRetry = false;
    try {
      const customers: any[] = await database
        .get('customers')
        .query(Q.where('code', customerCode))
        .fetch();
      if (customers.length === 0 && attempt < MAX_ATTEMPTS) {
        needsRetry = true;
      } else {
        const custGroup = customers[0]?.priceList ?? customers[0]?.customerGroup ?? '';
        const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');
        const normalizedGroup = normalize(custGroup);

        const allMsl: any[] = await database.get('selling_skus').query().fetch();
        if (allMsl.length === 0 && attempt < MAX_ATTEMPTS) {
          needsRetry = true;
        } else {
          for (const r of allMsl) {
            if (normalize(r.groupCode ?? '') === normalizedGroup) mslCodes.add(r.itemCode);
          }
          if (mslCodes.size === 0 && attempt < 3) {
            needsRetry = true;
          }
        }
      }
    } catch {
      // MSL not available — leave set empty (no items shown)
    }

    if (needsRetry) {
      setTimeout(() => { loadItems(attempt + 1); }, RETRY_MS);
      return;
    }

    // Strict filter: only items in this chain's MSL.
    const checkItems: CheckItem[] = allItems
      .filter((item: any) => mslCodes.has(item.code))
      .map((item: any) => ({
        code: item.code,
        name: item.name,
        category: item.category ?? 'Uncategorized',
        brand: item.brand ?? '',
        imagePath: item.imagePath ?? null,
        shelfQty: 0,
        storeQty: 0,
        isAvailable: true,
        isMsl: true,
      }));

    checkItems.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    setItems(checkItems);
    setLoading(false);
  }, [customerCode]);

  // No draft persistence — store-check values only survive a Back tap
  // when committed via Submit (then loadItems above merges from the
  // local DB). One-shot clearDraft wipes any stale entry from a prior
  // build.
  useEffect(() => { clearDraft(customerCode, 'StoreCheck'); }, [customerCode, clearDraft]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const updateShelfQty = useCallback((code: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code
          ? { ...item, shelfQty: Math.max(0, item.shelfQty + delta) }
          : item,
      ),
    );
  }, []);

  const updateStoreQty = useCallback((code: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code
          ? { ...item, storeQty: Math.max(0, item.storeQty + delta) }
          : item,
      ),
    );
  }, []);

  // Numeric keypad
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<{ code: string; name: string; field: 'shelf' | 'store'; qty: number } | null>(null);

  const openKeypad = useCallback((code: string, name: string, field: 'shelf' | 'store', currentQty: number) => {
    setKeypadTarget({ code, name, field, qty: currentQty });
    setKeypadVisible(true);
  }, []);

  const toggleAvailable = useCallback((code: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.code === code
          ? { ...item, isAvailable: !item.isAvailable }
          : item,
      ),
    );
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (showMslOnly) {
      result = result.filter((i) => i.isMsl);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, search, showMslOnly]);

  const checkedItems = useMemo(
    () => items.filter((i) => i.shelfQty > 0 || i.storeQty > 0 || !i.isAvailable),
    [items],
  );

  const foodItems = useMemo(
    () => checkedItems.filter((i) => {
      const cat = i.category.toLowerCase();
      return cat.includes('makhana') || cat.includes('date') || cat.includes('seed') || cat.includes('nut') || cat.includes('food');
    }),
    [checkedItems],
  );

  const handleSave = async () => {
    if (checkedItems.length === 0) {
      Alert.alert('No Data', 'Record at least one item to save the store check.');
      return;
    }

    setSaving(true);
    const appId = uuidv4();
    const now = Date.now();

    try {
      await database.write(async () => {
        await database.get('store_checks').create((rec: any) => {
          rec._raw.id = appId;
          rec.appId = appId;
          rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode;
          rec.customerName = customerName;
          rec.visitCode = visitCode ?? null;
          rec.checkDate = now;
          rec.totalCount = checkedItems.length;
          rec.foodCount = foodItems.length;
          rec.nonFoodCount = checkedItems.length - foodItems.length;
          rec.status = 1;
          rec.isSynced = false;
        });

        for (const item of checkedItems) {
          await database.get('store_check_items').create((rec: any) => {
            rec._raw.id = `${appId}_${item.code}`;
            rec.storeCheckId = appId;
            rec.itemCode = item.code;
            rec.itemName = item.name;
            rec.categoryName = item.category;
            rec.brandName = item.brand;
            rec.shelfQuantity = item.shelfQty;
            rec.storeQuantity = item.storeQty;
            rec.isAvailable = item.isAvailable;
            rec.reason = item.isAvailable ? null : 'Out of stock';
          });
        }
      });

      pushSync().catch(() => {});
      Alert.alert(
        'Store Check Saved',
        `${checkedItems.length} items recorded`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to save store check.');
    } finally {
      setSaving(false);
    }
  };

  // Group by category
  const categories = useMemo(() => {
    const map = new Map<string, CheckItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).map(([category, categoryItems]) => ({
      category,
      data: categoryItems,
    }));
  }, [filteredItems]);

  const flatData: Array<
    { type: 'header'; category: string } | { type: 'item'; item: CheckItem }
  > = [];
  for (const cat of categories) {
    flatData.push({ type: 'header', category: cat.category });
    for (const item of cat.data) {
      flatData.push({ type: 'item', item });
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerCustomer} numberOfLines={1}>
              {customerName}
            </Text>
            <Text style={styles.headerSubtitle}>
              {checkedItems.length} items recorded
            </Text>
          </View>
          {/* MSL Toggle */}
          <TouchableOpacity
            style={[styles.mslToggle, showMslOnly && styles.mslToggleActive]}
            onPress={() => setShowMslOnly(!showMslOnly)}
            activeOpacity={0.7}
          >
            <Text style={[styles.mslToggleText, showMslOnly && styles.mslToggleTextActive]}>
              {showMslOnly ? 'MSL Only' : 'All Items'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      {customerCoords ? (
        <View style={styles.mapCard}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: customerCoords.lat,
              longitude: customerCoords.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            scrollEnabled={false}
            zoomEnabled={false}
          />
          <TouchableOpacity style={styles.navigateBtn} onPress={handleNavigate} activeOpacity={0.8}>
            <Icon name="navigate" size={16} color="#fff" />
            <Text style={styles.navigateBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {/* Items */}
      <FlatList
        data={flatData}
        keyExtractor={(item, idx) =>
          item.type === 'header' ? `hdr_${item.category}` : `item_${item.item.code}`
        }
        renderItem={({ item: row }) => {
          if (row.type === 'header') {
            return (
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryTitle}>{row.category}</Text>
              </View>
            );
          }
          const item = row.item;
          return (
            <View style={[styles.itemCard, !item.isAvailable && styles.itemCardUnavailable]}>
              <View style={styles.itemTop}>
                {item.imagePath ? (
                  <Image
                    source={{ uri: itemImageUrl(item.imagePath) ?? '' }}
                    style={styles.itemThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.itemThumbFallback, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={styles.itemThumbLetter}>
                      {(item.category ?? item.name)?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemCode}>{item.code}</Text>
                </View>
                <View style={styles.badgeRow}>
                  {item.isMsl && (
                    <View style={styles.mslBadge}>
                      <Text style={styles.mslBadgeText}>MSL</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.availBadge,
                      item.isAvailable ? styles.availYes : styles.availNo,
                    ]}
                    onPress={() => toggleAvailable(item.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.availText,
                      item.isAvailable ? styles.availTextYes : styles.availTextNo,
                    ]}>
                      {item.isAvailable ? 'In Stock' : 'Out'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {item.isAvailable && (
                <View style={styles.qtyRow}>
                  <View style={styles.qtyGroup}>
                    <Text style={styles.qtyLabel}>Shelf</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateShelfQty(item.code, -1)}
                      >
                        <Text style={styles.stepperBtnText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openKeypad(item.code, item.name, 'shelf', item.shelfQty)}>
                        <Text style={styles.stepperQty}>{item.shelfQty}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateShelfQty(item.code, 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.qtyGroup}>
                    <Text style={styles.qtyLabel}>Store</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateStoreQty(item.code, -1)}
                      >
                        <Text style={styles.stepperBtnText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openKeypad(item.code, item.name, 'store', item.storeQty)}>
                        <Text style={styles.stepperQty}>{item.storeQty}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateStoreQty(item.code, 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomItems}>
            {checkedItems.length} item{checkedItems.length !== 1 ? 's' : ''} recorded
          </Text>
          <Text style={styles.bottomSub}>
            {foodItems.length} food · {checkedItems.length - foodItems.length} non-food
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, checkedItems.length === 0 && styles.saveBtnDisabled]}
          activeOpacity={0.7}
          onPress={handleSave}
          disabled={saving || checkedItems.length === 0}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Numeric Keypad */}
      <NumericKeypad
        visible={keypadVisible}
        value={keypadTarget?.qty ?? 0}
        title={keypadTarget?.name ?? 'Enter Quantity'}
        subtitle={keypadTarget?.field === 'shelf' ? 'Shelf Quantity' : 'Store Quantity'}
        onConfirm={(val) => {
          if (keypadTarget) {
            setItems(prev => prev.map(item =>
              item.code === keypadTarget.code
                ? { ...item, [keypadTarget.field === 'shelf' ? 'shelfQty' : 'storeQty']: Math.max(0, val) }
                : item
            ));
          }
          setKeypadVisible(false);
        }}
        onClose={() => setKeypadVisible(false)}
      />
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
    backgroundColor: Colors.card,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  headerCustomer: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  mslToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mslToggleActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#1d4ed8',
  },
  mslToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  mslToggleTextActive: {
    color: '#1d4ed8',
  },
  mapCard: {
    height: 160,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  navigateBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.92)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  navigateBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.background,
  },
  searchInput: {
    height: 44,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  categoryHeader: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  itemCardUnavailable: {
    opacity: 0.6,
    backgroundColor: '#fef2f2',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.background,
    marginRight: 10,
  },
  itemThumbFallback: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemThumbLetter: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  itemCode: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  mslBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  mslBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },
  availBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  availYes: {
    backgroundColor: Colors.primaryLight,
  },
  availNo: {
    backgroundColor: '#fef2f2',
  },
  availText: {
    fontSize: 12,
    fontWeight: '600',
  },
  availTextYes: {
    color: Colors.primaryDark,
  },
  availTextNo: {
    color: Colors.danger,
  },
  qtyRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  qtyGroup: {
    flex: 1,
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 20,
    fontWeight: '500',
    color: Colors.primary,
  },
  stepperQty: {
    width: 36,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomInfo: {
    flex: 1,
  },
  bottomItems: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  bottomSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 28,
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
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
