import { PermissionsAndroid, Platform, Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (fine) return true;
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

// Cache last known position — persisted to AsyncStorage
let _lastPos: GeoPosition | null = null;
const LAST_POS_KEY = 'last_gps_position';

// Load cached position from AsyncStorage on module init
AsyncStorage.getItem(LAST_POS_KEY).then(val => {
  if (val) { try { _lastPos = JSON.parse(val); } catch (e) { console.warn("[App]", e); } }
}).catch(() => {});

function saveLastPos(pos: GeoPosition) {
  _lastPos = pos;
  AsyncStorage.setItem(LAST_POS_KEY, JSON.stringify(pos)).catch(() => {});
}

/**
 * Returns the in-memory cached GPS position synchronously, or null if no
 * cached fix is available yet. Callers (e.g. CustomerVisitScreen's map
 * default region) use this so the first paint can land on the rep's last
 * known location instead of a hard-coded DEFAULT_REGION (Dubai) while the
 * async GPS read is still in flight.
 */
export function getCachedPosition(): GeoPosition | null {
  return _lastPos;
}

export async function getCurrentPosition(fast?: boolean): Promise<GeoPosition | null> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    Alert.alert(
      'Location Permission',
      'Location permission was denied. Please enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return null;
  }

  const getPos = (highAccuracy: boolean, timeoutMs: number, maxAgeMs: number): Promise<GeoPosition | null> =>
    new Promise((resolve) => {
      const safetyTimeout = setTimeout(() => {
        console.warn(`[Location] Timeout after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs + 2000);

      Geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(safetyTimeout);
          const result: GeoPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          console.log(`[Location] Got: ${result.lat.toFixed(6)},${result.lng.toFixed(6)} acc=${result.accuracy?.toFixed(0)}m`);
          saveLastPos(result);
          resolve(result);
        },
        (error) => {
          clearTimeout(safetyTimeout);
          console.warn(`[Location] Error:`, error.code, error.message);
          resolve(null);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeoutMs,
          maximumAge: maxAgeMs,
          forceRequestLocation: true,
          forceLocationManager: true,
          showLocationDialog: true,
        },
      );
    });

  if (fast) {
    // Fast mode used to return the cached position immediately, but that
    // burned a stale address into the photo whenever the rep moved between
    // stores — the previous fix lingered in AsyncStorage and got reused for
    // every later capture. (After an uninstall the cache is empty so the
    // first capture *looked* correct; everything after was wrong.)
    //
    // Always attempt a fresh fix first with a short 3 s budget, ask the
    // platform for a fresh sample (maxAge = 0), and only fall back to the
    // cached position if the fresh fix times out. Keeps the "fast" UX
    // (camera flow doesn't block more than a few seconds) while never
    // showing a stale address.
    const fresh = await getPos(false, 3000, 0);
    if (fresh) return fresh;
    if (_lastPos) {
      console.log('[Location] Fast GPS timed out — falling back to cached position');
      return _lastPos;
    }
    return null;
  }

  // Normal mode: fresh GPS, 5s timeout
  const pos = await getPos(true, 5000, 10000);
  if (pos) return pos;

  // Fallback: cached or low accuracy 3s
  if (_lastPos) return _lastPos;
  const fallback = await getPos(false, 3000, 30000);
  // No inline Alert here — LocationGuardProvider already shows a full-screen
  // modal when device location is off, so stacking a popup on top of it
  // produces duplicate UI. Callers should handle null return values.
  return fallback ?? _lastPos;
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
