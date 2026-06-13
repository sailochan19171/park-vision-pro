import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import axios from 'axios';
import { API_URL } from '../config';
import { needsInitialSync, reconcileCustomerScope, pushSync } from '../services/syncService';
import { deleteMasterDataBackup } from '../services/masterDataBackup';
import useVisitStore from './visit';
import database from '../db/database';

import { authService } from '../services/auth/authService';

// Wipe the cross-user residue that doesn't belong to the next signed-in rep:
//   - navigation_state_v1: the persisted screen stack from the prior session.
//     Without clearing, the next user could land on a CustomerDashboard with a
//     stale visitCode belonging to the previous rep — triggering the broken
//     "Start Day Required" path on a customer they never checked into.
//   - day_started_<today> / day_ended_<today> / day_start_timestamp_<today>:
//     these flags aren't user-scoped. Keeping them would let prior user's
//     "day started today" leak in and skip the new rep's Start Day gate.
//   - useVisitStore.activeVisit: Zustand in-memory state. Persists across
//     logout-without-process-kill and would otherwise let CustomerVisitScreen
//     restore the prior rep's check-in state on the next user's first visit.
// Operation/transactional tables that hold the SIGNED-IN rep's own captures.
// On a user switch these are wiped so the next rep can't see — or have
// surfaced to them — the previous rep's visits / orders / OSOI / planogram /
// stock rows and their on-device image paths (the cross-user image-leak bug).
// Master/reference tables (customers, items, prices, journey plans, …) are NOT
// wiped: they re-sync and aren't user-private, so the new user doesn't
// re-download everything.
const USER_SCOPED_TABLES = [
  'attendance_records', 'customer_visits', 'orders', 'order_lines',
  'osoi_photos', 'planogram_executions', 'opening_stocks', 'physical_stocks',
  'po_captures', 'po_capture_items', 'expiry_checks', 'competitor_observations',
  'product_samplings', 'store_checks', 'store_check_items',
  'permanent_display_checks', 'price_checks', 'collections', 'survey_responses',
  'initiative_executions', 'van_stock_records',
];

async function wipeUserScopedTables(): Promise<void> {
  try {
    await database.write(async () => {
      for (const table of USER_SCOPED_TABLES) {
        try {
          await database.get(table).query().destroyAllPermanently();
        } catch (e) {
          // Table may not exist in this build — skip without aborting the rest.
          console.warn(`[Auth] wipe ${table} failed:`, (e as any)?.message);
        }
      }
    });
  } catch (e) {
    console.warn('[Auth] user-switch data wipe failed:', (e as any)?.message);
  }
}

async function clearCrossUserClientState(): Promise<void> {
  // Different rep signing in on this device → wipe the previous rep's local
  // operation data so it can't surface for the new user (e.g. OSOI / planogram
  // images bleeding across users). Safe: logout already pushed it to the server.
  await wipeUserScopedTables();
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    await Promise.all([
      AsyncStorage.removeItem('navigation_state_v1'),
      AsyncStorage.removeItem(`day_started_${todayStr}`),
      AsyncStorage.removeItem(`day_ended_${todayStr}`),
      AsyncStorage.removeItem(`day_start_timestamp_${todayStr}`),
      AsyncStorage.removeItem(`day_end_timestamp_${todayStr}`),
      // Also drop the remaining day_* flags so NONE of the prior rep's day
      // state can surface for the new rep (start time display, auto-EOD anchor,
      // active attendance date, pending auto-EOD).
      AsyncStorage.removeItem(`day_start_time_${todayStr}`),
      AsyncStorage.removeItem(`day_end_time_${todayStr}`),
      AsyncStorage.removeItem(`day_start_finalized_timestamp_${todayStr}`),
      AsyncStorage.removeItem('active_attendance_date'),
      AsyncStorage.removeItem('auto_eod_pending'),
    ]);
  } catch { /* best-effort; next user's gates still guard via DB queries */ }
  try { useVisitStore.getState().clearVisit(); } catch { /* ignore */ }
}

interface User {
  code: string;
  name: string;
  userType: string;
  routeCode: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  needsSync: boolean;
  offlineMode: boolean;

