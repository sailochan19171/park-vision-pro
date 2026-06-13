import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, PermissionsAndroid,
  Modal, Image, ImageBackground, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import database from '../db/database';
import api from '../api/client';
import { API_URL } from '../config';
import useAuthStore from '../store/auth';
import { seedDayStatusCache } from './DashboardScreen';
import { v4 as uuidv4 } from 'uuid';
import { pushSync, uploadPhoto } from '../services/syncService';
import { captureSelfie } from '../services/cameraService';
import PhotoPreviewModal from '../components/common/PhotoPreviewModal';
import { reverseGeocode } from '../services/reverseGeocode';
import { useWatermark } from '../hooks/useWatermark';

const ATTENDANCE_OPTIONS = ['Present', 'Half Day', 'Leave', 'Week off', 'Holiday'];

// Attendance types that count as "on the job" — they require a selfie and
// the Proceed button is enabled. Every other option blocks Proceed (the
// user isn't working that day, so there's no shift to start).
const WORKING_ATTENDANCE = new Set(['Present', 'Half Day']);

// Build a human-readable message for the "you can't start a new day yet"
// server responses. The backend's SHIFT_IN_PROGRESS message currently
// inlines a raw UTC ISO timestamp ("...wait until 2026-06-03T16:55:54.954Z
// for a fresh Start Day"), which no rep can read at a glance. The same
// payload includes a separate `cutoff` ISO field — we parse that and
// reformat into the device's locale (typically IST), then build our own
// sentence. Falls back to the server's raw message for any other code.
function formatStartDayBlockMessage(err: any): string {
  const data = err?.response?.data ?? {};
  if (data?.error === 'SHIFT_IN_PROGRESS' && data?.cutoff) {
    const ts = new Date(data.cutoff);
    if (!isNaN(ts.getTime())) {
      const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `Your current shift is still running. Continue from where you left off, or wait until ${timeStr} on ${dateStr} for a fresh Start Day.`;
    }
  }
  return data?.message ?? 'Your current shift is still in progress. Please continue from where you left off.';
}

/**
 * Posts the start-day to the backend, resilient to the axios-over-Hermes
 * "Network Error" bug on older Android devices.
 *
 * /attendance/start-day is the single gate that decides whether a rep's day can
 * begin. On the field fleet's older handsets — the Nokia 6.1 Plus most of all —
 * axios on Hermes intermittently throws a synthetic "Network Error" BEFORE the
 * request ever leaves the device (a Buffer mis-typing on the JS↔native bridge,
 * not a real connectivity failure — see utils/netInfo.ts for the same root
 * cause). That made reps on solid Wi-Fi + mobile data see "No Internet" and get
 * blocked from starting their day.
 *
 * We mirror the netInfo fix here: try axios first, and on a network-class error
 * fall back to native fetch(), which goes straight to OkHttp and is immune to the
 * bridge bug. A genuine HTTP response (EOT_LOCKED, SHIFT_IN_PROGRESS, 5xx, …) is
 * re-thrown unchanged so the caller's response-code branches still handle it. Only
 * if fetch ALSO fails to reach the server is the device truly offline — and the
 * caller's "No Internet" message is then correct.
 */
