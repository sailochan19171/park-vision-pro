import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Alert, Image, Dimensions, Modal, TextInput,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import database from '../db/database';
import { pushSync, uploadPhoto } from '../services/syncService';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition } from '../services/locationService';
import { reverseGeocode } from '../services/reverseGeocode';
import { useWatermark } from '../hooks/useWatermark';
import NumericKeypad from '../components/common/NumericKeypad';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import Icon from 'react-native-vector-icons/Ionicons';

import { itemImageUrl, API_BASE_URL } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDEBAR_WIDTH = Math.round(SCREEN_WIDTH * 0.18);

type RouteParams = { PhysicalStock: { customerCode: string; customerName: string; visitCode: string } };

interface StockItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  packSize: string;
  stockQty: number;
  physicalQty: number;
  isMsl: boolean;
  imagePath: string | null;
}

function extractPackSize(name: string): string {
  const match = name.match(/(\d+\s*[gGkKmMlL]+)/);
  return match ? match[1].trim() : '';
}

export default function PhysicalStockScreen() {
  const route = useRoute<RouteProp<RouteParams, 'PhysicalStock'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;

  const [items, setItems] = useState<StockItem[]>([]);
  const [mslItemCodes, setMslItemCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadTarget, setKeypadTarget] = useState<{ code: string; name: string; field: 'stock' | 'physical'; qty: number } | null>(null);
  const { clearDraft } = useActivityDrafts();
  const listRef = useRef<FlatList<StockItem>>(null);
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Flips to true once handleSubmit succeeds so the captured photo locks
  // — the trash icon disappears and the strip becomes read-only. Without
  // this the rep could still tap delete on a photo that the server already
  // has, which is confusing (the row stays submitted on the DB, only the
  // local state clears). The screen pops via navigation.goBack() right
  // after, so the flag is short-lived; it just hides the icon for the
  // brief window between the database.write resolving and the alert
  // dismissing.
  const [submitted, setSubmitted] = useState(false);
  const [photoTs, setPhotoTs] = useState<number | null>(null);
  const [photoLat, setPhotoLat] = useState<number | null>(null);
  const [photoLng, setPhotoLng] = useState<number | null>(null);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [photoAddress, setPhotoAddress] = useState<string | null>(null);

  // Lazy reverse-geocode when the preview opens — show address alongside
  // lat/lng/timestamp so the user (and admin reviewing the photo later)
  // gets context beyond raw coordinates.
  useEffect(() => {
    if (!showPhotoPreview) return;
    if (photoAddress) return;
    if (photoLat == null || photoLng == null) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = await reverseGeocode(photoLat, photoLng);
        if (!cancelled && addr) setPhotoAddress(addr);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPhotoPreview]);

  // Re-tryable loader. Field reports said products were missing on the
  // first click for some users/customers and appeared on a back-and-
  // forward retry. Root cause is a cold-cache race: the screen mounts
  // before one of (items master, this customer's row, MSL master, MSL
  // rows for this chain) finishes syncing. The previous version only
  // retried when selling_skus was entirely empty, which missed the
  // partial-sync case where MSL has rows for chain A but not chain B.
  // Now we retry on any of those conditions, up to ~12 s total.
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
        // Customer master hasn't reached this code yet.
        needsRetry = true;
      } else {
        const custGroup = customers[0]?.priceList ?? customers[0]?.customerGroup ?? '';
        const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');
        const normalizedGroup = normalize(custGroup);
        const allMsl: any[] = await database.get('selling_skus').query().fetch();
        if (allMsl.length === 0 && attempt < MAX_ATTEMPTS) {
          // MSL master entirely empty — still mid-sync.
          needsRetry = true;
        } else {
          for (const r of allMsl) {
            if (normalize(r.groupCode ?? '') === normalizedGroup) mslCodes.add(r.itemCode);
          }
          // MSL has rows for OTHER chains but not this customer's chain.
          // Likely sync hasn't covered this group yet (~3 first retries),
          // after which we accept it as a genuine empty MSL for the chain.
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
    // Strict chain filter: only items in this chain's MSL.
    allItems = allItems.filter((i: any) => mslCodes.has(i.code));

    // Load previously saved physical stock for today (both system & physical qty)
    const todayStr = new Date().toISOString().split('T')[0];
    const savedMap = new Map<string, { systemQty: number; physicalQty: number }>();
    try {
      const savedRecords: any[] = await database.get('physical_stocks').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
        // Scope to the CURRENT visit/shift — each Start Day → check-in mints a
        // fresh visit_code, so a new shift (even on the same calendar date after
        // End Day / auto-EOD) starts blank instead of prefilling the previous
        // shift's quantities + photo. Fall back to today if there's no visit.
        visitCode ? Q.where('visit_code', visitCode) : Q.where('stock_date', todayStr),
      ).fetch();
      let restoredPhoto: string | null = null;
      for (const s of savedRecords) {
        const code = s.itemCode ?? s._raw?.item_code ?? '';
        savedMap.set(code, {
          systemQty: s.systemQty ?? s._raw?.system_qty ?? 0,
          physicalQty: s.physicalQty ?? s._raw?.physical_qty ?? 0,
        });
        // Surface the previously-captured photo. The image lives on every
        // restored row's image_path (carried from the server header). After a
        // reinstall the original local file is gone, so only a server-hosted
        // URL (http / "/public") is usable — prefix "/public" with the API base.
        if (!restoredPhoto) {
          const img = s.imagePath ?? s._raw?.image_path ?? null;
          if (img) {
            restoredPhoto = img.startsWith('http')
              ? img
              : (img.startsWith('/public') ? `${API_BASE_URL}${img}` : null);
          }
        }
      }
      if (restoredPhoto) {
        setPhotoUri(restoredPhoto);
        // Already submitted — lock the strip (no delete) since the server has it.
        setSubmitted(true);
      }
    } catch (e) { console.warn("[App]", e); }

    // Physical Stock is independent of Opening Stock. Stock Qty here refers
    // to the system/ERP stock shown to the rep for reconciliation, NOT what
    // the user entered earlier in the Opening Stock screen. Only previously
    // submitted physical_stocks values are pre-filled on re-entry.

    const stockItems: StockItem[] = allItems.map((item: any) => {
      const saved = savedMap.get(item.code);
      const stockQty = saved?.systemQty ?? 0;
      return {
        code: item.code, name: item.name,
        category: item.category ?? 'Other', brand: item.brand ?? '',
        packSize: extractPackSize(item.name),
        stockQty,
        physicalQty: saved?.physicalQty ?? 0,
        isMsl: mslCodes.has(item.code), imagePath: item.imagePath ?? null,
      };
    });
    stockItems.sort((a, b) => {
      if (a.isMsl !== b.isMsl) return a.isMsl ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setItems(stockItems);
    setLoading(false);
  }, [customerCode]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // No draft persistence — quantities and the photo only survive a Back
  // tap if the rep has tapped Submit (DB-load in loadItems brings them
  // back from physical_stocks). One-shot clearDraft wipes any stale
  // entry a previous build wrote so the first launch starts clean.
  useEffect(() => { clearDraft(customerCode, 'PhysicalStock'); }, [customerCode, clearDraft]);

  const handleCapturePhoto = async () => {
    try {
      const photo = await capturePhoto(false);
      if (photo) {
        // photo can be string or {uri} depending on the camera service
        const uri = typeof photo === 'string' ? photo : photo.uri;
        let lat: number | null = null, lng: number | null = null;
        try {
          const pos = await getCurrentPosition(true);
          if (pos) { lat = pos.lat; lng = pos.lng; }
        } catch (e) { console.warn("[App]", e); }
        
        const ts = Date.now();
        const stampedUri = await burnWatermark(uri, ts, lat, lng);
        setPhotoUri(stampedUri);
        setPhotoTs(ts);
        setPhotoLat(lat);
        setPhotoLng(lng);
      } else {
        Alert.alert('Camera', 'Photo capture failed. Please try again.');
      }
    } catch {
      Alert.alert('Camera Error', 'Unable to access camera. Please check camera permissions.');
    }
  };

  // Categories
  const categories = useMemo(() => {
    const catSet = new Set(items.map((i) => i.category));
    return ['ALL', ...Array.from(catSet).sort()];
  }, [items]);

  const categoryFiltered = useMemo(() => {
    if (selectedCategory === 'ALL') return items;
    return items.filter((i) => i.category === selectedCategory);
  }, [items, selectedCategory]);

  // Sub-filter chip set is built from the FULL items list — not the
  // category-filtered slice — so the strip stays stable as the rep flips
  // between categories. A 500g chip selected before tapping a new
  // category remains visible and selected, and the grid below just
  // narrows to 500g items inside the new category. Mirrors the same fix
  // in OpeningStockScreen; reps were seeing the chip strip "blank" when
  // they switched category because the chip set rebuilt from scratch.
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
    filters.push(...Array.from(sizeMap.values()).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)));
    return filters;
  }, [items, mslItemCodes]);

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

  // Sub-filter intentionally persists across category changes — see the
  // matching comment in OpeningStockScreen. The chip set is stable
  // (computed from the full items list), so the rep's pick carries
  // forward and the grid below just narrows to that pack size in the
  // newly chosen category.

  // Scroll the FlatList so the active product row is anchored at the
  // very top of the visible area — the floating keypad covers roughly
  // the bottom half of the screen, so anchoring just under the chip bar
  // keeps the row well clear of the keypad. The list also gets matching
  // extra bottom padding while the keypad is open (see contentContainer
  // below) so even the last few products can scroll up enough.
  useEffect(() => {
    if (!keypadVisible || !keypadTarget) return;
    const idx = filteredItems.findIndex(it => it.code === keypadTarget.code);
    if (idx < 0) return;
    const doScroll = () => {
      try { listRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true }); } catch {}
    };
    requestAnimationFrame(doScroll);
    const t = setTimeout(doScroll, 250);
    return () => clearTimeout(t);
  }, [keypadVisible, keypadTarget?.code, filteredItems]);

  const enteredItems = useMemo(() => items.filter(i => i.stockQty > 0 || i.physicalQty > 0), [items]);

  const handleSubmit = async () => {
    if (enteredItems.length === 0) {
      Alert.alert('Alert !', 'Please enter the stock quantity or physical quantity for at least one item before submitting.');
      return;
    }
    // Photo is mandatory — a physical stock submission without a photo leaves
    // the record with no image, which is why the completion (green tick) didn't
    // show. Block submit until a photo is captured.
    if (!photoUri) {
      Alert.alert('Photo Required', 'Please capture a photo before submitting physical stock.');
      return;
    }
    setSaving(true);
    const stockDate = new Date().toISOString().split('T')[0];
    try {
      // Best-effort upload now to skip the push-time upload on success, but
      // always fall back to persisting the LOCAL URI on the record. pushSync's
      // physical_stocks branch re-runs uploadPhoto at push time (mirroring
      // OSOI / PO / store-check) so a save-time upload failure isn't fatal —
      // the photo gets uploaded on the next sync tick instead of being lost.
      let finalPhotoUrl: string | null = null;
      if (photoUri) {
        try {
          const uploaded = await uploadPhoto(photoUri, 'physical-stock');
          finalPhotoUrl = uploaded ?? photoUri;
        } catch (e) {
          console.warn('[PhysicalStock] Photo upload failed at save, will retry on push:', e);
          finalPhotoUrl = photoUri;
        }
      }
      const serverPhotoUrl = finalPhotoUrl;

      // Pre-fetch all existing rows for today in one query, then build a map
      // by item_code. Replaces N queries (one per entered item) with 1.
      const allExisting: any[] = await database.get('physical_stocks').query(
        Q.where('user_code', user?.code ?? ''),
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
              rec.systemQty = item.stockQty; rec.physicalQty = item.physicalQty;
              rec.visitCode = visitCode; rec.isSynced = false;
              if (serverPhotoUrl) rec.imagePath = serverPhotoUrl;
              if (photoTs) rec.capturedOn = photoTs;
              if (photoLat != null) rec.geoLat = photoLat;
              if (photoLng != null) rec.geoLng = photoLng;
            });
          } else {
            const id = uuidv4();
            await database.get('physical_stocks').create((rec: any) => {
              rec._raw.id = id; rec.appTrxId = id; rec.userCode = user?.code ?? '';
              rec.customerCode = customerCode; rec.visitCode = visitCode;
              rec.itemCode = item.code; rec.itemName = item.name;
              rec.category = item.category; rec.brand = item.brand;
              rec.systemQty = item.stockQty; rec.physicalQty = item.physicalQty;
              rec.uom = 'EA'; rec.stockDate = stockDate; rec.isSynced = false;
              if (serverPhotoUrl) rec.imagePath = serverPhotoUrl;
              if (photoTs) rec.capturedOn = photoTs;
              if (photoLat != null) rec.geoLat = photoLat;
              if (photoLng != null) rec.geoLng = photoLng;
            });
          }
        }
      });
      pushSync().catch(() => {});
      try { const { logStockSubmit } = require('../services/activityLogger'); logStockSubmit('physical', customerCode, enteredItems.length); } catch {}
      // Lock the captured photo + qty rows from edits the moment the write
      // succeeds. The screen pops on alert OK so the flag's effect is
      // brief, but it removes the small race where the rep could still
      // tap "delete photo" between submit success and the alert dismiss.
      setSubmitted(true);
      Alert.alert('Success', `Physical stock saved for ${enteredItems.length} items.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      try { const { logStockSubmit } = require('../services/activityLogger'); logStockSubmit('physical', customerCode, 0, 'failed'); } catch {}
      Alert.alert('Error', err?.message ?? 'Failed to save.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color="#1a56db" /></View>;

  return (
    <View style={st.container} testID="physical-stock-screen">
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Physical Stock"
        rightElement={
          <TouchableOpacity style={st.cameraIconBtn} onPress={handleCapturePhoto} activeOpacity={0.7}>
            <Icon name="camera-outline" size={18} color={photoUri ? '#16A34A' : '#1a3178'} />
          </TouchableOpacity>
        }
      />

      {/* Photo preview strip — below the header, not crammed in the corner */}
      {photoUri && (
        <View style={st.photoStrip}>
          <TouchableOpacity
            onPress={() => setShowPhotoPreview(true)}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          >
            <Image source={{ uri: photoUri }} style={st.photoStripThumb} resizeMode="cover" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>Photo captured</Text>
              {photoTs ? (
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  {new Date(photoTs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {photoLat != null && photoLng != null ? `  ·  ${photoLat.toFixed(4)}, ${photoLng.toFixed(4)}` : ''}
                </Text>
              ) : (
                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Tap to view</Text>
              )}
            </View>
          </TouchableOpacity>
          {/* Black delete icon beside the strip — only rendered before the
              row has been submitted. Once Submit succeeds the photo is
              committed and the trash icon disappears so the rep can't
              tap it to clear local state while the server still has the
              capture. */}
          {!submitted && (
            <TouchableOpacity
              onPress={() => { setPhotoUri(null); setPhotoTs(null); setPhotoLat(null); setPhotoLng(null); setPhotoAddress(null); }}
              style={st.photoStripDeleteBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="trash-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      )}

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

      <View style={st.mainContent}>
        {/* Left Sidebar — mirrors OpeningStockScreen: each tile shows the
            first product image in that category as a darkened background
            with the category name overlaid in white. Reps recognise the
            category visually instead of squinting at 8-pt all-caps. */}
        <ScrollView style={st.sidebar} contentContainerStyle={st.sidebarContent} showsVerticalScrollIndicator={false}>
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            const catItems = cat === 'ALL' ? items : items.filter((i) => i.category === cat);
            const catEnteredCount = catItems.filter((i) => i.stockQty > 0 || i.physicalQty > 0).length;
            const sample = catItems.find((i) => i.imagePath);
            const bgUrl = sample?.imagePath ? itemImageUrl(sample.imagePath) : null;
            return (
              <TouchableOpacity key={cat} style={[st.sidebarItem, isActive && st.sidebarItemActive]} onPress={() => setSelectedCategory(cat)} activeOpacity={0.7}>
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

        {/* Right — Chips + Products */}
        <View style={st.productArea}>
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
              <View style={[st.itemRow, keypadVisible && keypadTarget?.code === item.code && st.itemRowSelected]}>
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
                  <View style={st.qtyRow}>
                    <TouchableOpacity
                      style={[st.qtyBtn, (item.stockQty > 0 || (keypadVisible && keypadTarget?.code === item.code && keypadTarget?.field === 'stock')) && st.qtyBtnActive]}
                      onPress={() => { setKeypadTarget({ code: item.code, name: item.name, field: 'stock', qty: item.stockQty }); setKeypadVisible(true); }}
                      activeOpacity={0.7}
                    >
                      <Text style={st.qtyLabel}>Stk</Text>
                      <Text style={[st.qtyBtnText, (item.stockQty > 0 || (keypadVisible && keypadTarget?.code === item.code && keypadTarget?.field === 'stock')) && st.qtyBtnTextActive]}>{item.stockQty}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.qtyBtn, (item.physicalQty > 0 || (keypadVisible && keypadTarget?.code === item.code && keypadTarget?.field === 'physical')) && st.qtyBtnPhysicalActive]}
                      onPress={() => { setKeypadTarget({ code: item.code, name: item.name, field: 'physical', qty: item.physicalQty }); setKeypadVisible(true); }}
                      activeOpacity={0.7}
                    >
                      <Text style={st.qtyLabel}>Phy</Text>
                      <Text style={[st.qtyBtnText, (item.physicalQty > 0 || (keypadVisible && keypadTarget?.code === item.code && keypadTarget?.field === 'physical')) && st.qtyBtnTextPhysicalActive]}>{item.physicalQty}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={<View style={st.empty}><Text style={st.emptyText}>No products found</Text></View>}
            // Extra bottom padding while the keypad is open lets the
            // last products scroll fully above the keypad — otherwise
            // scrollToIndex hits the end of the list and items near the
            // bottom stay hidden behind the keypad.
            contentContainerStyle={[st.productList, keypadVisible && { paddingBottom: 440 }]}
          />
        </View>
      </View>

      {/* Bottom */}
      <View style={st.bottomBar}>
        <View style={st.bottomInfo}><Text style={st.bottomInfoText}>{enteredItems.length} items entered</Text></View>
        <TouchableOpacity
          style={[st.submitBtn, enteredItems.length === 0 && { opacity: 0.5 }]}
          onPress={handleSubmit} activeOpacity={0.8}
          disabled={saving || enteredItems.length === 0}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.submitText}>Submit</Text>}
        </TouchableOpacity>
      </View>

      <NumericKeypad
        visible={keypadVisible}
        value={keypadTarget?.qty ?? 0}
        title={keypadTarget?.name ?? 'Qty'}
        subtitle={keypadTarget?.field === 'stock' ? 'Stock Quantity' : 'Physical Quantity'}
        onConfirm={(val) => {
          if (keypadTarget) {
            setItems(prev => prev.map(item =>
              item.code === keypadTarget.code
                ? { ...item, [keypadTarget.field === 'stock' ? 'stockQty' : 'physicalQty']: Math.max(0, val) }
                : item
            ));
          }
          setKeypadVisible(false);
        }}
        onClose={() => setKeypadVisible(false)}
        // Live-update the row's qty box as the user types on the keypad.
        onChangeText={(display) => {
          if (!keypadTarget) return;
          const n = Math.max(0, parseInt(display, 10) || 0);
          const fieldKey = keypadTarget.field === 'stock' ? 'stockQty' : 'physicalQty';
          setItems(prev => prev.map(item =>
            item.code === keypadTarget.code ? { ...item, [fieldKey]: n } : item
          ));
        }}
        // Next: horizontal advance. stock -> physical in the SAME row.
        // physical -> stock of the NEXT row. Keypad stays open.
        onNext={(val) => {
          if (!keypadTarget) { setKeypadVisible(false); return; }
          const fieldKey = keypadTarget.field === 'stock' ? 'stockQty' : 'physicalQty';
          // Save current value
          setItems(prev => prev.map(item =>
            item.code === keypadTarget.code ? { ...item, [fieldKey]: Math.max(0, val) } : item
          ));
          if (keypadTarget.field === 'stock') {
            // Same row, jump to Physical Qty.
            const cur = filteredItems.find(it => it.code === keypadTarget.code);
            setKeypadTarget({ code: keypadTarget.code, name: keypadTarget.name, field: 'physical', qty: cur?.physicalQty ?? 0 });
          } else {
            // physical -> next row's Stock Qty.
            const currentIndex = filteredItems.findIndex(it => it.code === keypadTarget.code);
            if (currentIndex !== -1 && currentIndex < filteredItems.length - 1) {
              const nextItem = filteredItems[currentIndex + 1];
              setKeypadTarget({ code: nextItem.code, name: nextItem.name, field: 'stock', qty: nextItem.stockQty });
            } else {
              setKeypadVisible(false);
            }
          }
        }}
        // Prev: reverse of Next. physical -> stock in same row.
        // stock -> previous row's Physical Qty.
        onPrev={(val) => {
          if (!keypadTarget) { setKeypadVisible(false); return; }
          const fieldKey = keypadTarget.field === 'stock' ? 'stockQty' : 'physicalQty';
          setItems(prev => prev.map(item =>
            item.code === keypadTarget.code ? { ...item, [fieldKey]: Math.max(0, val) } : item
          ));
          if (keypadTarget.field === 'physical') {
            const cur = filteredItems.find(it => it.code === keypadTarget.code);
            setKeypadTarget({ code: keypadTarget.code, name: keypadTarget.name, field: 'stock', qty: cur?.stockQty ?? 0 });
          } else {
            const currentIndex = filteredItems.findIndex(it => it.code === keypadTarget.code);
            if (currentIndex > 0) {
              const prevItem = filteredItems[currentIndex - 1];
              setKeypadTarget({ code: prevItem.code, name: prevItem.name, field: 'physical', qty: prevItem.physicalQty });
            } else {
              setKeypadVisible(false);
            }
          }
        }}
      />

      {/* Full-screen Photo Preview */}
      {showPhotoPreview && photoUri && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPhotoPreview(false)}>
          <View style={st.previewOverlay}>
            {/* Photo — fills available space between top padding and buttons.
                The lat/lng/timestamp/address are burned into the JPG itself
                by the useWatermark hook, so we don't render the separate
                info strip below the image anymore — it was duplicating the
                same data and stealing screen real estate from the photo. */}
            <Image source={{ uri: photoUri }} style={st.previewImage} resizeMode="contain" />

            {/* Action buttons — Retake removed per UX rework. Delete only
                shows before submit; once the row is committed the photo
                is locked and the preview offers Close only. */}
            <View style={st.previewBtnRow}>
              {!submitted && (
                <TouchableOpacity style={st.previewDeleteBtn} onPress={() => { setPhotoUri(null); setPhotoTs(null); setPhotoLat(null); setPhotoLng(null); setPhotoAddress(null); setShowPhotoPreview(false); }} activeOpacity={0.8}>
                  <Icon name="trash-outline" size={18} color="#FFF" />
                  <Text style={st.previewRetakeText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={st.previewCloseBtn} onPress={() => setShowPhotoPreview(false)} activeOpacity={0.8}>
                <Icon name="close" size={18} color="#FFF" />
                <Text style={st.previewRetakeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      <WatermarkRenderer />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainContent: { flex: 1, flexDirection: 'row' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1, fontSize: 13, color: '#111827', padding: 0,
  },

  sidebar: { width: SIDEBAR_WIDTH, maxWidth: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: '#E5E7EB' },
  sidebarContent: { paddingVertical: 2 },
  sidebarItem: { paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sidebarItemActive: { backgroundColor: '#EFF6FF', borderLeftColor: '#1a56db' },
  sidebarText: { fontSize: 8, fontWeight: '700', color: '#6B7280', textAlign: 'center', textTransform: 'uppercase' },
  sidebarTextActive: { color: '#1e40af', fontWeight: '700' },
  sidebarBadge: { marginTop: 2, backgroundColor: '#1a56db', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  sidebarBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  // Category tile thumbnail — same pattern as OpeningStockScreen. Image
  // fills the tile, dark overlay keeps the white label legible, label
  // sits absolutely positioned over both.
  sidebarThumbWrap: { width: '100%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden', position: 'relative', backgroundColor: '#1a3a8f' },
  sidebarThumbImg: { width: '100%', height: '100%' },
  // Same brightness tweak as OpeningStockScreen — overlay 0.35 → 0.18
  // for crisper-looking category tiles, stronger text shadow keeps the
  // white label readable on light SKU photos.
  sidebarThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  sidebarTextOnImg: {
    position: 'absolute',
    left: 2, right: 2, top: 0, bottom: 0,
    textAlign: 'center', textAlignVertical: 'center',
    fontSize: 9, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  sidebarTextOnImgActive: { color: '#FDE68A' },

  productArea: { flex: 1 },
  // The weight chips (e.g. "12 g", "200 g") must show the full "g" descender.
  // Match OpeningStock's descender-safe values: a generous height cap + extra
  // chip paddingVertical so Android's default font padding has room. The old
  // maxHeight:48 / paddingVertical:6 clipped the bottom of the "g".
  chipBar: { maxHeight: 86, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  // FIXED-HEIGHT pill with the text vertically CENTERED. No explicit lineHeight
  // on chipText — that makes Android clip the 'g'/'kg' descender inside the line
  // box regardless of pill padding. includeFontPadding reserves the descender as
  // part of the glyph's natural height; the tall pill + centering leaves room.
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  chipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#374151', includeFontPadding: true },
  chipTextActive: { color: '#FFFFFF' },

  productList: { paddingBottom: 80 },
  itemRow: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  // Full-row blue highlight when this product is the active keypad target.
  // The two qty boxes inside keep their own green-active styling so the
  // user can still see WHICH field is being edited within the highlighted row.
  // "Boxed" highlight — mirrors the keypad's value-display field: white
  // background with just a thick blue border on all sides (no fill tint),
  // so the row reads as a "selected input" rather than a coloured strip.
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
  itemRowActive: { backgroundColor: '#EFF6FF' },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemInfo: { flex: 1, marginHorizontal: 8 },
  itemTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  // Reserve room for the "g"/"kg" descender explicitly (lineHeight +
  // includeFontPadding:true) plus a bit more vertical padding so the bottom of
  // the letter is never clipped inside the pill on Android. NEVER set
  // includeFontPadding:false / overflow:hidden — those strip the descender.
  itemPackSize: { fontSize: 10, color: '#6B7280', backgroundColor: '#F3F4F6', paddingHorizontal: 5, paddingVertical: 4, borderRadius: 4, lineHeight: 15, includeFontPadding: true },
  itemThumb: { width: 36, height: 36, borderRadius: 6, marginRight: 8 },
  itemThumbFallback: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  itemThumbLetter: { fontSize: 14, fontWeight: '700', color: '#1a56db' },
  itemName: { fontSize: 11, fontWeight: '500', color: '#111827', lineHeight: 15 },
  mslBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 6 },
  mslBadgeText: { fontSize: 9, fontWeight: '700', color: '#B45309' },
  qtyRow: { flexDirection: 'row', gap: 8 },
  qtyBtn: { width: 50, height: 38, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  qtyBtnActive: { borderColor: '#10B981', backgroundColor: '#FFFFFF' },
  qtyBtnPhysicalActive: { borderColor: '#10B981', backgroundColor: '#FFFFFF' },
  qtyLabel: { fontSize: 8, fontWeight: '700', color: '#9CA3AF', marginBottom: 1 },
  qtyBtnText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  qtyBtnTextActive: { color: '#059669' },
  qtyBtnTextPhysicalActive: { color: '#059669' },

  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  cameraIconBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#1a3178',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF',
  },
  photoStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  photoStripThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#E5E7EB' },
  photoStripDeleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },

  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  previewImage: { width: '100%', flex: 1 },
  previewBtnRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'center' },
  previewRetakeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a3178', paddingVertical: 12, borderRadius: 10 },
  previewDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#111827', paddingVertical: 12, borderRadius: 10 },
  previewCloseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#374151', paddingVertical: 12, borderRadius: 10 },
  previewRetakeText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

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
