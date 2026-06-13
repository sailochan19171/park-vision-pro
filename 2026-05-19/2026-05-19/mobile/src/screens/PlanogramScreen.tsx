import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Platform, ActivityIndicator, Modal, Image, DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition } from '../services/locationService';
import { useWatermark } from '../hooks/useWatermark';
import { pushSync } from '../services/syncService';
import { ACTIVITY_SUBMITTED_EVENT } from '../services/restoreMyDay';
import { verifyUserActiveNow, verifyCustomerStillActive } from '../services/realtimeSync';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import PhotoThumbnail from '../components/common/PhotoThumbnail';
import ApprovalBadge from '../components/common/ApprovalBadge';
import api from '../api/client';
import { API_BASE_URL } from '../config';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

type RouteParams = { Planogram: { customerCode: string; customerName: string; visitCode?: string; targetDate?: number; preselectAssetType?: string } };

const ASSET_TYPES = [
  'Shelf - Top', 'Shelf - Eye Level', 'Shelf - Middle', 'Shelf - Bottom',
  'End Cap', 'Gondola', 'Chiller/Fridge', 'Floor Display', 'Counter', 'Other',
];

interface CapturedAsset {
  id: string;
  assetType: string;
  imageUri: string;
  timestamp: number;
  latitude: number | null;
  longitude: number | null;
  submitted?: boolean;
  approvalStatus?: string | null;
}

