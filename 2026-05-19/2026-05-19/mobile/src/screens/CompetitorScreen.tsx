import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Image,
  Platform, Alert, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition } from '../services/locationService';
import { pushSync } from '../services/syncService';
import { useBottomInset } from '../utils/safeBottom';
import { useWatermark } from '../hooks/useWatermark';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import PhotoThumbnail, { PhotoMeta } from '../components/common/PhotoThumbnail';
import { formatPriceInput } from '../utils/priceValidation';
import { API_BASE_URL } from '../config';

// Resolve a stored image path for <Image>. A freshly-captured photo is a local
// file:// path; after a Master-Data sync / reinstall / user switch the restore
// brings back the SERVER path (a relative "/public/..." URL), which React Native
// cannot load on its own — prefix it with the API host. http(s) URLs pass through.
function resolveImageUri(p?: string | null): string | null {
  if (!p) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('/')) return `${API_BASE_URL}${p}`;
  return p; // file:// or content:// local path
}

type RouteParams = { Competitor: { customerCode: string; customerName: string; visitCode: string } };

interface SavedObs { id: string; brandName: string; productName: string; imagePath?: string | null; dateTime: string; }

export default function CompetitorScreen() {
  const route = useRoute<RouteProp<RouteParams, 'Competitor'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;
  const bottomInset = useBottomInset(16);
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);

  const [observations, setObservations] = useState<SavedObs[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  // True while the captured photo is being watermarked + copied to its
  // permanent path. Submit is disabled during this window so the rep
  // can't ship a raw / un-watermarked photo even though the thumbnail
  // shows up instantly via the optimistic setPhotoData below.
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [brands, setBrands] = useState<string[]>([]);

  // Form state
  const [brandName, setBrandName] = useState('');
  const [productName, setProductName] = useState('');
  const [mrp, setMrp] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [uom, setUom] = useState('');
  const [photoData, setPhotoData] = useState<PhotoMeta | null>(null);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Note: form fields intentionally do NOT persist as a draft. The capture
  // form must always open blank — leaving the screen, coming back, or tapping
  // "Capture" again after a submit should never re-fill the previously
  // entered brand/product/photo. The history of submitted observations is
  // loaded from the database below.

  const PRODUCTS =['Cashews', 'Almonds', 'Raisins', 'Dates', 'Date Bites', 'Trail Mix', 'Makhana', 'Pumpkin Seeds', 'Chia Seeds', 'Seed Mix', 'Walnuts', 'Pistachios', 'Anjeer', 'Cranberries', 'Dry Fruits Mix', 'Granola', 'Peanuts', 'Quinoa Seeds', 'Apricot', 'Other'];

  useEffect(() => {
    (async () => {
      try {
        const cb: any[] = await database.get('competitor_brands').query().fetch();
        if (cb.length > 0) {
          // The backend DB stores the actual competitor brand name in 'competitorBrandName'
          // and 'brandName' is the owner POV which is always 'Farmley'.
          const rawBrands = cb.map((b: any) => b.competitorBrandName || b.brandName || b.brandCode);
          setBrands(Array.from(new Set(rawBrands)));
        } else {
          setBrands(['Happilo', 'Nutraj', 'Go Nuts', 'Berries', 'Tulsi', 'Rostaa', 'True Elements', 'Vedaka', 'Solimo', 'Miltop', 'Carnival', 'Dry Fruit Hub', 'Wonderland', 'Looms & Weaves', 'Nutty Gritties', 'Other']);
        }
      } catch {
        setBrands(['Happilo', 'Nutraj', 'Go Nuts', 'Berries', 'Tulsi', 'Rostaa', 'True Elements', 'Vedaka', 'Solimo', 'Miltop', 'Carnival', 'Dry Fruit Hub', 'Wonderland', 'Looms & Weaves', 'Nutty Gritties', 'Other']);
      }

      // Load existing observations for today
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      try {
        const existing: any[] = await database.get('competitor_observations').query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
          Q.where('observed_on', Q.gte(todayStart.getTime())),
        ).fetch();
        setObservations(existing.map((o: any) => ({
          id: o.id, brandName: o.brandName, productName: o.productName ?? '',
          imagePath: resolveImageUri(o.imagePath ?? o._raw?.image_path ?? null),
          dateTime: new Date(o.observedOn).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        })));
      } catch (e) { console.warn("[App]", e); }
    })();
  }, []);

  const resetForm = () => {
    setBrandName(''); setProductName(''); setMrp(''); setSellingPrice(''); setUom(''); setPhotoData(null);
  };

  const handleCapturePhoto = async () => {
    try {
      const p = await capturePhoto(false);
      if (!p) {
        Alert.alert('Camera', 'Photo capture failed. Please try again.');
        return;
      }

      // Optimistic UI: paint the raw capture into the photo slot immediately
      // so the rep sees the thumbnail the same frame they hit the shutter.
      // On older / slower phones the watermark composition + permanent-file
      // copy below can take a noticeable second or two, and the previous
      // flow waited for ALL of it before setPhotoData fired — looked like
      // the capture hadn't worked. The state is overwritten with the final
      // watermarked URI when the background work resolves; the Submit
      // button is gated on photoProcessing so the rep can't ship the raw
      // un-watermarked file by accident.
      const previewTs = Date.now();
      setPhotoData({ uri: p.uri, timestamp: previewTs, latitude: null, longitude: null, customerCode, customerName });
      setPhotoProcessing(true);

      let lat: number | null = null, lng: number | null = null;
      try { const pos = await getCurrentPosition(true); lat = pos?.lat ?? null; lng = pos?.lng ?? null; } catch (e) { console.warn("[App]", e); }

      // Copy the capture to a uniquely-named permanent file. The camera
      // reuses the same temp URI for every shot, so without this copy two
      // observations end up pointing at the same path — and the list ends
      // up showing the first / latest image for every row. Use uuidv4 in
      // the filename (Date.now() can collide on back-to-back captures) and
      // surface a hard error if the copy fails so the user retries instead
      // of silently saving a record pointing at a temp file.
      const filename = `competitor_${uuidv4()}.jpg`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;

      const ts = Date.now();
      const stampedUri = await burnWatermark(p.uri, ts, lat, lng);

      const sourcePath = stampedUri.replace(/^file:\/\//, '');
      try {
        await RNFS.copyFile(sourcePath, destPath);
      } catch (e) {
        console.error('[Competitor] failed to copy capture to permanent location:', e);
        Alert.alert('Photo Error', 'Could not save the captured photo. Please try again.');
        setPhotoData(null);
        setPhotoProcessing(false);
        return;
      }
      setPhotoData({ uri: `file://${destPath}`, timestamp: ts, latitude: lat, longitude: lng, customerCode, customerName });
      setPhotoProcessing(false);
    } catch {
      Alert.alert('Camera Error', 'Unable to access camera. Please check camera permissions.');
      setPhotoProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!brandName) { Alert.alert('Required', 'Select a competitor brand name.'); return; }
    if (!mrp.trim()) { Alert.alert('Required', 'Please enter MRP.'); return; }
    if (!sellingPrice.trim()) { Alert.alert('Required', 'Please enter Selling Price.'); return; }
    if (!uom.trim()) { Alert.alert('Required', 'Please enter UOM.'); return; }
    // Photo is mandatory — every competitor observation must have a
    // captured image alongside the price/UOM data.
    if (!photoData?.uri) { Alert.alert('Photo Required', 'Please capture a photo before submitting.'); return; }
    setSaving(true);
    try {
      const id = uuidv4();
      const now = Date.now();
      const mrpNum = parseFloat(mrp);
      const spNum = parseFloat(sellingPrice);
      await database.write(async () => {
        await database.get('competitor_observations').create((rec: any) => {
          rec._raw.id = id; rec.appTrxId = id; rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode; rec.visitCode = visitCode;
          rec.brandName = brandName; rec.productName = productName;
          rec.category = '';
          rec.price = !isNaN(mrpNum) ? mrpNum : (!isNaN(spNum) ? spNum : 0);
          rec.sellingPrice = !isNaN(spNum) ? spNum : null;
          rec.uom = uom || null;
          rec.imagePath = photoData?.uri ?? '';
          rec.notes = `MRP:${mrp} SP:${sellingPrice} UOM:${uom}`;
          rec.observedOn = now;
          rec.geoLat = photoData?.latitude ?? null;
          rec.geoLng = photoData?.longitude ?? null;
          rec.isSynced = false;
        });
      });
      setObservations(prev => [...prev, {
        id, brandName, productName,
        imagePath: photoData?.uri ?? null,
        dateTime: new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      }]);
      pushSync().catch(() => {});
      resetForm();
      setShowForm(false);
    } catch (err: any) { Alert.alert('Error', err?.message ?? 'Failed.'); }
    finally { setSaving(false); }
  };

  const filtered = search.trim()
    ? observations.filter(o => o.brandName.toLowerCase().includes(search.toLowerCase()) || o.productName.toLowerCase().includes(search.toLowerCase()))
    : observations;

  return (
    <View style={s.container}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="Competitor Observation" />
      {!showForm ? (
        /* ── List View ── */
        <>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.captureBtn} onPress={() => { resetForm(); setShowForm(true); }} activeOpacity={0.8}>
              <Text style={s.captureBtnText}>Capture</Text>
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <TextInput style={s.searchInput} placeholder="Search by Item Code/Item Name" placeholderTextColor="#9CA3AF" value={search} onChangeText={setSearch} />
            <Icon name="search" size={20} color="#9CA3AF" />
          </View>

          <View style={s.tableHeader}>
            <Text style={[s.thText, { flex: 1 }]}>Competitor Brand Name</Text>
            <Text style={s.thDivider}>|</Text>
            <Text style={[s.thText, { flex: 1, textAlign: 'center' }]}>Product Name</Text>
            <Text style={s.thDivider}>|</Text>
            <Text style={[s.thText, { width: 80, textAlign: 'center' }]}>Date & Time</Text>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <View style={[s.row, index % 2 === 0 && s.rowAlt]}>
                {item.imagePath ? (
                  <Image source={{ uri: item.imagePath }} style={{ width: 36, height: 36, borderRadius: 6, marginRight: 8 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 6, marginRight: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, color: '#9CA3AF' }}>📷</Text>
                  </View>
                )}
                <Text style={[s.cellText, { flex: 1 }]}>{item.brandName}</Text>
                <Text style={[s.cellText, { flex: 1, textAlign: 'center' }]}>{item.productName}</Text>
                <Text style={[s.cellText, { width: 80, textAlign: 'center', fontSize: 11 }]}>{item.dateTime}</Text>
              </View>
            )}
            ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No Competitor data found</Text></View>}
            contentContainerStyle={[s.list, filtered.length === 0 && { flex: 1, justifyContent: 'center' }]}
          />
        </>
      ) : (
        /* ── Capture Form ── */
        <ScrollView style={s.scroll} contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.formTitle}>Competitor Observation</Text>

            <Text style={s.label}>Competitor Brand Name</Text>
            <TouchableOpacity style={s.dropdown} onPress={() => setShowBrandPicker(true)}>
              <Text style={[s.dropdownText, !brandName && { color: '#9CA3AF' }]}>{brandName || 'Select Competitor Brand Name'}</Text>
              <Icon name="chevron-down" size={18} color="#6B7280" />
            </TouchableOpacity>

            <Text style={s.label}>Product Name</Text>
            <TouchableOpacity style={s.dropdown} onPress={() => setShowProductPicker(true)}>
              <Text style={[s.dropdownText, !productName && { color: '#9CA3AF' }]}>{productName || 'Select Product Name'}</Text>
              <Icon name="chevron-down" size={18} color="#6B7280" />
            </TouchableOpacity>

            <Text style={s.label}>MRP *</Text>
            <TextInput style={s.input} placeholder="Enter MRP" placeholderTextColor="#9CA3AF" value={mrp} onChangeText={(t) => setMrp(formatPriceInput(t, mrp))} keyboardType="decimal-pad" />

            <Text style={s.label}>Selling Price *</Text>
            <TextInput style={s.input} placeholder="Enter Selling Price" placeholderTextColor="#9CA3AF" value={sellingPrice} onChangeText={(t) => setSellingPrice(formatPriceInput(t, sellingPrice))} keyboardType="decimal-pad" />

            <Text style={s.label}>UOM *</Text>
            <TextInput
              style={s.input}
              placeholder="Enter UOM value"
              placeholderTextColor="#9CA3AF"
              value={uom}
              // Numeric keypad — UOM here is the value (e.g. 250, 500, 1.5).
              // Strip any non-digit / non-decimal characters and cap one dot.
              onChangeText={(t) => {
                let s2 = t.replace(/[^0-9.]/g, '');
                const firstDot = s2.indexOf('.');
                if (firstDot !== -1) s2 = s2.slice(0, firstDot + 1) + s2.slice(firstDot + 1).replace(/\./g, '');
                setUom(s2.slice(0, 20));
              }}
              keyboardType="decimal-pad"
              maxLength={20}
            />

            <Text style={s.label}>Capture Image</Text>
            {photoData ? (
              <PhotoThumbnail
                photo={photoData}
                size={80}
                onRetake={handleCapturePhoto}
                onRemove={() => setPhotoData(null)}
                showDeleteBeside
              />
            ) : (
              <TouchableOpacity style={s.captureBox} onPress={handleCapturePhoto}>
                <Icon name="camera-outline" size={32} color="#6B7280" />
                <Text style={s.captureBoxText}>Capture</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      {/* Bottom Buttons */}
      {showForm && (
        <View style={[s.bottomBar, { paddingBottom: bottomInset }]}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => { resetForm(); setShowForm(false); }} activeOpacity={0.8}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.submitBtn, (saving || photoProcessing) && { opacity: 0.7 }]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={saving || photoProcessing}
          >
            {(saving || photoProcessing) ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Brand Picker */}
      <Modal visible={showBrandPicker} transparent animationType="fade">
        <TouchableOpacity style={s.pickerOverlay} activeOpacity={1} onPress={() => setShowBrandPicker(false)}>
          <View style={s.pickerModal}>
            <Text style={s.pickerTitle}>Select Brand</Text>
            <FlatList data={brands} keyExtractor={i => i} renderItem={({ item }) => (
              <TouchableOpacity style={[s.pickerItem, brandName === item && s.pickerItemActive]} onPress={() => { setBrandName(item); setShowBrandPicker(false); }}>
                <Text style={[s.pickerItemText, brandName === item && { color: '#1a56db', fontWeight: '700' }]}>{item}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Product Picker */}
      <Modal visible={showProductPicker} transparent animationType="fade">
        <TouchableOpacity style={s.pickerOverlay} activeOpacity={1} onPress={() => setShowProductPicker(false)}>
          <View style={s.pickerModal}>
            <Text style={s.pickerTitle}>Select Product</Text>
            <FlatList data={PRODUCTS} keyExtractor={i => i} renderItem={({ item }) => (
              <TouchableOpacity style={[s.pickerItem, productName === item && s.pickerItemActive]} onPress={() => { setProductName(item); setShowProductPicker(false); }}>
                <Text style={[s.pickerItemText, productName === item && { color: '#1a56db', fontWeight: '700' }]}>{item}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },
  formContent: { padding: 12, paddingBottom: 80 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  captureBtn: { backgroundColor: '#1a3a8f', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  captureBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10 },
  thText: { fontSize: 12, fontWeight: '700', color: '#1a3a8f' },
  thDivider: { color: '#93C5FD', marginHorizontal: 4 },

  list: { paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowAlt: { backgroundColor: '#F9FAFB' },
  cellText: { fontSize: 13, color: '#111827' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },

  // Form
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#F9FAFB' },
  dropdownText: { fontSize: 15, color: '#111827' },

  captureBox: { borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 30, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  captureBoxText: { fontSize: 14, color: '#6B7280', marginTop: 6 },
  photoPreview: { width: '100%', height: 150, borderRadius: 12, marginTop: 4 },

  bottomBar: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  cancelBtn: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  submitBtn: { flex: 1, backgroundColor: '#1a3a8f', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  pickerModal: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, maxHeight: '60%' },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  pickerItemActive: { backgroundColor: '#EFF6FF', borderRadius: 8 },
  pickerItemText: { fontSize: 15, color: '#374151' },
});
