import { Platform, Alert, Linking, AppState } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { requestLocationPermission } from './locationService';

let isShowingAlert = false;

// Real check: ask the platform for a location fix. If the OS reports the
// services as disabled, error.code === 2 (POSITION_UNAVAILABLE) or 5
// (SETTINGS_NOT_SATISFIED). Permission denial returns code 1.
// A timeout means GPS is enabled but couldn't get a fix yet — treat as ON.
export async function isLocationEnabled(): Promise<boolean> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (val: boolean) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const timer = setTimeout(() => finish(true), 1500);

    Geolocation.getCurrentPosition(
      () => {
        clearTimeout(timer);
        finish(true);
      },
      (err) => {
        clearTimeout(timer);
        if (err?.code === 2 || err?.code === 5) {
          finish(false);
        } else {
          finish(true);
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 1000,
        maximumAge: 60000,
        forceLocationManager: Platform.OS === 'android',
      },
    );
  });
}

export function openLocationSettings(): void {
  if (Platform.OS === 'android') {
    // Proper Android intent for the system Location settings page (the one
    // with the master Location toggle). openSettings() lands on App Info /
    // permissions, which is the wrong screen for toggling GPS.
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
      Linking.sendIntent('android.settings.SETTINGS').catch(() => Linking.openSettings());
    });
  } else {
    Linking.openSettings();
  }
}

// Kept as a one-shot popup for callers that need a non-modal flow.
// LocationGuardProvider's full-screen modal is the primary UX — don't
// stack this on top of it.
export function showLocationDisabledAlert(): void {
  if (isShowingAlert) return;
  isShowingAlert = true;

  Alert.alert(
    'Location Required',
    'Location services are turned off. Please turn on Location in device settings to continue.',
    [
      {
        text: 'OK',
        onPress: () => {
          isShowingAlert = false;
          openLocationSettings();
        },
      },
    ],
    { cancelable: false },
  );
}

export async function checkLocationBeforeLogin(): Promise<boolean> {
  const enabled = await isLocationEnabled();
  if (!enabled) {
    showLocationDisabledAlert();
    return false;
  }
  return true;
}

export function startLocationMonitoring(onLocationDisabled: () => void): () => void {
  let lastCheck = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  const checkLocation = async () => {
    const now = Date.now();
    if (now - lastCheck < 5000) return;
    lastCheck = now;
    const enabled = await isLocationEnabled();
    if (!enabled && !isShowingAlert) onLocationDisabled();
  };

  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') checkLocation();
  });

  interval = setInterval(checkLocation, 10000);
  checkLocation();

  return () => {
    sub.remove();
    if (interval) clearInterval(interval);
  };
}

// Kept as no-ops so existing callers (LocationRequiredModal) keep compiling.
// The honor-system AsyncStorage flag is gone — isLocationEnabled() does a
// real native check on every call now.
export async function confirmLocationEnabled(): Promise<void> {}
export async function resetLocationStatus(): Promise<void> {}
export function resetLocationAlertState(): void {
  isShowingAlert = false;
}