// Small helper so the recommended-image cell in the history table can
// fall back to "No image" when the server-hosted setup image fails to
// load (bad URL, deleted asset, or offline). Without onError the cell
// was just blank — QA reported "recommended image are not visible."
function RecImg({ uri, onPress }: { uri: string; onPress: () => void }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <View style={s.rowNoImg}><Text style={s.rowNoImgText}>No image</Text></View>;
  return (
    <TouchableOpacity style={s.rowImgBox} activeOpacity={0.85} onPress={onPress}>
      <Image
        source={{ uri }}
        style={{ width: 88, height: 70, borderRadius: 8 }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </TouchableOpacity>
  );
}

export default function PlanogramScreen() {
  const route = useRoute<RouteProp<RouteParams, 'Planogram'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode, targetDate, preselectAssetType } = route.params;
  const isHistory = !!targetDate;
  // Re-execute mode: opened from a rejected planogram. Pre-binds the asset
  // type and starts with a clean capture (no prior photo loaded).
  const isReExecute = !!preselectAssetType;
  const { clearDraft } = useActivityDrafts();
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);

  const [selectedType, setSelectedType] = useState(preselectAssetType ?? '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [assets, setAssets] = useState<CapturedAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Full-screen viewer for the recommended planogram image. Tapping the
  // thumbnail opens it; tap anywhere or the close button to dismiss.
  const [recommendedFullScreen, setRecommendedFullScreen] = useState<string | null>(null);
  type Setup = { suggestedImage: string | null; instructions: string | null; categoryName: string | null; assetType: string | null; shareOfShelfCm: number; matchType: 'Customer' | 'SubChannel' | 'Classification' };
  const [setups, setSetups] = useState<Setup[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<FlatList<Setup> | null>(null);
  // Reentrancy guards — stop rapid-tap crashes / duplicate camera launches.
  const busyRef = useRef(false);
  const submittingRef = useRef(false);

  // Fetch planogram setups for this customer with priority fallback:
  //   1. Customer        — selection_value = customerCode  (most specific)
  //   2. SubChannel      — selection_value = customer.customer_group  (e.g. 'GT')
  //   3. Classification  — selection_value = customer.channel_code
  // We collect every match across these scopes (most-specific first) so the
  // user sees a horizontal carousel of all relevant reference images.
  useEffect(() => {
    (async () => {
      try {
        // Pull the customer's grouping fields needed for SubChannel /
        // Classification lookups. Mobile only stores customer_group +
        // channel_code locally (no separate sub_channel / classification
        // columns), so we use those as the SubChannel / Classification keys.
        const cust: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        const c = cust[0];
        const customerGroup = (c?._raw?.customer_group ?? c?.customerGroup ?? '') as string;
        const channelCode  = (c?._raw?.channel_code  ?? c?.channelCode  ?? '') as string;

        const merged: Setup[] = [];
        const seen = new Set<string>();
        const addRow = (m: any, matchType: Setup['matchType']) => {
          const key = `${matchType}:${(m._raw?.server_id ?? m.serverId ?? m.id ?? '')}:${m._raw?.suggested_image ?? m.suggestedImage ?? ''}`;
          if (seen.has(key)) return;
          seen.add(key);
          merged.push({
            suggestedImage: m._raw?.suggested_image ?? m.suggestedImage ?? null,
            instructions:   m._raw?.instructions   ?? m.instructions   ?? null,
            categoryName:   m._raw?.category_name  ?? m.categoryName   ?? m._raw?.category_code ?? m.categoryCode ?? null,
            assetType:      m._raw?.asset_type     ?? m.assetType      ?? null,
            shareOfShelfCm: m._raw?.share_of_shelf_cm ?? m.shareOfShelfCm ?? 0,
            matchType,
          });
        };

        // 1. Customer-specific
        try {
          const rows: any[] = await database.get('planogram_setups').query(
            Q.where('selection_type', 'Customer'),
            Q.where('selection_value', customerCode),
            Q.where('is_active', true),
          ).fetch();
          for (const r of rows) addRow(r, 'Customer');
        } catch (e) { console.warn('[Planogram] customer lookup', e); }

        // 2. SubChannel — uses the store's customer_group
        if (customerGroup) {
          try {
            const rows: any[] = await database.get('planogram_setups').query(
              Q.where('selection_type', 'SubChannel'),
              Q.where('selection_value', customerGroup),
              Q.where('is_active', true),
            ).fetch();
            for (const r of rows) addRow(r, 'SubChannel');
          } catch (e) { console.warn('[Planogram] subchannel lookup', e); }
        }

        // 3. Classification — uses the store's channel_code
        if (channelCode) {
          try {
            const rows: any[] = await database.get('planogram_setups').query(
              Q.where('selection_type', 'Classification'),
              Q.where('selection_value', channelCode),
              Q.where('is_active', true),
            ).fetch();
            for (const r of rows) addRow(r, 'Classification');
          } catch (e) { console.warn('[Planogram] classification lookup', e); }
        }

        if (merged.length > 0) {
          setSetups(merged);
          return;
        }

        // Network fallback — query each scope, then merge in priority order.
        const fetchScope = async (selectionType: string, value: string): Promise<any[]> => {
          if (!value) return [];
          try {
            const res: any = await api.get('/planogram-setups', { params: { selectionType, search: value, isActive: 'true' } });
            const rows = res?.data?.data ?? [];
            return rows.filter((r: any) => r.selectionValue === value);
          } catch { return []; }
        };
        const [byCust, bySub, byCls] = await Promise.all([
          fetchScope('Customer', customerCode),
          fetchScope('SubChannel', customerGroup),
          fetchScope('Classification', channelCode),
        ]);
        for (const m of byCust) addRow(m, 'Customer');
        for (const m of bySub)  addRow(m, 'SubChannel');
        for (const m of byCls)  addRow(m, 'Classification');
        setSetups(merged);
      } catch (e) { console.warn('[Planogram] setup fetch failed', e); }
    })();
  }, [customerCode]);

  // When the user picks an asset type, restrict the carousel to setups
  // configured for that asset type. Falls back to the full list when no
  // type is picked yet, or when no synced setup matches (so the rep still
  // sees *something* rather than a blank "no image" box).
  const visibleSetups = useMemo(() => {
    const norm = (v: string | null | undefined) => (v ?? '').toString().trim().toLowerCase();
    const base = selectedType
      ? setups.filter(st => norm(st.assetType) === norm(selectedType))
      : setups;
    // Only show setups that actually have a reference image — drop the empty
    // slides so the carousel never renders a stray "No image" next to a real
    // one. If none have an image, the box below falls back to a single
    // "No image" placeholder.
    return base.filter(st => !!st.suggestedImage);
  }, [setups, selectedType]);

  // Snap the carousel back to the first item whenever the filtered list
  // shrinks past the current index — otherwise carouselIndex points off
  // the end of visibleSetups and the indicator dots desync.
  useEffect(() => {
    if (carouselIndex >= visibleSetups.length) {
      setCarouselIndex(0);
      carouselRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    }
  }, [visibleSetups.length, carouselIndex]);

  // Convenience — first match (most specific) for things like the heading.
  const setup = visibleSetups[carouselIndex] ?? null;

  // Recommended setup (image + product category) for a given asset type —
  // used by the table's "Recommended" column so each row shows the reference
  // image and its category (e.g. Almonds). Prefers a setup that has an image.
  const recommendedSetupForType = (
    assetType: string | null | undefined,
  ): { image: string | null; category: string | null } | null => {
    const norm = (v: string | null | undefined) => (v ?? '').toString().trim().toLowerCase();
    const matches = setups.filter(st => norm(st.assetType) === norm(assetType));
    if (matches.length === 0) return null;
    const chosen = matches.find(st => !!st.suggestedImage) ?? matches[0];
    const img = chosen.suggestedImage;
    return {
      image: img ? (img.startsWith('http') ? img : `${API_BASE_URL}${img}`) : null,
      category: chosen.categoryName ?? null,
    };
  };

  // Load ONLY the submitted Planogram rows from the local DB. Customer-
  // dashboard activity screens never carry forward an in-progress draft —
  // captures and edits live in memory until the rep taps Submit. Wipe any
  // stale draft a previous build left behind so the first launch after
  // upgrading doesn't resurrect abandoned captures.
  useEffect(() => {
    if (!isHistory) clearDraft(customerCode, 'Planogram');
  }, [customerCode, isHistory, clearDraft]);

  useEffect(() => {
    // Re-execute opens a clean capture for one asset type — don't preload
    // the prior (rejected) photo, so the rep captures a fresh image.
    if (isReExecute) return;
    // Guard: an empty user_code would match records that were saved without
    // a user_code (e.g. dharam's records on a shared device), causing the
    // wrong user to see another user's planogram photos. Skip the load if
    // user.code is not yet available.
    if (!user?.code) return;
    (async () => {
      let queryStart: number, queryEnd: number;
      if (isHistory) {
        const d = new Date(targetDate!);
        d.setHours(0, 0, 0, 0);
        queryStart = d.getTime();
        d.setHours(23, 59, 59, 999);
        queryEnd = d.getTime();
      } else {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        queryStart = todayStart.getTime();
        queryEnd = Number.MAX_SAFE_INTEGER;
      }
      try {
        const saved: any[] = await database.get('planogram_executions').query(
          Q.where('customer_code', customerCode),
          Q.where('user_code', user.code),
          Q.where('performed_on', Q.gte(queryStart)),
          Q.where('performed_on', Q.lte(queryEnd))
        ).fetch();
        if (saved.length === 0) return;
        const fromDb: CapturedAsset[] = saved.map((s: any) => {
          // handleSubmit saves the captured photo to `postImage`
          // (preImage stays empty). Read postImage first, fall back
          // to preImage for any legacy rows.
          const dbImage =
            s.postImage ?? s._raw?.post_image ??
            s.preImage ?? s._raw?.pre_image ?? '';
          return {
            id: s.id,
            assetType: s.categoryCode ?? s._raw?.category_code ?? '',
            imageUri: dbImage,
            timestamp: s.performedOn ?? s._raw?.performed_on ?? 0,
            latitude: s.geoLat ?? s._raw?.geo_lat ?? null,
            longitude: s.geoLng ?? s._raw?.geo_lng ?? null,
            submitted: true,
            approvalStatus: s.approvalStatus ?? s._raw?.approval_status ?? null,
          };
        });
        setAssets(fromDb);
      } catch (e) { console.warn("[App]", e); }
    })();
  }, [customerCode, isHistory, targetDate]);

  // Subscribe to approval status changes for submitted assets
  useEffect(() => {
    const submittedIds = assets.filter(a => a.submitted && a.id).map(a => a.id);
    if (submittedIds.length === 0) return;

    const subscription = database.get('planogram_executions')
      .query(Q.where('app_trx_id', Q.oneOf(submittedIds)))
      .observe()
      .subscribe(records => {
        setAssets(prev => {
          let changed = false;
          const next = prev.map(a => {
            if (!a.submitted) return a;
            const rec: any = records.find((r: any) => r.appTrxId === a.id);
            const status = rec?.approvalStatus ?? rec?._raw?.approval_status ?? null;
            if (rec && status !== a.approvalStatus) {
              changed = true;
              return { ...a, approvalStatus: status };
            }
            return a;
          });
          return changed ? next : prev;
        });
      });

    return () => subscription.unsubscribe();
  }, [assets.filter(a => a.submitted).map(a => a.id).join(',')]);

  const handleCapture = async () => {
    // Block rapid taps — camera can only be opened once at a time.
    if (busyRef.current) return;
    if (!selectedType) { Alert.alert('Select Asset Type', 'Please select an asset type before capturing.'); return; }
    busyRef.current = true;
    setCapturing(true);
    try {
      // Open camera immediately — don't wait on GPS. GPS is resolved in parallel
      // and whichever reply comes back first is used for the asset metadata.
      const gpsPromise = getCurrentPosition(false).catch(() => null);
      const photo = await capturePhoto(false);
      if (!photo) {
        // Silently skip on cancel; only alert on hard failures. Keeps UX smooth
        // during monkey-testing (back-button from camera = cancel, not error).
        return;
      }
      let lat: number | null = null, lng: number | null = null;
      try {
        const pos = await gpsPromise;
        if (pos) { lat = pos.lat; lng = pos.lng; }
      } catch (e) { console.warn('[Planogram] GPS failed', e); }
      const stampedUri = await burnWatermark(photo.uri, Date.now(), lat, lng);
      setAssets(prev => [...prev, {
        id: uuidv4(), assetType: selectedType, imageUri: stampedUri,
        timestamp: Date.now(), latitude: lat, longitude: lng,
      }]);
    } catch (err) {
      console.warn('[Planogram] capture error', err);
      Alert.alert('Camera Error', 'Unable to access camera. Please check permissions.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  };

  const handleRetake = async (assetId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setCapturing(true);
    try {
      const gpsPromise = getCurrentPosition(false).catch(() => null);
      const photo = await capturePhoto(false);
      if (!photo) return; // user cancelled
      let lat: number | null = null, lng: number | null = null;
      try { const pos = await gpsPromise; if (pos) { lat = pos.lat; lng = pos.lng; } } catch (e) { console.warn("[App]", e); }
      const stampedUri = await burnWatermark(photo.uri, Date.now(), lat, lng);
      setAssets(prev => prev.map(a => a.id === assetId
        ? { ...a, imageUri: stampedUri, timestamp: Date.now(), latitude: lat, longitude: lng }
        : a
      ));
    } catch (err) {
      console.warn('[Planogram] retake error', err);
      Alert.alert('Camera Error', 'Unable to access camera. Please check permissions.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  };

  const handleDelete = (assetId: string) => {
    if (busyRef.current) return;
    setAssets(prev => prev.filter(a => a.id !== assetId));
  };

  // Re-execute a REJECTED planogram: open a fresh Planogram capture screen
  // with the rejected item's asset type pre-bound in the dropdown. The new
  // screen starts clean (no prior photo) so the rep captures a new image and
  // submits it for fresh review.
  const handleReExecute = (assetType: string) => {
    navigation.push('Planogram', {
      customerCode,
      customerName,
      visitCode,
      preselectAssetType: assetType,
    });
  };

  const openDropdown = () => {
    if (busyRef.current || showDropdown) return;
    setShowDropdown(true);
  };

  const pickType = (type: string) => {
    setSelectedType(type);
    setShowDropdown(false);
  };

  const handleSubmit = async () => {
    // Guard against rapid submit taps — the DB write is idempotent via
    // appTrxId dedup on the server, but double-write locally wastes time
    // and confuses the user.
    if (submittingRef.current || saving) return;
    if (assets.length === 0) { Alert.alert('No Photos', 'Capture at least one photo.'); return; }

    // Pre-submit gate: server-side user-active + local customer-active.
    try {
      const userOk = await verifyUserActiveNow();
      if (!userOk) return;
      const cust = await verifyCustomerStillActive(customerCode);
      if (!cust.ok) {
        const name = cust.customerName ?? customerName ?? customerCode;
        const msg = cust.reason === 'blocked'
          ? `${name} has been blocked. Planogram cannot be submitted.`
          : cust.reason === 'deactivated'
            ? `${name} has been deactivated. Planogram cannot be submitted.`
            : `${name} is no longer available.`;
        Alert.alert('Customer Not Available', msg);
        return;
      }
    } catch (_e) { /* don't block on transient errors */ }

    submittingRef.current = true;
    setSaving(true);
    try {
      // Upsert by asset.id so re-submits don't duplicate rows. Look the
      // existing rows up by their PK (id) directly, not by user_code /
      // customer_code — the load path (above) loads any saved row for this
      // customer regardless of user, so a row created with a different
      // user_code (or a blank one if user was undefined at submit time)
      // would otherwise miss the map and fall into the create() branch,
      // hitting "UNIQUE constraint failed: planogram_executions.id".
      const ids = assets.map(a => a.id).filter(Boolean);
      const allExisting: any[] = ids.length > 0
        ? await database.get('planogram_executions').query(Q.where('id', Q.oneOf(ids))).fetch()
        : [];
      const existingMap = new Map<string, any>();
      for (const rec of allExisting) {
        const recId = rec.id ?? rec._raw?.id;
        if (recId) existingMap.set(recId, rec);
      }
      await database.write(async () => {
        for (const asset of assets) {
          const existing = existingMap.get(asset.id);
          if (existing) {
            await existing.update((rec: any) => {
              rec.categoryCode = asset.assetType;
              rec.postImage = asset.imageUri;
              rec.geoLat = asset.latitude ?? null;
              rec.geoLng = asset.longitude ?? null;
              rec.visitCode = visitCode ?? '';
              // Re-submitted (e.g. after a rejection) — back to pending review.
              rec.approvalStatus = null;
              rec.isSynced = false;
            });
          } else {
            await database.get('planogram_executions').create((rec: any) => {
              rec._raw.id = asset.id; rec.appTrxId = asset.id; rec.userCode = user?.code ?? '';
              rec.customerCode = customerCode; rec.visitCode = visitCode ?? '';
              rec.categoryCode = asset.assetType; rec.performedOn = Date.now();
              rec.isFollowed = true; rec.preImage = ''; rec.postImage = asset.imageUri;
              rec.geoLat = asset.latitude ?? null;
              rec.geoLng = asset.longitude ?? null;
              rec.notes = ''; rec.isSynced = false;
            });
          }
        }
      });
      clearDraft(customerCode, 'Planogram');
      pushSync().catch(() => {});
      // Mark every captured asset as submitted in-memory so the green tick
      // paints on the screen the rep is still looking at (in case they
      // dismiss the alert without going back). The DB load on the next
      // mount will arrive at the same state via the saved row.
      setAssets(prev => prev.map(a => ({ ...a, submitted: true })));
      // Tell CustomerDashboard a submit just landed so its activity-tile
      // completion check re-runs — covers the case where back-navigation
      // out-races the WatermelonDB writer queue on slow devices and the
      // focus-fired refresh sees no row.
      DeviceEventEmitter.emit(ACTIVITY_SUBMITTED_EVENT);
      Alert.alert('Success', `${assets.length} planogram photo(s) saved.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed.');
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={s.container}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title={isHistory ? "Planogram History" : "Planogram"} />
      
      {/* Execute mode only: Select Asset Type on top, recommended image below.
          History uses the per-row "Recommended" column in the table instead. */}
      {!isHistory && (
      <View style={s.card}>
        {(
          <>
            <Text style={s.label}>Select Asset Type</Text>
            <View style={s.dropdownRow}>
              <TouchableOpacity
                style={s.dropdown}
                onPress={openDropdown}
                activeOpacity={0.7}
                disabled={capturing || saving}
              >
                <Text style={[s.dropdownText, !selectedType && { color: '#9CA3AF' }]}>{selectedType || 'Select Asset Type'}</Text>
                <Icon name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.cameraBtn, (capturing || saving) && { opacity: 0.5 }]}
                onPress={handleCapture}
                activeOpacity={0.7}
                disabled={capturing || saving}
              >
                {capturing ? <ActivityIndicator color="#1a3a8f" /> : <Icon name="camera" size={24} color="#1a3a8f" />}
              </TouchableOpacity>
            </View>
          </>
        )}

        <View>
          <Text style={s.label}>
            Recommended image{visibleSetups.length > 1 ? ` (${carouselIndex + 1} / ${visibleSetups.length})` : ''}
          </Text>
          <View style={s.recommendedBox}>
            {visibleSetups.length > 0 ? (
              <FlatList
                ref={carouselRef}
                data={visibleSetups}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToAlignment="center"
                decelerationRate="fast"
                keyExtractor={(_, i) => `setup-${i}`}
                onMomentumScrollEnd={(e) => {
                  const w = e.nativeEvent.layoutMeasurement.width;
                  const x = e.nativeEvent.contentOffset.x;
                  if (w > 0) setCarouselIndex(Math.round(x / w));
                }}
                renderItem={({ item }) => (
                  <View style={{ width: 200, alignItems: 'center', justifyContent: 'center' }}>
                    {item.suggestedImage ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          const fullUri = item.suggestedImage!.startsWith('http')
                            ? item.suggestedImage!
                            : `${API_BASE_URL}${item.suggestedImage!}`;
                          setRecommendedFullScreen(fullUri);
                        }}
                      >
                        <Image
                          source={{ uri: item.suggestedImage.startsWith('http') ? item.suggestedImage : `${API_BASE_URL}${item.suggestedImage}` }}
                          style={{ width: 160, height: 120, borderRadius: 12 }}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={s.noImageBox}>
                        <Icon name="image-outline" size={48} color="#D1D5DB" />
                        <Text style={s.noImageText}>No image</Text>
                      </View>
                    )}
                  </View>
                )}
              />
            ) : (
              <View style={s.noImageBox}>
                <Icon name="image-outline" size={48} color="#D1D5DB" />
                <Text style={s.noImageText}>No image</Text>
              </View>
            )}
          </View>
          {visibleSetups.length > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 4 }}>
              {visibleSetups.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    setCarouselIndex(i);
                    carouselRef.current?.scrollToIndex({ index: i, animated: true });
                  }}
                  style={{
                    width: i === carouselIndex ? 18 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i === carouselIndex ? '#1a3a8f' : '#CBD5E1',
                  }}
                />
              ))}
            </View>
          )}
          {setup && (
            <View style={{ marginBottom: 8, paddingHorizontal: 4 }}>
              {setup.categoryName && (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1a3a8f' }}>
                  {setup.categoryName}
                  {setup.shareOfShelfCm > 0 && ` · ${setup.shareOfShelfCm} cm shelf`}
                  <Text style={{ fontSize: 11, fontWeight: '400', color: '#6B7280' }}>  · {setup.matchType}</Text>
                </Text>
              )}
              {setup.instructions && (
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{setup.instructions}</Text>
              )}
            </View>
          )}

        </View>
      </View>
      )}

      {(() => {
        const showDeleteCol = !isHistory && assets.some(a => !a.submitted);
        return (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.thText, { flex: 1 }]}>Asset Type</Text>
              <Text style={[s.thText, { width: 100, textAlign: 'center' }]}>Image</Text>
              <Text style={[s.thText, { width: 100, textAlign: 'center' }]}>Recommended</Text>
              {showDeleteCol && (
                <Text style={[s.thText, { width: 60, textAlign: 'center' }]}>Delete</Text>
              )}
            </View>

            <FlatList
              data={assets}
              keyExtractor={item => item.id}
              renderItem={({ item, index }) => (
                <View style={[s.row, index % 2 === 0 && s.rowAlt]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowType} numberOfLines={1}>{item.assetType}</Text>
                    {(() => {
                      const cat = recommendedSetupForType(item.assetType)?.category;
                      return cat ? <Text style={s.rowCategory} numberOfLines={1}>{cat}</Text> : null;
                    })()}
                    {item.submitted ? (
                      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        {/* Green tick = "this row has been submitted". Independent
                            of the approval badge so the rep gets an immediate
                            success cue even while admin review is still pending. */}
                        <Icon name="checkmark-circle" size={18} color="#16A34A" />
                        <ApprovalBadge status={item.approvalStatus} />
                        {/* A rejected planogram can be re-executed from either
                            the live or history view — it opens a fresh capture
                            screen with this asset type pre-bound. */}
                        {(item.approvalStatus ?? '').toLowerCase() === 'rejected' && (
                          <TouchableOpacity
                            style={s.reExecBtn}
                            onPress={() => handleReExecute(item.assetType)}
                            activeOpacity={0.7}
                            disabled={capturing || saving}
                          >
                            <Icon name="camera-reverse-outline" size={13} color="#1a3a8f" />
                            <Text style={s.reExecText}>Re-execute</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}
                  </View>
                  <View style={s.rowImgBox}>
                    <PhotoThumbnail
                      photo={{ uri: item.imageUri, timestamp: item.timestamp, latitude: item.latitude, longitude: item.longitude, customerCode, customerName }}
                      size={88}
                      onRetake={!isHistory ? () => handleRetake(item.id) : undefined}
                      style={{ width: 88, height: 70, borderRadius: 8 }}
                    />
                  </View>
                  {/* Recommended image for THIS row's asset type (or "No image").
                      onError fallback prevents a silent blank box when the
                      server-side setup image is missing or the network is down. */}
                  {(() => {
                    const recUri = recommendedSetupForType(item.assetType)?.image ?? null;
                    return recUri ? (
                      <RecImg uri={recUri} onPress={() => setRecommendedFullScreen(recUri)} />
                    ) : (
                      <View style={s.rowNoImg}><Text style={s.rowNoImgText}>No image</Text></View>
                    );
                  })()}
                  {showDeleteCol && (
                    item.submitted ? (
                      <View style={s.rowDelBtn} />
                    ) : (
                      <TouchableOpacity
                        style={s.rowDelBtn}
                        onPress={() => handleDelete(item.id)}
                        disabled={capturing || saving}
                      >
                        <Icon name="trash-outline" size={20} color={capturing || saving ? '#9CA3AF' : '#111827'} />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}
              ListEmptyComponent={<View style={s.empty} />}
              contentContainerStyle={s.list}
            />
          </>
        );
      })()}

      {!isHistory && (
        <View style={s.bottomBar}>
          <TouchableOpacity
            style={[s.submitBtn, (assets.length === 0 || capturing) && { opacity: 0.5 }]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={saving || capturing || assets.length === 0}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDropdown(false)}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Select Asset Type</Text>
            {/* Always show every asset type, regardless of which setups are
                mapped to this customer/chain — the rep must be able to capture
                any fixture. The recommended image below resolves per type (or
                shows "No image" when nothing is configured for it). */}
            {ASSET_TYPES.map(type => (
              <TouchableOpacity key={type} style={[s.modalItem, selectedType === type && s.modalItemActive]} onPress={() => pickType(type)}>
                <Text style={[s.modalItemText, selectedType === type && { color: '#1a56db', fontWeight: '600' }]}>{type}</Text>
                {selectedType === type && <Icon name="checkmark" size={18} color="#1a56db" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full-screen viewer for the recommended image */}
      <Modal
        visible={!!recommendedFullScreen}
        transparent
        animationType="fade"
        onRequestClose={() => setRecommendedFullScreen(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity
            onPress={() => setRecommendedFullScreen(null)}
            style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 36, right: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
          >
            <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setRecommendedFullScreen(null)}
          >
            {recommendedFullScreen ? (
              <Image
                source={{ uri: recommendedFullScreen }}
                style={{ flex: 1, width: '100%' }}
                resizeMode="contain"
              />
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  card: { backgroundColor: '#FFF', margin: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }) },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8, marginTop: 8 },

  recommendedBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, marginBottom: 8 },
  noImageBox: { alignItems: 'center', justifyContent: 'center', width: 160, height: 120, borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed', borderRadius: 12 },
  noImageText: { fontSize: 13, color: '#D1D5DB', marginTop: 6 },

  dropdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 15, color: '#111827' },
  cameraBtn: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#1a3a8f', alignItems: 'center', justifyContent: 'center' },

  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  thText: { fontSize: 13, fontWeight: '700', color: '#1a3a8f' },
  list: { paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowAlt: { backgroundColor: '#F9FAFB' },
  rowType: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  rowCategory: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  // Image + Recommended thumbnails before submit — bigger so the rep and any
  // reviewer over their shoulder can verify "yes that's the asset that was
  // captured for this asset type". Was 60x44 and reps were complaining the
  // captured photo + reference were too small to read against each other.
  rowImgBox: { width: 88, height: 70, borderRadius: 8, overflow: 'hidden', marginHorizontal: 6 },
  rowNoImg: { width: 88, height: 70, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  rowNoImgText: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  rowImg: { width: 88, height: 70 },
  rowDelBtn: { width: 40, alignItems: 'center' },
  reExecBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1a3a8f', backgroundColor: '#EFF3FB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  reExecText: { fontSize: 11, fontWeight: '700', color: '#1a3a8f' },
  empty: { paddingVertical: 20 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: SAFE_BOTTOM_PADDING },
  submitBtn: { backgroundColor: '#1a3a8f', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  modal: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemActive: { backgroundColor: '#EFF6FF', borderRadius: 8 },
  modalItemText: { fontSize: 15, color: '#374151' },
});
