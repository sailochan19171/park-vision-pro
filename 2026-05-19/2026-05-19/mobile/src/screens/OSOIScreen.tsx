import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Alert,
  Platform, ActivityIndicator, Modal,
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
import { useBottomInset } from '../utils/safeBottom';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import PhotoThumbnail from '../components/common/PhotoThumbnail';
import ApprovalBadge from '../components/common/ApprovalBadge';

type RouteParams = { OSOI: { customerCode: string; customerName: string; visitCode?: string; preselectAssetType?: string } };

const ASSET_TYPES = [
  'Shelf Display', 'End Cap', 'Floor Display', 'Counter Display',
  'Window Display', 'Gondola', 'Chiller/Fridge', 'Checkout Area', 'Warehouse', 'Other',
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

export default function OSOIScreen() {
  const route = useRoute<RouteProp<RouteParams, 'OSOI'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode, preselectAssetType } = route.params;
  // Re-execute mode: opened from a rejected OSOI capture. Pre-binds the asset
  // type and starts clean (no prior photo loaded) so the rep captures a fresh
  // image and submits it for review.
  const isReExecute = !!preselectAssetType;
  const bottomInset = useBottomInset(16);
  const { clearDraft } = useActivityDrafts();
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);

  const [selectedType, setSelectedType] = useState(preselectAssetType ?? '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [assets, setAssets] = useState<CapturedAsset[]>([]);
  const [saving, setSaving] = useState(false);

  // Load ONLY the submitted OSOI rows from the local DB. No draft layer —
  // captures and edits live in memory until the rep taps Submit. One-shot
  // clearDraft wipes any stale draft a previous build left behind.
  useEffect(() => { clearDraft(customerCode, 'OSOI'); }, [customerCode, clearDraft]);

  useEffect(() => {
    if (isReExecute) return;
    // Guard: if user.code is empty we'd query WHERE user_code='' which
    // can match records whose user_code was never written (e.g. submitted
    // while user was still loading). Skip the load entirely — the user has
    // no day started without a valid code, so nothing meaningful can show.
    if (!user?.code) return;
    (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      try {
        const saved: any[] = await database.get('osoi_photos').query(
          Q.where('customer_code', customerCode),
          Q.where('user_code', user.code),
          Q.where('captured_on', Q.gte(todayStart.getTime())),
        ).fetch();
        if (saved.length === 0) return;
        const fromDb: CapturedAsset[] = saved.map((s: any) => ({
          id: s.id,
          assetType: s.assetType ?? s._raw?.asset_type ?? '',
          imageUri: s.imagePath ?? s._raw?.image_path ?? '',
          timestamp: s.capturedOn ?? s._raw?.captured_on ?? 0,
          latitude: s.geoLat ?? s._raw?.geo_lat ?? null,
          longitude: s.geoLng ?? s._raw?.geo_lng ?? null,
          submitted: true,
          approvalStatus: s.approvalStatus ?? s._raw?.approval_status ?? null,
        }));
        setAssets(fromDb);
      } catch (e) { console.warn("[App]", e); }
    })();
  }, [customerCode, isReExecute]);

  // Subscribe to approval status changes for submitted assets
  useEffect(() => {
    const submittedIds = assets.filter(a => a.submitted && a.id).map(a => a.id);
    if (submittedIds.length === 0) return;

    const subscription = database.get('osoi_photos')
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

  const handleCapture = async (replaceId?: string) => {
    if (!selectedType && !replaceId) { Alert.alert('Select Asset Type', 'Please select an asset type before capturing.'); return; }
    try {
      const photo = await capturePhoto(false);
      if (photo) {
        const ts = Date.now();
        let lat: number | null = null, lng: number | null = null;
        try { const pos = await getCurrentPosition(true); lat = pos?.lat ?? null; lng = pos?.lng ?? null; } catch (e) { console.warn("[App]", e); }
        const stampedUri = await burnWatermark(photo.uri, ts, lat, lng);
        if (replaceId) {
          setAssets(prev => prev.map(a =>
            a.id === replaceId
              ? { ...a, imageUri: stampedUri, timestamp: ts, latitude: lat, longitude: lng }
              : a
          ));
        } else {
          setAssets(prev => [...prev, {
            id: uuidv4(),
            assetType: selectedType,
            imageUri: stampedUri,
            timestamp: ts,
            latitude: lat,
            longitude: lng,
          }]);
        }
      } else {
        Alert.alert('Camera', 'Photo capture failed. Please try again.');
      }
    } catch {
      Alert.alert('Camera Error', 'Unable to access camera. Please check camera permissions.');
    }
  };

  // Re-execute a REJECTED OSOI capture: open a fresh OSOI screen with the
  // rejected item's asset type pre-bound. The new screen starts clean (no
  // prior photo) so the rep captures a new image and re-submits for review.
  const handleReExecute = (assetType: string) => {
    navigation.push('OSOI', {
      customerCode,
      customerName,
      visitCode,
      preselectAssetType: assetType,
    });
  };

  const handleSubmit = async () => {
    if (assets.length === 0) { Alert.alert('No Photos', 'Capture at least one photo.'); return; }
    setSaving(true);
    try {
      // Upsert by asset.id (the frontend-generated uuid) so re-submitting the
      // same captures updates the existing rows instead of inserting duplicates.
      const allExisting: any[] = await database.get('osoi_photos').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
      ).fetch();
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
              rec.assetType = asset.assetType;
              rec.imagePath = asset.imageUri;
              rec.geoLat = asset.latitude ?? null;
              rec.geoLng = asset.longitude ?? null;
              rec.visitCode = visitCode ?? '';
              // Re-submitted (e.g. after a rejection) — back to pending review.
              rec.approvalStatus = null;
              rec.isSynced = false;
            });
          } else {
            await database.get('osoi_photos').create((rec: any) => {
              rec._raw.id = asset.id; rec.appTrxId = asset.id; rec.userCode = user?.code ?? '';
              rec.customerCode = customerCode; rec.visitCode = visitCode ?? '';
              rec.assetType = asset.assetType; rec.imagePath = asset.imageUri;
              rec.geoLat = asset.latitude ?? null;
              rec.geoLng = asset.longitude ?? null;
              rec.capturedOn = Date.now(); rec.isSynced = false;
            });
          }
        }
      });
      pushSync().catch(() => {});
      Alert.alert('Success', `${assets.length} photo(s) saved.`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err: any) { Alert.alert('Error', err?.message ?? 'Failed.'); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.container}>
      <StoreActivityHeader customerCode={customerCode} customerName={customerName} visitCode={visitCode} title="OSOI Photo" />
      {/* Card */}
      <View style={s.card}>
        <Text style={s.label}>Select Asser Type</Text>
        <View style={s.dropdownRow}>
          <TouchableOpacity style={s.dropdown} onPress={() => setShowDropdown(true)} activeOpacity={0.7}>
            <Text style={[s.dropdownText, !selectedType && { color: '#9CA3AF' }]}>{selectedType || 'Select Asset Type'}</Text>
            <Icon name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={s.cameraBtn} onPress={() => handleCapture()} activeOpacity={0.7}>
            <Icon name="camera" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Table Header — Delete column hides itself once every row is
          already submitted; reappears as soon as a new unsubmitted
          capture is added. Keeps a completed screen visually tidy. */}
      {(() => {
        const showDeleteCol = assets.some(a => !a.submitted);
        return (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.thText, { flex: 1 }]}>Asset Type</Text>
              <Text style={[s.thText, { width: 80, textAlign: 'center' }]}>Image</Text>
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
                    {item.submitted ? (
                      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <ApprovalBadge status={item.approvalStatus} />
                        {/* Rejected OSOI capture can be re-executed: opens a
                            fresh OSOI screen with this asset type pre-bound. */}
                        {(item.approvalStatus ?? '').toLowerCase() === 'rejected' && (
                          <TouchableOpacity
                            style={s.reExecBtn}
                            onPress={() => handleReExecute(item.assetType)}
                            activeOpacity={0.7}
                            disabled={saving}
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
                      size={60}
                      onRetake={() => handleCapture(item.id)}
                      style={{ width: 60, height: 44, borderRadius: 6 }}
                    />
                  </View>
                  {showDeleteCol && (
                    item.submitted ? (
                      <View style={s.rowDelBtn} />
                    ) : (
                      <TouchableOpacity style={s.rowDelBtn} onPress={() => setAssets(prev => prev.filter(a => a.id !== item.id))}>
                        <Icon name="trash-outline" size={20} color="#111827" />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}
              ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No photos captured yet</Text></View>}
              contentContainerStyle={[s.list, assets.length === 0 && { flex: 1 }]}
            />
          </>
        );
      })()}

      {/* Submit */}
      <View style={[s.bottomBar, { paddingBottom: bottomInset }]}>
        <TouchableOpacity style={[s.submitBtn, assets.length === 0 && { opacity: 0.5 }]} onPress={handleSubmit} activeOpacity={0.8} disabled={saving || assets.length === 0}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit</Text>}
        </TouchableOpacity>
      </View>

      {/* Dropdown Modal */}
      <Modal visible={showDropdown} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDropdown(false)}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Select Asset Type</Text>
            {ASSET_TYPES.map(type => (
              <TouchableOpacity key={type} style={[s.modalItem, selectedType === type && s.modalItemActive]} onPress={() => { setSelectedType(type); setShowDropdown(false); }}>
                <Text style={[s.modalItemText, selectedType === type && { color: '#1a56db', fontWeight: '600' }]}>{type}</Text>
                {selectedType === type && <Icon name="checkmark" size={18} color="#1a56db" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  card: { backgroundColor: '#FFF', margin: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }) },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, height: 48, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 15, color: '#111827' },
  cameraBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#1a3a8f', alignItems: 'center', justifyContent: 'center' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  thText: { fontSize: 13, fontWeight: '700', color: '#1a3a8f' },
  list: { paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowAlt: { backgroundColor: '#F9FAFB' },
  rowType: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  rowImgBox: { width: 60, height: 44, borderRadius: 6, overflow: 'hidden', marginHorizontal: 10 },
  rowImg: { width: 60, height: 44 },
  rowDelBtn: { width: 40, alignItems: 'center' },
  reExecBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1a3a8f', backgroundColor: '#EFF3FB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  reExecText: { fontSize: 11, fontWeight: '700', color: '#1a3a8f' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  submitBtn: { backgroundColor: '#1a3a8f', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  modal: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemActive: { backgroundColor: '#EFF6FF', borderRadius: 8 },
  modalItemText: { fontSize: 15, color: '#374151' },
});
