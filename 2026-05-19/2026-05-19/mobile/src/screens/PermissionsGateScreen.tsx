import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, PermissionsAndroid, Alert, Linking, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';

// Only Location + Camera. Storage/Photos permissions are NOT needed —
// the camera saves to app-private storage via react-native-image-picker.
// Requesting READ_MEDIA_IMAGES on Android 13+ opens the gallery picker
// UI instead of a simple Allow/Deny, which confuses users.
const ALL_ANDROID: Array<keyof typeof PermissionsAndroid.PERMISSIONS> = [
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'CAMERA',
];

const PERMISSIONS_DONE_KEY = 'permissionsGateCompleted';

interface Props {
  onGranted: () => void;
}

export default function PermissionsGateScreen({ onGranted }: Props) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'denied'>('idle');
  const [locGranted, setLocGranted] = useState(false);
  const [camGranted, setCamGranted] = useState(false);

  const checkAll = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const loc = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      || await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    const cam = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    setLocGranted(loc);
    setCamGranted(cam);
    return loc && cam;
  }, []);

  const requestAll = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    const toRequest: string[] = [];
    for (const key of ALL_ANDROID) {
      const perm = PermissionsAndroid.PERMISSIONS[key];
      if (!perm) continue;
      const ok = await PermissionsAndroid.check(perm);
      if (!ok) toRequest.push(perm);
    }

    if (toRequest.length === 0) {
      setLocGranted(true);
      setCamGranted(true);
      return true;
    }

    setStatus('requesting');
    const results = await PermissionsAndroid.requestMultiple(toRequest as any);

    const loc = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
      || results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    const cam = results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
    setLocGranted(loc);
    setCamGranted(cam);
    return loc && cam;
  }, []);

  const handleGrant = useCallback(async () => {
    const ok = await requestAll();
    if (ok) {
      await AsyncStorage.setItem(PERMISSIONS_DONE_KEY, 'true');
      onGranted();
    } else {
      setStatus('denied');
    }
  }, [requestAll, onGranted]);

  // Auto-check on mount
  useEffect(() => {
    (async () => {
      const already = await checkAll();
      if (already) {
        await AsyncStorage.setItem(PERMISSIONS_DONE_KEY, 'true');
        onGranted();
      }
    })();
  }, [checkAll, onGranted]);

  // Re-check when coming back from device Settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active' && status === 'denied') {
        const ok = await checkAll();
        if (ok) {
          await AsyncStorage.setItem(PERMISSIONS_DONE_KEY, 'true');
          onGranted();
        }
      }
    });
    return () => sub.remove();
  }, [checkAll, onGranted, status]);

  const openSettings = () => {
    Linking.openSettings().catch(() => Alert.alert('Error', 'Could not open Settings.'));
  };

  const permIcon = (granted: boolean) => (
    <Icon
      name={granted ? 'checkmark-circle' : 'close-circle'}
      size={18}
      color={granted ? '#16A34A' : '#DC2626'}
      style={{ marginLeft: 'auto' }}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name="shield-checkmark-outline" size={52} color="#1a56db" />
      </View>
      <Text style={styles.title}>Permissions Required</Text>
      <Text style={styles.subtitle}>
        Farmley SFA needs Location and Camera access to mark attendance, check in to stores, and capture photos.
      </Text>

      <View style={styles.permRow}>
        <Icon name="location-outline" size={22} color="#1a56db" />
        <Text style={styles.permLabel}>Location (GPS)</Text>
        {status === 'denied' && permIcon(locGranted)}
      </View>
      <View style={styles.permRow}>
        <Icon name="camera-outline" size={22} color="#1a56db" />
        <Text style={styles.permLabel}>Camera</Text>
        {status === 'denied' && permIcon(camGranted)}
      </View>

      {status === 'denied' ? (
        <>
          <Text style={styles.errorText}>
            Some permissions were denied. Please enable them in your device Settings to continue.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openSettings} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleGrant} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>
            {status === 'requesting' ? 'Requesting…' : 'Grant Permissions'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginVertical: 6 },
  permLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginLeft: 12 },
  errorText: { fontSize: 13, color: '#B91C1C', textAlign: 'center', marginTop: 18, marginBottom: 10 },
  primaryBtn: {
    marginTop: 24, backgroundColor: '#1a56db', paddingVertical: 14, paddingHorizontal: 40,
    borderRadius: 10, alignSelf: 'stretch', alignItems: 'center',
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
