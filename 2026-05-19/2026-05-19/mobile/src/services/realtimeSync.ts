import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { authService } from './auth/authService';
import api from '../api/client';
import useAuthStore from '../store/auth';
import database from '../db/database';

// Real-time sync checker for user deactivation and critical updates.
//
// 60-second cadence (was 5 min) so an admin deactivating a user mid-shift
// is caught within roughly a minute instead of five. The check itself is
// just one call to /auth/user-status returning a few bytes, so the cost
// is small even with 200+ field users.
//
// The "live" gate verifyUserActiveNow() below bypasses the throttle for
// pre-submit safety checks — every activity submit calls it explicitly.
// 30 s — admin actions in the web portal (deactivate / lock / role change /
// any user-state edit) reach the device within half a minute. The previous
// 60 s ceiling was the requested ceiling at the time; reps reported the
// gap felt too long when QA flipped users on/off live.
const USER_STATUS_CHECK_INTERVAL = 30 * 1000; // 30 s
let userStatusIntervalId: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let lastUserStatusCheck = 0;

/**
 * Check if user is still active and hasn't been deactivated
 */
async function checkUserStatus(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;

    // Avoid too frequent checks
    const now = Date.now();
    if (now - lastUserStatusCheck < USER_STATUS_CHECK_INTERVAL) return;
    lastUserStatusCheck = now;

    console.log('[RealtimeSync] Checking user status...');
    const response = await authService.checkUserStatus(token);
    const userStatus = response?.data;

    // If user is deactivated, force logout
    if (userStatus?.isActive === false || userStatus?.status === 'deactivated') {
      console.log('[RealtimeSync] User deactivated detected, forcing logout');
      const { logout } = useAuthStore.getState();
      await logout({ force: true });
    }
  } catch (error: any) {
    // Only an explicit 200 + isActive:false (handled above) means deactivation.
    // A 401 here is almost always just an expired access token (15 min TTL),
    // e.g. after the app was backgrounded — NOT a deactivation. This raw-axios
    // call bypasses the api client's auto-refresh, so logging out on 401 would
    // wrongly kick active users out on resume. Token expiry/revocation is
    // handled by the api client's refresh on regular sync calls; here we just
    // warn and wait for the next check (which uses the freshly-refreshed token).
    console.warn('[RealtimeSync] User status check failed:', error?.message);
  }
}

/**
 * Start real-time sync service for critical updates
 */
export function startRealtimeSync(): void {
  stopRealtimeSync();
  
  console.log('[RealtimeSync] Started - checking for critical updates every 30 seconds');

  // Check immediately on start
  checkUserStatus().catch(() => {});

  // Set up periodic checks
  userStatusIntervalId = setInterval(() => {
    checkUserStatus().catch(() => {});
  }, USER_STATUS_CHECK_INTERVAL);

  // Check when app comes to foreground
  appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      checkUserStatus().catch(() => {});
    }
  });
}

/**
 * Stop real-time sync service
 */
export function stopRealtimeSync(): void {
  if (userStatusIntervalId != null) {
    clearInterval(userStatusIntervalId);
    userStatusIntervalId = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  lastUserStatusCheck = 0;
  console.log('[RealtimeSync] Stopped');
}

/**
 * Manual trigger for user status check (useful after critical operations)
 */
export function triggerUserStatusCheck(): void {
  checkUserStatus().catch(() => {});
}

export interface CustomerStatus {
  ok: boolean;
  reason?: 'deactivated' | 'blocked' | 'not_found';
  customerName?: string | null;
}

/**
 * Pre-submit gate for activities (Sales Report, Sampling, Planogram,
 * Expiry, etc.). Reads the LOCAL customer record — kept fresh by the 5 s
 * background incremental sync (cursor on customers.updated_at on the
 * backend) — so a customer deactivated/blocked from the web portal lands
 * on the device within ~5-10 s and is then blocked at the next activity
 * submission.
 *
 * We deliberately don't hit the network here: the background sync is
 * authoritative and a per-submit network call would be redundant.
 * Returns { ok: true } when the customer is active. Returns
 * { ok: false, reason: ... } when blocked or deactivated.
 */
export async function verifyCustomerStillActive(customerCode: string): Promise<CustomerStatus> {
  try {
    const rows: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
    if (rows.length === 0) {
      return { ok: false, reason: 'not_found' };
    }
    const c: any = rows[0];
    const name = (c.name ?? c._raw?.name) as string | null | undefined;
    const status = (c.status ?? c._raw?.status ?? '').toString().toLowerCase();
    const isActive = c.isActive ?? c._raw?.is_active;
    if (status === 'blocked') {
      return { ok: false, reason: 'blocked', customerName: name ?? null };
    }
    if (isActive === false || status === 'deactivated' || status === 'inactive') {
      return { ok: false, reason: 'deactivated', customerName: name ?? null };
    }
    return { ok: true, customerName: name ?? null };
  } catch (err) {
    // Local DB read failed — don't block the user on a transient error.
    // The next submit attempt will re-check; a deactivation reaching the
    // device on the next sync tick will be caught then.
    console.warn('[RealtimeSync] verifyCustomerStillActive failed:', err);
    return { ok: true };
  }
}

/**
 * Synchronous-style gate for sensitive operations (check-in, order finalize).
 * Bypasses the 5-min throttle and returns false if the user is no longer
 * active on the server. On network failure, returns true (don't block field
 * users on connectivity blips — the next throttled check or login flow will
 * catch a real deactivation).
 */
export async function verifyUserActiveNow(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return true; // offline-mode login — nothing to verify
    // Route through the api client so a benign access-token expiry gets
    // auto-refreshed instead of surfacing as a 401 and (worse) silently
    // letting a deactivated rep proceed. The refresh endpoint itself
    // rejects deactivated users with USER_DISABLED — when that happens
    // the client's interceptor wipes the session and the catch below
    // sees the eventual 401 and bails.
    const response = await api.get('/auth/user-status', { timeout: 8000 });
    const status = response?.data;
    const inactive = status?.isActive === false || status?.status === 'deactivated';
    if (inactive) {
      const { logout } = useAuthStore.getState();
      await logout({ force: true }).catch(() => {});
      return false;
    }
    lastUserStatusCheck = Date.now();
    return true;
  } catch (err: any) {
    // 401 / 403 reaching here means the api client's auto-refresh ALSO
    // failed — i.e. the refresh endpoint rejected this session because
    // the user has been deactivated server-side. Block the action and
    // log out so the rep can't keep operating against a dead session.
    const httpStatus = err?.response?.status;
    if (httpStatus === 401 || httpStatus === 403) {
      try {
        const { logout } = useAuthStore.getState();
        await logout({ force: true });
      } catch { /* swallow — auth state will reset on next render */ }
      return false;
    }
    // Pure network/timeout failures still pass through — a rep with a bad
    // signal shouldn't be locked out of check-in just because a heartbeat
    // missed. The next online tick will catch a real deactivation.
    return true;
  }
}