  login: (username: string, password: string, onProgress?: (msg: string) => void) => Promise<void>;
  logout: (opts?: { force?: boolean }) => Promise<void>;
  loadFromStorage: () => Promise<void>;
  markSyncDone: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoggedIn: false,
  isLoading: true,
  needsSync: false,
  offlineMode: false,

  login: async (username: string, password: string, onProgress?: (msg: string) => void) => {
    try {
      onProgress?.('Initializing...');
      // Use authService (microservice client) for login
      const response = await authService.login(username, password);
      const { data } = response;

      // Clock-tamper check: compare the server's Date header with the device
      // time. If the device is more than 10 min out of sync (past OR future),
      // refuse login — someone is trying to fake the clock to bypass EOT
      // locks, backdate attendance, etc.
      const serverDateHeader = response.headers?.date ?? response.headers?.Date;
      if (serverDateHeader) {
        const serverMs = new Date(serverDateHeader).getTime();
        const deviceMs = Date.now();
        if (!Number.isNaN(serverMs)) {
          const driftMs = Math.abs(deviceMs - serverMs);
          if (driftMs > 10 * 60 * 1000) {
            throw new Error(
              'Your device date/time is incorrect. Please turn on "Automatic date & time" in device settings and try again.',
            );
          }
        }
      }

      const { accessToken, refreshToken, user } = data;

      // Check if user is active before proceeding
      if (user.isActive === false || user.status === 'deactivated') {
        throw new Error('Your account has been deactivated. Please contact your administrator.');
      }

      // If the signed-in user differs from whoever was cached on this device,
      // wipe per-session client state that isn't user-scoped (persisted
      // navigation stack, day_* AsyncStorage flags, in-memory active visit).
      // Without this, the new rep can be dropped onto the prior rep's
      // CustomerDashboard route with a stale visitCode and immediately hit
      // the "Start Day Required" alert on a customer they never visited.
      try {
        // Detect the previous user from `offlineUser`, NOT `user`: logout()
        // removes the `user` key but keeps `offlineUser`, so reading `user`
        // here returned null after any logout — which silently skipped the
        // cross-user cleanup and let the prior rep's day_started_<today> flag
        // leak into the new rep's session (new user wrongly saw "Continue").
        // `offlineUser` still holds the prior rep at this point (it isn't
        // overwritten until a few lines below), so the user-change check works.
        const prevUserRaw = (await AsyncStorage.getItem('user')) ?? (await AsyncStorage.getItem('offlineUser'));
        const prevCode = prevUserRaw ? JSON.parse(prevUserRaw)?.code : null;
        if (prevCode && prevCode !== user.code) {
          await clearCrossUserClientState();
        }
      } catch { /* best-effort */ }

      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      // Cache credentials + user for offline login
      await AsyncStorage.setItem('offlineCredentials', JSON.stringify({ u: username, p: password }));
      await AsyncStorage.setItem('offlineUser', JSON.stringify(user));
      // Stamp the device clock against the server clock. Offline login uses
      // this: if the user later rolls the device date back, we can detect it.
      await AsyncStorage.setItem('lastServerSyncAt', String(Date.now()));

      let syncNeeded = await needsInitialSync();

      // Run initialSync INLINE before flipping isLoggedIn so the
      // LoginScreen's overlay stays visible for the entire sync.
      // If we set isLoggedIn=true first, AppNavigator would yank
      // the user to InitialSyncScreen mid-flow — defeating the
      // single-screen UX. Sync errors are non-fatal: we let the
      // user into the app and let background sync catch up.
      if (syncNeeded && onProgress) {
        try {
          onProgress('Syncing Data...');
          const { initialSync } = await import('../services/syncService');
          await initialSync(user.routeCode ?? '', (progress) => {
            const arr = Array.isArray(progress) ? progress : [];
            const done = arr.filter((p: any) => p.status === 'done').length;
            const total = arr.length || 1;
            const pct = Math.round((done / total) * 100);
            const inFlight = arr.find((p: any) => p.status === 'syncing');
            if (inFlight?.module) {
              const label = String(inFlight.module)
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              onProgress(`Syncing Data...${label} ${pct}%`);
            } else {
              onProgress(`Syncing Data...${pct}%`);
            }
          });
          syncNeeded = false;
        } catch (syncErr) {
          console.warn('[Login] Inline sync failed (non-fatal):', syncErr);
        }
      }

      set({
        user,
        accessToken,
        refreshToken,
        isLoggedIn: true,
        needsSync: syncNeeded,
        offlineMode: false,
      });

      // Reconcile customer scope right after login — ensures any customers
      // unassigned on the portal while the user was logged out get purged
      // locally. Non-blocking; failures are fine (next sync will retry).
      reconcileCustomerScope().catch(() => {});
    } catch (error: any) {
      // Server responded with error (wrong credentials)
      const statusCode = error?.response?.status;
      const serverMsg = error?.response?.data?.message;
      if (statusCode === 401 || statusCode === 403 || (serverMsg && serverMsg.includes('Invalid'))) {
        throw new Error('Invalid username or password. Please check your credentials.');
      }

      // Real network error — try offline login
      const isNetwork = error?.message === 'Network Error' || error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || !error?.response;
      if (!isNetwork) throw error;

      console.log('[Auth] No network — trying offline login');

      // Even offline, reject logins when the device clock has been rolled
      // backwards relative to the last successful online login. Without this
      // a user could go offline, set the date to yesterday, and backdate
      // attendance / orders.
      const lastSyncRaw = await AsyncStorage.getItem('lastServerSyncAt');
      if (lastSyncRaw) {
        const lastSync = parseInt(lastSyncRaw, 10);
        if (!Number.isNaN(lastSync) && Date.now() < lastSync - 5 * 60 * 1000) {
          throw new Error(
            'Device date/time has been changed. Please set the correct date & time (enable Automatic) and reconnect to the internet.',
          );
        }
      }

      const credRaw = await AsyncStorage.getItem('offlineCredentials');
      const userRaw = await AsyncStorage.getItem('offlineUser') || await AsyncStorage.getItem('user');
      console.log('[Auth] offlineCredentials:', credRaw ? 'found' : 'MISSING');
      console.log('[Auth] offlineUser:', userRaw ? 'found' : 'MISSING');

      if (!credRaw) {
        throw new Error('No internet connection and no cached login. Connect to internet for first login.');
      }

      // Match credentials (support JSON and old Base64 format)
      let match = false;
      try {
        const c = JSON.parse(credRaw);
        match = c.u === username && c.p === password;
      } catch {
        try { match = Buffer.from(credRaw, 'base64').toString() === `${username}:${password}`; } catch { match = false; }
      }
      if (!match) {
        throw new Error('Invalid username or password (offline mode).');
      }

      const user = userRaw ? JSON.parse(userRaw) : { code: username, name: username, userType: 'Promoter', routeCode: '' };

      await AsyncStorage.setItem('user', JSON.stringify(user));
      const syncNeeded = await needsInitialSync();

      set({
        user,
        accessToken: null,
        refreshToken: null,
        isLoggedIn: true,
        needsSync: syncNeeded,
        offlineMode: true,
      });
    }
  },

