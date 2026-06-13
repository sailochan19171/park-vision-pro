import React, { useState, useEffect } from 'react';
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
  Modal,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { capturePhoto } from '../services/cameraService';
import { reverseGeocode } from '../services/reverseGeocode';

type RouteParams = {
  InitiativeExecution: {
    initiativeId: string;
    customerCode: string;
    customerName: string;
    visitCode?: string;
  };
};

type ExecutionStatus = 'completed' | 'partial' | 'skipped';

const STATUS_OPTIONS: {
  key: ExecutionStatus;
  label: string;
  bg: string;
  activeBg: string;
  text: string;
  activeText: string;
}[] = [
  {
    key: 'completed',
    label: 'Completed',
    bg: '#f0fdf4',
    activeBg: Colors.primary,
    text: Colors.primary,
    activeText: Colors.white,
  },
  {
    key: 'partial',
    label: 'Partial',
    bg: '#fffbeb',
    activeBg: Colors.warning,
    text: Colors.warning,
    activeText: Colors.white,
  },
  {
    key: 'skipped',
    label: 'Skipped',
    bg: '#f3f4f6',
    activeBg: '#6b7280',
    text: '#6b7280',
    activeText: Colors.white,
  },
];

export default function InitiativeExecutionScreen() {
  const route = useRoute<RouteProp<RouteParams, 'InitiativeExecution'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { initiativeId, customerCode, customerName, visitCode } = route.params;

  const [status, setStatus] = useState<ExecutionStatus>('completed');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoTs, setPhotoTs] = useState<number | null>(null);
  const [photoLat, setPhotoLat] = useState<number | null>(null);
  const [photoLng, setPhotoLng] = useState<number | null>(null);
  const [photoAddress, setPhotoAddress] = useState<string | null>(null);
  const [photoViewVisible, setPhotoViewVisible] = useState(false);
  const [saving, setSaving] = useState(false);

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
    } catch (err) {
      Alert.alert('Camera Error', 'Could not capture photo. Please try again.');
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

  // Lazy reverse-geocode when the fullscreen viewer opens.
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

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await database.write(async () => {
        await database.get('initiative_executions').create((rec: any) => {
          rec._raw.id = uuidv4();
          rec.appTrxId = uuidv4();
          rec.initiativeId = initiativeId;
          rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode;
          rec.visitCode = visitCode ?? null;
          rec.executedOn = Date.now();
          rec.notes = notes;
          rec.photoPath = photoUri ?? null;
          rec.status = status;
          rec.isSynced = false;
        });
      });

      Alert.alert('Saved', 'Initiative execution recorded', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save execution. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Customer Header */}
      <View style={styles.customerHeader}>
        <Text style={styles.customerName}>{customerName}</Text>
        <Text style={styles.customerCode}>{customerCode}</Text>
      </View>

      {/* Status Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Execution Status</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => {
            const isActive = status === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.statusBtn,
                  { backgroundColor: isActive ? opt.activeBg : opt.bg },
                  isActive && styles.statusBtnActive,
                ]}
                activeOpacity={0.75}
                onPress={() => setStatus(opt.key)}
              >
                <Text
                  style={[
                    styles.statusBtnText,
                    { color: isActive ? opt.activeText : opt.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add notes about the execution..."
          placeholderTextColor={Colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

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
            activeOpacity={0.75}
            onPress={handleCapturePhoto}
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
          {saving ? 'Saving...' : 'Save Execution'}
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
  customerHeader: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    ...cardShadow,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  customerCode: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
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
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusBtnActive: {
    borderColor: 'transparent',
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  notesInput: {
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
    fontSize: 32,
  },
  photoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  photoContainer: {
    gap: 10,
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
    marginTop: 8,
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
