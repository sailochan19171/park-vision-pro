import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from '../api/client';

const LOG_QUEUE_KEY = 'activity_log_queue';
// SESSION buffer: every logActivity() call appends here regardless of
// whether the live POST succeeded. The two "Upload Debug Logs" /
// "Upload Delivery Logs" buttons in Settings drain THIS buffer (not
// LOG_QUEUE_KEY) so support always gets the full picture of the
// session, not just the offline-failed subset. Capped at 500 and
// cleared on logout / new login.
const SESSION_LOG_KEY = 'activity_session_log';
const SESSION_LOG_CAP = 500;
const APP_VERSION = 'V2.2';

interface LogEntry {
  action: string;
  status: 'success' | 'failed' | 'pending';
  module?: string;
  userCode?: string;
  customerCode?: string;
  customerName?: string;
  details?: string;
  errorMessage?: string;
  geoLat?: number;
  geoLng?: number;
  timestamp?: number;
}

let deviceInfoCache: string | null = null;

async function getDeviceInfo(): Promise<string> {
  if (deviceInfoCache) return deviceInfoCache;
  try {
    const DeviceInfo = require('react-native-device-info').default;
    const model = await DeviceInfo.getModel();
    const osVersion = await DeviceInfo.getSystemVersion();
    deviceInfoCache = `${model} | Android ${osVersion}`;
  } catch {
    deviceInfoCache = Platform.OS === 'android' ? 'Android' : 'iOS';
  }
  return deviceInfoCache;
}

/**
 * Log a mobile operation. Tries to send to server immediately.
 * If offline, queues locally and flushes on next sync.
 */
export async function logActivity(entry: LogEntry): Promise<void> {
  const deviceInfo = await getDeviceInfo();
  const payload = {
    ...entry,
    deviceInfo,
    appVersion: APP_VERSION,
    timestamp: entry.timestamp ?? Date.now(),
  };

  // Always append to the session buffer FIRST so the Upload Debug /
  // Delivery Logs buttons always have something real to ship — even
  // when the live POST below succeeds. Without this, the buttons say
  // "nothing to upload" whenever the user is online because every
  // entry was already drained at POST time.
  try {
    const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
    const buf: any[] = raw ? JSON.parse(raw) : [];
    buf.push({ ...payload, _loggedAt: Date.now() });
    if (buf.length > SESSION_LOG_CAP) buf.splice(0, buf.length - SESSION_LOG_CAP);
    await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(buf));
  } catch { /* ignore storage errors */ }

  try {
    await api.post('/activity-logs', payload);
  } catch {
    // Offline or failed — queue for retry on the next background sync.
    try {
      const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY);
      const queue: any[] = raw ? JSON.parse(raw) : [];
      queue.push({ ...payload, _queuedAt: Date.now() });
      // Keep max 500 entries to prevent storage bloat
      if (queue.length > 500) queue.splice(0, queue.length - 500);
      await AsyncStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(queue));
    } catch { /* ignore storage errors */ }
  }
}

/**
 * Clears the in-session debug buffer. Called on logout / fresh login
 * so the next user doesn't inherit the previous user's debug trail.
 */
export async function clearSessionLogs(): Promise<void> {
  try { await AsyncStorage.removeItem(SESSION_LOG_KEY); } catch { /* ignore */ }
}

/**
 * Flush queued logs to the server. Called during background sync.
 */
export async function flushActivityLogs(): Promise<void> {
  await flushLogs();
}

/**
 * Internal: flush logs matching an optional filter. Returns the count
 * of entries successfully shipped. Surfaces the count to the caller
 * (used by Settings → Upload Debug / Delivery Logs to show "n entries
 * uploaded" instead of a fake success message).
 */
async function flushLogs(filter?: (e: any) => boolean): Promise<{ sent: number; remaining: number }> {
  try {
    const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY);
    if (!raw) return { sent: 0, remaining: 0 };
    const queue: any[] = JSON.parse(raw);
    if (queue.length === 0) return { sent: 0, remaining: 0 };

    const matched = filter ? queue.filter(filter) : queue;
    const unmatched = filter ? queue.filter(e => !filter(e)) : [];

    const BATCH = 50;
    let sent = 0;
    let unsent: any[] = [];
    for (let i = 0; i < matched.length; i += BATCH) {
      const batch = matched.slice(i, i + BATCH);
      try {
        await api.post('/activity-logs/batch', { logs: batch });
        sent += batch.length;
      } catch {
        unsent = matched.slice(i);
        break;
      }
    }

    // Rewrite queue with: unsent matched entries + everything that didn't match the filter
    const newQueue = [...unsent, ...unmatched];
    if (newQueue.length === 0) {
      await AsyncStorage.removeItem(LOG_QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(newQueue));
    }
    console.log(`[ActivityLogger] flushed ${sent} logs, ${newQueue.length} remain`);
    return { sent, remaining: newQueue.length };
  } catch (err) {
    console.warn('[ActivityLogger] flushLogs error:', err);
    return { sent: 0, remaining: 0 };
  }
}