  logout: async (opts) => {
    const force = opts?.force === true;
    // User-initiated logout: pending data MUST reach the server before
    // the session is cleared. Otherwise the records would sit in a
    // local DB tied to the just-cleared user and the user has no way
    // to know they were lost. pushSync is retried up to 3 times with
    // a 1.5 s backoff to absorb transient hiccups (WiFi → mobile-data
    // handover, brief packet loss). If every retry fails, we throw —
    // the screen-level handler keeps the user logged in and surfaces
    // an alert so they can fix connectivity and try again.
    //
    // We do NOT pre-check netinfo — the underlying native module is
    // unreliable in this codebase (false negatives have been observed
    // even on connected WiFi / mobile data).
    if (!force) {
      // STEP 1 — Reachability ping. pushSync is a no-op when the local
      // queue is empty (it returns success without making a network
      // call), which used to let an offline user log out cleanly. That
      // is wrong: even a clean session must require connectivity at
      // logout time so the server can be contacted at all. Hit a
      // lightweight authenticated endpoint with a short timeout; if it
      // throws with anything that looks like a network failure (no
      // response object, ECONN*, timeout), bail with OFFLINE so the
      // screen handler shows the right alert.
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        try {
          await authService.checkStatus(token);
        } catch (err: any) {
          const noResponse = !err?.response;
          const code: string = err?.code ?? '';
          const isNetwork = noResponse
            || code === 'ERR_NETWORK'
            || code === 'ECONNABORTED'
            || code === 'ETIMEDOUT'
            || err?.message === 'Network Error';
          if (isNetwork) {
            console.warn('[Auth] logout reachability ping failed (offline):', err?.message ?? err);
            throw new Error('OFFLINE: server unreachable');
          }
          // 401/403 etc still mean the server is up; let pushSync handle
          // whatever has to happen next.
        }
      }

      // STEP 2 — Push pending data.
      const MAX_ATTEMPTS = 3;
      let lastErr: unknown = null;
      let pushed = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await pushSync();
          console.log(`[Auth] logout pushSync OK on attempt ${attempt}`);
          pushed = true;
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`[Auth] logout pushSync attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 1500));
          }
        }
      }
      if (!pushed) {
        const msg = lastErr instanceof Error ? lastErr.message : 'Network error';
        throw new Error(`PUSH_FAILED: ${msg}`);
      }
    }

    await Promise.all([
      AsyncStorage.removeItem('accessToken'),
      AsyncStorage.removeItem('refreshToken'),
      AsyncStorage.removeItem('user'),
      // Drop the persisted navigation stack so the next user doesn't land
      // on the previous session's deep-linked screen.
      AsyncStorage.removeItem('navigation_state_v1'),
      // Drop the in-session activity-log buffer so the next user's
      // Upload Debug Logs button doesn't ship the previous user's
      // session trail.
      AsyncStorage.removeItem('activity_session_log'),
    ]);
    // Drop the in-memory active visit too so the next user's first
    // CustomerVisitScreen mount doesn't restore the prior rep's check-in.
    try { useVisitStore.getState().clearVisit(); } catch { /* ignore */ }
    // Note: day_* AsyncStorage flags are intentionally NOT cleared here.
    // The Dashboard's fast-path and the active-visit resume both gate on
    // the local attendance_records row matching the signed-in user, so
    // a stale flag from a prior user can't surface for a new user. And
    // keeping the flags lets the SAME user log out + log back in (same
    // day) and see Continue on first paint instead of a Start Day flicker.
    // If a *different* user logs in next, login() detects the user-code
    // change and calls clearCrossUserClientState() to drop the flags then.

    // Delete master data backup so next user doesn't see previous user's data
    try {
      await deleteMasterDataBackup();
    } catch {
      // Non-critical error
    }

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
      needsSync: false,
      offlineMode: false,
    });
  },

  loadFromStorage: async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const refresh = await AsyncStorage.getItem('refreshToken');
      const userJson = await AsyncStorage.getItem('user');
      const offlineCredentials = await AsyncStorage.getItem('offlineCredentials');
      const user = userJson ? JSON.parse(userJson) : null;
      let loggedIn = !!token && !!user;

      // Trust stored tokens on every cold start — do NOT call checkStatus.
      // The api client interceptor already handles 401 → silent refresh
      // automatically on every subsequent request, so there is no need to
      // pre-validate the access token here. Pre-validation was the sole cause
      // of the background-logout bug: Android kills the app after 15+ min,
      // user reopens it, checkStatus returned 401 (expired token), and the
      // old code cleared all tokens → logged out — even though the 30-day
      // refresh token was perfectly valid.
      //
      // Deactivation is caught by the 30-second realtimeSync heartbeat that
      // starts as soon as isLoggedIn becomes true — no need to check it here.

      let syncNeeded = false;
      if (loggedIn) {
        syncNeeded = await needsInitialSync();
      }

      set({
        accessToken: token,
        refreshToken: refresh,
        user,
        isLoggedIn: loggedIn,
        isLoading: false,
        needsSync: syncNeeded,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  markSyncDone: () => set({ needsSync: false }),
}));

export default useAuthStore;
