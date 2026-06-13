import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Alert, Image, Dimensions, TextInput,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import database from '../db/database';
import { pushSync } from '../services/syncService';
import { ACTIVITY_SUBMITTED_EVENT } from '../services/restoreMyDay';
import { useBottomInset } from '../utils/safeBottom';
import NumericKeypad from '../components/common/NumericKeypad';
import StoreActivityHeader from '../components/common/StoreActivityHeader';

import { itemImageUrl } from '../config';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDEBAR_WIDTH = Math.round(SCREEN_WIDTH * 0.18);

type RouteParams = { OpeningStock: { customerCode: string; customerName: string; visitCode: string } };

interface StockItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  packSize: string;
  qty: number;
  isMsl: boolean;
  imagePath: string | null;
}

function extractPackSize(name: string): string {
  const match = name.match(/(\d+\s*[gGkKmMlL]+)/);
  return match ? match[1].trim() : '';
}

export default function OpeningStockScreen() {
  const route = useRoute<RouteProp<RouteParams, 'OpeningStock'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;
  const bottomInset = useBottomInset(16);

  const [items, setItems] = useState<StockItem[]>([]);
  const [mslItemCodes, setMslItemCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadItem, setKeypadItem] = useState<{ code: string; name: string; qty: number } | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const { clearDraft } = useActivityDrafts();
  const listRef = useRef<FlatList<StockItem>>(null);

  // Re-tryable loader. Retries on any of: items master empty, this
  // customer's row not synced yet, MSL master empty, or MSL has rows
  // for other chains but not this customer's chain yet. Up to ~12 s
  // total before accepting an empty list as the real answer.
  const loadItems = useCallback(async (attempt = 0) => {
    const MAX_ATTEMPTS = 8;
    const RETRY_MS = 1500;

    let allItems: any[] = await database.get('items').query(Q.where('is_active', true)).fetch();
    if (allItems.length === 0 && attempt < MAX_ATTEMPTS) {
      setTimeout(() => { loadItems(attempt + 1); }, RETRY_MS);
      return;
    }

    let mslCodes = new Set<string>();
    let needsRetry = false;
    try {
      const customers: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
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
    } catch (e) { console.warn("[App]", e); }

    if (needsRetry) {
      setTimeout(() => { loadItems(attempt + 1); }, RETRY_MS);
      return;
    }

    setMslItemCodes(mslCodes);

    // Load previously saved opening stock for today BEFORE filtering by
    // MSL so a customer like NST — whose chain MSL didn't include some
    // SKUs the rep already submitted opening stock for — still shows
    // those submitted quantities on revisit. Without this, an MSL diff
    // since the original submission silently dropped the saved rows.
    //
    // TODAY-only lookup so a changed day starts blank — the screen must not
    // pre-fill yesterday's quantities once the day rolls over. Two steps:
    //   1. (user_code, customer_code, stock_date=today) — the common case.
    //   2. (customer_code, stock_date=today)            — covers rows written
    //      with a blank user_code (the documented NST failure).
    // (A previous ±1-day step also pulled yesterday's stock to cover the rare
    // 00:00–05:30 IST UTC-rollover submit, but that re-showed yesterday's work
    // on a new day — the wrong trade-off now that a changed day must be fresh.)
    const todayStr = new Date().toISOString().split('T')[0];
    let savedStockMap = new Map<string, { qty: number; name?: string }>();
    let savedStocksFound = 0;
    let savedStocksSource: 'user+date' | 'date' | 'none' = 'none';
    try {
      let savedStocks: any[] = await database.get('opening_stocks').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
        Q.where('stock_date', todayStr),
      ).fetch();
      if (savedStocks.length > 0) savedStocksSource = 'user+date';
      if (savedStocks.length === 0) {
        savedStocks = await database.get('opening_stocks').query(
          Q.where('customer_code', customerCode),
          Q.where('stock_date', todayStr),
        ).fetch();
        if (savedStocks.length > 0) savedStocksSource = 'date';
      }
      savedStocksFound = savedStocks.length;
      for (const s of savedStocks) {
        const code = s.itemCode ?? s._raw?.item_code ?? '';
        if (!code) continue;
        const prev = savedStockMap.get(code);
        savedStockMap.set(code, {
          qty: (prev?.qty ?? 0) + (s.quantity ?? s._raw?.quantity ?? 0),
          name: prev?.name ?? s.itemName ?? s._raw?.item_name ?? undefined,
        });
      }
    } catch (e) { console.warn("[App]", e); }

    // Drop a single activity-log line per load so the next "opening stock
    // missing at NST" report ships diagnostic context (which fallback fired,
    // how many rows, what stock_date the screen was searching for) via the
    // Settings → Upload Debug Logs button. No PII beyond the existing log
    // payload.
    try {
      const { logActivity } = require('../services/activityLogger');
      logActivity({
        action: 'OPENING_STOCK_LOAD',
        status: 'success',
        module: 'opening_stock',
        customerCode,
        details: `revisit lookup: source=${savedStocksSource} found=${savedStocksFound} ` +
          `userCode=${user?.code ?? '(none)'} today=${todayStr} mslSize=${mslCodes.size}`,
      }).catch(() => {});
    } catch { /* logger optional */ }

    // Union: items in this chain's MSL  ∪  items the rep already submitted
    // opening stock for today. Order MSL items first, then saved-but-not-MSL
    // items at the end so the chain list reads naturally with the rep's
    // saved entries surfacing in the table.
    const visibleItemMap = new Map<string, any>();
    for (const i of allItems) {
      if (mslCodes.has(i.code) || savedStockMap.has(i.code)) visibleItemMap.set(i.code, i);
    }
    // Saved item codes that aren't in the items master at all (rare —
    // happens when a SKU is deactivated after submission) get rendered
    // from the stored name so the rep still sees their entry.
    for (const [code, info] of savedStockMap) {
      if (!visibleItemMap.has(code)) {
        visibleItemMap.set(code, {
          code,
          name: info.name ?? code,
          category: 'Other',
          brand: '',
          baseUom: 'EA',
          imagePath: null,
        });
      }
    }
    allItems = Array.from(visibleItemMap.values());

    const stockItems: StockItem[] = allItems.map((item: any) => ({
      code: item.code, name: item.name,
      category: item.category ?? 'Other', brand: item.brand ?? '',
      packSize: extractPackSize(item.name),
      qty: savedStockMap.get(item.code)?.qty ?? 0,
      isMsl: mslCodes.has(item.code), imagePath: item.imagePath ?? null,
    }));
    stockItems.sort((a, b) => {
      if (a.isMsl !== b.isMsl) return a.isMsl ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setItems(stockItems);
    setLoading(false);
  }, [customerCode]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // No draft persistence — quantities only survive a Back tap if the rep
  // has already tapped Submit (then the DB-load in loadItems above
  // restores them). One-shot clearDraft wipes any stale entry a previous
  // build wrote.
  useEffect(() => { clearDraft(customerCode, 'OpeningStock'); }, [customerCode, clearDraft]);

  // Categories from data
  const categories = useMemo(() => {
    const catSet = new Set(items.map((i) => i.category));
    return ['ALL', ...Array.from(catSet).sort()];
  }, [items]);

  // Items filtered by category
  const categoryFiltered = useMemo(() => {
    if (selectedCategory === 'ALL') return items;
    return items.filter((i) => i.category === selectedCategory);
  }, [items, selectedCategory]);

  // Sub-filters (MSL + pack sizes) — deduplicate by removing spaces and
  // lowercasing. The set is built from the FULL items list (not just the
  // category-filtered one) so the strip's chip set stays stable as the
  // rep flips between categories. Reps complained that picking 500g,
  // scrolling the strip, then switching to a different category reset
  // the chip set and "blanked" the strip; with the stable set the chip
  // stays selected and the horizontal scroll position doesn't reflow.
  const subFilters = useMemo(() => {
    const sizeMap = new Map<string, string>();
    items.forEach((i) => {
      if (i.packSize) {
        const key = i.packSize.replace(/\s+/g, '').toLowerCase();
        if (!sizeMap.has(key)) sizeMap.set(key, i.packSize.trim());
      }
    });
    const filters = ['ALL'];
    if (items.some(i => mslItemCodes.has(i.code))) filters.push('MSL');
    const uniqueSizes = Array.from(sizeMap.values()).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    filters.push(...uniqueSizes);
    return filters;
  }, [items, mslItemCodes]);

  // Final filtered items (category → sub-filter → search query)
  const filteredItems = useMemo(() => {
    let list = categoryFiltered;
    if (selectedSubFilter === 'MSL') list = list.filter((i) => mslItemCodes.has(i.code));
    else if (selectedSubFilter !== 'ALL') {
      list = list.filter((i) => i.packSize?.replace(/\s+/g, '').toLowerCase() === selectedSubFilter.replace(/\s+/g, '').toLowerCase());
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.brand ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [categoryFiltered, selectedSubFilter, mslItemCodes, searchQuery]);

  // Sub-filter is intentionally NOT reset on category change. The strip
  // shows the same chip set across categories (built from the full items
  // list above), so the rep's pick of e.g. 500g carries forward — the
  // grid below just narrows to items of that pack size in the newly
  // selected category. Reps reported the chip strip "blanking" / scrolling
  // away when the category changed; that was this reset firing.

  // When the floating keypad opens for an item, scroll the list so the
  // active row sits at the very top of the visible area — the keypad
  // covers ~half the screen, so anchoring the row just under the chip
  // bar keeps it well clear of the keypad. The contentContainerStyle
  // below adds matching bottom padding when the keypad is open, so
  // even the last products in the list can scroll up enough to clear
  // the keypad.
  useEffect(() => {
    if (!keypadVisible || !keypadItem) return;
    const idx = filteredItems.findIndex(it => it.code === keypadItem.code);
    if (idx < 0) return;
    const doScroll = () => {
      try { listRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true }); } catch {}
    };
    // Small delay lets the keypad's modal animation start so the list
    // re-renders with the extra paddingBottom before we scroll.
    requestAnimationFrame(doScroll);
    const t = setTimeout(doScroll, 250);
    return () => clearTimeout(t);
  }, [keypadVisible, keypadItem?.code, filteredItems]);

  const setQty = useCallback((code: string, qty: number) => {
    setItems(prev => prev.map(item => item.code === code ? { ...item, qty: Math.max(0, qty) } : item));
  }, []);

  const enteredItems = useMemo(() => items.filter(i => i.qty > 0), [items]);

  const handleSubmit = async () => {
    if (enteredItems.length === 0) {
      Alert.alert('Alert !', 'Please enter the stock quantity for at least one item before submitting.');
      return;
    }
    // Refuse the submit when the auth user isn't loaded — persisting with a
    // blank user_code is exactly the failure mode that produced the field
    // reports of "my opening stock disappeared at NST". The server-side
    // restore endpoints filter by user_code, so a blank-user_code row never
    // round-trips back on reinstall and the rep sees an empty list on
    // revisit. Better to bounce them to re-login than to lose the data.
    const userCode = user?.code;
    if (!userCode) {
      Alert.alert(
        'Session Issue',
        'Your login session has not fully loaded. Please go back to the home Dashboard and re-open this store, or sign out and sign in again before submitting opening stock.',
      );
      return;
    }
    setSaving(true);
    const stockDate = new Date().toISOString().split('T')[0];
    try {
      // Pre-fetch all existing rows for today in one query, then build a map
      // by item_code. This replaces N queries (one per entered item) with 1.
      const allExisting: any[] = await database.get('opening_stocks').query(
        Q.where('user_code', userCode),
        Q.where('customer_code', customerCode),
        Q.where('stock_date', stockDate),
      ).fetch();
      const existingMap = new Map<string, any>();
      for (const rec of allExisting) {
        const code = rec.itemCode ?? rec._raw?.item_code ?? '';
        if (code) existingMap.set(code, rec);
      }
      await database.write(async () => {
        for (const item of enteredItems) {
          const existing = existingMap.get(item.code);
          if (existing) {
            await existing.update((rec: any) => {
              rec.quantity = item.qty;
              rec.visitCode = visitCode;
              rec.isSynced = false;
            });
          } else {
            const id = uuidv4();
            await database.get('opening_stocks').create((rec: any) => {
              rec._raw.id = id; rec.appTrxId = id; rec.userCode = userCode;
              rec.customerCode = customerCode; rec.visitCode = visitCode;
              rec.itemCode = item.code; rec.itemName = item.name;
              rec.category = item.category; rec.brand = item.brand;
              rec.quantity = item.qty; rec.uom = 'EA'; rec.stockDate = stockDate; rec.isSynced = false;
            });
          }
        }
      });
      pushSync().catch(() => {});
      try { const { logStockSubmit } = require('../services/activityLogger'); logStockSubmit('opening', customerCode, enteredItems.length); } catch {}
      // Tell CustomerDashboard a submit just landed so its tile-completion
      // check re-runs and the green tick on the Opening Stock tile lights up
      // the moment the rep returns. Without this the tile relied on focus
      // alone, which raced WatermelonDB's writer queue on slow devices and
      // sometimes counted zero rows.
      DeviceEventEmitter.emit(ACTIVITY_SUBMITTED_EVENT);
      Alert.alert('Success', `Opening stock saved for ${enteredItems.length} items.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      try { const { logStockSubmit } = require('../services/activityLogger'); logStockSubmit('opening', customerCode, 0, 'failed'); } catch {}
      Alert.alert('Error', err?.message ?? 'Failed to save stock.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color="#1a56db" /></View>;

  return (
    <View style={st.container} testID="opening-stock-screen">
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Opening Stock" />

      {/* Search bar */}
      <View style={st.searchBar}>
        <Icon name="search" size={16} color="#9CA3AF" style={{ marginRight: 6 }} />
        <TextInput
          style={st.searchInput}
          placeholder="Search by item name, code or brand"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main: Sidebar + Products */}
      <View style={st.mainContent}>
        {/* Left Sidebar — Category Filter. Each tile renders the first
            product image in that category as a darkened background with
            the category name overlaid in white, so reps can recognise
            the category by its product visual instead of squinting at
            8-pt all-caps text. Falls back to the original flat tile
            when no item in the category has an image. */}
        <ScrollView style={st.sidebar} contentContainerStyle={st.sidebarContent} showsVerticalScrollIndicator={false}>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            const catItems = cat === 'ALL' ? items : items.filter((i) => i.category === cat);
            const catEnteredCount = catItems.filter((i) => i.qty > 0).length;
            const sample = catItems.find((i) => i.imagePath);
            const bgUrl = sample?.imagePath ? itemImageUrl(sample.imagePath) : null;
            return (
              <TouchableOpacity
                key={cat}
                style={[st.sidebarItem, isActive && st.sidebarItemActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                {bgUrl ? (
                  <View style={st.sidebarThumbWrap}>
                    <Image source={{ uri: bgUrl }} style={st.sidebarThumbImg} resizeMode="cover" />
                    <View style={st.sidebarThumbOverlay} />
                    <Text style={[st.sidebarTextOnImg, isActive && st.sidebarTextOnImgActive]} numberOfLines={2}>{cat}</Text>
                  </View>
                ) : (
                  <Text style={[st.sidebarText, isActive && st.sidebarTextActive]} numberOfLines={2}>{cat}</Text>
                )}
                {catEnteredCount > 0 && (
                  <View style={st.sidebarBadge}><Text style={st.sidebarBadgeText}>{catEnteredCount}</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Right — Sub-filter + Products */}
        <View style={st.productArea}>
          {/* Horizontal Sub-filter Chips */}
          <ScrollView horizontal style={st.chipBar} contentContainerStyle={st.chipBarContent} showsHorizontalScrollIndicator={false}>
            {subFilters.map((sf) => {
              const isActive = selectedSubFilter === sf;
              return (
                <TouchableOpacity key={sf} style={[st.chip, isActive && st.chipActive]} onPress={() => setSelectedSubFilter(sf)} activeOpacity={0.7}>
                  <Text style={[st.chipText, isActive && st.chipTextActive]}>{sf}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product List */}
          <FlatList
            ref={listRef}
            data={filteredItems}
            keyExtractor={item => item.code}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.05, animated: true });
              }, 80);
            }}
            renderItem={({ item }) => (
              <View style={[st.itemRow, keypadVisible && keypadItem?.code === item.code && st.itemRowSelected]}>
                <View style={st.itemContent}>
                  {item.imagePath ? (
                    <Image source={{ uri: itemImageUrl(item.imagePath) ?? '' }} style={st.itemThumb} resizeMode="cover" />
                  ) : (
                    <View style={st.itemThumbFallback}>
                      <Text style={st.itemThumbLetter}>{(item.category ?? item.name)?.[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  <View style={st.itemInfo}>
                    <Text style={st.itemName} numberOfLines={3}>{item.name}</Text>
                    <View style={st.itemTagRow}>
                      {item.packSize ? <Text style={st.itemPackSize}>{item.packSize}</Text> : null}
                      {mslItemCodes.has(item.code) && (
                        <View style={st.mslBadge}><Text style={st.mslBadgeText}>MSL</Text></View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[st.qtyBtn, (item.qty > 0 || (keypadVisible && keypadItem?.code === item.code)) && st.qtyBtnActive]}
                    onPress={() => { setKeypadItem({ code: item.code, name: item.name, qty: item.qty }); setKeypadVisible(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.qtyBtnText, (item.qty > 0 || (keypadVisible && keypadItem?.code === item.code)) && st.qtyBtnTextActive]}>{item.qty}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<View style={st.empty}><Text style={st.emptyText}>No products found</Text></View>}
            // When the floating keypad is open, pad the list with the
            // keypad's height (~440px) so even the last products can
            // scroll fully above the keypad. Without this, scrollToIndex
            // hits the end of the list and items near the bottom stay
            // hidden behind the keypad.
            contentContainerStyle={[st.productList, keypadVisible && { paddingBottom: 440 }]}
          />
        </View>
      </View>

      {/* Bottom Submit */}
      <View style={[st.bottomBar, { paddingBottom: bottomInset }]}>
        <View style={st.bottomInfo}>
          <Text style={st.bottomInfoText}>{enteredItems.length} items entered</Text>
        </View>
        <TouchableOpacity
          style={[st.submitBtn, enteredItems.length === 0 && { opacity: 0.5 }]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={saving || enteredItems.length === 0}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.submitText}>Submit</Text>}
        </TouchableOpacity>
      </View>

      <NumericKeypad
        visible={keypadVisible}
        value={keypadItem?.qty ?? 0}
        title={keypadItem?.name ?? 'Stock Qty'}
        subtitle="Enter opening stock quantity"
        onConfirm={(val) => { if (keypadItem) setQty(keypadItem.code, val); setKeypadVisible(false); }}
        onClose={() => setKeypadVisible(false)}
        // Live-update the row's qty box as the user types on the keypad so
        // the value shows in the qty square box without having to tap ✓.
        onChangeText={(display) => {
          if (!keypadItem) return;
          const n = parseInt(display, 10) || 0;
          setQty(keypadItem.code, n);
        }}
        // Next: save current row, advance to next product. Keypad stays open.
        onNext={(val) => {
          if (keypadItem) setQty(keypadItem.code, val);
          const currentIndex = filteredItems.findIndex(item => item.code === keypadItem?.code);
          if (currentIndex !== -1 && currentIndex < filteredItems.length - 1) {
            const nextItem = filteredItems[currentIndex + 1];
            setKeypadItem({ code: nextItem.code, name: nextItem.name, qty: nextItem.qty });
          } else {
            setKeypadVisible(false);
          }
        }}
        // Prev: save current row, move back to previous product.
        onPrev={(val) => {
          if (keypadItem) setQty(keypadItem.code, val);
          const currentIndex = filteredItems.findIndex(item => item.code === keypadItem?.code);
          if (currentIndex > 0) {
            const prevItem = filteredItems[currentIndex - 1];
            setKeypadItem({ code: prevItem.code, name: prevItem.name, qty: prevItem.qty });
          } else {
            setKeypadVisible(false);
          }
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1, fontSize: 13, color: '#111827', padding: 0,
  },

  // Main layout
  mainContent: { flex: 1, flexDirection: 'row' },

  // Left sidebar
  sidebar: { width: SIDEBAR_WIDTH, maxWidth: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: '#E5E7EB' },
  sidebarContent: { paddingVertical: 2 },
  sidebarItem: { paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sidebarItemActive: { backgroundColor: '#EFF6FF', borderLeftColor: '#1a56db' },
  sidebarText: { fontSize: 8, fontWeight: '700', color: '#6B7280', textAlign: 'center', textTransform: 'uppercase' },
  sidebarTextActive: { color: '#1e40af', fontWeight: '700' },
  sidebarBadge: { marginTop: 2, backgroundColor: '#1a56db', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  sidebarBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  // Category tile thumbnail. The image fills the tile; an overlay darkens
  // it slightly so the centered category label stays legible no matter
  // what colour the SKU photo behind it is. The label sits absolutely
  // positioned over both layers.
  sidebarThumbWrap: { width: '100%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden', position: 'relative', backgroundColor: '#1a3a8f' },
  sidebarThumbImg: { width: '100%', height: '100%' },
  // Reps reported the category tiles looked dull. Dropped the dimmer
  // overlay from 0.35 → 0.18 so the SKU photo behind the label reads
  // brighter — still enough darken to keep white text legible on light
  // packaging (the bumped text shadow below covers the rest).
  sidebarThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  sidebarTextOnImg: {
    position: 'absolute',
    left: 2, right: 2, top: 0, bottom: 0,
    textAlign: 'center', textAlignVertical: 'center',
    fontSize: 9, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase',
    // Stronger shadow (radius 5, fully opaque) compensates for the
    // lighter overlay so the label stays readable on white/cream
    // product photos where the SKU itself is near-white.
    textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  sidebarTextOnImgActive: { color: '#FDE68A' },

  // Right product area
  productArea: { flex: 1 },

  // Chip bar
  // The weight chips (e.g. "12 g", "58 g") must show the full "g" descender.
  // Give the bar a generous height cap and let the text render with Android's
  // default font padding (which reserves room for descenders) — DO NOT set
  // includeFontPadding:false here, that strips the descender space and made
  // the "g" look compressed/clipped. Extra chip paddingVertical adds room.
  chipBar: { maxHeight: 86, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  // FIXED-HEIGHT pill with the text vertically CENTERED. We deliberately do NOT
  // set lineHeight on chipText — an explicit lineHeight makes Android clip the
  // 'g'/'kg' descender inside the line box no matter how much padding the pill
  // has (the "200 g" → "200 ɑ" bug). With no lineHeight, includeFontPadding
  // reserves the descender as part of the glyph's natural height, and the tall
  // pill + center justification leaves clear room below it.
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  chipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151', includeFontPadding: true },
  chipTextActive: { color: '#FFFFFF' },

  // Product items
  productList: { paddingBottom: 80 },
  itemRow: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  // "Boxed" highlight when this product is the active keypad target —
  // mirrors the keypad's value-display field: white background with just
  // a thick blue border on all sides (no fill tint).
  itemRowSelected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1a56db',
    borderRadius: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#1a56db',
    marginHorizontal: 6,
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemInfo: { flex: 1, marginHorizontal: 8 },
  itemTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  // Per-item weight label (e.g. "500g", "15 kg"). Reserve room for the "g"/"kg"
  // descender explicitly (lineHeight + includeFontPadding:true) and give a bit
  // more vertical padding so the bottom of the letter is never clipped inside
  // the pill on Android. NEVER set includeFontPadding:false — that strips the
  // descender space.
  itemPackSize: { fontSize: 11, color: '#6B7280', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, lineHeight: 16, includeFontPadding: true },
  itemRowActive: { backgroundColor: '#EFF6FF' },
  itemThumb: { width: 34, height: 34, borderRadius: 6 },
  itemThumbFallback: { width: 34, height: 34, borderRadius: 6, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  itemThumbLetter: { fontSize: 13, fontWeight: '700', color: '#1a56db' },
  itemName: { fontSize: 11, fontWeight: '500', color: '#111827', lineHeight: 15 },
  mslBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6 },
  mslBadgeText: { fontSize: 9, fontWeight: '700', color: '#B45309' },
  qtyBtn: { width: 56, height: 34, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  qtyBtnActive: { borderColor: '#10B981', backgroundColor: '#FFFFFF' },
  qtyBtnText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
  qtyBtnTextActive: { color: '#059669' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, gap: 12,
  },
  bottomInfo: { flex: 1 },
  bottomInfoText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  submitBtn: { backgroundColor: '#1a3a8f', borderRadius: 10, height: 48, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
