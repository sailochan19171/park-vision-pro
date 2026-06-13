// dayStatusPrefetch
// ---------------------------------------------------------------------------
// Seeds AsyncStorage with today's day-start / day-end flags from the server
// BEFORE DashboardScreen mounts. Without this, on a fresh install + login
// (or any cold launch where AsyncStorage is empty for today), the Dashboard's
// loadDayStatus must wait ~1-2 s for the server reconcile to finish before
// it can render the correct "Start Day" / "Continue" / "Day Ended" label.
// During that wait it shows a spinner, then flips — a visible delay/flicker.
//
// By writing the AsyncStorage keys here (called from App.tsx alongside
// restoreMyDay), the Dashboard's fast-path can render the correct button
// label on first paint with zero spinner. Honors three server signals:
//
//   1. srv.dayStarted === true                    → write today's flag
//   2. srv.openDayDate (open day on a prior date) → write today's flag too,
//      anchored to the open day's startTime. This is what made logout +
//      relogin show Start Day instead of Continue when the rep had started
//      day before UTC midnight: the server query for "today" found no row,
//      but the rep's open day was on yesterday's UTC date.
//   3. srv.dayEnded === true                      → write today's ended flag
//
// WRITE-ONLY: flags are only ever added here, never removed. Removal is
// done by clearCrossUserClientState() on user-switch and by
// DashboardScreen.loadDayStatus() which cross-checks all three sources
// (AsyncStorage, local DB, server) before removing anything.

import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

export interface DayStatusPrefetchResult {
  // True only when the server actually answered (not offline / timeout). Only
  // a confirmed result is safe to paint the bottom button from on the first
  // frame — see App.tsx's seed logic.
  confirmed: boolean;
  // Server says the rep has a day in progress (today's attendance OR an open
  // day from a prior date) → the button should read "Continue".
  dayInProgress: boolean;
  // Server says today's day has already been ended (EOT exists).
  dayEnded: boolean;
}

export async function prefetchDayStatus(): Promise<DayStatusPrefetchResult> {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: srv } = await api.get('/attendance/my-day-status', {
      params: { date: todayStr },
      timeout: 5000,
    });
    if (!srv || typeof srv !== 'object') {
      return { confirmed: false, dayInProgress: false, dayEnded: false };
    }

    const writes: Array<[string, string]> = [];

    // "Day in progress" = today has an attendance row OR the rep has an open
    // day from a prior date that no EOT closed — AND the day is NOT already
    // ended. An ENDED day (today's EOT exists → srv.dayEnded=true) must show
    // "Start Day", so we must NOT write day_started_<today> for it. Otherwise
    // the dashboard fast-path reads that flag and paints "Continue" for a frame
    // before the reconcile (todayHasEot) corrects it to "Start Day" — the exact
    // Start Day <-> Continue flicker.
    const dayInProgress =
      srv.dayEnded !== true && (srv.dayStarted === true || !!srv.openDayDate);
    const startTimeIso: string | null =
      (srv.dayStarted === true ? srv.startTime : srv.openDayStartTime) ?? null;

    // WRITE-ONLY: only set flags when the server positively confirms the
    // state. Never remove existing flags here.
    //
    // Removing flags on a "dayStarted: false" response causes a false
    // "Start Day" flash on login whenever the attendance record was
    // written locally but hasn't synced to the server yet (e.g. network
    // was down at submit time, or the logout pushSync was skipped). The
    // preserved flag lets DashboardScreen's fast-path paint "Continue"
    // immediately; its own authoritative loadDayStatus (which also
    // checks the local WatermelonDB attendance_records table as a
    // fallback) handles the definitive cleanup when appropriate.
    //
    // DashboardScreen.loadDayStatus is the single source of truth for
    // flag removal — it checks all three layers (AsyncStorage, local DB,
    // server) and decides whether to remove or keep flags. Removal here
    // was a premature optimisation that broke same-user re-login.
    if (dayInProgress) {
      writes.push([`day_started_${todayStr}`, 'true']);
      if (startTimeIso) {
        writes.push([`day_start_timestamp_${todayStr}`, String(startTimeIso)]);
      }
    }
    // Do NOT write day_ended / day_end_timestamp here. When the server
    // reports dayEnded=true, DashboardScreen's server reconcile branch
    // (todayHasEot=true) ALWAYS clears those flags to show "Start Day".
    // Writing them here causes the gray "Day Ended" button to flash for
    // one render-cycle before the reconcile corrects it — visible as the
    // two-screenshot flicker (gray→blue) reported by QA. The reconcile
    // in loadDayStatus is the single source of truth for the ended state;
    // it reads from the server on every focus and removes stale flags
    // itself, so pre-seeding them here serves no purpose and only hurts.

    if (writes.length > 0) await AsyncStorage.multiSet(writes);
    return { confirmed: true, dayInProgress, dayEnded: srv.dayEnded === true };
  } catch {
    // Best-effort. Not confirmed → the caller keeps the spinner up and the
    // Dashboard reconciles on its own, instead of flashing a wrong label.
    return { confirmed: false, dayInProgress: false, dayEnded: false };
  }
}