/**
 * Internal: read the session buffer, batch-post the matching entries
 * to /activity-logs/batch, and rewrite the buffer with whatever didn't
 * match (so a Delivery upload doesn't erase the user's non-delivery
 * debug trail). Unlike flushLogs(), this works against SESSION_LOG_KEY
 * which is populated even when the live POST in logActivity succeeded
 * — that's why the user sees real activity here instead of an empty
 * "nothing to upload" alert.
 */
async function shipSessionLogs(filter?: (e: any) => boolean): Promise<{ sent: number; remaining: number }> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return { sent: 0, remaining: 0 };
    const buf: any[] = JSON.parse(raw);
    if (buf.length === 0) return { sent: 0, remaining: 0 };

    const matched = filter ? buf.filter(filter) : buf;
    const unmatched = filter ? buf.filter((e) => !filter(e)) : [];
    if (matched.length === 0) return { sent: 0, remaining: buf.length };

    const BATCH = 50;
    let sent = 0;
    let unsent: any[] = [];
    for (let i = 0; i < matched.length; i += BATCH) {
      const batch = matched.slice(i, i + BATCH);
      try {
        // `bundle: true` marks these as a manual debug-snapshot push so
        // the web side can tell them apart from the live single-entry
        // POSTs from logActivity (and dedupe by timestamp+action+user
        // if it wants to).
        await api.post('/activity-logs/batch', { logs: batch, bundle: true });
        sent += batch.length;
      } catch {
        unsent = matched.slice(i);
        break;
      }
    }

    const newBuf = [...unsent, ...unmatched];
    if (newBuf.length === 0) {
      await AsyncStorage.removeItem(SESSION_LOG_KEY);
    } else {
      await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(newBuf));
    }
    console.log(`[ActivityLogger] shipped ${sent} session logs, ${newBuf.length} remain`);
    return { sent, remaining: newBuf.length };
  } catch (err) {
    console.warn('[ActivityLogger] shipSessionLogs error:', err);
    return { sent: 0, remaining: 0 };
  }
}

/**
 * Settings → Upload Debug Logs. Ships every entry recorded during the
 * current session (crashes, errors, sync events, activity) regardless
 * of whether it was already delivered live by logActivity. This is the
 * "give me the full picture of what happened" button.
 */
export async function uploadDebugLogs(): Promise<{ sent: number; remaining: number }> {
  return shipSessionLogs();
}

/**
 * Settings → Upload Delivery Logs. Ships only the session entries that
 * pertain to the delivery / order / stock / visit / attendance flow —
 * useful when support wants the field-activity trail without the
 * noisier crash / sync chatter. Non-delivery entries stay in the
 * session buffer so a follow-up Upload Debug Logs press still ships
 * them.
 */
export async function uploadDeliveryLogs(): Promise<{ sent: number; remaining: number }> {
  const deliveryModules = new Set(['order', 'stock', 'visit', 'delivery', 'attendance']);
  return shipSessionLogs((e) => deliveryModules.has(String(e?.module ?? '').toLowerCase()));
}

// ── Detailed convenience helpers ─────────────────────────────────────
// Each helper includes the screen name + flow step so the web portal
// shows exactly WHERE in the app the operation happened.

export const logLogin = (status: 'success' | 'failed' = 'success', error?: string, userCode?: string) =>
  logActivity({
    action: 'LOGIN',
    status,
    module: 'auth',
    userCode,
    details: status === 'success'
      ? `Screen: LoginScreen → User '${userCode}' authenticated successfully → Redirected to Dashboard`
      : `Screen: LoginScreen → Authentication failed for '${userCode}'`,
    errorMessage: error ? `${error} (User: ${userCode})` : undefined,
  });

