import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, Alert, BackHandler, TextInput, Modal,
  DeviceEventEmitter,
} from 'react-native';
import StoreActivityHeader from '../components/common/StoreActivityHeader';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import useVisitStore from '../store/visit';
import database from '../db/database';
import { pushSync, uploadPhoto, incrementalSync } from '../services/syncService';
import { RESTORE_MY_DAY_DONE_EVENT, ACTIVITY_SUBMITTED_EVENT } from '../services/restoreMyDay';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition, calculateDistance } from '../services/locationService';
import api from '../api/client';
import { useWatermark } from '../hooks/useWatermark';
import PhotoPreviewModal from '../components/common/PhotoPreviewModal';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

type RouteParams = {
  CustomerDashboard: {
    customerCode: string;
    customerName: string;
    visitCode?: string;
    // Set when returning from the Daily Sales Report flow so checkCompleted
    // re-runs and lights the Sales Report tile tick.
    salesReportDone?: boolean;
  };
};

interface ActivityItem {
  icon: string;
  title: string;
  screen: string;
}

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Offline OTP: challenge-response — must match web portal algorithm
const OTP_SECRET = 'FARMLEY_SFA_2026';

function generateChallenge(userCode: string, customerCode: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const seed = `${userCode}:${customerCode}:${today}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return String(Math.abs(hash) % 10000).padStart(4, '0');
}

function verifyOtpResponse(challenge: string, customerCode: string, response: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const seed = `${challenge}:${customerCode}:${today}:${OTP_SECRET}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const expected = String(Math.abs(hash) % 10000).padStart(4, '0');
  return response === expected;
}

const ACTIVITIES: ActivityItem[] = [
  { icon: 'layers-outline', title: 'Opening Stock', screen: 'OpeningStock' },
  { icon: 'cube-outline', title: 'Physical Stock', screen: 'PhysicalStock' },
  { icon: 'camera-outline', title: 'OSOI Photo Capture', screen: 'OSOI' },
  { icon: 'grid-outline', title: 'Planogram', screen: 'PlanogramHistory' },
  { icon: 'time-outline', title: 'Ageing/Near Expiry Data', screen: 'ExpiryCheck' },
  { icon: 'people-outline', title: 'Competitor Observation', screen: 'Competitor' },
  { icon: 'document-text-outline', title: 'Daily Sales Report', screen: 'SalesReport' },
  { icon: 'receipt-outline', title: 'PO Capture', screen: 'POCapture' },
  { icon: 'trending-up-outline', title: 'MTD Sales Summary', screen: 'MTDSummary' },
];

