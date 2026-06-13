import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { reverseGeocode } from '../services/reverseGeocode';
import { Modal } from 'react-native';

const SOS_STORAGE_KEY = 'share_of_shelf_data';

type RouteParams = {
  ShareOfShelf: {
    customerCode: string;
    customerName: string;
    visitCode?: string;
  };
};

interface BrandFacing {
  brand: string;
  facings: number;
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Colour palette for brand slices
const BRAND_COLORS = [
  '#1a56db', '#7c3aed', '#db2777', '#ea580c',
  '#16a34a', '#0891b2', '#d97706', '#be123c',
  '#4f46e5', '#065f46',
];

export default function ShareOfShelfScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'ShareOfShelf'>>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode } = route.params;

  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [brandFacings, setBrandFacings] = useState<BrandFacing[]>([]);
  const [shelfPhoto, setShelfPhoto] = useState<string | null>(null);
  const [shelfPhotoTs, setShelfPhotoTs] = useState<number | null>(null);
  const [shelfPhotoLat, setShelfPhotoLat] = useState<number | null>(null);
  const [shelfPhotoLng, setShelfPhotoLng] = useState<number | null>(null);
  const [shelfPhotoAddress, setShelfPhotoAddress] = useState<string | null>(null);
  const [shelfPhotoView, setShelfPhotoView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);

  // Load categories and saved data on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allItems: any[] = await database
        .get('items')
        .query(Q.where('is_active', true))
        .fetch();

      const catSet = new Set<string>();
      for (const item of allItems) {
        catSet.add(item.category ?? 'Uncategorized');
      }
      const cats = Array.from(catSet).sort();
      setCategories(cats);

      if (cats.length > 0) {
        setSelectedCategory(cats[0]);
      }

      // Restore previously saved data
      try {
        const key = `${SOS_STORAGE_KEY}_${customerCode}_${getTodayString()}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.selectedCategory) setSelectedCategory(saved.selectedCategory);
          if (saved.brandFacings) setBrandFacings(saved.brandFacings);
          if (saved.shelfPhoto) setShelfPhoto(saved.shelfPhoto);
        }
      } catch {
        // no previous data
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load product data.');
    } finally {
      setLoading(false);
    }
  }, [customerCode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When category changes, load brands for that category and init facings
  const loadBrandsForCategory = useCallback(
    async (category: string) => {
      if (!category) return;
      const allItems: any[] = await database
        .get('items')
        .query(Q.and(Q.where('is_active', true), Q.where('category', category)))
        .fetch();

      const brandSet = new Set<string>();
      for (const item of allItems) {
        brandSet.add(item.brand ?? 'Farmley');
      }

      setBrandFacings(
        Array.from(brandSet)
          .sort()
          .map((brand) => {
            // preserve existing value if present
            const existing = brandFacings.find((b) => b.brand === brand);
            return { brand, facings: existing?.facings ?? 0 };
          }),
      );
    },
    [brandFacings],
  );

  useEffect(() => {
    if (selectedCategory) {
      loadBrandsForCategory(selectedCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const updateFacings = useCallback((brand: string, text: string) => {
    const parsed = parseInt(text, 10);
    const facings = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setBrandFacings((prev) =>
      prev.map((b) => (b.brand === brand ? { ...b, facings } : b)),
    );
  }, []);

  const totalFacings = useMemo(
    () => brandFacings.reduce((s, b) => s + b.facings, 0),
    [brandFacings],
  );

  const brandsWithShare = useMemo(
    () =>
      brandFacings.map((b, idx) => ({
        ...b,
        share: totalFacings > 0 ? ((b.facings / totalFacings) * 100).toFixed(1) : '0.0',
        color: BRAND_COLORS[idx % BRAND_COLORS.length],
      })),
    [brandFacings, totalFacings],
  );

  const handleCapture = async () => {
    setCaptureLoading(true);
    try {
      const photo = await capturePhoto(false);
      if (photo) {
        setShelfPhoto(photo.uri);
        setShelfPhotoTs(Date.now());
        setShelfPhotoAddress(null);
        try {
          const { getCurrentPosition } = require('../services/locationService');
          const pos = await getCurrentPosition(true);
          if (pos) { setShelfPhotoLat(pos.lat); setShelfPhotoLng(pos.lng); }
        } catch { /* GPS optional */ }
      }
    } finally {
      setCaptureLoading(false);
    }
  };

  const handleDeleteShelfPhoto = () => {
    setShelfPhoto(null);
    setShelfPhotoTs(null);
    setShelfPhotoLat(null);
    setShelfPhotoLng(null);
    setShelfPhotoAddress(null);
    setShelfPhotoView(false);
  };

  // Lazy reverse-geocode when fullscreen viewer opens.
  useEffect(() => {
    if (!shelfPhotoView) return;
    if (shelfPhotoAddress) return;
    if (shelfPhotoLat == null || shelfPhotoLng == null) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = await reverseGeocode(shelfPhotoLat, shelfPhotoLng);
        if (!cancelled && addr) setShelfPhotoAddress(addr);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [shelfPhotoView, shelfPhotoLat, shelfPhotoLng, shelfPhotoAddress]);

  const handleSave = async () => {
    if (totalFacings === 0) {
      Alert.alert('No Data', 'Enter facings for at least one brand before saving.');
      return;
    }

    setSaving(true);
    try {
      const key = `${SOS_STORAGE_KEY}_${customerCode}_${getTodayString()}`;
      const payload = {
        customerCode,
        customerName,
        visitCode,
        userCode: user?.code ?? '',
        date: getTodayString(),
        selectedCategory,
        brandFacings: brandsWithShare,
        totalFacings,
        shelfPhoto,
        savedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(payload));

      // Also attempt WatermelonDB store_checks save
      try {
        const { v4: uuidv4 } = require('uuid');
        const appId = uuidv4();
        await database.write(async () => {
          await (database.get('store_checks') as any).create((rec: any) => {
            rec._raw.id = appId;
            rec.appId = appId;
            rec.userCode = user?.code ?? '';
            rec.customerCode = customerCode;
            rec.customerName = customerName;
            rec.visitCode = visitCode ?? null;
            rec.checkDate = Date.now();
            rec.totalCount = brandsWithShare.length;
            rec.status = 1;
            rec.isSynced = false;
          });
        });
      } catch {
        // store_checks table may not support this shape — AsyncStorage fallback is sufficient
      }

      Alert.alert(
        'Saved',
        `Share of shelf saved for ${selectedCategory} with ${brandsWithShare.length} brand(s).`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert('Error', 'Failed to save data.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading categories...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Share of Shelf</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{customerName}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category selector */}
        <Text style={styles.sectionLabel}>Select Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.catChipText, selectedCategory === cat && styles.catChipTextActive]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Total facings badge */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Facings</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{totalFacings}</Text>
          </View>
        </View>

        {/* Brand facings list */}
        {brandsWithShare.length === 0 ? (
          <View style={styles.emptyBrands}>
            <Icon name="pricetag-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyBrandsText}>No brands found for this category</Text>
          </View>
        ) : (
          <View style={styles.brandsContainer}>
            {brandsWithShare.map((brand) => (
              <View key={brand.brand} style={styles.brandRow}>
                <View style={[styles.brandColorDot, { backgroundColor: brand.color }]} />
                <View style={styles.brandInfo}>
                  <Text style={styles.brandName}>{brand.brand}</Text>
                  <Text style={styles.brandShare}>{brand.share}% share</Text>
                </View>
                <View style={styles.facingInputRow}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      updateFacings(brand.brand, String(Math.max(0, brand.facings - 1)))
                    }
                  >
                    <Icon name="remove" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.facingInput}
                    value={brand.facings > 0 ? String(brand.facings) : ''}
                    onChangeText={(t) => updateFacings(brand.brand, t)}
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateFacings(brand.brand, String(brand.facings + 1))}
                  >
                    <Icon name="add" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                {/* Share bar */}
                <View style={styles.shareBarContainer}>
                  <View
                    style={[
                      styles.shareBar,
                      {
                        width: `${parseFloat(brand.share)}%`,
                        backgroundColor: brand.color,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Photo capture */}
        <Text style={styles.sectionLabel}>Shelf Photo</Text>
        {!shelfPhoto && (
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            disabled={captureLoading}
            activeOpacity={0.8}
          >
            {captureLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Icon name="camera-outline" size={22} color={Colors.primary} />
                <Text style={styles.captureBtnText}>Capture Shelf Photo</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {shelfPhoto ? (
          <View style={{ width: '100%', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => setShelfPhotoView(true)} activeOpacity={0.8} style={styles.sosPhotoBox}>
              <Image source={{ uri: shelfPhoto }} style={styles.photoPreview} resizeMode="contain" />
              <View style={styles.sosStampOverlay}>
                {shelfPhotoTs && (
                  <Text style={styles.sosStampText} numberOfLines={1}>
                    {new Date(shelfPhotoTs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {shelfPhotoLat != null && shelfPhotoLng != null && (
                  <Text style={styles.sosStampText} numberOfLines={1}>
                    {shelfPhotoLat.toFixed(5)}, {shelfPhotoLng.toFixed(5)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sosPhotoDeleteBtn}
              onPress={handleDeleteShelfPhoto}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.sosPhotoDeleteBtnText}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Full-screen viewer for shelf photo */}
        <Modal visible={shelfPhotoView} transparent animationType="fade" onRequestClose={() => setShelfPhotoView(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
            <TouchableOpacity onPress={() => setShelfPhotoView(false)}
              style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
              <Icon name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShelfPhotoView(false)}>
              {shelfPhoto ? <Image source={{ uri: shelfPhoto }} style={{ flex: 1, width: '100%' }} resizeMode="contain" /> : null}
            </TouchableOpacity>
            {/* Metadata overlay removed — timestamp + lat/lng + address
                are already burned into the JPEG via BurnWatermark. */}
          </View>
        </Modal>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, (saving || totalFacings === 0) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || totalFacings === 0}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Icon name="checkmark-circle-outline" size={20} color={Colors.white} />
              <Text style={styles.saveBtnText}>Save Share of Shelf</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 8,
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryScrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  catChipTextActive: {
    color: Colors.white,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  totalBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  totalBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  emptyBrands: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  emptyBrandsText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  brandsContainer: {
    gap: 8,
    marginBottom: 20,
  },
  brandRow: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  brandColorDot: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
    borderRadius: 12,
  },
  brandInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 8,
  },
  brandName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  brandShare: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  facingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    gap: 8,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  facingInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  shareBarContainer: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginTop: 4,
    marginLeft: 8,
    overflow: 'hidden',
  },
  shareBar: {
    height: 6,
    borderRadius: 3,
    maxWidth: '100%',
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    backgroundColor: Colors.primaryLight,
    marginBottom: 12,
  },
  captureBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  photoPreviewContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 2,
  },
  sosPhotoBox: { width: '100%', borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: '#E5E7EB' },
  sosStampOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  sosStampText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  sosPhotoDeleteBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  sosPhotoDeleteBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