export const logStartDay = (lat?: number, lng?: number, attendanceType?: string) =>
  logActivity({
    action: 'START_DAY',
    status: 'success',
    module: 'attendance',
    details: `Screen: StartDayScreen → Pre-requisites passed → Selfie captured → Attendance marked (${attendanceType ?? 'Present'}) → Navigated to Journey Plan`,
    geoLat: lat,
    geoLng: lng,
  });

export const logEndDay = (status: 'success' | 'failed' = 'success', error?: string) =>
  logActivity({
    action: 'END_DAY',
    status,
    module: 'attendance',
    details: status === 'success'
      ? 'Screen: EndOfDayScreen → Data synced → EOT submitted to server → Day ended successfully'
      : 'Screen: EndOfDayScreen → EOT submission failed',
    errorMessage: error,
  });

// Logs an END_DAY_AUTO activity. The `reason` string is passed through
// as-is to `details` (no boilerplate wrap) so the Recent Auto-EOD card
// on the web portal shows the actual transaction summary the mobile
// captured during the Auto-EOD pushSync, not noise like "Screen: ...
// Day automatically reset for new session".
export const logAutoEndDay = (reason: string) =>
  logActivity({
    action: 'END_DAY_AUTO',
    status: 'success',
    module: 'attendance',
    details: reason,
  });

export const logCheckIn = (customerCode: string, customerName: string, lat?: number, lng?: number, checkinType?: string) =>
  logActivity({
    action: 'CHECK_IN',
    status: 'success',
    module: 'visit',
    customerCode,
    customerName,
    details: `Screen: CustomerVisitScreen → GPS captured → Photo taken → Check-in recorded (${checkinType ?? 'normal'}) → Navigated to CustomerDashboard`,
    geoLat: lat,
    geoLng: lng,
  });

export const logCheckOut = (customerCode: string, customerName: string, lat?: number, lng?: number, checkoutType?: string) =>
  logActivity({
    action: 'CHECK_OUT',
    status: 'success',
    module: 'visit',
    customerCode,
    customerName,
    details: `Screen: CustomerDashboard → Checkout photo captured → Visit completed (${checkoutType ?? 'normal'}) → Navigated to My Stores`,
    geoLat: lat,
    geoLng: lng,
  });

export const logPhotoCapture = (screen: string, module: string, customerCode?: string, customerName?: string, status: 'success' | 'failed' = 'success', error?: string) =>
  logActivity({
    action: 'PHOTO_CAPTURE',
    status,
    module,
    customerCode,
    customerName,
    details: status === 'success'
      ? `Screen: ${screen} → Camera opened → Photo captured and saved locally`
      : `Screen: ${screen} → Camera failed`,
    errorMessage: error,
  });

export const logOrderSubmit = (customerCode: string, customerName: string, amount: number, itemCount: number, status: 'success' | 'failed' = 'success', error?: string) =>
  logActivity({
    action: 'ORDER_SUBMIT',
    status,
    module: 'order',
    customerCode,
    customerName,
    details: status === 'success'
      ? `Screen: OrderScreen → ${itemCount} items added → Total: ₹${amount.toLocaleString('en-IN')} → Order saved locally → Push sync triggered`
      : `Screen: OrderScreen → Order submission failed`,
    errorMessage: error,
  });

export const logStockSubmit = (type: 'opening' | 'physical', customerCode: string, itemCount: number, status: 'success' | 'failed' = 'success', error?: string) =>
  logActivity({
    action: `${type.toUpperCase()}_STOCK_SUBMIT`,
    status,
    module: 'stock',
    customerCode,
    details: status === 'success'
      ? `Screen: ${type === 'opening' ? 'OpeningStockScreen' : 'PhysicalStockScreen'} → ${itemCount} items entered → Stock saved locally → Push sync triggered`
      : `Screen: ${type === 'opening' ? 'OpeningStockScreen' : 'PhysicalStockScreen'} → Stock save failed`,
    errorMessage: error,
  });

export const logSync = (direction: 'pull' | 'push', status: 'success' | 'failed' = 'success', details?: string, error?: string) =>
  logActivity({
    action: `SYNC_${direction.toUpperCase()}`,
    status,
    module: 'sync',
    details: details ?? (status === 'success'
      ? `Background sync ${direction} completed successfully`
      : `Background sync ${direction} failed`),
    errorMessage: error,
  });

export const logGeneric = (action: string, screen: string, module: string, status: 'success' | 'failed' = 'success', details?: string, error?: string) =>
  logActivity({
    action,
    status,
    module,
    details: details ?? `Screen: ${screen} → ${action} ${status}`,
    errorMessage: error,
  });
