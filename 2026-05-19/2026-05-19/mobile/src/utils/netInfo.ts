import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { API_URL } from '../config';

export interface ConnectivityStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
  details?: NetInfoState;
}

async function pingBackend(timeout: number = 8000): Promise<boolean> {
  // Native fetch, not axios. axios + Hermes + older Android NDKs
  // intermittently throws "Network Error" before a request leaves the
  // device (Buffer mis-typing on the bridge), which surfaces as false
  // offline even on solid Wi-Fi. fetch() goes straight to OkHttp.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_URL}/sync/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // React Native's lib.dom typing of AbortSignal mismatches the
      // RN-specific AbortSignal global; cast to silence the overload
      // mismatch — runtime behaviour is identical.
      signal: ctrl.signal as any,
    });
    // Any HTTP response — 200, 401, 404 — proves the network path
    // works. We don't care about auth here, just reachability.
    return res != null;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks current internet connectivity status
 * @returns Promise<ConnectivityStatus> - Current connectivity status
 */
export async function checkInternetConnectivity(): Promise<ConnectivityStatus> {
  try {
    const netInfoState = await NetInfo.fetch();
    const isConnected = netInfoState.isConnected ?? false;
    let isInternetReachable = typeof netInfoState.isInternetReachable === 'boolean'
      ? netInfoState.isInternetReachable
      : isConnected;

    // On many Android devices, NetInfo marks reachability as null/false even
    // when the app can talk to our backend over slow or restricted networks.
    // Use the app server as the final source of truth before declaring offline.
    if (isConnected && !isInternetReachable) {
      isInternetReachable = await pingBackend();
    }

    return {
      isConnected,
      isInternetReachable,
      type: netInfoState.type || 'unknown',
      details: netInfoState
    };
  } catch (error) {
    const backendReachable = await pingBackend();
    if (backendReachable) {
      return {
        isConnected: true,
        isInternetReachable: true,
        type: 'unknown'
      };
    }

    console.warn('[NetInfo] Error checking connectivity:', error);
    return {
      isConnected: false,
      isInternetReachable: false,
      type: 'unknown'
    };
  }
}

/**
 * Checks if device has active internet connection
 * @returns Promise<boolean> - True if internet is reachable
 */
export async function isInternetAvailable(): Promise<boolean> {
  const status = await checkInternetConnectivity();
  return status.isConnected && status.isInternetReachable;
}

/**
 * Sets up connectivity change listener
 * @param callback - Function to call when connectivity changes
 * @returns Unsubscribe function
 */
export function setupConnectivityListener(
  callback: (status: ConnectivityStatus) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    const isConnected = state.isConnected ?? false;
    const status: ConnectivityStatus = {
      isConnected,
      isInternetReachable: typeof state.isInternetReachable === 'boolean'
        ? state.isInternetReachable
        : isConnected,
      type: state.type || 'unknown',
      details: state
    };
    
    callback(status);
  });
  
  return unsubscribe;
}

/**
 * Waits for internet connection to be available
 * @param timeoutMs - Maximum time to wait (default: 30 seconds)
 * @returns Promise<boolean> - True if internet becomes available
 */
export async function waitForInternet(
  timeoutMs: number = 30000
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const checkConnection = async () => {
      if (resolved) return;
      
      const isConnected = await isInternetAvailable();
      if (isConnected) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(true);
        return;
      }
    };
    
    // Initial check
    checkConnection();
    
    // Set up listener
    const unsubscribe = setupConnectivityListener(async (status) => {
      if (status.isConnected && status.isInternetReachable) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(true);
      }
    });
    
    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        unsubscribe();
        resolve(false);
      }
    }, timeoutMs);
  });
}

/**
 * Logs connectivity status for debugging
 */
export function logConnectivityStatus(status: ConnectivityStatus): void {
  console.log('[NetInfo] Connectivity Status:', {
    connected: status.isConnected,
    internetReachable: status.isInternetReachable,
    type: status.type,
    timestamp: new Date().toISOString()
  });
}
