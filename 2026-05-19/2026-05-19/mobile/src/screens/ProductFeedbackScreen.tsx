import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import FarmleyHeader from '../components/common/FarmleyHeader';
import SideMenuDrawer from '../components/common/SideMenuDrawer';
import useSyncStore from '../store/sync';
import { capturePhoto } from '../services/cameraService';
import { normalizePhone, isValidOptionalPhone, PHONE_VALIDATION_MESSAGE } from '../utils/phoneValidation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import useAuthStore from '../store/auth';
import { v4 as uuidv4 } from 'uuid';
import { BurnWatermark, type WatermarkInfo } from '../services/watermarkService';
import { reverseGeocode } from '../services/reverseGeocode';

// Fallback list — used only if the GET /settings/feedback-types/active
// call fails. The authoritative source is the server-side catalog so
// admins can toggle types in the web Settings page.
const FEEDBACK_TYPES_FALLBACK = [
  'Product Quality',
  'Packaging',
  'Price Point',
  'Availability',
  'Taste/Flavour',
  'Brand Awareness',
  'Competitor Preference',
  'Other',
];

interface StoreOption { label: string; value: string; }
interface SkuOption   { label: string; value: string; }



export default function ProductFeedbackScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreOption | null>(null);
  const [selectedSku, setSelectedSku] = useState<SkuOption | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<string[]>([]);
  const [feedbackTypeOptions, setFeedbackTypeOptions] = useState<string[]>(FEEDBACK_TYPES_FALLBACK);
  const [customerName, setCustomerName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageTs, setImageTs] = useState<number | null>(null);
  const [imageLat, setImageLat] = useState<number | null>(null);
  const [imageLng, setImageLng] = useState<number | null>(null);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [imageAddress, setImageAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pendingCount } = useSyncStore();
  const [pendingWatermark, setPendingWatermark] = useState<
    { photoUri: string; info: WatermarkInfo; callback: (uri: string) => void } | null
  >(null);

  const burnWatermark = useCallback(
    (photoUri: string, ts: number | null, lat: number | null, lng: number | null): Promise<string> => {
      return new Promise((resolve) => {
        (async () => {
          const d = new Date(ts ?? Date.now());
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          // Reuse the address we already resolved for the preview — falls back
          // to a fresh reverseGeocode (4 s cap) if the user submits before the
          // preview was ever opened.
          let address: string | null = imageAddress;
          if (!address && lat != null && lng != null) {
            try {
              address = await Promise.race<string | null>([
                reverseGeocode(lat, lng),
                new Promise<null>((r) => setTimeout(() => r(null), 4000)),
              ]);
            } catch { /* silent — watermark proceeds without address */ }
          }
          const info: WatermarkInfo = {
            timestamp: `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}:${ss}`,
            latitude: lat != null ? lat.toFixed(7) : '—',
            longitude: lng != null ? lng.toFixed(7) : '—',
            userName: user?.name,
            customerName: selectedStore?.label,
            customerCode: selectedStore?.value,
            address,
          };
          setPendingWatermark({
            photoUri,
            info,
            callback: (uri) => {
              setPendingWatermark(null);
              resolve(uri);
            },
          });
        })();
      });
    },
    [user?.name, selectedStore?.label, selectedStore?.value, imageAddress],
  );

  // Clear in-memory preview when store changes.
  useEffect(() => {
    setImageUri(null);
    setImageTs(null);
    setImageLat(null);
    setImageLng(null);
    setImageAddress(null);
    setImageViewVisible(false);
  }, [selectedStore?.value]);

  // Lazy reverse-geocode the captured photo coords for the live preview.
  // Runs once when the fullscreen viewer opens to avoid a network call per
  // capture. The result is cached in state until the next capture/store change.
  useEffect(() => {
    if (!imageViewVisible) return;
    if (imageAddress) return;
    if (imageLat == null || imageLng == null) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = await reverseGeocode(imageLat, imageLng);
        if (!cancelled && addr) setImageAddress(addr);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [imageViewVisible, imageLat, imageLng, imageAddress]);

  // Dropdowns
  const [storeModal, setStoreModal] = useState(false);
  const [skuModal, setSkuModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [skuSearch, setSkuSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const custs: any[] = await database.get('customers').query(Q.take(500)).fetch();
    setStores(custs.map((c) => ({ label: c.name, value: c.code })));
    const items: any[] = await database.get('items').query(Q.take(500)).fetch();
    setSkus(items.map((i) => ({ label: i.name, value: i.code })));

    // Feedback types come from the server-side catalog now so admins can
    // toggle them in the web Settings page without an app rebuild. Falls
    // back to the bundled list if the API call fails (offline, older
    // backend, etc.).
    try {
      const apiClient = require('../api/client').default;
      const { data } = await apiClient.get('/settings/feedback-types/active');
      const list = Array.isArray(data?.data) ? data.data : [];
      const names = list.map((t: any) => String(t.name)).filter(Boolean);
      if (names.length > 0) setFeedbackTypeOptions(names);
    } catch (e) {
      console.warn('[ProductFeedback] feedback-types fetch failed, using fallback:', e);
    }
  };

  const filteredStores = stores.filter(
    (s) => s.label.toLowerCase().includes(storeSearch.toLowerCase()) || s.value.toLowerCase().includes(storeSearch.toLowerCase()),
  );
  const filteredSkus = skus.filter(
    (s) => s.label.toLowerCase().includes(skuSearch.toLowerCase()) || s.value.toLowerCase().includes(skuSearch.toLowerCase()),
  );

  const toggleFeedback = (type: string) => {
    setSelectedFeedback((prev) =>
      prev.includes(type) ? prev.filter((f) => f !== type) : [...prev, type],
    );
  };

  const handleCapture = async () => {
    // Routes through cameraService so resize limits (1280px max, JPEG 0.7)
    // and permission handling match the rest of the app.
    const photo = await capturePhoto();
    if (!photo?.uri) return;
    const rawUri = photo.uri;
    const ts = Date.now();
    setImageTs(ts);
    setImageAddress(null);

    let lat: number | null = null, lng: number | null = null;
    try {
      const { getCurrentPosition } = require('../services/locationService');
      const pos = await getCurrentPosition(true);
      if (pos) { lat = pos.lat; lng = pos.lng; }
    } catch { /* GPS optional */ }
    setImageLat(lat);
    setImageLng(lng);

    // Burn lat/lng/timestamp/address into the JPEG NOW (not at submit
    // time) so the live preview the field user opens before submitting
    // also shows the metadata stamp — was missing previously and reps
    // couldn't visually verify the photo was geo-stamped.
    try {
      const stampedUri = await burnWatermark(rawUri, ts, lat, lng);
      setImageUri(stampedUri);
    } catch {
      // Watermark burn failed — fall back to the raw photo so the user
      // still sees something. handleSubmit will retry the burn before
      // upload, so the server-side copy still gets stamped.
      setImageUri(rawUri);
    }
  };

  const handleDeletePhoto = () => {
    setImageUri(null);
    setImageTs(null);
    setImageLat(null);
    setImageLng(null);
    setImageAddress(null);
    setImageViewVisible(false);
  };

  const handleSubmit = async () => {
    if (!selectedStore) { Alert.alert('Required', 'Please select a store'); return; }
    if (!selectedSku) { Alert.alert('Required', 'Please select a product/SKU'); return; }
    if (selectedFeedback.length === 0) { Alert.alert('Required', 'Please select at least one feedback type'); return; }
    if (!isValidOptionalPhone(mobileNo)) { Alert.alert('Invalid Phone', PHONE_VALIDATION_MESSAGE); return; }
    // Photo evidence is mandatory — the form previously submitted with no
    // image, so reps could log feedback without any proof.
    if (!imageUri) { Alert.alert('Required', 'Please capture a photo as evidence before submitting.'); return; }

    setLoading(true);
    try {
      // OPTIMISTIC submit: enqueue to the outbox and show success IMMEDIATELY.
      // The background flush uploads the (already watermarked) photo and posts
      // /product-feedback, retrying until it lands — the user never waits on the
      // network. imageUri is a local file:// path; the outbox uploads it and
      // fills `imagePath` with the returned server URL before posting.
      const { enqueueOutbox } = require('../services/outbox');
      await enqueueOutbox({
        endpoint: '/product-feedback',
        payload: {
          appTrxId: require('uuid').v4(),
          customerCode: selectedStore.value,
          customerName: selectedStore.label,
          itemCode: selectedSku.value,
          itemName: selectedSku.label,
          feedbackTypes: selectedFeedback.join(', '),
          customerNameField: customerName.trim() || undefined,
          mobileNo: mobileNo.trim() || undefined,
        },
        photo: imageUri ? { localPath: imageUri, field: 'imagePath', category: 'product-feedback' } : undefined,
      });

      setLoading(false);
      Alert.alert(
        'Feedback Submitted',
        `Feedback recorded for ${selectedStore.label}\nProduct: ${selectedSku.label}\nTypes: ${selectedFeedback.join(', ')}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err?.message ?? 'Failed to submit feedback. Please try again.');
    }
  };

  const DropdownButton = ({ label, value, onPress }: { label: string; value: string | null; onPress: () => void }) => (
    <TouchableOpacity style={styles.dropdown} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>
        {value ?? label}
      </Text>
      <Text style={styles.dropdownArrow}>▾</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Store */}
        <Text style={styles.label}>STORE *</Text>
        <DropdownButton label="Select Store" value={selectedStore?.label ?? null} onPress={() => setStoreModal(true)} />

        {/* SKU */}
        <Text style={styles.label}>PRODUCT / SKU *</Text>
        <DropdownButton label="Select Product" value={selectedSku?.label ?? null} onPress={() => setSkuModal(true)} />

        {/* Feedback Types */}
        <Text style={styles.label}>FEEDBACK TYPE * (multi-select)</Text>
        <TouchableOpacity style={styles.dropdown} onPress={() => setFeedbackModal(true)} activeOpacity={0.7}>
          {/* Single-line summary. Joining every selected type made the closed
              dropdown wrap to several lines and overflow into the fields below
              (the "collapsing" layout reps reported when picking Select All).
              numberOfLines={1} + a concise summary keeps the row a fixed height. */}
          <Text
            style={[styles.dropdownText, selectedFeedback.length === 0 && styles.dropdownPlaceholder]}
            numberOfLines={1}
          >
            {selectedFeedback.length === 0
              ? 'Select Feedback Type(s)'
              : selectedFeedback.length === feedbackTypeOptions.length
                ? `All ${selectedFeedback.length} selected`
                : selectedFeedback.length <= 2
                  ? selectedFeedback.join(', ')
                  : `${selectedFeedback.length} selected`}
          </Text>
          <Text style={styles.dropdownArrow}>▾</Text>
        </TouchableOpacity>

        {/* Customer Name — letters and spaces only. Numbers and special
            characters are stripped on input so a name can't carry digits
            or symbols (reps were typing phone numbers / junk here). */}
        <Text style={styles.label}>END CUSTOMER NAME</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter customer name"
          placeholderTextColor="#9CA3AF"
          value={customerName}
          onChangeText={(v) => setCustomerName(v.replace(/[^A-Za-z ]/g, ''))}
          autoCapitalize="words"
        />

        {/* Mobile Number */}
        <Text style={styles.label}>MOBILE NUMBER</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter 10-digit mobile number"
          placeholderTextColor="#9CA3AF"
          value={mobileNo}
          onChangeText={(v) => setMobileNo(normalizePhone(v))}
          keyboardType="phone-pad"
          maxLength={10}
        />

        {/* Image Capture */}
        <Text style={styles.label}>PHOTO EVIDENCE *</Text>
        {imageUri ? (
          // Outer View enforces full column width so the inner image cannot
          // collapse. Previous `alignSelf: 'stretch'` on the TouchableOpacity
          // alone left the preview blank on some Android devices — nested
          // touchables seem to confuse the auto-width measurement. Adding the
          // explicit-width wrapper makes the layout deterministic.
          <View style={{ width: '100%' }}>
            <TouchableOpacity onPress={() => setImageViewVisible(true)} activeOpacity={0.8} style={styles.imagePreviewBox}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="contain" />
              <View style={styles.stampOverlay}>
                {imageTs && (
                  <Text style={styles.stampText} numberOfLines={1}>
                    {new Date(imageTs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {imageLat != null && imageLng != null && (
                  <Text style={styles.stampText} numberOfLines={1}>
                    {imageLat.toFixed(5)}, {imageLng.toFixed(5)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            {/* Delete is a sibling of the image (not nested inside the
                TouchableOpacity) so the press doesn't bubble into "open the
                lightbox" and so the image's full-width layout isn't affected
                by a touchable child. */}
            <TouchableOpacity
              style={styles.photoDeleteBtn}
              onPress={handleDeletePhoto}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.photoDeleteBtnText}>×</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.7}>
            <Text style={styles.captureBtnIcon}>📷</Text>
            <Text style={styles.captureBtnText}>Capture Photo</Text>
          </TouchableOpacity>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Submit Feedback</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Store Modal */}
      <Modal visible={storeModal} animationType="slide" onRequestClose={() => setStoreModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Store</Text>
            <TouchableOpacity onPress={() => setStoreModal(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.modalSearch} placeholder="Search store..." placeholderTextColor="#9CA3AF" value={storeSearch} onChangeText={setStoreSearch} />
          <FlatList
            data={filteredStores}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setImageViewVisible(false);
                  setImageUri(null);
                  setImageTs(null);
                  setImageLat(null);
                  setImageLng(null);
                  setSelectedStore(item);
                  setStoreModal(false);
                  setStoreSearch('');
                }}
              >
                <Text style={styles.modalItemText}>{item.label}</Text>
                <Text style={styles.modalItemSub}>{item.value}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* SKU Modal */}
      <Modal visible={skuModal} animationType="slide" onRequestClose={() => setSkuModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Product</Text>
            <TouchableOpacity onPress={() => setSkuModal(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.modalSearch} placeholder="Search product..." placeholderTextColor="#9CA3AF" value={skuSearch} onChangeText={setSkuSearch} />
          <FlatList
            data={filteredSkus}
            keyExtractor={(i) => i.value}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.modalItem} onPress={() => { setSelectedSku(item); setSkuModal(false); setSkuSearch(''); }}>
                <Text style={styles.modalItemText}>{item.label}</Text>
                <Text style={styles.modalItemSub}>{item.value}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Feedback Type Modal */}
      <Modal visible={feedbackModal} animationType="slide" onRequestClose={() => setFeedbackModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Feedback Types</Text>
            <TouchableOpacity onPress={() => setFeedbackModal(false)}><Text style={styles.modalClose}>Done</Text></TouchableOpacity>
          </View>
          {/* Select All / Unselect All */}
          <View style={styles.selectAllRow}>
            <TouchableOpacity onPress={() => setSelectedFeedback([...feedbackTypeOptions])} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedFeedback([])} style={[styles.selectAllBtn, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.selectAllText, { color: '#DC2626' }]}>Unselect All</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={feedbackTypeOptions}
            keyExtractor={(i) => i}
            renderItem={({ item }) => {
              const selected = selectedFeedback.includes(item);
              return (
                <TouchableOpacity style={styles.checkRow} onPress={() => toggleFeedback(item)}>
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkLabel}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Full-screen photo viewer with timestamp + lat/lng */}
      <Modal visible={imageViewVisible} transparent animationType="fade" onRequestClose={() => setImageViewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity onPress={() => setImageViewVisible(false)}
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setImageViewVisible(false)}>
            {imageUri ? <Image source={{ uri: imageUri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" /> : null}
          </TouchableOpacity>
          {/* Metadata overlay removed — timestamp + lat/lng + address
              are already burned into the JPEG via BurnWatermark. */}
        </View>
      </Modal>

      {/* Off-screen watermark burner — renders only while a burn is pending */}
      {pendingWatermark && (
        <BurnWatermark
          photoUri={pendingWatermark.photoUri}
          info={pendingWatermark.info}
          onResult={pendingWatermark.callback}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  dropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 15, color: '#111827', flex: 1 },
  dropdownPlaceholder: { color: '#9CA3AF' },
  dropdownArrow: { fontSize: 14, color: '#6B7280' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },
  captureBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  captureBtnIcon: { fontSize: 28 },
  captureBtnText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  imagePreviewBox: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  imagePreview: { width: '100%', height: 200 },
  stampOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  stampText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  photoDeleteBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoDeleteBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  submitBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    ...Platform.select({
      ios: { shadowColor: '#1a56db', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Modal
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
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
  selectAllRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectAllBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  selectAllText: { fontSize: 13, fontWeight: '600', color: '#1a56db' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  checkLabel: { fontSize: 15, color: '#111827' },
});
