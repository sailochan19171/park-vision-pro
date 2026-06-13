import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Image, Modal, FlatList,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import FarmleyHeader from '../components/common/FarmleyHeader';
import SideMenuDrawer from '../components/common/SideMenuDrawer';
import { v4 as uuidv4 } from 'uuid';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../store/auth';
import useActivityDrafts from '../store/activityDrafts';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { verifyUserActiveNow, verifyCustomerStillActive } from '../services/realtimeSync';
import { reverseGeocode } from '../services/reverseGeocode';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';
import { formatPriceInput } from '../utils/priceValidation';
import { useWatermark } from '../hooks/useWatermark';

interface Option { label: string; value: string; }

// Photo is scoped per store so switching stores in the dropdown shows the
// photo captured for that store (matches ProductFeedback). 24h TTL.
function getSamplingPhotoStorageKey(store: Option | null): string {
  if (store?.value) return `productSamplingPhoto_${store.value}`;
  return 'productSamplingPhoto_draft';
}

export default function ProductSamplingScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const paramCustomerCode: string = route.params?.customerCode ?? '';
  const paramCustomerName: string = route.params?.customerName ?? '';
  const visitCode: string | undefined = route.params?.visitCode;

  const [stores, setStores] = useState<Option[]>([]);
  const [skus, setSkus] = useState<Option[]>([]);
  const [selectedStore, setSelectedStore] = useState<Option | null>(
    paramCustomerCode ? { label: paramCustomerName || paramCustomerCode, value: paramCustomerCode } : null,
  );
  const [selectedSku, setSelectedSku] = useState<Option | null>(null);
  const [sellingPrice, setSellingPrice] = useState('');
  const [unitsUsed, setUnitsUsed] = useState('');
  const [unitsSold, setUnitsSold] = useState('');
  // Customers approached starts blank — the user types whatever they want.
  // Previously this seeded '0' which forced the user to clear before typing
  // a real value, and any silent submit ended up recording a fake 0.
  const [customersApproached, setCustomersApproached] = useState('');
  // Multi-image capture. The screen used to have two fixed Front/Back slots
  // — clients now want an open list of captures (delete + add as needed).
  type PhotoSlot = { uri: string; ts: number; lat: number | null; lng: number | null };
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [photoViewVisible, setPhotoViewVisible] = useState<number | null>(null);
  const [photoAddress, setPhotoAddress] = useState<string | null>(null);

  // Lazy reverse-geocode when the photo viewer opens. Resets when the user
  // closes / switches photos so we don't show a stale address.
  useEffect(() => {
    setPhotoAddress(null);
    if (photoViewVisible == null) return;
    const active = photos[photoViewVisible];
    if (!active?.lat || !active?.lng) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = await reverseGeocode(active.lat as number, active.lng as number);
        if (!cancelled && addr) setPhotoAddress(addr);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoViewVisible]);
  const [saving, setSaving] = useState(false);
  // Ref-based guard prevents double-tap on Submit from generating two
  // separate UUIDs (and thus two server rows). useState alone is not
  // enough — setState is async, so the button can re-fire before the
  // re-render sets disabled=true.
  const submittingRef = useRef(false);
  const [storeModal, setStoreModal] = useState(false);
  const [skuModal, setSkuModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const { clearDraft } = useActivityDrafts();
  const { burnWatermark, WatermarkRenderer } = useWatermark(selectedStore?.label ?? '', selectedStore?.value ?? '');

  // No draft persistence. Fields + captured photos only survive while
  // the screen is mounted. Leaving and coming back must show a blank
  // form so the rep doesn't accidentally re-submit unfinished data.
  // One-shot clearDraft wipes any stale draft a previous build wrote.
  useEffect(() => { clearDraft(paramCustomerCode, 'ProductSampling'); }, [paramCustomerCode, clearDraft]);

  useEffect(() => { loadData(); }, []);

  // Photos are NOT persisted between mounts — they only live in this
  // screen's in-memory state. Switching the store dropdown clears the
  // photos so the rep starts fresh for the new store, mirroring the
  // overall no-draft rule. The next-mount path also wipes any photo
  // cache key a previous build wrote so an upgrade doesn't resurrect
  // captures the rep abandoned.
  useEffect(() => {
    setPhotoViewVisible(null);
    setPhotos([]);
    if (selectedStore?.value) {
      AsyncStorage.removeItem(getSamplingPhotoStorageKey(selectedStore)).catch(() => {});
    }
  }, [selectedStore?.value]);

  const persistPhotos = (_nextPhotos: PhotoSlot[], _storeForKey: Option | null = selectedStore) => {
    // No-op: per-store photo persistence intentionally removed. Live state
    // is the only source of truth until handleSubmit commits the capture.
  };

  const loadData = async () => {
    const custs: any[] = await database.get('customers').query(Q.take(500)).fetch();
    setStores(custs.map((c) => ({ label: c.name, value: c.code })));
    const items: any[] = await database.get('items').query(Q.take(500)).fetch();
    setSkus(items.map((i) => ({ label: i.name, value: i.code ?? i.id })));
  };

  const filteredStores = stores.filter(
    (s) => s.label.toLowerCase().includes(storeSearch.toLowerCase()) ||
           s.value.toLowerCase().includes(storeSearch.toLowerCase()),
  );
  const filteredSkus = skus.filter(
    (s) => s.label.toLowerCase().includes(skuSearch.toLowerCase()) ||
           s.value.toLowerCase().includes(skuSearch.toLowerCase()),
  );

  // Capture a new photo and append it to the list. The user can take as
  // many photos as they want; each goes into `photos` in order.
  const handleCapturePhoto = async () => {
    try {
      const photo = await capturePhoto();
      if (!photo) return;
      const uri = typeof photo === 'string' ? photo : (photo as any).uri ?? null;
      if (!uri) return;
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { getCurrentPosition } = require('../services/locationService');
        const pos = await getCurrentPosition(true);
        if (pos) { lat = pos.lat; lng = pos.lng; }
      } catch { /* GPS optional */ }
      const ts = Date.now();
      const stampedUri = await burnWatermark(uri, ts, lat, lng);
      const newSlot: PhotoSlot = { uri: stampedUri, ts, lat, lng };
      // Capture the active store *now* so the persist write can't race with
      // a store-dropdown change happening while the camera was open. We've
      // seen photos save under the new store's key when the user switches
      // mid-capture — pinning the store here prevents that drift.
      const storeAtCapture = selectedStore;
      setPhotos(prev => {
        const next = [...prev, newSlot];
        persistPhotos(next, storeAtCapture);
        return next;
      });
    } catch {
      Alert.alert('Camera Error', 'Could not capture photo.');
    }
  };

  const handleDeletePhoto = (index: number) => {
    setPhotos(prev => {
      const next = prev.filter((_, i) => i !== index);
      persistPhotos(next);
      return next;
    });
    setPhotoViewVisible(null);
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // synchronous double-tap guard
    submittingRef.current = true;
    if (!selectedStore) { submittingRef.current = false; Alert.alert('Required', 'Please select a store.'); return; }
    if (!selectedSku) { submittingRef.current = false; Alert.alert('Required', 'Please select a SKU.'); return; }

    // Pre-submit gate: user-active + customer-active. User check is a
    // live /auth/user-status call (forces logout on deactivation);
    // customer check reads the local record kept fresh by the 5 s
    // background sync.
    try {
      const userOk = await verifyUserActiveNow();
      if (!userOk) return;
      const cust = await verifyCustomerStillActive(selectedStore.value);
      if (!cust.ok) {
        const name = cust.customerName ?? selectedStore.label;
        const msg = cust.reason === 'blocked'
          ? `${name} has been blocked. Sampling cannot be submitted.`
          : cust.reason === 'deactivated'
            ? `${name} has been deactivated. Sampling cannot be submitted.`
            : `${name} is no longer available.`;
        Alert.alert('Customer Not Available', msg);
        return;
      }
    } catch (_e) { /* don't block on transient errors */ }

    const sp = parseFloat(sellingPrice);
    if (!sellingPrice.trim() || isNaN(sp) || sp < 0) {
      Alert.alert('Required', 'Please enter a valid Selling Price.');
      return;
    }

    const uu = parseInt(unitsUsed, 10);
    if (!unitsUsed.trim() || isNaN(uu) || uu <= 0) {
      Alert.alert('Required', 'Please enter a valid number of Units Used.');
      return;
    }

    const us = parseFloat(unitsSold);
    if (!unitsSold.trim() || isNaN(us) || us < 0) {
      Alert.alert('Required', 'Please enter a valid number of Units Sold.');
      return;
    }

    const ca = parseInt(customersApproached, 10);
    if (!customersApproached.trim() || isNaN(ca) || ca < 0) {
      Alert.alert('Required', 'Please enter a valid number of Customers Approached.');
      return;
    }

    if (photos.length === 0) {
      Alert.alert('Required', 'Please capture at least one photo before submitting.');
      return;
    }
    setSaving(true);
    try {
      const id = uuidv4();
      
      // Combine all captured photo URIs into the single photoPath field
      // with a pipe separator. Server/report layer can split on '|' to
      // display every photo.
      const combinedPhotoPath = photos.map(p => p.uri).join('|');
      const geoLat = photos.find(p => p.lat != null)?.lat ?? null;
      const geoLng = photos.find(p => p.lng != null)?.lng ?? null;
      console.log('[ProductSampling] submit start', { id, store: selectedStore!.value, sku: selectedSku!.value, unitsUsed, sellingPrice, photoCount: photos.length });
      await database.write(async () => {
        await database.get('product_samplings').create((rec: any) => {
          rec._raw.id = id;
          rec.appTrxId = id;
          rec.userCode = user?.code ?? '';
          rec.customerCode = selectedStore!.value;
          rec.visitCode = visitCode ?? null;
          rec.itemCode = selectedSku!.value;
          rec.itemName = selectedSku!.label;
          rec.quantitySampled = uu;
          rec.uom = 'Pieces';
          rec.sellingPrice = sp;
          rec.unitsSold = us;
          rec.customersApproached = ca;
          rec.consumerFeedback = null;
          rec.photoPath = combinedPhotoPath;
          rec.geoLat = geoLat;
          rec.geoLng = geoLng;
          rec.sampledOn = Date.now();
          rec.isSynced = false;
        });
      });
      console.log('[ProductSampling] local write OK — triggering background pushSync');
      // Fire the push in the BACKGROUND (do NOT await) so the "Submitted" popup
      // is instant. The record is already persisted locally (isSynced=false), so
      // the 5s background sync / app-resume flush uploads it even if this
      // immediate attempt fails — nothing is lost.
      try {
        const { pushSync } = require('../services/syncService');
        pushSync().catch((pushErr: any) => console.log('[ProductSampling] bg pushSync error:', pushErr?.message ?? pushErr));
      } catch (pushErr: any) {
        console.log('[ProductSampling] pushSync trigger error:', pushErr?.message ?? pushErr);
      }
      // Clear local form state + drop any photo cache key the previous
      // build may have written. No draft layer exists anymore, so there
      // is nothing for an auto-save effect to re-create on the next
      // render — the screen simply returns to a blank form.
      AsyncStorage.removeItem(getSamplingPhotoStorageKey(selectedStore)).catch(() => {});
      clearDraft(paramCustomerCode, 'ProductSampling');
      setSelectedSku(null);
      setSellingPrice('');
      setUnitsUsed('');
      setUnitsSold('');
      setCustomersApproached('');
      setPhotos([]);
      setPhotoViewVisible(null);

      Alert.alert('Submitted', 'Product sampling recorded successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.log('[ProductSampling] submit error:', err?.message ?? err);
      Alert.alert('Error', err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  return (
    <View style={styles.wrapper}>
      <SideMenuDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        onNavigate={(screen) => {
          setDrawerOpen(false);
          navigation.navigate(screen);
        }}
        onLogout={() => {
          setDrawerOpen(false);
          useAuthStore.getState().logout();
        }}
        onEndDay={() => {
          setDrawerOpen(false);
          navigation.navigate('EndOfDay');
        }}
        dayStarted={true}
      />

      <FarmleyHeader onMenuPress={() => setDrawerOpen(true)} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Product Sampling</Text>

          <Text style={styles.label}>Select Store *</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setStoreModal(true)} activeOpacity={0.7}>
            <Text style={[styles.dropdownText, !selectedStore && styles.placeholder]}>
              {selectedStore ? selectedStore.label : 'Select Store'}
            </Text>
            <Text style={styles.dropdownArrow}>{'\u2228'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Select SKU *</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setSkuModal(true)} activeOpacity={0.7}>
            <Text style={[styles.dropdownText, !selectedSku && styles.placeholder]}>
              {selectedSku ? selectedSku.label : 'Select SKU'}
            </Text>
            <Text style={styles.dropdownArrow}>{'\u2228'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Selling Price *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Selling Price"
            placeholderTextColor="#9CA3AF"
            value={sellingPrice}
            onChangeText={(t) => setSellingPrice(formatPriceInput(t, sellingPrice))}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Units Used *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Units Used"
            placeholderTextColor="#9CA3AF"
            value={unitsUsed}
            onChangeText={setUnitsUsed}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Units Sold *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Units Sold"
            placeholderTextColor="#9CA3AF"
            value={unitsSold}
            onChangeText={setUnitsSold}
            keyboardType="numeric"
          />

          <Text style={styles.label}>No of Customers Approached *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter number of customers"
            placeholderTextColor="#9CA3AF"
            value={customersApproached}
            onChangeText={setCustomersApproached}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Capture Image *</Text>
          {/* Centered, full-width single photo. The previous grid was 48%
              tiles left-aligned which made the lone captured photo look
              off-balance; sampling is one-photo-per-record so a single
              centered preview matches the form's visual rhythm. */}
          {photos.length === 0 ? (
            <TouchableOpacity style={[styles.captureBox, { alignSelf: 'center', width: '100%', height: 180 }]} onPress={handleCapturePhoto} activeOpacity={0.7}>
              <Text style={styles.cameraEmoji}>{String.fromCodePoint(0x1F4F7)}</Text>
              <Text style={styles.captureText}>Capture Image</Text>
            </TouchableOpacity>
          ) : (
            photos.map((photo, idx) => (
              <TouchableOpacity
                key={`${photo.uri}-${idx}`}
                onPress={() => setPhotoViewVisible(idx)}
                activeOpacity={0.8}
                style={[styles.photoPreviewBox, { alignSelf: 'center', width: '100%' }]}
              >
                <Image source={{ uri: photo.uri }} style={[styles.photoPreview, { height: 220 }]} resizeMode="contain" />
                <View style={styles.photoOverlay}>
                  <Text style={styles.photoOverlayText}>
                    {new Date(photo.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {photo.lat != null && photo.lng != null && (
                    <Text style={styles.photoOverlayText}>{photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.photoDeleteBtn}
                  onPress={() => handleDeletePhoto(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.photoDeleteBtnText}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.submitBar}>
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Submitting...' : 'Submit'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={storeModal} animationType="slide" onRequestClose={() => setStoreModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Store</Text>
            <TouchableOpacity onPress={() => setStoreModal(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search store..."
            placeholderTextColor="#9CA3AF"
            value={storeSearch}
            onChangeText={setStoreSearch}
          />
          <FlatList
            data={filteredStores}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { setSelectedStore(item); setStoreModal(false); setStoreSearch(''); }}
              >
                <Text style={styles.modalItemText}>{item.label}</Text>
                <Text style={styles.modalItemSub}>{item.value}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={skuModal} animationType="slide" onRequestClose={() => setSkuModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select SKU</Text>
            <TouchableOpacity onPress={() => setSkuModal(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search SKU..."
            placeholderTextColor="#9CA3AF"
            value={skuSearch}
            onChangeText={setSkuSearch}
          />
          <FlatList
            data={filteredSkus}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { setSelectedSku(item); setSkuModal(false); setSkuSearch(''); }}
              >
                <Text style={styles.modalItemText}>{item.label}</Text>
                <Text style={styles.modalItemSub}>{item.value}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Full-screen photo viewer with timestamp + lat/lng + address. The
          delete icon here lets the user remove the current capture without
          dismissing the viewer first. */}
      <Modal visible={photoViewVisible != null} transparent animationType="fade" onRequestClose={() => setPhotoViewVisible(null)}>
        {(() => {
          const active = photoViewVisible != null ? photos[photoViewVisible] : null;
          return (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
              <TouchableOpacity
                onPress={() => setPhotoViewVisible(null)}
                style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 36, right: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
              >
                <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
              {photoViewVisible != null && (
                <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 54 : 40, left: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>Photo {photoViewVisible + 1} of {photos.length}</Text>
                </View>
              )}
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPhotoViewVisible(null)}>
                {active?.uri ? <Image source={{ uri: active.uri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" /> : null}
              </TouchableOpacity>
              {/* Metadata overlay removed — the same timestamp / lat-lng /
                  address is already burned into the JPEG via BurnWatermark,
                  so this dark panel was showing duplicate info on top of
                  the photo and covering part of the actual image content. */}
              {photoViewVisible != null && (
                <View style={{ position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', justifyContent: 'center' }}>
                  <TouchableOpacity
                    onPress={() => handleDeletePhoto(photoViewVisible)}
                    style={{ paddingVertical: 14, paddingHorizontal: 28, backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 12 }}
                  >
                    <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>🗑  Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })()}
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  dropdown: {
    borderWidth: 1.5,
    borderColor: '#1a56db',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  dropdownText: { fontSize: 15, color: '#111827', flex: 1 },
  placeholder: { color: '#9CA3AF' },
  dropdownArrow: { fontSize: 18, color: '#1a56db', fontWeight: '700' },
  input: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  captureBox: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 10,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    backgroundColor: '#FAFAFA',
  },
  cameraEmoji: { fontSize: 30, marginBottom: 8 },
  captureText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  photoPreviewBox: { borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  photoPreview: { width: '100%', height: 180 },
  photoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 6,
  },
  photoOverlayText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', lineHeight: 16 },
  photoDeleteBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoDeleteBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  submitBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: SAFE_BOTTOM_PADDING,
  },
  submitBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a3fa0',
    borderRadius: 10,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#1a56db', fontWeight: '600' },
  modalSearch: {
    margin: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  modalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  modalItemSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
});