export default function CustomerDashboardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'CustomerDashboard'>>();
  const { customerCode, customerName, visitCode } = route.params;
  const user = useAuthStore((s) => s.user);
  const { clearVisit } = useVisitStore();
  const [address, setAddress] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [completedActivities, setCompletedActivities] = useState<Set<string>>(new Set());
  // Latest check-in timestamp for THIS visit, surfaced in the date row
  // next to the "Check In" label so reps can see when they tapped Check
  // In (and the updated time on a re-visit to the same store today).
  const [checkinTimeStr, setCheckinTimeStr] = useState<string | null>(null);
  const [customerTarget, setCustomerTarget] = useState<{ targetAmount: number; achievement: number } | null>(null);
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);
  const [checkoutPhotoPreview, setCheckoutPhotoPreview] = useState(false);
  const [checkoutPhotoUri, setCheckoutPhotoUri] = useState<string | null>(null);
  const [checkoutPhotoTs, setCheckoutPhotoTs] = useState<number | null>(null);
  const [checkoutPhotoLat, setCheckoutPhotoLat] = useState<number | null>(null);
  const [checkoutPhotoLng, setCheckoutPhotoLng] = useState<number | null>(null);
  const [checkoutPhotoResolve, setCheckoutPhotoResolve] = useState<((uri: string | null) => void) | null>(null);
  // Custom "Checkout Required" confirm. Replaces a native Alert whose long
  // "Checkout & Leave" label made Android stack/truncate the buttons on some
  // devices — this modal keeps Stay + Checkout & Leave on one row everywhere.
  const [showCheckoutRequired, setShowCheckoutRequired] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpType, setOtpType] = useState<'checkin' | 'checkout'>('checkout');
  const [isSyncing, setIsSyncing] = useState(false);
  // Guards the one-time "customer un-assigned" exit so the alert + navigation
  // fire only once even though checkCompleted polls repeatedly.
  const removedRef = useRef(false);

  // Force flags are synced via background sync (every 2 min) into AsyncStorage
  // Check-in/check-out reads from AsyncStorage — fully offline

  // Load address + check completed activities
  const checkCompleted = useCallback(async () => {
    // Check which activities have actual submitted data (not just visited).
    // Completion is scoped to TODAY only so the tiles read fresh on a new day:
    // a customer whose day isn't started / wasn't visited today, and yesterday's
    // submissions, must NOT light a green tick. The string-date activities
    // (opening/physical stock, expiry) stamp a UTC `YYYY-MM-DD`; for IST
    // (UTC+5:30) a daytime submit lands under today-UTC, so `today` alone catches
    // the normal case while correctly excluding yesterday's work. (We previously
    // used a ±1-day window for the rare 00:00–05:30 IST submit, but that also lit
    // yesterday's genuine work as "done today" — the wrong trade-off given the
    // requirement that a changed day starts blank.) Scope stays per user +
    // customer so it can't pick up an unrelated activity.
    const today = new Date().toISOString().split('T')[0];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const cc = customerCode;
    // Scope every completion check to the CURRENT user. Without this, the tick
    // was decided purely by "any row for this customer today", so on a shared
    // device (or with restored/leftover data from a previous rep) OSOI /
    // Planogram / etc. showed as done even though the logged-in user never
    // submitted them. Same cross-user attribution the auto-EOD popup had to fix.
    const uc = user?.code ?? '';

    // Scope completion to the CURRENT SHIFT, not the whole calendar day. After
    // End Day (manual or auto-EOD) + a fresh Start Day, the rep is on a NEW
    // shift — which can fall on the SAME calendar date (the 12 h rollover) — and
    // the previous shift's work (incl. data restored on a reinstall) must NOT
    // show as done. Every activity carries the visit_code of the check-in it
    // belongs to, and each Start Day → check-in mints a fresh visit_code, so
    // scoping activities by the CURRENT visit resets the ticks per shift. Orders
    // have no visit_code, so gate them on the current shift's Start-Day time
    // instead. If we somehow arrived without a visit code, `scoped` falls back
    // to the old today-scoped filter so the ticks never break.
    const vc = visitCode ?? '';
    let shiftStartMs = todayMs;
    try {
      const ts = await AsyncStorage.getItem(`day_start_timestamp_${today}`);
      if (ts) { const ms = new Date(ts).getTime(); if (!Number.isNaN(ms)) shiftStartMs = ms; }
    } catch { /* fall back to today midnight */ }
    const scoped = (fallback: any) => (vc ? Q.where('visit_code', vc) : fallback);

    const done = new Set<string>();
    try {
      // Run the customer lookup + every activity-completion count CONCURRENTLY.
      // These are all independent SQLite queries; awaiting them one-by-one (the
      // previous behaviour) meant ~11 round-trips back-to-back, which was the
      // bulk of the customer-dashboard open lag on low-end devices. Promise.all
      // collapses them into a single parallel batch — same results, one wait.
      const [custs, os, ps, osoi, plano, exp, comp, sr, po, ord] = await Promise.all([
        database.get('customers').query(Q.where('code', cc)).fetch(),
        database.get('opening_stocks').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('stock_date', today))).fetchCount(),
        database.get('physical_stocks').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('stock_date', today))).fetchCount(),
        database.get('osoi_photos').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('captured_on', Q.gte(todayMs)))).fetchCount(),
        // Planogram. Activity tile key is 'PlanogramHistory' (the screen route
        // it navigates to); the tile lookup below is
        // `completedActivities.has(item.screen)`.
        database.get('planogram_executions').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('performed_on', Q.gte(todayMs)))).fetchCount(),
        // Ageing/Near-Expiry. expiry_checks.visit_code is NOT persisted on the
        // server (the backend table has no visit_code column), so RESTORED rows
        // (Master-Data sync / reinstall / user switch) always come back with
        // visit_code = null and the plain visit-scoped check missed them — the
        // green tick disappeared after restore. Count the current visit's rows
        // OR any restored (null visit_code) row for today so a previously
        // submitted ageing entry still shows as done.
        database.get('expiry_checks').query(
          Q.where('customer_code', cc), Q.where('user_code', uc),
          vc
            ? Q.or(Q.where('visit_code', vc), Q.and(Q.where('visit_code', null), Q.where('visited_date', today)))
            : Q.where('visited_date', today),
        ).fetchCount(),
        database.get('competitor_observations').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('observed_on', Q.gte(todayMs)))).fetchCount(),
        // Daily Sales Report (status 100) vs Order (everything else). Orders
        // carry no visit_code → gate on the current shift's start time.
        database.get('orders').query(Q.where('customer_code', cc), Q.where('user_code', uc), Q.where('status', 100), Q.where('trx_date', Q.gte(shiftStartMs))).fetchCount(),
        database.get('po_captures').query(Q.where('customer_code', cc), Q.where('user_code', uc), scoped(Q.where('captured_on', Q.gte(todayMs)))).fetchCount(),
        database.get('orders').query(Q.where('customer_code', cc), Q.where('user_code', uc), Q.where('status', Q.notEq(100)), Q.where('trx_date', Q.gte(shiftStartMs))).fetchCount(),
      ]);
      // If the customer is no longer in the local table, an admin un-assigned it
      // from this user on the web portal and the scope-reconcile removed it (and
      // auto-checked-out the visit). Kick the rep out so they can't keep
      // submitting against a store that's no longer theirs.
      if (custs.length === 0 && !removedRef.current) {
        removedRef.current = true;
        try { clearVisit(); } catch { /* best-effort */ }
        // Navigate back DETERMINISTICALLY here — NOT inside the popup's OK
        // handler. On Android a back/swipe gesture dismisses the alert without
        // firing onPress, which previously left the rep stranded on a dashboard
        // for a store that's no longer theirs. Doing the goBack first makes the
        // exit happen regardless of how (or whether) the popup is dismissed; the
        // alert is then purely informational and shows on the screen we land on.
        try { navigation.goBack(); } catch { /* ignore */ }
        setTimeout(() => {
          try {
            Alert.alert('Customer Removed', 'This customer is no longer assigned to you. You have been checked out.');
          } catch { /* ignore */ }
        }, 400);
        return;
      }
      if (custs.length > 0 && (custs[0] as any).address) setAddress((custs[0] as any).address);
      if (os > 0) done.add('OpeningStock');
      if (ps > 0) done.add('PhysicalStock');
      if (osoi > 0) done.add('OSOI');
      if (plano > 0) done.add('PlanogramHistory');
      if (exp > 0) done.add('ExpiryCheck');
      if (comp > 0) done.add('Competitor');
      if (sr > 0) done.add('SalesReport');
      if (po > 0) done.add('POCapture');
      if (ord > 0) done.add('Order');
      // MTD Summary — always accessible, mark if orders exist
      if (ord > 0 || sr > 0) done.add('MTDSummary');
    } catch (e) { console.warn("[App]", e); }

    setCompletedActivities(done);

    // Read customer target + achievement from AsyncStorage (offline — synced every 15s from server)
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const targetStr = await AsyncStorage.getItem(`target_${customerCode}_${month}_${year}`);
      if (targetStr) {
        const t = JSON.parse(targetStr);
        // Use server-synced achievement (includes all orders from all devices)
        // Plus add any local unsynced orders for this month
        let achievement = t.achievedAmount ?? 0;
        try {
          const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
          const monthEnd = new Date(year, month, 0, 23, 59, 59, 999).getTime();
          const unsyncedOrders: any[] = await database.get('orders').query(
            Q.where('customer_code', customerCode),
            Q.where('is_synced', false),
            Q.where('trx_date', Q.gte(monthStart)),
            Q.where('trx_date', Q.lte(monthEnd)),
          ).fetch();
          const unsyncedTotal = unsyncedOrders.reduce((sum, o) => sum + (o.totalAmount ?? o._raw?.total_amount ?? 0), 0);
          achievement += unsyncedTotal;
        } catch (e) { console.warn("[App]", e); }
        setCustomerTarget({ targetAmount: t.targetAmount ?? 0, achievement });
      }
    } catch (e) { console.warn("[App]", e); }
  }, [customerCode, user?.code, visitCode, route.params?.salesReportDone]);

  useEffect(() => { checkCompleted(); }, [checkCompleted]);

  // Load the latest check-in time for THIS visit so the date row reads
  // e.g. "Check In   10:34 AM" instead of just today's date. Re-fires on
  // focus and on the visitCode changing, so a re-check-in to the same
  // store later in the day shows the updated time (a new visit row gets
  // created on each check-in; pick the most-recent one for this user +
  // customer combo today).
  const loadCheckinTime = useCallback(async () => {
    try {
      // Resolve the check-in time for THIS visit. Read by visit_code first
      // (the param the screen mounted with), so a re-check-in to the same
      // store later in the day shows the NEW visit's time — not the
      // earlier visit row that was still sitting in local DB. Falls back
      // to the latest customer_visits row for today if the visit_code
      // lookup misses (legacy rows that didn't write visit_code, or a
      // bot/test seed).
      if (visitCode) {
        const direct: any[] = await database.get('customer_visits').query(
          Q.where('visit_code', visitCode),
        ).fetch();
        if (direct.length > 0) {
          const ms: number = direct[0].checkinTime ?? direct[0]._raw?.checkin_time ?? 0;
          if (ms) {
            setCheckinTimeStr(new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
            return;
          }
        }
      }
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const rows: any[] = await database.get('customer_visits').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('customer_code', customerCode),
        Q.where('checkin_time', Q.gte(todayMidnight.getTime())),
      ).fetch();
      if (rows.length === 0) { setCheckinTimeStr(null); return; }
      let latest = rows[0];
      for (const r of rows) {
        if ((r.checkinTime ?? 0) > (latest.checkinTime ?? 0)) latest = r;
      }
      const ms: number = latest.checkinTime ?? 0;
      if (!ms) { setCheckinTimeStr(null); return; }
      setCheckinTimeStr(new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } catch { setCheckinTimeStr(null); }
  }, [user?.code, customerCode, visitCode]);
  useEffect(() => { loadCheckinTime(); }, [loadCheckinTime]);

  // Cold-launch race after uninstall + reinstall + login: this screen often
  // mounts (via DashboardScreen's active-visit resume which fires off the
  // restoreMyDay completion event) AFTER the event has already been emitted.
  // The listener below subscribes too late and misses the one-shot event,
  // so the badges + target row sat empty until the user back-navigated and
  // remounted the screen. Two complementary safety nets:
  //
  // 1. Event listener — covers the case where restoreMyDay finishes while
  //    the user is already on the customer dashboard (warm restart, or the
  //    cold-launch resume that happened before restore was done).
  // 2. Short polling retry — covers the cold-launch reinstall case where
  //    restoreMyDay's event fires BEFORE this screen mounts. We re-run
  //    checkCompleted every 1.5 s for the first 9 s after mount, stopping
  //    as soon as any operation badge appears (i.e. the restore has clearly
  //    landed). Bounded cost: max 6 light count queries × a handful of
  //    tables on a screen the user is staring at anyway.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RESTORE_MY_DAY_DONE_EVENT, () => {
      checkCompleted();
    });
    return () => sub.remove();
  }, [checkCompleted]);

  // Listen for any activity screen's successful submit so the green tile
  // tick lights up the moment the rep returns to this screen — without
  // this, Planogram (and others) relied on the focus-fired refresh, which
  // on slow devices ran before WatermelonDB's writer queue had flushed
  // the new row and so the count came back zero.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ACTIVITY_SUBMITTED_EVENT, () => {
      checkCompleted();
    });
    return () => sub.remove();
  }, [checkCompleted]);

  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      checkCompleted();
      if (attempts >= 6) clearInterval(id);
    }, 1500);
    return () => clearInterval(id);
  }, [checkCompleted]);

  // Auto-checkout warning: if the admin enabled auto-checkout for this user+
  // store combo, schedule a local alert for when the configured window elapses.
  // The backend cron will also close the visit server-side; this alert just
  // gives the field user visible warning while they're still on this screen.
  useEffect(() => {
    if (!visitCode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const showAlert = (minutes: number) => {
      if (cancelled) return;
      Alert.alert(
        'Auto Checkout',
        `The configured auto-checkout window of ${minutes} minute${minutes === 1 ? '' : 's'} has elapsed for your visit at ${customerName}. ` +
        `The system has closed this visit on the server automatically (no photo / GPS captured). Tap OK to return to the store list.`,
        [
          {
            text: 'OK',
            onPress: async () => {
              // Mirror the server's auto-close locally so the row doesn't
              // stay "open" on the device, then exit the checkout screen.
              try {
                const matches: any[] = await database.get('customer_visits').query(Q.where('visit_code', visitCode)).fetch();
                const local = matches[0];
                if (local && !local.checkoutTime) {
                  await database.write(async () => {
                    await local.update((rec: any) => {
                      rec._raw.checkout_time = Date.now();
                      rec._raw.status = 'completed';
                      rec._raw.checkout_type = 'auto';
                      rec._raw.is_synced = true;
                      const ci = rec._raw.checkin_time ?? Date.now();
                      rec._raw.duration_mins = Math.round((Date.now() - ci) / 60000);
                    });
                  });
                }
              } catch (e) {
                console.warn('[auto-checkout] local close failed:', (e as any)?.message);
              }
              clearVisit();
              navigation.navigate('Stores' as never);
            },
          },
        ],
        { cancelable: false },
      );
    };
    (async () => {
      try {
        const visits: any[] = await database.get('customer_visits').query(Q.where('visit_code', visitCode)).fetch();
        const local = visits[0];
        if (!local || local.checkoutTime) return; // already checked out
        const checkinMs: number = local.checkinTime;
        const { data } = await api.get('/settings/auto-checkout/for-me', { params: { customerCode } });
        if (cancelled) return;
        if (!data?.applies) return;
        const freqMins: number = Number(data.frequencyMinutes) || 0;
        if (freqMins <= 0) return;
        const elapsedMs = Date.now() - checkinMs;
        const remainingMs = freqMins * 60_000 - elapsedMs;
        if (remainingMs <= 0) {
          showAlert(freqMins);
        } else {
          timer = setTimeout(() => showAlert(freqMins), remainingMs);
        }
      } catch (e) {
        console.warn('[auto-checkout] for-me fetch failed:', (e as any)?.message);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [visitCode, customerCode, customerName]);

  // Customer-deactivation guard: while the rep is checked in to this store,
  // poll the local DB every 15 s for the customer's active flag (kept fresh
  // by the background /customers pull). If admin flips the store to inactive
  // / blocked / deactivated on the web portal, force-close the visit and
  // bounce back to My Stores so the rep can't keep submitting against a
  // store that's no longer valid. Mirrors the auto-close pattern used for
  // the auto-checkout window above — closes locally with checkout_type
  // 'auto_inactive' so the report can distinguish admin-deactivation from
  // a time-window auto-close.
  useEffect(() => {
    if (!visitCode || !customerCode) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const handleDeactivated = async (reason: string) => {
      if (cancelled) return;
      try {
        const matches: any[] = await database.get('customer_visits').query(Q.where('visit_code', visitCode)).fetch();
        const local = matches[0];
        if (local && !local.checkoutTime) {
          await database.write(async () => {
            await local.update((rec: any) => {
              rec._raw.checkout_time = Date.now();
              rec._raw.status = 'completed';
              rec._raw.checkout_type = 'auto_inactive';
              rec._raw.is_synced = false; // sync push the auto-close to server
              const ci = rec._raw.checkin_time ?? Date.now();
              rec._raw.duration_mins = Math.round((Date.now() - ci) / 60000);
            });
          });
        }
      } catch (e) {
        console.warn('[auto-inactive-checkout] local close failed:', (e as any)?.message);
      }
      if (cancelled) return;
      Alert.alert(
        'Customer Deactivated',
        `${customerName} has been ${reason} by the administrator. Your visit has been automatically closed.`,
        [
          {
            text: 'OK',
            onPress: () => {
              clearVisit();
              navigation.navigate('Stores' as never);
            },
          },
        ],
        { cancelable: false },
      );
    };

    const check = async () => {
      if (cancelled) return;
      try {
        const rows: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        const c: any = rows[0];
        if (!c) return; // master not synced yet, don't blow the rep off the screen
        const status = (c.status ?? c._raw?.status ?? '').toString().toLowerCase();
        const isActive = c.isActive ?? c._raw?.is_active;
        if (status === 'blocked') return handleDeactivated('blocked');
        if (isActive === false || status === 'deactivated' || status === 'inactive') {
          return handleDeactivated('deactivated');
        }
      } catch (e) {
        console.warn('[customer-active-guard] read failed:', (e as any)?.message);
      }
    };

    check();
    timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [visitCode, customerCode, customerName, navigation, clearVisit]);

  useFocusEffect(useCallback(() => {
    checkCompleted();
    loadCheckinTime();
  }, [checkCompleted, loadCheckinTime]));

  // Day guard. Two states are illegal here:
  //   1. Day already ended       → tell the rep to start a new day.
  //   2. Day not started at all  → previously the rep could relaunch the app,
  //      land here via a stale checked_in visit row (or open the customer
  //      directly), and submit operations without ever having marked
  //      attendance for today. Kick them back to Start Day so the work
  //      always sits inside an attendance window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const [dayStarted, dayEnded] = await Promise.all([
          AsyncStorage.getItem(`day_started_${todayStr}`),
          AsyncStorage.getItem(`day_ended_${todayStr}`),
        ]);
        if (cancelled) return;
        if (dayEnded === 'true') {
          Alert.alert('Day Already Ended', 'Please start a new day to continue.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
        if (dayStarted !== 'true') {
          // Reconcile once with the server before we bounce the user — the
          // local flag may simply not have been written yet (cold launch
          // race with prefetchDayStatus / restoreMyDay). Treat both
          // `dayStarted` and a non-null `openDayDate` as "day in progress",
          // mirroring the prefetch + Dashboard reconcile.
          let confirmedStart = false;
          try {
            const { data: srv } = await api.get('/attendance/my-day-status', {
              params: { date: todayStr },
              timeout: 5000,
            });
            confirmedStart = srv?.dayStarted === true || !!srv?.openDayDate;
            if (confirmedStart) {
              await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
            }
          } catch { /* offline — fall through to the bounce */ }
          if (cancelled) return;
          if (!confirmedStart) {
            Alert.alert(
              'Start Day Required',
              'Please mark your attendance and start the day before checking in to any store.',
              [{ text: 'OK', onPress: () => {
                // Bypass the Checkout-Required beforeRemove guard: the rep
                // never legitimately checked in (day not started), so there
                // is no checkout to enforce. Clear the in-memory active visit
                // too so other screens don't restore this illegal state.
                checkoutDoneRef.current = true;
                useVisitStore.getState().clearVisit();
                // Root home is registered as 'MainTabs', not 'Dashboard' —
                // the old name silently no-op'd and trapped the rep here.
                // reset() clears the back stack so a back gesture can't pop
                // them back into this CustomerDashboard.
                navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as never }] });
              } }],
              { cancelable: false },
            );
          }
        }
      } catch (e) { console.warn("[App]", e); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tracks whether the user has successfully checked out. Set to true at
  // the end of handleCheckOut (after photo + server post + DB update).
  // Until then, beforeRemove blocks every back navigation.
  const checkoutDoneRef = useRef(false);
  // Reentrancy guard for ALL capturePhoto calls in the checkout flow.
  // useState is async so a fast double-tap (or the retake path calling
  // capturePhoto while the camera intent from the first call is still
  // live on some Android devices) crashes the app with a double-launch.
  const cameraInProgressRef = useRef(false);

  // Back navigation of ANY kind triggers checkout instead of silently
  // leaving. Checkout is mandatory after check-in. We use React
  // Navigation's beforeRemove which catches all back paths uniformly:
  //   - hardware 3-button back
  //   - Android system gesture back (swipe from edge)
  //   - iOS swipe-back gesture
  //   - navigation.goBack() programmatic calls
  //   - header back button
  // BackHandler ('hardwareBackPress') alone misses gesture back, which
  // is how users on gesture-nav phones were leaving without checkout.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!visitCode) return;            // no active visit — let nav proceed
      if (checkoutDoneRef.current) return; // already checked out — allow leave

      // Async safety net: the visit may have been auto-closed by Start Day's
      // lingering-visit cleanup or by Auto-EOD without this screen knowing.
      // Re-check the DB before blocking the navigation. If the row already
      // has a checkout_time, mark done and let the nav proceed without
      // surfacing the Checkout Required alert.
      e.preventDefault();
      (async () => {
        try {
          const visits: any[] = await database.get('customer_visits').query(
            Q.where('visit_code', visitCode),
          ).fetch();
          const v = visits[0];
          const checkoutTime = v?.checkoutTime ?? v?._raw?.checkout_time;
          if (checkoutTime) {
            checkoutDoneRef.current = true;
            navigation.dispatch(e.data.action);
            return;
          }
        } catch { /* fall through to the modal */ }
        setShowCheckoutRequired(true);
      })();
    });
    return unsubscribe;
  }, [navigation, visitCode]);

  // Debounce tile presses — prevents double-tap from pushing the same
  // screen twice onto the nav stack (causes flicker / crash).
  const tileNavRef = useRef(false);
  const handleTilePress = useCallback(async (screen: string) => {
    if (tileNavRef.current) return;
    tileNavRef.current = true;
    let priceList = 'GT';
    try {
      const custs: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
      if (custs.length > 0 && custs[0].priceList) priceList = custs[0].priceList;
    } catch (e) { console.warn("[App]", e); }
    navigation.navigate(screen, { customerCode, customerName, visitCode, priceList });
    setTimeout(() => { tileNavRef.current = false; }, 800);
  }, [navigation, customerCode, customerName, visitCode]);

  const initiateCheckout = () => confirmCheckout();

  const confirmCheckout = async () => {
    try {
      // 1. Get user GPS and customer coords
      let userLoc: { lat: number; lng: number } | null = null;
      try {
        const pos = await getCurrentPosition(true);
        if (pos) userLoc = { lat: pos.lat, lng: pos.lng };
      } catch (e) { console.warn("[App]", e); }

      let custLat = 0, custLng = 0;
      try {
        const customers: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        if (customers.length > 0) {
          custLat = parseFloat(customers[0].latitude) || 0;
          custLng = parseFloat(customers[0].longitude) || 0;
        }
      } catch (e) { console.warn("[App]", e); }

      // 2. If user is within the store radius — show the NORMAL checkout
      // confirmation (not a force checkout). Only when the rep is OUTSIDE
      // the radius do we fall through to the force-checkout popup below.
      if (userLoc && custLat !== 0 && custLng !== 0) {
        const distance = calculateDistance(userLoc.lat, userLoc.lng, custLat, custLng);
        if (distance <= 1000) {
          Alert.alert(
            'Check Out',
            'Are you sure you want to check out from this store?',
            [
              { text: 'No', style: 'cancel' },
              { text: 'Yes', onPress: () => handleCheckOut('normal') },
            ],
          );
          return;
        }
      }

      // 2b. Store has NO mapped coordinates (or we couldn't read them). There
      // is no geofence to evaluate, so this can't be an out-of-radius "force"
      // checkout — treat it as a NORMAL checkout. Previously an unmapped store
      // forced every checkout even when the rep was standing inside it (the
      // "0.00 km / no distance still shows force" complaint).
      if (custLat === 0 || custLng === 0) {
        Alert.alert(
          'Check Out',
          'Are you sure you want to check out from this store?',
          [
            { text: 'No', style: 'cancel' },
            { text: 'Yes', onPress: () => handleCheckOut('normal') },
          ],
        );
        return;
      }

      // 3. User is outside the radius (coords are known) — force checkout flag
      let forceCheckoutEnabled = true;
      try {
        const flag = await AsyncStorage.getItem(`force_checkout_${customerCode}`);
        if (flag === 'false') forceCheckoutEnabled = false;
      } catch (e) { console.warn("[App]", e); }

      if (!forceCheckoutEnabled) {
        Alert.alert(
          'Access Denied',
          'You are not within the store radius and force check-out is disabled by admin for this store.',
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Use OTP',
              onPress: () => {
                const challenge = generateChallenge(user?.code ?? '', customerCode);
                setOtpChallenge(challenge);
                setOtpInput('');
                setOtpError('');
                setOtpType('checkout');
                setShowOtpModal(true);
              },
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Force Check Out',
        'You are not within the store radius. This will be recorded as a force check out. Continue?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes', onPress: () => handleCheckOut('force') },
        ]
      );
    } catch {
      handleCheckOut('normal');
    }
  };

  const handleCheckOut = async (checkoutType: string = 'normal') => {
    if (!visitCode) { navigation.goBack(); return; }
    if (cameraInProgressRef.current) return; // block concurrent camera calls
    cameraInProgressRef.current = true;
    setCheckingOut(true);
    try {
      // 1. Start GPS fetch in background (don't wait). Hold the coords on an
      // object property rather than a bare `let` — assigning inside the .then
      // closure stops TS from narrowing a plain variable, which made every
      // later `loc.current?.lat` read error as "Property 'lat' does not exist on never".
      const loc: { current: { lat: number; lng: number } | null } = { current: null };
      const gpsPromise = getCurrentPosition(true).then(pos => {
        if (pos) loc.current = { lat: pos.lat, lng: pos.lng };
      }).catch(() => {});

      // 2. Capture checkout photo immediately (don't wait for GPS)
      let photoUri: string | null = null;
      try {
        const photo = await capturePhoto(false, user?.name ?? user?.code, customerName);
        if (photo) {
          const ts = Date.now();
          await gpsPromise;
          const stampedUri = await burnWatermark(photo.uri, ts, loc.current?.lat ?? null, loc.current?.lng ?? null);
          const acceptedUri = await new Promise<string | null>((resolve) => {
            setCheckoutPhotoUri(stampedUri);
            setCheckoutPhotoTs(ts);
            setCheckoutPhotoLat(loc.current?.lat ?? null);
            setCheckoutPhotoLng(loc.current?.lng ?? null);
            setCheckoutPhotoResolve(() => resolve);
            setCheckoutPhotoPreview(true);
          });

          if (!acceptedUri) {
            setCheckingOut(false);
            cameraInProgressRef.current = false;
            return;
          }
          photoUri = acceptedUri;
        } else {
          Alert.alert('Alert !', 'Please capture a photo to check out.');
          setCheckingOut(false);
          cameraInProgressRef.current = false;
          return;
        }
      } catch (camErr) {
        console.warn('[CheckOut] Camera error:', camErr);
        Alert.alert('Alert !', 'Camera not available.');
        setCheckingOut(false);
        cameraInProgressRef.current = false;
        return;
      }

      // 3. OPTIMISTIC CHECKOUT. Write the checkout onto the local visit row with
      // the LOCAL photo URI and is_synced=false, then navigate IMMEDIATELY. The
      // photo upload, reverse-geocode and backend PUT run in the BACKGROUND
      // below. Previously uploadPhoto + reverseGeocode were awaited before
      // navigating, stalling checkout for several seconds after the rep accepted
      // the photo. pushSync (and the 30 s timer) reconcile the server image URL
      // + place + backend record without blocking the rep.
      const now = Date.now();
      const coLat = loc.current?.lat ?? null;
      const coLng = loc.current?.lng ?? null;

      const visits: any[] = await database.get('customer_visits').query(
        Q.where('visit_code', visitCode),
      ).fetch();
      if (visits.length > 0) {
        await database.write(async () => {
          await visits[0].update((rec: any) => {
            rec._raw.checkout_time = now;
            rec._raw.checkout_lat = coLat;
            rec._raw.checkout_lng = coLng;
            rec._raw.checkout_place = null;   // resolved in the background below
            rec._raw.checkout_image = photoUri; // local URI; server URL set in bg
            rec._raw.status = 'completed';
            rec._raw.checkout_type = checkoutType;
            rec._raw.is_synced = false;
            const checkin = rec._raw.checkin_time || now;
            rec._raw.duration_mins = Math.round((now - checkin) / 60000);
          });
        });
      }
      clearVisit();

      // Mark checkout completed so beforeRemove allows navigation, then leave.
      checkoutDoneRef.current = true;
      navigation.navigate('Stores');

      // Detached background work — runs after navigation and survives this
      // screen's unmount (touches NO React state). Uploads the photo, geocodes
      // the place, stamps the server URL + place on the row, then PUTs to the
      // backend + syncs. pushSync is the retry/mark-synced safety net.
      void (async () => {
        let serverPhotoUrl = photoUri;
        if (photoUri) {
          try {
            const uploaded = await uploadPhoto(photoUri, 'checkout');
            if (uploaded) serverPhotoUrl = uploaded;
          } catch (e) { console.warn('[CheckOut] Photo upload failed, using local URI:', e); }
        }

        let checkoutPlace: string | null = null;
        if (typeof coLat === 'number' && typeof coLng === 'number') {
          try {
            const { reverseGeocode } = require('../services/reverseGeocode');
            checkoutPlace = await reverseGeocode(coLat, coLng);
          } catch (e) { console.warn('[CheckOut] reverseGeocode failed:', e); }
        }

        try {
          const rows: any[] = await database.get('customer_visits').query(Q.where('visit_code', visitCode)).fetch();
          if (rows[0]) {
            await database.write(async () => {
              await rows[0].update((rec: any) => {
                rec._raw.checkout_image = serverPhotoUrl;
                rec._raw.checkout_place = checkoutPlace;
              });
            });
          }
        } catch (e) { console.warn("[App]", e); }

        api.put(`/customer-visits/${visitCode}/checkout`, {
          checkoutTime: new Date(now).toISOString(),
          checkoutLat: coLat,
          checkoutLng: coLng,
          checkoutPlace,
          checkoutImage: serverPhotoUrl,
          checkoutType,
          status: 'completed',
        }).catch(() => {});

        pushSync().catch(() => {});
      })();

      // Log checkout
      try { const { logCheckOut } = require('../services/activityLogger'); logCheckOut(customerCode, customerName, coLat, coLng); } catch {}
    } catch (err: any) {
      console.error('[CheckOut] Error:', err);
      try { const { logActivity } = require('../services/activityLogger'); logActivity({ action: 'CHECK_OUT', status: 'failed', module: 'visit', customerCode, customerName, errorMessage: err?.message }); } catch {}
      Alert.alert('Error', err?.message ?? 'Failed to check out.');
    } finally {
      setCheckingOut(false);
      cameraInProgressRef.current = false;
    }
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await pushSync();
      await incrementalSync(user?.routeCode ?? '');
      Alert.alert('Synced', 'Data synced successfully.');
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.message ?? 'Could not sync data.');
    } finally {
      setIsSyncing(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <View style={s.container} testID="customer-dashboard">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <StoreActivityHeader 
        customerCode={customerCode} 
        customerName={customerName} 
        visitCode={visitCode} 
        rightElement={
          <TouchableOpacity onPress={handleManualSync} style={{ padding: 4 }} disabled={isSyncing}>
            <Icon name="sync" size={24} color={isSyncing ? '#9CA3AF' : '#111827'} style={isSyncing && { opacity: 0.5 }} />
          </TouchableOpacity>
        }
      />

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Blue Header Card */}
        <LinearGradient colors={['#1240ab', '#1a56db']} style={s.headerCard}>
          <View style={s.headerRow}>
            <View style={s.headerIconBox}>
              <Icon name="people-outline" size={28} color="#FFFFFF" />
            </View>
            <View style={s.headerInfo}>
              <Text style={s.headerName} numberOfLines={2} testID="customer-store-name">{customerName}</Text>
              {!!customerCode && (
                <Text style={s.headerCode} numberOfLines={1} testID="customer-store-code">[{customerCode}]</Text>
              )}
              {address ? <Text style={s.headerAddress} numberOfLines={2}>{address}</Text> : null}
            </View>
          </View>
        </LinearGradient>

        {/* Target Card */}
        {customerTarget && customerTarget.targetAmount > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Monthly Target</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Target</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>₹{customerTarget.targetAmount.toLocaleString('en-IN')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Achievement</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>₹{customerTarget.achievement.toLocaleString('en-IN')}</Text>
              </View>
            </View>
            {/* Progress bar */}
            <View style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{
                height: '100%', borderRadius: 4,
                width: `${Math.min(100, (customerTarget.achievement / customerTarget.targetAmount) * 100)}%`,
                backgroundColor: customerTarget.achievement >= customerTarget.targetAmount ? '#16a34a' : '#3b82f6',
              }} />
            </View>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'right' }}>
              {Math.min(100, Math.round((customerTarget.achievement / customerTarget.targetAmount) * 100))}%
            </Text>
          </View>
        )}

        {/* Check In Date + Time. Shows today's date on the left chip and
            the rep's actual check-in time on the right so they can see
            when this visit was opened. Re-firing loadCheckinTime on
            focus + visitCode change keeps the time fresh on a same-day
            re-visit (new visit row created → newer checkinTime wins). */}
        <View style={s.dateRow}>
          <Text style={s.dateLabel}>Check In</Text>
          <Text style={s.dateValue}>{checkinTimeStr ? `${todayStr}   ${checkinTimeStr}` : todayStr}</Text>
        </View>

        {/* Activity List */}
        {ACTIVITIES.map((item, idx) => {
          const isDone = completedActivities.has(item.screen);
          return (
            <TouchableOpacity
              key={idx}
              style={[s.activityCard, isDone && s.activityCardDone]}
              onPress={() => handleTilePress(item.screen)}
              activeOpacity={0.7}
            >
              <View style={[s.activityIconBox, isDone && s.activityIconBoxDone]}>
                <Icon name={item.icon} size={24} color={isDone ? '#16a34a' : '#374151'} />
              </View>
              <Text style={[s.activityTitle, isDone && s.activityTitleDone]}>{item.title}</Text>
              {isDone && (
                <View style={s.tickIcon}>
                  <Icon name="checkmark-circle" size={24} color="#16a34a" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* Bottom Check Out Button */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={s.checkoutBtn}
          onPress={confirmCheckout}
          activeOpacity={0.8}
          disabled={checkingOut}
        >
          <Text style={s.checkoutBtnText}>{checkingOut ? 'Checking Out...' : 'Check Out'}</Text>
        </TouchableOpacity>
      </View>

      {/* Checkout Required — custom modal so the two actions ALWAYS sit on a
          single row. The native Alert stacked / clipped the long
          "Checkout & Leave" label on some Android devices. flex:1 buttons +
          single-line auto-sizing text keep it inline on every screen width. */}
      <Modal
        visible={showCheckoutRequired}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCheckoutRequired(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Checkout Required</Text>
            <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 20, lineHeight: 20 }}>
              Please checkout with a photo before leaving this store.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
                onPress={() => setShowCheckoutRequired(false)}
                activeOpacity={0.8}
              >
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: 48, borderRadius: 10, backgroundColor: '#1a56db', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
                onPress={() => { setShowCheckoutRequired(false); initiateCheckout(); }}
                activeOpacity={0.8}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Checkout & Leave</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Off-screen watermark burner */}
      <WatermarkRenderer />

      {/* Checkout Photo Preview */}
      <PhotoPreviewModal
        visible={checkoutPhotoPreview}
        photoUri={checkoutPhotoUri}
        timestamp={checkoutPhotoTs ?? undefined}
        latitude={checkoutPhotoLat}
        longitude={checkoutPhotoLng}
        customerCode={customerCode}
        customerName={customerName}
        title="Check-Out Photo"
        onAccept={() => {
          setCheckoutPhotoPreview(false);
          checkoutPhotoResolve?.(checkoutPhotoUri);
        }}
        onRetake={async () => {
          if (cameraInProgressRef.current) return; // prevent double-launch
          cameraInProgressRef.current = true;
          setCheckoutPhotoPreview(false);
          try {
            const photo = await capturePhoto(false, user?.name ?? user?.code, customerName);
            if (photo) {
              const ts = Date.now();
              const stampedUri = await burnWatermark(photo.uri, ts, checkoutPhotoLat, checkoutPhotoLng);
              setCheckoutPhotoUri(stampedUri);
              setCheckoutPhotoTs(ts);
              setTimeout(() => setCheckoutPhotoPreview(true), 300);
            } else {
              checkoutPhotoResolve?.(null);
            }
          } catch {
            checkoutPhotoResolve?.(null);
          } finally {
            cameraInProgressRef.current = false;
          }
        }}
      />

      {/* Offline OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={otpStyles.overlay}>
          <View style={otpStyles.card}>
            <Text style={otpStyles.title}>Unlock Force Check-Out</Text>
            <Text style={otpStyles.subtitle}>
              Force check-out is disabled for this store. Contact your manager with the code below to get an unlock OTP.
            </Text>

            <Text style={otpStyles.label}>YOUR CHALLENGE CODE</Text>
            <View style={otpStyles.challengeBox}>
              <Text style={otpStyles.challengeText}>{otpChallenge}</Text>
            </View>
            <Text style={otpStyles.hint}>Read this code to your manager</Text>

            <Text style={[otpStyles.label, { marginTop: 20 }]}>ENTER RESPONSE OTP</Text>
            <TextInput
              style={otpStyles.otpInput}
              value={otpInput}
              onChangeText={t => { setOtpInput(t.replace(/\D/g, '').slice(0, 4)); setOtpError(''); }}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="0000"
              placeholderTextColor="#d1d5db"
            />
            {otpError ? <Text style={otpStyles.error}>{otpError}</Text> : null}

            <View style={otpStyles.buttons}>
              <TouchableOpacity
                style={otpStyles.cancelBtn}
                onPress={() => setShowOtpModal(false)}
              >
                <Text style={otpStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[otpStyles.verifyBtn, otpInput.length < 4 && { opacity: 0.5 }]}
                disabled={otpInput.length < 4}
                onPress={async () => {
                  if (verifyOtpResponse(otpChallenge, customerCode, otpInput)) {
                    setShowOtpModal(false);
                    // Log OTP approval to backend
                    try {
                      await api.post('/customer-visits/otp-approval', {
                        challenge: otpChallenge,
                        customerCode,
                      });
                    } catch (e) {
                      console.warn('[OTP] Approval log failed, will sync later:', e);
                    }
                    handleCheckOut('force_otp');
                  } else {
                    setOtpError('Invalid OTP. Please check with your manager.');
                  }
                }}
              >
                <Text style={otpStyles.verifyText}>Verify & Check Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const otpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 6,
  },
  challengeBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  challengeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1e40af',
    letterSpacing: 12,
  },
  hint: {
    fontSize: 11,
    color: '#3b82f6',
    textAlign: 'center',
    marginTop: 6,
  },
  otpInput: {
    height: 52,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 12,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
  },
  error: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 6,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  verifyBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },

  // Header
  headerCard: { paddingTop: Platform.OS === 'ios' ? 54 : 38, paddingBottom: 20, paddingHorizontal: 20 },
  backBtn: { marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  headerCode: { fontSize: 13, fontWeight: '700', color: '#FFE9A8', marginBottom: 4, letterSpacing: 0.3 },
  headerAddress: { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 17 },

  // Check Out card
  checkoutCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: -10, borderRadius: 12, padding: 14, gap: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({ android: { elevation: 3 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 } }),
  },
  checkoutText: { fontSize: 16, fontWeight: '600', color: '#111827' },

  // Date
  dateRow: { paddingHorizontal: 20, paddingVertical: 10 },
  dateLabel: { fontSize: 12, color: '#6B7280' },
  dateValue: { fontSize: 15, fontWeight: '600', color: '#111827', marginTop: 2 },

  // Activity items
  activityCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 16, gap: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({ android: { elevation: 1 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 } }),
  },
  activityIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  activityTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  activityCardDone: {},
  activityIconBoxDone: {},
  activityTitleDone: {},
  tickIcon: { marginLeft: 'auto' },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    padding: 16, paddingBottom: SAFE_BOTTOM_PADDING,
  },
  checkoutBtn: {
    backgroundColor: '#1a3a8f', borderRadius: 12, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  checkoutBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
