import { AppState, AppStateStatus } from 'react-native';
import { incrementalSync, pushSync, syncForceFlags, syncCustomerTargets, recomputePendingCount, syncApprovalUpdates } from './syncService';
import { flushActivityLogs } from './activityLogger';
import { flushOutbox } from './outbox';

// @react-native-community/netinfo was removed: its native codegen library was
// missing from the APK and threw during module load, escalating to
// std::terminate before the JS error handler was armed. Connectivity recovery
// now relies solely on the AppState 'active' event below.

// Fast-poll cadence per user request — every short-cycle background timer
// fires at 5 s so admin changes on the portal reach the device almost in
// real time. This is intentionally aggressive; downside is roughly 6×
// more API requests per minute than the previous 30 s baseline.
const FLAG_INTERVAL_MS = 5 * 1000; // 5 s — force flags + targets
const FULL_SYNC_INTERVAL_MS = 5 * 1000; // 5 s — full incremental sync
const APPROVAL_POLL_INTERVAL_MS = 5 * 1000; // 5 s — approval badge refresh

let flagIntervalId: ReturnType<typeof setInterval> | null = null;
let fullSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let approvalPollIntervalId: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let syncInFlight = false;
// Debounce for connectivity-triggered flushes. Android tends to fire the
// NetInfo listener several times in quick succession on resume from
// background, which was overwhelming the sync pipeline and crashing the app.
let lastReconnectAt = 0;
const RECONNECT_DEBOUNCE_MS = 10 * 1000;

// Track app foreground/background state so the interval callbacks can
// skip API calls when the app is backgrounded. Without this, the 5-second
// intervals fire in the background for 10-15 minutes, the access token
// expires, the refresh fails (no network / token TTL), and the auth client
// forces an automatic logout — users reported being logged out while the
// app was idle in the background.
let appIsActive = AppState.currentState === 'active';
let appStateForSyncSub: { remove: () => void } | null = null;

function trackAppState(): void {
  if (appStateForSyncSub) return;
  appStateForSyncSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    appIsActive = next === 'active';
  });
}

function stopTrackingAppState(): void {
  if (appStateForSyncSub) { appStateForSyncSub.remove(); appStateForSyncSub = null; }
  appIsActive = true; // reset to safe default
}

async function flushQueuedWrites(routeCode: string, trigger: string): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    console.log(`[BackgroundSync] Connectivity restored (${trigger}) — flushing offline queue`);
    // Push first so anything captured offline (check-in/out, start day, stocks,
    // OSOI, PO capture, orders, etc.) is uploaded before we pull fresh data.
    await pushSync();
    // Flush the generic outbox (product feedback, sampling, broadcast, ageing,
    // edit-location, …) — submissions the user fired optimistically.
    await flushOutbox();
    await incrementalSync(routeCode);
    await flushActivityLogs();
    // Refresh the pending-sync count for the Dashboard banner.
    try { await recomputePendingCount(); } catch { /* ignore */ }
  } catch (err) {
    console.warn('[BackgroundSync] Flush on reconnect failed:', err);
  } finally {
    syncInFlight = false;
  }
}

export function startBackgroundSync(routeCode: string): void {
  stopBackgroundSync();

  console.log('[BackgroundSync] Started — periodic + connectivity-triggered sync');

  // Start tracking app foreground/background so intervals skip API calls
  // when the app is suspended. Prevents the token-expiry auto-logout that
  // occurred when 5-second intervals kept firing after 10-15 min background.
  trackAppState();

  // Run immediately on start
  syncForceFlags().catch(() => {});
  syncCustomerTargets().catch(() => {});
  flushQueuedWrites(routeCode, 'startup').catch(() => {});

  flagIntervalId = setInterval(async () => {
    // Skip entirely when the app is not in the foreground — we don't want
    // API calls (and the resulting 401/refresh cycle) firing in the background.
    if (!appIsActive) return;
    try {
      await syncForceFlags();
      await syncCustomerTargets();
    } catch (e) { console.warn("[App]", e); }
  }, FLAG_INTERVAL_MS);

  fullSyncIntervalId = setInterval(async () => {
    if (!appIsActive) return; // skip when backgrounded
    if (syncInFlight) {
      console.log('[BackgroundSync] Skipping full sync — already in progress');
      return;
    }
    syncInFlight = true;
    console.log('[BackgroundSync] Running full sync...');
    try {
      await flushOutbox();
      await incrementalSync(routeCode);
      try { await recomputePendingCount(); } catch { /* ignore */ }
    } catch (error) {
      console.warn('[BackgroundSync] Full sync failed:', error);
    } finally {
      syncInFlight = false;
    }
  }, FULL_SYNC_INTERVAL_MS);

  // Lightweight approval-only poll runs every 10 s so admin approve / reject /
  // skip actions on the web portal land on the mobile badge in seconds, not
  // after the next 30-second full-sync cycle finishes.
  syncApprovalUpdates().catch(() => {});
  approvalPollIntervalId = setInterval(() => {
    if (!appIsActive) return; // skip when backgrounded
    syncApprovalUpdates().catch(() => {});
  }, APPROVAL_POLL_INTERVAL_MS);

  // Connectivity listener was removed with @react-native-community/netinfo.
  // The AppState 'active' hook below covers the offline→online recovery path:
  // when the user foregrounds the app after regaining connectivity, it flushes
  // the queue. This is the only reliable signal we have without netinfo.

  // When the app comes back to foreground after being backgrounded, run one
  // catch-up sync — but only if it's been a while since the last reconnect
  // flush. This is the specific path that was crashing: rapid successive
  // syncs on resume.
  appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    const now = Date.now();
    if (now - lastReconnectAt < RECONNECT_DEBOUNCE_MS) return;
    lastReconnectAt = now;
    flushQueuedWrites(routeCode, 'app-resume').catch(() => {});
  });
}

export function stopBackgroundSync(): void {
  if (flagIntervalId != null) { clearInterval(flagIntervalId); flagIntervalId = null; }
  if (fullSyncIntervalId != null) { clearInterval(fullSyncIntervalId); fullSyncIntervalId = null; }
  if (approvalPollIntervalId != null) { clearInterval(approvalPollIntervalId); approvalPollIntervalId = null; }
  if (appStateSub) { appStateSub.remove(); appStateSub = null; }
  stopTrackingAppState();
  lastReconnectAt = 0;
  console.log('[BackgroundSync] Stopped');
}
