import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { reverseGeocode } from '../services/reverseGeocode';

type RouteParams = {
  PermanentDisplayCheck: {
    displayId: string;
    customerCode: string;
    customerName: string;
    visitCode?: string;
    displayType: string;
  };
};

interface DisplayInfo {
  displayType: string;
  locationDescription: string;
}

export default function PermanentDisplayCheckScreen() {
  const route = useRoute<RouteProp<RouteParams, 'PermanentDisplayCheck'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { displayId, customerCode, customerName, visitCode, displayType } = route.params;

  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null);
  const [loadingDisplay, setLoadingDisplay] = useState(true);
  const [isCompliant, setIsCompliant] = useState(true);
  const [issueDescription, setIssueDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTs, setPhotoTs] = useState<number | null>(null);
  const [photoLat, setPhotoLat] = useState<number | null>(null);
  const [photoLng, setPhotoLng] = useState<number | null>(null);
  const [photoAddress, setPhotoAddress] = useState<string | null>(null);
  const [photoViewVisible, setPhotoViewVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photoViewVisible) return;
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
  }, [photoViewVisible, photoLat, photoLng, photoAddress]);

  const loadDisplay = useCallback(async () => {
    try {
      const records = await database
        .get('permanent_displays')
        .query(Q.where('id', displayId))
        .fetch();
      if (records.length > 0) {
        const r: any = records[0];
        setDisplayInfo({
          displayType: r.displayType,
          locationDescription: r.locationDescription ?? '',
        });
      }
    } catch (err) {
      console.error('PermanentDisplayCheckScreen loadDisplay error:', err);
    } finally {
      setLoadingDisplay(false);
    }
  }, [displayId]);

  useEffect(() => {
    loadDisplay();
  }, [loadDisplay]);

  const handleCapturePhoto = async () => {
    try {
      const photo = await capturePhoto();
      if (photo) {
        const uri = typeof photo === 'string' ? photo : (photo as any).uri ?? null;
        setPhotoUri(uri);
        setPhotoTs(Date.now());
        setPhotoAddress(null);
        try {
          const { getCurrentPosition } = require('../services/locationService');
          const pos = await getCurrentPosition(true);
          if (pos) { setPhotoLat(pos.lat); setPhotoLng(pos.lng); }
        } catch { /* GPS optional */ }
      }
    } catch {
      Alert.alert('Camera Error', 'Could not capture photo.');
    }
  };

  const handleDeletePhoto = () => {
    setPhotoUri(null);
    setPhotoTs(null);
    setPhotoLat(null);
    setPhotoLng(null);
    setPhotoAddress(null);
    setPhotoViewVisible(false);
  };

  const handleSubmit = async () => {
    if (!isCompliant && issueDescription.trim() === '') {
      Alert.alert('Issue Required', 'Please describe the non-compliance issue.');
      return;
    }

    setSaving(true);
    try {
      const id = uuidv4();
      await database.write(async () => {
        await database.get('permanent_display_checks').create((rec: any) => {
          rec._raw.id = id;
          rec.appTrxId = id;
          rec.displayId = displayId;
          rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode;
          rec.visitCode = visitCode ?? null;
          rec.isCompliant = isCompliant;
          rec.issueDescription = isCompliant ? null : issueDescription.trim();
          rec.photoPath = photoUri ?? null;
          rec.checkedOn = Date.now();
          rec.isSynced = false;
        });
      });

      Alert.alert(
        'Saved',
        `Display check recorded as ${isCompliant ? 'Compliant' : 'Non-Compliant'}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to save check. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Display Details Card */}
      {loadingDisplay ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.displayCard}>
          <Text style={styles.displayType}>
            {displayInfo?.displayType ?? displayType}
          </Text>
          {displayInfo?.locationDescription !== '' && (
            <Text style={styles.locationDesc}>{displayInfo?.locationDescription}</Text>
          )}
          <Text style={styles.storeLabel}>
            {customerName} · {customerCode}
          </Text>
        </View>
      )}

      {/* Compliance Toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Compliance Status</Text>
        <View style={styles.complianceRow}>
          <TouchableOpacity
            style={[
              styles.complianceBtn,
              isCompliant && styles.complianceBtnCompliant,
            ]}
            activeOpacity={0.75}
            onPress={() => setIsCompliant(true)}
          >
            <Text style={styles.complianceBtnIcon}>✅</Text>
            <Text
              style={[
                styles.complianceBtnText,
                isCompliant && styles.complianceBtnTextCompliant,
              ]}
            >
              Compliant
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.complianceBtn,
              !isCompliant && styles.complianceBtnNonCompliant,
            ]}
            activeOpacity={0.75}
            onPress={() => setIsCompliant(false)}
          >
            <Text style={styles.complianceBtnIcon}>❌</Text>
            <Text
              style={[
                styles.complianceBtnText,
                !isCompliant && styles.complianceBtnTextNonCompliant,
              ]}
            >
              Non-Compliant
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Issue Description (shown if non-compliant) */}
      {!isCompliant && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Issue Description</Text>
          <TextInput
            style={styles.issueInput}
            placeholder="Describe the non-compliance issue..."
            placeholderTextColor={Colors.textSecondary}
            value={issueDescription}
            onChangeText={setIssueDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      )}

      {/* Photo */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Photo Evidence</Text>
        {photoUri ? (
          <View style={{ width: '100%' }}>
            <TouchableOpacity onPress={() => setPhotoViewVisible(true)} activeOpacity={0.8} style={styles.photoPreviewBox}>
              <Image source={{ uri: photoUri }} style={styles.photoThumbnail} resizeMode="contain" />
              <View style={styles.stampOverlay}>
                {photoTs && (
                  <Text style={styles.stampText} numberOfLines={1}>
                    {new Date(photoTs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {photoLat != null && photoLng != null && (
                  <Text style={styles.stampText} numberOfLines={1}>
                    {photoLat.toFixed(5)}, {photoLng.toFixed(5)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoDeleteBtn}
              onPress={handleDeletePhoto}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.photoDeleteBtnText}>×</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={handleCapturePhoto}
            activeOpacity={0.75}
          >
            <Text style={styles.photoBtnIcon}>📷</Text>
            <Text style={styles.photoBtnText}>Take Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Full-screen photo viewer */}
      <Modal visible={photoViewVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity onPress={() => setPhotoViewVisible(false)}
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPhotoViewVisible(false)}>
            {photoUri ? <Image source={{ uri: photoUri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" /> : null}
          </TouchableOpacity>
          {/* Metadata overlay removed — timestamp + lat/lng + address
              are already burned into the JPEG via BurnWatermark. */}
        </View>
      </Modal>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
        activeOpacity={0.8}
        onPress={handleSubmit}
        disabled={saving}
      >
        <Text style={styles.submitBtnText}>
          {saving ? 'Saving...' : 'Save Check'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loadingCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...cardShadow,
  },
  displayCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    ...cardShadow,
  },
  displayType: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  locationDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  storeLabel: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 10,
  },
  complianceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  complianceBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 8,
    ...cardShadow,
  },
  complianceBtnCompliant: {
    backgroundColor: '#f0fdf4',
    borderColor: Colors.primary,
  },
  complianceBtnNonCompliant: {
    backgroundColor: '#fef2f2',
    borderColor: Colors.danger,
  },
  complianceBtnIcon: {
    fontSize: 28,
  },
  complianceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  complianceBtnTextCompliant: {
    color: Colors.primaryDark,
  },
  complianceBtnTextNonCompliant: {
    color: Colors.danger,
  },
  issueInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    textAlignVertical: 'top',
    ...cardShadow,
  },
  photoBtn: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  photoBtnIcon: {
    fontSize: 30,
  },
  photoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  photoPreviewBox: { width: '100%', borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: Colors.border },
  photoThumbnail: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.border,
  },
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
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