async function postStartDay(startTime: string, attendanceDate: string): Promise<void> {
  const body = { startTime, attendanceDate };
  try {
    await api.post('/attendance/start-day', body);
    return;
  } catch (e: any) {
    // A real response means the request DID reach the server — propagate so the
    // caller's EOT_LOCKED / SHIFT_IN_PROGRESS / HTTP-status branches handle it.
    // Only the Hermes/axios pre-flight network bug is worth retrying via fetch.
    const errCode = e?.code ?? '';
    const isAxiosNetworkBug = !e?.response
      && (errCode === 'ERR_NETWORK'
        || errCode === 'ECONNABORTED'
        || errCode === 'ETIMEDOUT'
        || e?.message === 'Network Error');
    if (!isAxiosNetworkBug) throw e;
  }

  // Fallback: native fetch → OkHttp, immune to the Hermes bridge bug.
  const token = await AsyncStorage.getItem('accessToken');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: any;
  try {
    res = await fetch(`${API_URL}/attendance/start-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      // RN's lib.dom AbortSignal typing mismatches the RN global; cast to
      // silence the overload mismatch — runtime behaviour is identical.
      signal: ctrl.signal as any,
    });
  } catch {
    // The native layer also failed to reach the server → the device really is
    // offline. Re-throw a network-shaped error so the caller shows "No Internet".
    const offline: any = new Error('Network Error');
    offline.code = 'ERR_NETWORK';
    throw offline;
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return;

  // Non-2xx — reshape into the axios error contract the callers expect
  // (e.response.status / e.response.data.error) so EOT_LOCKED etc. still branch.
  let data: any = {};
  try { data = await res.json(); } catch { /* empty / non-JSON body */ }
  const httpErr: any = new Error(data?.message ?? `HTTP ${res.status}`);
  httpErr.response = { status: res.status, data };
  throw httpErr;
}

export default function StartDayScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  // Check states: null=pending, true=pass, false=fail
  const { burnWatermark, WatermarkRenderer } = useWatermark();
  const [syncDone, setSyncDone] = useState<boolean | null>(null);
  const [connectDone, setConnectDone] = useState<boolean | null>(null);
  const [wifiSpeed, setWifiSpeed] = useState('');
  const [networkDone, setNetworkDone] = useState<boolean | null>(null);
  const [networkMsg, setNetworkMsg] = useState('Check Network Availability');
  const [networkType, setNetworkType] = useState<string>('');
  const [locationDone, setLocationDone] = useState<boolean | null>(null);
  const [locationMsg, setLocationMsg] = useState('Permission should be allowed at all times');
  const [batteryPct, setBatteryPct] = useState(0);
  const [batteryDone, setBatteryDone] = useState<boolean | null>(null);
  // Network / sync / battery checks are informational only — they fail
  // routinely on 2G / patchy mobile data, and blocking Start Day on them
  // locks out field users. Only hard-require: checks have finished running
  // AND location permission is granted (attendance photo needs geotag).
  const allChecksRan = syncDone !== null && connectDone !== null && networkDone !== null && locationDone !== null && batteryDone !== null;
  const allChecksDone = allChecksRan && locationDone === true;

  // Attendance sheet
  const [attendanceVisible, setAttendanceVisible] = useState(false);
  const [attendanceType, setAttendanceType] = useState('Present');
  const [assetsPickerVisible, setAssetsPickerVisible] = useState(false);
  const [selfieTaken, setSelfieTaken] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieViewOnly, setSelfieViewOnly] = useState(false);
  const [selfieAddress, setSelfieAddress] = useState<string | null>(null);
  // Lat/lng/timestamp declared up here (rather than further down with the
  // other selfie bookkeeping) because the reverse-geocode effect below
  // references them — and a `const`/`let` declared after its use crashes
  // the TS compile with TDZ errors. The setters are still assigned in
  // handleTakeSelfie like before.
  const [selfieTimestamp, setSelfieTimestamp] = useState<number | null>(null);
  const [selfieLat, setSelfieLat] = useState<number | null>(null);
  const [selfieLng, setSelfieLng] = useState<number | null>(null);

  // Lazy reverse-geocode when the selfie viewer opens, so users see the
  // street address alongside lat/lng instead of just raw coordinates.
  useEffect(() => {
    if (!selfieViewOnly) return;
    if (selfieAddress) return;
    if (selfieLat == null || selfieLng == null) return;
    let cancelled = false;
    (async () => {
      try {
        const addr = await reverseGeocode(selfieLat, selfieLng);
        if (!cancelled && addr) setSelfieAddress(addr);
      } catch (error) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [selfieViewOnly, selfieLat, selfieLng, selfieAddress]);
  const [marking, setMarking] = useState(false);

  // Restore persisted selfie on mount (survives navigation + app restart).
  // The key is scoped by user.code so one user's selfie can't leak into
  // another user's Start Day screen if they share a device (previously
  // the key was just date-based, so after User A logged out and User B
  // logged in, User B saw User A's selfie pre-filled).
  const todayKey = new Date().toISOString().split('T')[0];
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(`attendance_selfie_${user?.code ?? 'unknown'}_${todayKey}`);
        if (saved) {
          const { uri, ts, lat, lng } = JSON.parse(saved);
          // Only use if less than 24h old
          if (Date.now() - ts < 24 * 60 * 60 * 1000) {
            setSelfieUri(uri);
            setSelfieTaken(true);
            setSelfieTimestamp(ts);
            if (lat != null) setSelfieLat(lat);
            if (lng != null) setSelfieLng(lng);
          } else {
            await AsyncStorage.removeItem(`attendance_selfie_${user?.code ?? 'unknown'}_${todayKey}`);
          }
        }
      } catch (error) { /* ignore */ }
    })();
  }, []);

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // After a manual End Day, the EOT is reopenable for 12 h from the ORIGINAL
  // Start Day time (the auto-EOD frequency window). Inside that window, tapping
  // Start Day returns SHIFT_IN_PROGRESS and this "Reopen Previous Day" popup
  // appears. "Yes, Continue" attempts the reopen, then reflects the AUTHORITATIVE
  // server state so the result is always correct and flicker-free:
  //
  //   • Inside the window → reopen-my-eot DELETES the EOT → /my-day-status
  //     reports dayEnded=false → land on "Continue" (resume the same day).
  //   • Window already elapsed / not reopenable (auto-EOD, or an admin re-closed
  //     it) → the EOT stays → dayEnded=true → land on "Start Day" IMMEDIATELY,
  //     no "Continue" flash, no flicker. (Past the window the rep can just Start
  //     a fresh day, and the previous day is finalized server-side.)
  //
  // /my-day-status (dayEnded) is the single source of truth — we re-read it
  // AFTER the reopen attempt (an admin may also have reopened/closed it on the
  // portal). The seeded cache + flags are written to match it BEFORE the
  // navigation reset so the Dashboard's first frame AND every 5 s poll agree.
  const offerReopenEot = async (): Promise<void> => {
    const todayStr = new Date().toISOString().split('T')[0];
    const wantReopen = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Reopen Previous Day',
        'Your previous day is still within the active window. Do you want to reopen it and continue from where you left off?',
        [
          { text: 'No', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yes, Continue', onPress: () => resolve(true) },
        ],
        { cancelable: true },
      );
    });
    if (!wantReopen) return;

    // 1. Attempt the self-service reopen. Inside the window the backend DELETES
    //    the EOT (200); past the window / auto-EOD it returns 409
    //    EOT_WINDOW_EXPIRED / 404 NO_EOT. Those business codes are EXPECTED and
    //    swallowed — the status read in step 2 is what decides the outcome (it
    //    also covers an admin reopen/close done on the portal). Only a genuine
    //    connectivity failure is surfaced to the rep.
    let networkFailed = false;
    try {
      await api.post('/attendance/reopen-my-eot', {});
    } catch (re: any) {
      if (!re?.response) networkFailed = true;
    }
    if (networkFailed) {
      showAlert('No Internet', 'Could not reach the server to reopen your day. Please check your connection and tap Start Day again.');
      return;
    }

    // 2. SERVER-AUTHORITATIVE re-read: is the EOT now gone? dayEnded=false →
    //    resumable (Continue); dayEnded=true → still ended (Start Day). On a
    //    non-network error we default to "still ended" — the safe choice that
    //    never falsely resumes a closed day.
    let dayEndedSrv = true;
    let dayStartedSrv = false;
    let resumeDate = todayStr;
    let startTimeIso: string | null = null;
    try {
      const { data: srv } = await api.get('/attendance/my-day-status', { params: { date: todayStr }, timeout: 8000 });
      if (srv && typeof srv === 'object') {
        dayEndedSrv = srv.dayEnded === true;
        dayStartedSrv = srv.dayStarted === true || !!srv.openDayDate;
        resumeDate = srv.openDayDate ?? todayStr;
        startTimeIso = (srv.dayStarted === true ? srv.startTime : srv.openDayStartTime) ?? null;
      }
    } catch (e: any) {
      if (!e?.response) {
        showAlert('No Internet', 'Could not reach the server to check your day status. Please check your connection and tap Start Day again.');
        return;
      }
      /* non-network error → keep the safe "still ended" default */
    }

    if (!dayEndedSrv && dayStartedSrv) {
      // EOT deleted on the backend → resume the day. Seed "Continue" so the
      // Dashboard's first frame and every poll agree.
      await AsyncStorage.multiRemove([
        `day_ended_${todayStr}`,
        `day_end_time_${todayStr}`,
        `day_end_timestamp_${todayStr}`,
        // Clear the durable "this day was ended" markers so the Dashboard's
        // attendance-row fallback resurrects "Continue" (not "Start Day") on
        // any poll that can't reach the server after the reopen.
        `auto_eod_fired_for_${resumeDate}`,
        `auto_eod_fired_for_${todayStr}`,
      ]);
      await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
      await AsyncStorage.setItem('active_attendance_date', resumeDate);
      if (startTimeIso) await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, String(startTimeIso));
      seedDayStatusCache(true, false, true, user?.code ?? '');
    } else {
      // EOT still present on the backend → the day stays ended. Land on
      // "Start Day" immediately with NO "Continue" flash. Clear the started
      // flags and (re)stamp the durable "ended" marker so the Dashboard's
      // fast path, attendance-row fallback and server reconcile all agree on
      // Start Day → no flicker.
      const activeDate = (await AsyncStorage.getItem('active_attendance_date')) ?? todayStr;
      await AsyncStorage.multiRemove([
        `day_started_${todayStr}`,
        `day_start_time_${todayStr}`,
        `day_start_timestamp_${todayStr}`,
        `day_start_finalized_timestamp_${todayStr}`,
        `day_ended_${todayStr}`,
        `day_end_time_${todayStr}`,
        `day_end_timestamp_${todayStr}`,
      ]);
      await AsyncStorage.multiSet([
        [`auto_eod_fired_for_${todayStr}`, 'true'],
        [`auto_eod_fired_for_${activeDate}`, 'true'],
      ]);
      seedDayStatusCache(false, false, true, user?.code ?? '');
    }
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  useEffect(() => {
    runChecks();
  }, []);

  const runChecks = async () => {
    setNetworkType('Checking...');

    // Single reachability probe. The three rows in the UI (Sync /
    // Connectivity / Network) are all asking the same question — "can
    // we reach the backend right now?" — so the previous code ran
    // three identical /sync/status requests sequentially with 30 s
    // timeouts each (up to 90 s wait on slow networks). We now do
    // one native fetch with a 12 s budget and derive all three rows
    // from it. Using fetch() instead of axios avoids the Hermes +
    // OkHttp body-type bug that surfaces as "Network Error" on
    // Android 10/11/13 even when the device is on solid Wi-Fi.
    //
    // Auto-retry: on first-press the network stack is cold — DNS
    // resolution + TLS handshake can take 5-8 s on Android, causing
    // the probe to time out even when the device is online. A single
    // silent retry (after a 1.5 s warm-up pause) handles this case so
    // reps never see the "Could not connect" popup on a live network.
    const probe = async (): Promise<{ ok: boolean; latency: number }> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const startedAt = Date.now();
      try {
        await fetch(`${API_URL}/sync/status`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          // RN's lib.dom AbortSignal typing mismatches the RN global; cast to
          // silence the overload mismatch — runtime behaviour is identical
          // (same workaround as postStartDay above).
          signal: ctrl.signal as any,
        });
        return { ok: true, latency: Date.now() - startedAt };
      } catch {
        return { ok: false, latency: Date.now() - startedAt };
      } finally {
        clearTimeout(timer);
      }
    };

    let result = await probe();
    if (!result.ok) {
      // First attempt failed — wait 1.5 s for the network stack to warm
      // up, then try once more before declaring the device offline.
      await delay(1500);
      result = await probe();
    }

    if (result.ok) {
      setSyncDone(true);
      setConnectDone(true);
      setNetworkDone(true);
      setWifiSpeed(`${result.latency}ms`);
      setNetworkType('Online');
      setNetworkMsg('Network Available');
    } else {
      setSyncDone(false);
      setConnectDone(false);
      setNetworkDone(false);
      setWifiSpeed('Offline');
      setNetworkType('Offline');
      setNetworkMsg('Network Unavailable');
    }

    // 4. Location — check permission only (avoid native GPS crash)
    await delay(300);
    try {
      if (Platform.OS === 'android') {
        const fineGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (!fineGranted) {
          const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            setLocationDone(false);
            setLocationMsg('Permission denied');
            checkBattery();
            return;
          }
        }
        // Permission granted — mark as success
        setLocationDone(true);
        setLocationMsg('Permission allowed');
      } else {
        // iOS — try getting location to verify GPS is working
        try {
          const { getCurrentPosition } = require('../services/locationService');
          const pos = await getCurrentPosition(true);
          setLocationDone(true);
          setLocationMsg(pos ? 'Location available' : 'Permission allowed');
        } catch (error) {
          setLocationDone(true);
          setLocationMsg('Permission allowed');
        }
      }
    } catch (error) {
      setLocationDone(false);
      setLocationMsg('Location check failed');
    }

    // 5. Battery — read real battery level
    await checkBattery();

    // Show alert if any check failed so user knows what to fix
    // Read latest state via a small delay (setState is async)
    await delay(300);
  };

  // Generate a timestamp-based error code for support reference
  const [errorCode, setErrorCode] = useState('');

  // Show warning when checks complete and something failed
  useEffect(() => {
    if (syncDone === null || connectDone === null || networkDone === null || locationDone === null || batteryDone === null) return;
    const failures: string[] = [];
    if (!syncDone || !connectDone || !networkDone) {
      failures.push('Sync failed, Due to Low Internet Connectivity (or) No Connection, Please try again.');
    }
    if (!locationDone) failures.push('Location permission denied. Please enable GPS and allow location access in Settings.');
    // Battery is INFORMATIONAL only — low battery must NOT block Start Day /
    // attendance and must NOT raise a warning popup. The battery row still
    // shows the current % for the rep's awareness, but it never gates Proceed
    // (allChecksDone only requires location) and is intentionally excluded from
    // this failures popup.
    if (failures.length > 0) {
      const now = new Date();
      const code = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}-${String(now.getMilliseconds()).padStart(3,'0')}${String(Math.floor(Math.random()*1000)).padStart(3,'0')}`;
      setErrorCode(code);
      showAlert('Warning !', failures.join('\n') + `\nError Code: ${code}`);
    }
  }, [syncDone, connectDone, networkDone, locationDone, batteryDone]);

  const checkBattery = async () => {
    await delay(200);
    let level = -1;

    // Use react-native-device-info (works on all Android versions + iOS).
    // The sysfs approach was blocked by SELinux on modern Android phones,
    // which is why "Unknown" was showing instead of the real percentage.
    try {
      const DeviceInfo = require('react-native-device-info').default;
      const batteryLevel = await DeviceInfo.getBatteryLevel(); // 0.0 - 1.0
      if (batteryLevel >= 0) {
        level = Math.round(batteryLevel * 100);
      }
    } catch (e) {
      console.warn('[Battery] DeviceInfo failed, trying sysfs fallback:', e);
      // Fallback to sysfs for older builds without the native module
      if (Platform.OS === 'android') {
        const paths = [
          '/sys/class/power_supply/battery/capacity',
          '/sys/class/power_supply/Battery/capacity',
        ];
        for (const path of paths) {
          if (level >= 0) break;
          try {
            const RNFS = require('react-native-fs');
            const content = await RNFS.readFile(path, 'utf8');
            const parsed = parseInt(content.trim(), 10);
            if (parsed > 0 && parsed <= 100) level = parsed;
          } catch (error) { /* try next */ }
        }
      }
    }

    if (level >= 0) {
      setBatteryPct(level);
      // Battery is INFORMATIONAL only — ANY level must let the rep mark
      // attendance and proceed. Always pass the check (no red X, no gate); the
      // real % is still shown in the row for the rep's awareness.
      setBatteryDone(true);
    } else {
      setBatteryPct(-1);
      setBatteryDone(true);
    }
  };

  const handleAttendanceOpen = () => {
    setAttendanceVisible(true);
  };

  // Auto-close any visits that the user forgot to check out of. Run before
  // navigation.reset so the still-mounted CustomerDashboardScreen's
  // beforeRemove listener doesn't pop a "Checkout Required" alert during
  // the reset that wipes the back stack.
  const autoCloseLingeringVisits = async () => {
    try {
      const open: any[] = await database.get('customer_visits').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('checkout_time', null),
      ).fetch();
      if (open.length === 0) return;
      const nowMs = Date.now();
      await database.write(async () => {
        for (const v of open) {
          try {
            await v.update((rec: any) => {
              rec._raw.checkout_time = nowMs;
              rec._raw.checkout_type = 'auto';
              rec._raw.status = 'CHECKED_OUT';
              rec._raw.is_synced = false;
              const checkin = rec._raw.checkin_time || nowMs;
              rec._raw.duration_mins = Math.round((nowMs - checkin) / 60000);
            });
          } catch (e) { console.warn('[StartDay] auto-close visit failed:', e); }
        }
      });
    } catch (e) { console.warn('[StartDay] auto-close lingering visits failed:', e); }
  };

  // Save the absence record (Leave / Week off / Holiday) without starting
  // the working day. The row is written locally with isPresent=false and
  // attendance_type=<selection>, then pushed so the absence shows on the
  // web portal Attendance report. We deliberately skip /attendance/start-day
  // and the navigation.reset → MainTabs — the user isn't entering the day,
  // just registering the absence.
  const handleSaveAbsence = async () => {
    setMarking(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const existing: any[] = await database.get('attendance_records').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('attendance_date', todayStr),
      ).fetch();

      if (existing.length > 0) {
        await database.write(async () => {
          await existing[0].update((rec: any) => {
            rec.isPresent = false;
            rec._raw.attendance_type = attendanceType;
            rec.selfiePath = null;
            rec.geoLat = null;
            rec.geoLng = null;
            rec.isSynced = false;
          });
        });
      } else {
        await database.write(async () => {
          await database.get('attendance_records').create((rec: any) => {
            rec._raw.id = uuidv4();
            rec.userCode = user?.code ?? '';
            rec.isPresent = false;
            rec._raw.attendance_type = attendanceType;
            rec.attendanceDate = todayStr;
            rec.selfiePath = null;
            rec.geoLat = null;
            rec.geoLng = null;
            rec.isSynced = false;
          });
        });
      }

      // Fire-and-forget — pushSync also runs on a 30 s interval, so the
      // record will land on the server within seconds of this call (or on
      // the next cycle if the user is briefly offline).
      pushSync().catch(() => {});

      try {
        const { logAttendance } = require('../services/activityLogger');
        logAttendance?.(`Marked ${attendanceType}`);
      } catch (error) { /* non-blocking */ }

      showAlert(
        'Attendance Recorded',
        `Your attendance is marked as ${attendanceType}. It will sync to the portal shortly.`,
      );
      setAttendanceVisible(false);
      navigation.goBack();
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Failed to save attendance.');
    } finally {
      setMarking(false);
    }
  };

  const handleProceed = async (bypassSelfieCheck = false) => {
    // Non-working attendance (Leave / Week off / Holiday) routes to the
    // absence-save flow — record the row, push, return to dashboard without
    // entering the working day.
    if (!WORKING_ATTENDANCE.has(attendanceType)) {
      await handleSaveAbsence();
      return;
    }

    // Working day requires a selfie. Open camera + preview first — don't
    // proceed until the user has accepted the selfie capture.
    // bypassSelfieCheck=true is set when handleSelfieAccept calls us
    // directly after Use Photo: the state setter `setSelfieTaken(true)`
    // hasn't committed yet inside that render, but we know the selfie
    // is ready (and selfieUri / selfieLat / selfieLng / selfieTimestamp
    // are already in scope on the current render's closure).
    if (!bypassSelfieCheck && !selfieTaken) {
      handleTakeSelfie();
      return;
    }

    setMarking(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const existing = await database.get('attendance_records').query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('attendance_date', todayStr),
      ).fetchCount();

      if (existing > 0) {
        // Use selfie capture time as the real start time
        const startTs = selfieTimestamp
          ? new Date(selfieTimestamp).toISOString()
          : new Date().toISOString();
        // SERVER-FIRST: confirm the start-day with the backend before any
        // local state changes. If the rep is offline (mobile data off etc.)
        // we must block — silently marking attendance the server never
        // recorded was the bug field reps hit on a Nokia 6.1 Plus (data off
        // mid-flow, photo + Proceed still let the day start).
        try {
          await postStartDay(startTs, todayStr);
        } catch (e: any) {
          if (e?.response?.data?.error === 'EOT_LOCKED') {
            showAlert('Day Already Ended', e?.response?.data?.message ?? 'You have already ended your day. Ask an administrator to reopen your EOT.');
            return;
          }
          if (e?.response?.data?.error === 'SHIFT_IN_PROGRESS') {
            // Inside the frequency window — offer reopen + continue.
            await offerReopenEot();
            return;
          }
          if (
            e?.response?.data?.error === 'COOLDOWN_ACTIVE'
            || e?.response?.data?.error === 'NEXT_DAY_REQUIRED'
          ) {
            showAlert('Start Day Not Allowed Yet', formatStartDayBlockMessage(e));
            return;
          }
          console.warn('[StartDay] Start time API failed:', e);
          // Distinguish a true offline / unreachable-server failure from a
          // genuine server error. The previous unconditional "No Internet"
          // alert misled reps who had 5G + Wi-Fi connected and were
          // actually hitting a 5xx / timed-out refresh / dropped TLS
          // handshake. Network errors have NO `response` object on axios;
          // server errors do. We branch the message accordingly so the
          // rep knows whether to check connectivity or just retry.
          const httpStatus = e?.response?.status;
          const errCode = e?.code ?? '';
          const isNetwork = !e?.response
            && (errCode === 'ERR_NETWORK'
              || errCode === 'ECONNABORTED'
              || errCode === 'ETIMEDOUT'
              || e?.message === 'Network Error');
          if (isNetwork) {
            showAlert('No Internet', 'Could not reach the server to mark attendance. Please check your mobile data or Wi-Fi and try again.');
          } else {
            showAlert('Attendance Failed', `Could not save attendance (HTTP ${httpStatus ?? '?'}). Please try again in a moment.`);
          }
          return;
        }
        // A successful start-day here means the rep is starting a NEW shift —
        // the reopen / still-in-progress path returns SHIFT_IN_PROGRESS and is
        // handled above, so the only way we reach here is the backend ACCEPTING
        // a fresh Start Day (window elapsed / previous shift finalized). So
        // CREATE A NEW attendance row rather than overwriting the previous
        // shift's row. A rep can run several shifts on the SAME calendar date
        // (Start Day → manual EOD → 12 h window elapses → Start Day again); each
        // shift is its own row + its own EOT, and the User Wise Attendance
        // report shows them all (previous + current + new). Upload the selfie
        // first so the row is created complete and pushed exactly once (no
        // re-push that could clobber a sibling same-date shift).
        let serverSelfieUrl = selfieUri;
        if (selfieUri) {
          try {
            const uploaded = await uploadPhoto(selfieUri, 'attendance');
            if (uploaded) serverSelfieUrl = uploaded;
          } catch (e) {
            console.warn('[StartDay] Selfie upload failed:', e);
          }
        }
        await database.write(async () => {
          await database.get('attendance_records').create((rec: any) => {
            rec._raw.id = uuidv4();
            rec.userCode = user?.code ?? '';
            rec.isPresent = true;
            rec._raw.attendance_type = attendanceType;
            rec.attendanceDate = todayStr;
            rec.selfiePath = serverSelfieUrl ?? null;
            rec.geoLat = selfieLat ?? null;
            rec.geoLng = selfieLng ?? null;
            rec.isSynced = false;
          });
        });
        await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
        await AsyncStorage.setItem('active_attendance_date', todayStr);
        await AsyncStorage.removeItem(`day_ended_${todayStr}`);
        // This is a brand-new active shift — clear the durable "this day was
        // ended" marker left by the previous shift's EOD so the Dashboard's
        // attendance-row fallback keeps "Continue" if the day_started flag is
        // ever transiently lost.
        await AsyncStorage.removeItem(`auto_eod_fired_for_${todayStr}`);
        await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, startTs);
        // Anchor for the auto-EOD timer — see the new-record branch below
        // for the reasoning. Without this, the Reopen-EOT → Start Day flow
        // re-uses the old selfie timestamp from the previous day-start and
        // the popup fires immediately on landing at the Dashboard.
        await AsyncStorage.setItem(`day_start_finalized_timestamp_${todayStr}`, new Date().toISOString());
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);
        pushSync().catch(() => {});
        // Seed the Dashboard's module-level cache so its very first frame
        // after this reset paints "Continue" instantly — no spinner, no
        // "Start Day" flash while the async loadDayStatus / server sync
        // catch up.
        seedDayStatusCache(true, false, true, user?.code ?? '');
        await autoCloseLingeringVisits();
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        return;
      }

      // Half Day still counts as "present" on the attendance row — the
      // attendance_type column carries the granular distinction for the
      // web portal report, but the boolean isPresent stays true so the
      // user appears in the day's roster (not in the absences list).
      const isPresent = WORKING_ATTENDANCE.has(attendanceType);

      // Use the actual selfie capture time (not "now") so the portal shows the
      // real moment the user marked attendance, not the delayed sync/upload time.
      const startTimestamp = selfieTimestamp
        ? new Date(selfieTimestamp).toISOString()
        : new Date().toISOString();

      // SERVER-FIRST: confirm the start-day with the backend before creating
      // any local row or setting day_started flags. If the rep is offline
      // we must block — otherwise the device silently marks attendance the
      // server never recorded (the Nokia 6.1 Plus mobile-data-off scenario).
      try {
        await postStartDay(startTimestamp, todayStr);
      } catch (e: any) {
        if (e?.response?.data?.error === 'EOT_LOCKED') {
          showAlert('Day Already Ended', e?.response?.data?.message ?? 'You have already ended your day. Ask an administrator to reopen your EOT.');
          return;
        }
        // SHIFT_IN_PROGRESS is the only "you can't start a new day yet"
        // code the backend actually returns from /attendance/start-day
        // (see backend/src/routes/attendance.ts:355-405). It fires when
        // an open shift exists inside its auto-EOD frequency window —
        // the rep should Continue the existing shift, not Start fresh.
        // Past that window the backend silently accepts Start Day, so
        // there's no "end previous day first" alert by design — auto-EOD
        // unlocks the new day automatically. COOLDOWN_ACTIVE retained as
        // defensive cover for any future server-side cooldown policy.
        if (e?.response?.data?.error === 'SHIFT_IN_PROGRESS') {
          // Inside the frequency window — offer reopen + continue.
          await offerReopenEot();
          return;
        }
        if (e?.response?.data?.error === 'COOLDOWN_ACTIVE') {
          showAlert('Start Day Not Allowed Yet', formatStartDayBlockMessage(e));
          return;
        }
        console.warn('[StartDay] Start time API failed:', e);
        // Distinguish a true offline / unreachable failure from a 5xx /
        // server error so a rep on a working connection isn't told "No
        // Internet" when the backend just hiccupped. Network errors have
        // NO `response` object on axios; server errors do.
        const httpStatus = e?.response?.status;
        const errCode = e?.code ?? '';
        const isNetwork = !e?.response
          && (errCode === 'ERR_NETWORK'
            || errCode === 'ECONNABORTED'
            || errCode === 'ETIMEDOUT'
            || e?.message === 'Network Error');
        if (isNetwork) {
          showAlert('No Internet', 'Could not reach the server to mark attendance. Please check your mobile data or Wi-Fi and try again.');
        } else {
          showAlert('Attendance Failed', `Could not save attendance (HTTP ${httpStatus ?? '?'}). Please try again in a moment.`);
        }
        return;
      }

      // Upload selfie before saving
      let serverSelfieUrl = selfieUri;
      if (selfieUri) {
        try {
          const uploaded = await uploadPhoto(selfieUri, 'attendance');
          if (uploaded) serverSelfieUrl = uploaded;
        } catch (e) {
          console.warn('[StartDay] Selfie upload failed:', e);
        }
      }

      await database.write(async () => {
        await database.get('attendance_records').create((rec: any) => {
          rec._raw.id = uuidv4();
          rec.userCode = user?.code ?? '';
          rec.isPresent = isPresent;
          rec._raw.attendance_type = attendanceType;
          rec.attendanceDate = todayStr;
          rec.selfiePath = serverSelfieUrl ?? null;
          rec.geoLat = selfieLat ?? null;
          rec.geoLng = selfieLng ?? null;
          rec.isSynced = false;
        });
      });

      await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
      await AsyncStorage.setItem('active_attendance_date', todayStr);
      await AsyncStorage.removeItem(`day_ended_${todayStr}`);
      // Fresh active shift — drop any stale "this day was ended" marker so the
      // Dashboard's attendance-row fallback keeps "Continue".
      await AsyncStorage.removeItem(`auto_eod_fired_for_${todayStr}`);
      await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, startTimestamp);
      // Separate anchor for the auto-EOD timer. We use `now()` (when Start
      // Day actually finalised) rather than the selfie capture time, so a
      // gap between selfie and Proceed doesn't eat into the configured
      // auto-EOD window. day_start_timestamp continues to drive the portal
      // display + elapsed timer.
      await AsyncStorage.setItem(`day_start_finalized_timestamp_${todayStr}`, new Date().toISOString());
      const captureTime = selfieTimestamp ? new Date(selfieTimestamp) : new Date();
      const timeStr = captureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);

      pushSync().catch(() => {});
      // Log start day activity
      try {
        const { logStartDay } = require('../services/activityLogger');
        logStartDay(selfieLat ?? undefined, selfieLng ?? undefined);
      } catch (error) { /* non-blocking */ }
      // Seed the Dashboard's module-level cache so its very first frame
      // after this reset paints "Continue" instantly — no spinner, no
      // "Start Day" flash while the async loadDayStatus / server sync
      // catch up.
      seedDayStatusCache(true, false, true, user?.code ?? '');
      await autoCloseLingeringVisits();
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Failed to mark attendance.');
      try {
        const { logActivity } = require('../services/activityLogger');
        logActivity({ action: 'START_DAY', status: 'failed', module: 'attendance', errorMessage: err?.message });
      } catch (error) { /* non-blocking */ }
    } finally { setMarking(false); }
  };

  const [selfiePreview, setSelfiePreview] = useState(false);
  // selfieTimestamp / selfieLat / selfieLng declared higher up — moved
  // there so the reverse-geocode effect can reference them without a TDZ.

  const handleTakeSelfie = async () => {
    try {
      const photo = await captureSelfie();
      if (photo) {
        // Attendance is a once-per-day compliance capture — the burned
        // overlay needs lat/lng/timestamp/address every time. The previous
        // fast-only GPS read returned null whenever the device cache was
        // cold and the watermark hook then dropped the lat/lng + address
        // lines, leaving the selfie with only a date stamp (Dharam's
        // report). Try the cache for a fast same-frame paint, fall
        // through to a fresh fix when the cache is empty so the
        // watermark always has real coords to burn in.
        let lat: number | null = null, lng: number | null = null;
        try {
          const { getCurrentPosition } = require('../services/locationService');
          const cached = await getCurrentPosition(true);
          if (cached) { lat = cached.lat; lng = cached.lng; }
          else {
            const fresh = await getCurrentPosition(false);
            if (fresh) { lat = fresh.lat; lng = fresh.lng; }
          }
        } catch (e) { console.warn("[App]", e); }

        const ts = Date.now();
        const stampedUri = await burnWatermark(photo.uri, ts, lat, lng);

        setSelfieUri(stampedUri);
        setSelfieTimestamp(ts);
        setSelfieLat(lat);
        setSelfieLng(lng);
        setSelfiePreview(true);
      } else {
        showAlert('Camera', 'Photo capture failed. Please try again.');
      }
    } catch (error) {
      showAlert('Camera Error', 'Unable to access camera. Please check camera permissions in Settings.');
    }
  };

  const handleSelfieAccept = () => {
    setSelfiePreview(false);
    setSelfieTaken(true);
    // Persist selfie + location so it survives navigation away + app restart
    if (selfieUri) {
      AsyncStorage.setItem(
        `attendance_selfie_${user?.code ?? 'unknown'}_${todayKey}`,
        JSON.stringify({ uri: selfieUri, ts: selfieTimestamp ?? Date.now(), lat: selfieLat, lng: selfieLng }),
      ).catch(() => {});
    }
    // No auto-proceed: leave the user on the Start Day pre-requisites
    // screen with the selfie thumbnail shown. They must explicitly tap
    // Proceed to navigate to Dashboard. Avoids accidental day starts
    // from a quick Use Photo tap.
  };

  const handleSelfieRetake = async () => {
    setSelfiePreview(false);
    setSelfieUri(null);
    // Re-open camera
    setTimeout(() => handleTakeSelfie(), 300);
  };

  const renderCheck = (
    done: boolean | null,
    iconName: string,
    iconColor: string,
    title: string,
    subtitle?: string,
    isLast?: boolean,
    passTestID?: string,
  ) => (
    <View key={title}>
      <View style={st.checkRow}>
        <View style={[st.checkIconCircle, { backgroundColor: iconColor }]}>
          <Icon name={iconName} size={22} color="#fff" />
        </View>
        <View style={st.checkInfo}>
          <Text style={st.checkTitle}>{title}</Text>
          {subtitle ? <Text style={st.checkSubtitle}>{subtitle}</Text> : null}
        </View>
        {done === null ? (
          <ActivityIndicator size="small" color="#1a56db" />
        ) : done === true ? (
          <Icon name="checkmark" size={28} color="#22C55E" testID={passTestID} />
        ) : (
          <Icon name="close" size={28} color="#EF4444" />
        )}
      </View>
      {!isLast && <View style={st.divider} />}
    </View>
  );

  return (
    <View style={st.container} testID="start-day-screen">
      {/* ScrollView wraps the banner + checks so small-screen devices (e.g.
          Oppo A55, 720x1600 at ~267 ppi) can swipe down to reach the
          Attendance button even when the checks card overflows the viewport.
          The button itself sits OUTSIDE the scroll area so it stays pinned
          at the bottom on every device size. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      {/* Banner */}
      <ImageBackground source={require('../assets/attendance.png')} style={st.banner} resizeMode="cover">
        <View style={st.bannerOverlay}>
          <Text style={st.bannerTitle}>
            <Text style={{ fontWeight: '800' }}>START DAY PRE </Text>
            <Text style={{ fontWeight: '400' }}>REQUISITES</Text>
          </Text>
        </View>
      </ImageBackground>

      {/* Network Type Badge */}
      {networkType ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, marginBottom: -4 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
            backgroundColor: networkType === 'WiFi' ? '#DCFCE7' : networkType === 'Mobile Data' ? '#DBEAFE' : '#FEE2E2',
          }}>
            <MCIcon
              name={networkType === 'WiFi' ? 'wifi' : networkType === 'Mobile Data' ? 'signal-4g' : 'wifi-off'}
              size={16}
              color={networkType === 'WiFi' ? '#16A34A' : networkType === 'Mobile Data' ? '#2563EB' : '#EF4444'}
            />
            <Text style={{
              fontSize: 12, fontWeight: '700',
              color: networkType === 'WiFi' ? '#16A34A' : networkType === 'Mobile Data' ? '#2563EB' : '#EF4444',
            }}>
              {networkType === 'WiFi' ? 'Connected via WiFi' : networkType === 'Mobile Data' ? 'Connected via Mobile Data' : 'No Network Connection'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Checks Card */}
      <View style={st.checksCard}>
        {renderCheck(syncDone, 'sync-outline', '#22C55E', 'Synchronization', syncDone === false ? 'Sync failed — check internet' : undefined, false, 'check-sync-pass')}
        {renderCheck(connectDone, 'wifi-outline', '#7C3AED', 'Connectivity Check',
          connectDone !== null ? `Latency: ${wifiSpeed}` : undefined, false, 'check-connectivity-pass')}
        {renderCheck(networkDone, 'bar-chart-outline', '#EF6B6B', 'Network',
          networkMsg, false, 'check-network-pass')}
        {renderCheck(locationDone, 'navigate-outline', '#3B82F6', 'Location',
          locationMsg, false, 'check-location-pass')}
        {renderCheck(batteryDone,
          batteryPct >= 80 ? 'battery-full' : batteryPct >= 30 ? 'battery-half-outline' : 'battery-dead',
          '#F59E0B',
          batteryPct >= 0 ? `Battery — ${batteryPct}%` : 'Battery',
          batteryDone === null ? undefined
            : batteryDone
              ? `Current charge: ${batteryPct >= 0 ? batteryPct + '%' : 'Unknown'}. Minimum 20% required.`
              : `Low battery (${batteryPct}%) — please charge to at least 20%`,
          true, 'check-battery-pass')}
      </View>

      {/* Sync Time footer */}
      {errorCode ? (
        <Text style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 12, marginBottom: 8 }}>
          Sync Time:{errorCode}
        </Text>
      ) : null}

      {/* Bottom padding so content doesn't sit directly against the button */}
      <View style={{ height: 16 }} />
      </ScrollView>

      {/* Attendance Button — pinned below the scroll area on every screen size */}
      <TouchableOpacity
        style={st.attendanceBtn}
        activeOpacity={0.8}
        onPress={handleAttendanceOpen}
        disabled={!allChecksDone}
        testID="attendance-button"
      >
        <View style={st.attendanceBtnLeft}>
          <MCIcon name="account-check" size={36} color="#F59E0B" />
        </View>
        <Text style={st.attendanceBtnText}>Attendance</Text>
        <Icon name="chevron-forward" size={22} color="#9CA3AF" />
      </TouchableOpacity>

      {/* ── Attendance Bottom Sheet ── */}
      <Modal visible={attendanceVisible} transparent animationType="fade" hardwareAccelerated>
        <View style={st.sheetOverlay}>
          <View style={st.sheetContainer}>
            {/* Sheet Header */}
            <View style={st.sheetHeader}>
              <Text style={st.sheetTitle}>Attendance</Text>
              <TouchableOpacity onPress={() => setAttendanceVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {/* Mark Attendance */}
              <Text style={st.sheetSectionLabel}>Mark Attendance</Text>
              <TouchableOpacity
                style={st.dropdownBtn}
                onPress={() => setAssetsPickerVisible(true)}
                activeOpacity={0.7}
                testID="attendance-type-dropdown"
              >
                <Text style={st.dropdownText}>{attendanceType}</Text>
                <Icon name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>

              {/* Selfie capture is shown for any "working" attendance —
                  Present and Half Day both need a selfie to start the
                  shift. Leave / Week off / Holiday don't show the camera
                  icon at all because there's no day to start. */}
              {WORKING_ATTENDANCE.has(attendanceType) ? (
                <>
                  {/* Divider */}
                  <View style={st.sheetDivider} />

                  {/* Take a Selfie Photograph */}
                  <View style={st.selfieRow}>
                    <Text style={st.selfieSectionLabel}>Take a Selfie Photograph</Text>
                    <TouchableOpacity onPress={handleTakeSelfie} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="selfie-camera-button">
                      <MCIcon name="camera-outline" size={26} color="#111827" />
                    </TouchableOpacity>
                  </View>

                  {selfieTaken && selfieUri ? (
                    <View style={st.selfieDone}>
                      <View style={st.selfieCaptureRow}>
                        <TouchableOpacity onPress={() => setSelfieViewOnly(true)} activeOpacity={0.8}>
                          <Image source={{ uri: selfieUri }} style={st.selfieImage} testID="selfie-preview" />
                        </TouchableOpacity>
                        {/* Delete sits beside the selfie so the user can drop it
                            and retake without diving into the full-screen viewer. */}
                        <TouchableOpacity
                          onPress={() => { setSelfieUri(null); setSelfieTimestamp(null); setSelfieLat(null); setSelfieLng(null); setSelfieAddress(null); setSelfieTaken(false); }}
                          activeOpacity={0.7}
                          style={st.selfieDeleteBtn}
                          testID="selfie-delete-button"
                        >
                          <Icon name="trash-outline" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                      <Text style={st.selfieTapHint}>Tap to view full size</Text>
                      <Text style={st.selfieDoneText}>Selfie Captured</Text>
                    </View>
                  ) : selfieTaken ? (
                    <View style={st.selfieDone}>
                      <Icon name="checkmark-circle" size={60} color="#22C55E" />
                      <Text style={st.selfieDoneText}>Selfie Captured</Text>
                    </View>
                  ) : (
                    <View style={st.selfieImgPlaceholder}>
                      <Image source={require('../assets/selfie_template.png')} style={{ width: 220, height: 220 }} resizeMode="contain" />
                    </View>
                  )}
                </>
              ) : (
                /* Non-working attendance: show a compact info card instead
                   of empty whitespace below the dropdown. The sheet's
                   maxHeight lets it shrink to fit this content. */
                <View style={st.attendanceInfoBox}>
                  <Icon name="information-circle-outline" size={22} color="#1a3a8f" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={st.attendanceInfoTitle}>{attendanceType}</Text>
                    <Text style={st.attendanceInfoText}>
                      Tap "Save Attendance" to record today as {attendanceType} on the portal. The working day will not be started.
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Proceed / Save Attendance button. Working attendance
                (Present, Half Day) → Proceed enters the day via the selfie
                flow. Non-working (Leave / Week off / Holiday) → Save
                Attendance records the absence locally + pushes it to the
                portal so the row appears on the Attendance report, but
                does NOT start the working day. */}
            <TouchableOpacity
              style={[
                st.proceedBtn,
                marking && { opacity: 0.7 },
              ]}
              onPress={() => handleProceed()}
              activeOpacity={0.8}
              disabled={marking}
            >
              {marking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.proceedBtnText}>
                  {WORKING_ATTENDANCE.has(attendanceType) ? 'Proceed' : 'Save Attendance'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Attendance Type Picker Modal ── */}
      <Modal visible={assetsPickerVisible} transparent animationType="fade">
        <View style={st.pickerOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAssetsPickerVisible(false)} />
          <View style={st.pickerBox}>
            <View style={st.pickerHeader}>
              <Text style={st.pickerTitle}>Mark Attendance</Text>
              <TouchableOpacity onPress={() => setAssetsPickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>


            {/* Options */}
            {ATTENDANCE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={st.pickerOption}
                onPress={() => {
                  setAttendanceType(option);
                  setAssetsPickerVisible(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={st.pickerOptionText}>{option}</Text>
                <View style={[
                  st.radioOuter,
                  attendanceType === option && st.radioOuterSelected,
                ]}>
                  {attendanceType === option && <View style={st.radioInner} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAssetsPickerVisible(false)} />
        </View>
      </Modal>

      {/* ── Alert Modal ── */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={st.alertOverlay}>
          <View style={st.alertBox}>
            <Text style={st.alertTitleText}>{alertTitle}</Text>
            <Text style={st.alertMessageText}>{alertMessage}</Text>
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: '#6B7280', borderBottomLeftRadius: 14 }}
                onPress={() => setAlertVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: '#1a3a8f', borderBottomRightRadius: 14 }}
                onPress={() => { setAlertVisible(false); runChecks(); }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Selfie Preview (capture flow — Retake / Use Photo) */}
      <PhotoPreviewModal
        visible={selfiePreview}
        photoUri={selfieUri}
        timestamp={selfieTimestamp ?? undefined}
        latitude={selfieLat}
        longitude={selfieLng}
        title="Selfie Preview"
        onAccept={handleSelfieAccept}
        onRetake={handleSelfieRetake}
      />

      {/* View-only selfie viewer. The captured photo already has the
          timestamp + lat/lng + address burned in via BurnWatermark, so
          there's no separate dark overlay panel here — that would
          duplicate the metadata and visually cover part of the image. */}
      <Modal visible={selfieViewOnly} transparent animationType="fade" onRequestClose={() => setSelfieViewOnly(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity
            onPress={() => setSelfieViewOnly(false)}
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
          >
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelfieViewOnly(false)}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={{ flex: 1, width: '100%', height: '100%' }} resizeMode="contain" />
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>
      <WatermarkRenderer />
    </View>
  );
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  // Banner
  banner: {
    height: 200,
    backgroundColor: '#4a5fa0',
    justifyContent: 'flex-end',
  },
  bannerOverlay: {
    padding: 20,
    paddingBottom: 30,
  },
  bannerTitle: {
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Checks Card
  checksCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: -20,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkInfo: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  checkSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 60,
  },

  // Attendance Button (bottom card)
  attendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 34 : 16,
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  attendanceBtnLeft: {
    marginRight: 12,
  },
  attendanceBtnText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  // ── Attendance Bottom Sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // maxHeight (not fixed height) so the sheet shrinks to its content
    // when the selfie block is hidden — previously a fixed 65 % height
    // left a large white gap below the dropdown for Leave / Week off /
    // Holiday selections.
    maxHeight: '65%',
    paddingBottom: 0,
  },
  attendanceInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  attendanceInfoTitle: { fontSize: 14, fontWeight: '700', color: '#1a3a8f', marginBottom: 4 },
  attendanceInfoText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  sheetSectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 50,
  },
  dropdownText: {
    fontSize: 15,
    color: '#374151',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 0,
    marginTop: 20,
    marginBottom: 16,
  },
  selfieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  selfieSectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  selfieImgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  selfieDone: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  selfieCaptureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  selfieDeleteBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  selfieImage: {
    width: Platform.OS === 'ios' ? 200 : 150,
    height: Platform.OS === 'ios' ? 200 : 150,
    borderRadius: Platform.OS === 'ios' ? 100 : 75,
    marginBottom: 6,
    borderWidth: 3,
    borderColor: '#22C55E',
  },
  selfieTapHint: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
  selfieDoneText: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '600',
    marginTop: 8,
  },
  proceedBtn: {
    backgroundColor: '#1a3a8f',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Assets Picker ──
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingBottom: 14,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
  },
  pickerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
  },
  pickerSearchPlaceholder: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  pickerSearchDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#EF4444',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },

  // ── Alert Modal ──
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  alertBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    padding: 24,
    paddingBottom: 0,
    alignItems: 'flex-start',
  },
  alertTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  alertMessageText: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  alertOkBtn: {
    width: '100%',
    backgroundColor: '#1a3a8f',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  alertOkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
