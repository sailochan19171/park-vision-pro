import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
  Image,
  PermissionsAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { useNavigation } from '@react-navigation/native';
import { pushSync, pullSync, resetCursors, syncForceFlags } from '../services/syncService';
import { uploadDebugLogs, uploadDeliveryLogs } from '../services/activityLogger';
import { isInternetAvailable } from '../utils/netInfo';

// Matches the legacy Java SFA's `IS_UPLOAD_RUNNING` SharedPreference —
// while either Upload Debug Logs or Upload Delivery Logs is in flight,
// re-tapping either button shows "upload already running" instead of
// kicking off a second push that would race the first. The flag is
// always cleared in the finally block so a crash mid-upload doesn't
// leave the buttons permanently locked.
const IS_UPLOAD_RUNNING_KEY = 'is_upload_running';
import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
import api from '../api/client';

const { FilePicker } = NativeModules;

const CUSTOM_CAMERA_KEY = 'custom_camera_enabled';
const DEV_MODE_KEY = 'developer_mode_enabled';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingDebug, setUploadingDebug] = useState(false);
  const [uploadingDelivery, setUploadingDelivery] = useState(false);
  const [customCamera, setCustomCamera] = useState(false);
  const [syncTime, setSyncTime] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_CAMERA_KEY).then((val) => {
      if (val === 'true') setCustomCamera(true);
    });
    AsyncStorage.getItem('last_sync_time').then((val) => {
      if (val) setSyncTime(val);
    });
    AsyncStorage.getItem(DEV_MODE_KEY).then((val) => {
      if (val === 'true') setDevMode(true);
    });
    // Clear any stale IS_UPLOAD_RUNNING flag left behind by a previous
    // app session that was killed mid-upload. Without this the buttons
    // would say "already running" forever until storage was cleared.
    // Safe because the screen has just mounted and nothing in this
    // process is uploading yet.
    AsyncStorage.removeItem(IS_UPLOAD_RUNNING_KEY).catch(() => {});
  }, []);

  const handleSyncData = async () => {
    if (syncing) return; // belt-and-braces guard against double-fire
    setSyncing(true);
    try {
      // Manual Sync Data is the user's "give me the absolute latest"
      // button — make it a guaranteed full refresh of master data,
      // not an incremental tick. Reset the cursors for every master
      // module so the next pull serves the full active set from the
      // server. This protects against:
      //   - a stuck/corrupt cursor that's blocking new rows
      //   - an admin edit on the web that didn't bump updated_at
      //     (missed trigger, raw SQL, restored from backup, etc.)
      //   - any other reason the 30 s incremental delta missed a row
      // Background auto-sync still uses the incremental cursor path —
      // only the manual button gets the full-refresh treatment, so
      // we don't blow up bandwidth on every tick.
      const MASTER_MODULES = [
        'customers',
        'items',
        'prices',
        'journey_plan_customers',
        'competitor_brands',
        'initiatives',
        'surveys',
        'permanent_displays',
        'planogram_setups',
        'app_settings',
      ];
      await resetCursors(MASTER_MODULES);

      // Drain every page of every module — pullSync returns one page
      // per module per call and a `hasMore` flag. Without this loop a
      // manual sync after a cursor reset would only pull the first 500
      // rows of each module; the remainder would dribble in over
      // subsequent auto-sync ticks, which is exactly the "I synced and
      // the new price still isn't showing" symptom we're fixing. Cap
      // at 20 iterations to defend against a pathological hasMore loop.
      let remaining = MASTER_MODULES;
      for (let iter = 0; iter < 20 && remaining.length > 0; iter++) {
        const results = await pullSync({
          modules: remaining,
          routeCode: user?.routeCode ?? '',
          // Skip the heavy ~1000-customer force-flags fetch on every drain
          // page; we run it once after the drain completes (below).
          skipForceFlags: true,
        });
        remaining = results.filter((r) => r.hasMore).map((r) => r.moduleName);
      }
      // Force check-in/out flags refreshed once after the full drain.
      try { await syncForceFlags(); } catch { /* non-blocking */ }
      const now = new Date();
      const timeStr = `${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear().toString().slice(-2)}--${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      await AsyncStorage.setItem('last_sync_time', timeStr);
      setSyncTime(timeStr);
      // Hold syncing=true while the alert is up so the user's OK tap
      // can't pass through to the Sync card underneath (which would
      // immediately re-trigger another sync — the original "tap OK and
      // it syncs again" report). The button stays "Syncing..." until
      // the user explicitly dismisses the alert; only then do we
      // re-enable it via setSyncing(false) inside the OK handler.
      Alert.alert('Success', 'Data synced successfully.', [
        { text: 'OK', onPress: () => setSyncing(false) },
      ], { cancelable: false });
    } catch (err: any) {
      Alert.alert('Sync Failed', err?.message ?? 'Could not sync data.', [
        { text: 'OK', onPress: () => setSyncing(false) },
      ], { cancelable: false });
    }
  };

  const handleUploadData = async () => {
    if (uploading) return;
    setUploading(true);
    // Same tap-through guard as handleSyncData: hold the spinner up
    // until the user dismisses the result alert, so an OK tap can't
    // re-trigger another upload on the underlying card.
    const dismiss = [{ text: 'OK', onPress: () => setUploading(false) }];
    try {
      const results = await pushSync();
      const success = results.reduce((s, r) => s + r.success, 0);
      const failed = results.reduce((s, r) => s + r.failed, 0);
      const failedEntities = results.filter(r => r.failed > 0).map(r => `${r.entity}: ${r.failed} failed`).join('\n');
      if (failed > 0) {
        Alert.alert('Upload Partial', `Uploaded ${success}, failed ${failed}.\n\n${failedEntities}`, dismiss, { cancelable: false });
      } else if (success > 0) {
        Alert.alert('Success', `Uploaded ${success} item${success !== 1 ? 's' : ''}.`, dismiss, { cancelable: false });
      } else {
        Alert.alert('Up to Date', 'No pending data to upload.', dismiss, { cancelable: false });
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload data.', dismiss, { cancelable: false });
    }
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
      rows.push(row);
    }
    return rows;
  };

  // Mirrors the legacy Java app's btnUploadData pattern:
  //   1. No network? → "no internet" alert, bail.
  //   2. Another upload already running? → "already running" alert, bail.
  //   3. Otherwise: set the running flag, push pending transactions
  //      (orders / visits / stocks / media — same as `UploadData`'s
  //      UploadTransactions service), then ship the session activity
  //      logs (crash reports + activity trail) to /activity-logs/batch.
  //      Clear the flag in finally so a crash mid-push doesn't lock
  //      the buttons forever.
  const runUploadFlow = async (
    label: 'Debug Logs' | 'Delivery Logs',
    shipper: () => Promise<{ sent: number; remaining: number }>,
    setBusy: (b: boolean) => void,
  ) => {
    const online = await isInternetAvailable();
    if (!online) {
      Alert.alert(label, 'No internet connection. Please check your network and try again.');
      return;
    }

    const running = await AsyncStorage.getItem(IS_UPLOAD_RUNNING_KEY);
    if (running === 'true') {
      Alert.alert(label, 'An upload is already running. Please wait for it to finish.');
      return;
    }

    setBusy(true);
    await AsyncStorage.setItem(IS_UPLOAD_RUNNING_KEY, 'true');

    let pushedTxns = 0;
    let pendingTxns = 0;
    try {
      // 1. Push pending transactions to the server. pushSync returns a
      //    per-entity breakdown ({ entity, success, failed }) covering
      //    orders, visits, stocks, photos, etc. — the equivalent of the
      //    Java UploadData's three Intent services bundled together.
      //    A first pass can leave items in the "failed" bucket because of
      //    a transient blip (token mid-rotation, momentary 5xx, duplicate
      //    write of a row the server already accepted on an earlier tap).
      //    The mobile retries those automatically on every background
      //    cycle anyway, but waiting until the next cycle would let this
      //    alert report a misleading "X transactions failed" even though
      //    the data was on its way. So we run pushSync a second time when
      //    the first pass reported anything pending — almost always wipes
      //    the count to 0 before we tell the user.
      const runOnce = async () => {
        let pushed = 0;
        let pending = 0;
        try {
          const results: Array<{ entity: string; success: number; failed: number }> = await pushSync();
          if (Array.isArray(results)) {
            for (const r of results) {
              pushed += r?.success ?? 0;
              pending += r?.failed ?? 0;
            }
          }
        } catch (e) {
          console.warn('[Settings] pushSync failed:', e);
        }
        return { pushed, pending };
      };

      let firstPass = await runOnce();
      pushedTxns = firstPass.pushed;
      pendingTxns = firstPass.pending;
      if (pendingTxns > 0) {
        const second = await runOnce();
        pushedTxns += second.pushed;
        pendingTxns = second.pending;
      }

      // 2. Ship the session activity-log buffer (crash logs, deliveries,
      //    everything captured during this session). Filtered by the
      //    caller — Debug Logs ships all, Delivery Logs filters to
      //    delivery-related modules.
      const { sent, remaining } = await shipper();

      // 3. Build a single summary alert that reports both halves so the
      //    user knows whether (a) any pending field transactions reached
      //    the server, and (b) how many log entries went up. We don't say
      //    "failed" for the still-pending count — the mobile keeps those
      //    rows queued and retries on every background cycle, so calling
      //    them "failed" alarmed reps whose data had in fact reached the
      //    server (they just hadn't seen the next sync tick yet).
      const parts: string[] = [];
      if (pushedTxns > 0) parts.push(`uploaded ${pushedTxns} transaction${pushedTxns === 1 ? '' : 's'}`);
      if (pendingTxns > 0) parts.push(`${pendingTxns} transaction${pendingTxns === 1 ? '' : 's'} queued — will retry automatically`);
      if (sent > 0) parts.push(`uploaded ${sent} log ${sent === 1 ? 'entry' : 'entries'}`);
      if (remaining > 0) parts.push(`${remaining} log ${remaining === 1 ? 'entry' : 'entries'} still queued`);

      if (parts.length === 0) {
        // Nothing pending AND nothing in session buffer — explicit
        // "all clear" message instead of the misleading old "nothing
        // to upload". This matches the Java app's behaviour where a
        // clean tap on btnUploadData simply does nothing visible
        // because UploadTransactions found 0 unsynced rows.
        Alert.alert(label, 'Everything is already up to date — nothing pending to upload.');
      } else {
        Alert.alert(label, `Upload complete — ${parts.join(', ')}.`);
      }
    } catch (e: any) {
      Alert.alert(label, `Could not complete upload — ${e?.message ?? 'please try again'}.`);
    } finally {
      await AsyncStorage.removeItem(IS_UPLOAD_RUNNING_KEY);
      setBusy(false);
    }
  };

  const handleUploadDebugLogs = () =>
    runUploadFlow('Debug Logs', uploadDebugLogs, setUploadingDebug);

  const handleUploadDeliveryLogs = () =>
    runUploadFlow('Delivery Logs', uploadDeliveryLogs, setUploadingDelivery);

  const handleCSVUpload = async () => {
    try {
      if (FilePicker && typeof FilePicker.pickCSV === 'function') {
        // Use native file picker — opens Android file browser
        setCsvUploading(true);
        const result = await FilePicker.pickCSV();
        setCsvUploading(false);
        const { name, content } = result;
        if (!content) { Alert.alert('Empty', 'File is empty.'); return; }
        const rows = parseCSV(content);
        if (rows.length === 0) { Alert.alert('Empty', `${name} has no data rows.`); return; }
        await processCSVRows(name, rows);
      } else {
        // Fallback: scan Downloads folder
        setCsvUploading(true);
        const files = await RNFS.readDir(RNFS.DownloadDirectoryPath);
        const csvFiles = files
          .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.csv'))
          .sort((a, b) => (b.mtime?.getTime() ?? 0) - (a.mtime?.getTime() ?? 0))
          .slice(0, 10);
        setCsvUploading(false);
        if (csvFiles.length === 0) { Alert.alert('No CSV Files', 'No .csv files found in Downloads.'); return; }
        const buttons = csvFiles.map(f => ({ text: f.name, onPress: () => processCSVFile(f.path, f.name) }));
        buttons.push({ text: 'Cancel', onPress: () => {} });
        Alert.alert('Select CSV File', `Found ${csvFiles.length} CSV file(s):`, buttons);
      }
    } catch (err: any) {
      setCsvUploading(false);
      if (err?.message !== 'File selection cancelled') {
        Alert.alert('Error', err?.message ?? 'Failed to pick CSV file.');
      }
    }
  };

  const processCSVRows = async (fileName: string, rows: Record<string, string>[]) => {
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
    let endpoint = '', label = '';
    if (headers.includes('customer_code') || headers.includes('customercode') || (headers.includes('code') && headers.includes('name') && headers.includes('address'))) {
      endpoint = '/imports/customers'; label = 'Customers';
    } else if (headers.includes('item_code') || headers.includes('itemcode') || (headers.includes('code') && headers.includes('name') && headers.includes('category'))) {
      endpoint = '/imports/items'; label = 'Items';
    } else if (headers.includes('price')) {
      endpoint = '/imports/prices'; label = 'Prices';
    } else if (headers.includes('route_code') || headers.includes('visit_day')) {
      endpoint = '/imports/journey-plans'; label = 'Journey Plans';
    } else {
      Alert.alert('Select Data Type', `${fileName}: ${rows.length} rows\nColumns: ${Object.keys(rows[0]).join(', ')}`, [
        { text: 'Customers', onPress: () => uploadCSVData('/imports/customers', 'Customers', rows) },
        { text: 'Items', onPress: () => uploadCSVData('/imports/items', 'Items', rows) },
        { text: 'Prices', onPress: () => uploadCSVData('/imports/prices', 'Prices', rows) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    await uploadCSVData(endpoint, label, rows);
  };

  const processCSVFile = async (filePath: string, fileName: string) => {
    setCsvUploading(true);
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      const rows = parseCSV(content);
      if (rows.length === 0) { Alert.alert('Empty', `${fileName} has no data rows.`); setCsvUploading(false); return; }
      await processCSVRows(fileName, rows);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to read CSV file.');
    } finally { setCsvUploading(false); }
  };

  const uploadCSVData = async (endpoint: string, label: string, rows: Record<string, string>[]) => {
    setCsvUploading(true);
    try {
      const mapped = rows.map(row => {
        const obj: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          obj[camel] = val;
        }
        if (obj.price) obj.price = parseFloat(obj.price) || 0;
        if (obj.visitSequence) obj.visitSequence = parseInt(obj.visitSequence, 10) || 0;
        return obj;
      });
      const { data } = await api.post(endpoint, mapped);
      Alert.alert(`${label} Import`, `Created: ${data.created ?? 0}${data.updated ? `\nUpdated: ${data.updated}` : ''}${data.skipped ? `\nSkipped: ${data.skipped}` : ''}\nTotal: ${rows.length}`);
    } catch (err: any) {
      Alert.alert('Import Failed', err?.response?.data?.message ?? err?.message ?? 'Upload failed');
    } finally { setCsvUploading(false); }
  };

  const handleDownloadDB = async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `farmley_sfa_${user?.code ?? 'user'}_${timestamp}.db`;
      const dest = `${RNFS.DownloadDirectoryPath}/${fileName}`;

      // WatermelonDB default name is "watermelon" — try multiple possible paths
      const possiblePaths = [
        `${RNFS.DocumentDirectoryPath}/../databases/watermelon.db`,
        `${RNFS.DocumentDirectoryPath}/../databases/watermelon`,
        `${RNFS.DocumentDirectoryPath}/../databases/farmley_sfa.db`,
        `/data/data/com.farmleysfa/databases/watermelon.db`,
        `/data/data/com.farmleysfa/databases/watermelon`,
      ];

      let dbPath = '';
      for (const p of possiblePaths) {
        if (await RNFS.exists(p)) { dbPath = p; break; }
      }

      if (!dbPath) {
        // List what's in the databases folder for debugging
        try {
          const dbDir = `${RNFS.DocumentDirectoryPath}/../databases`;
          const files = await RNFS.readDir(dbDir);
          const names = files.map(f => `${f.name} (${f.size}B)`).join('\n');
          Alert.alert('DB Not Found', `Files in databases folder:\n${names || 'empty'}`);
        } catch {
          Alert.alert('Error', 'Database file not found and cannot list databases folder.');
        }
        return;
      }

      await RNFS.copyFile(dbPath, dest);
      const fileStat = await RNFS.stat(dest);
      const sizeMB = ((fileStat.size || 0) / (1024 * 1024)).toFixed(2);

      Alert.alert(
        'Database Exported',
        `File: ${fileName}\nSize: ${sizeMB} MB\nUser: ${user?.name} (${user?.code})\n\nSaved to Downloads. Tap Share to send.`,
        [
          { text: 'OK' },
          {
            text: 'Share',
            onPress: async () => {
              try {
                const RNShare = require('react-native-share').default;
                await RNShare.open({
                  title: `Farmley SFA Database - ${user?.code}`,
                  message: `Farmley SFA Database\nUser: ${user?.name} (${user?.code})\nDate: ${new Date().toLocaleString()}\nSize: ${sizeMB} MB`,
                  url: `file://${dest}`,
                  type: 'application/x-sqlite3',
                  filename: fileName,
                });
              } catch { /* user cancelled share */ }
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to export database.');
    }
  };

  const toggleDevMode = async (value: boolean) => {
    setDevMode(value);
    await AsyncStorage.setItem(DEV_MODE_KEY, value ? 'true' : 'false');
  };

  const toggleCustomCamera = async (value: boolean) => {
    setCustomCamera(value);
    await AsyncStorage.setItem(CUSTOM_CAMERA_KEY, value ? 'true' : 'false');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const MenuItem = ({ icon, label, subtitle, onPress, loading, rightElement, badge }: {
    icon: string; label: string; subtitle?: string; onPress?: () => void; loading?: boolean; rightElement?: React.ReactNode; badge?: string;
  }) => (
    <TouchableOpacity style={st.menuItem} activeOpacity={0.7} onPress={onPress} disabled={loading || !onPress}>
      <View style={st.menuIconBox}>
        <Icon name={icon} size={20} color="#1a56db" />
      </View>
      <View style={st.menuTextBox}>
        <Text style={st.menuLabel}>{label}</Text>
        {subtitle ? <Text style={st.menuSub}>{subtitle}</Text> : null}
      </View>
      {loading ? <ActivityIndicator size="small" color="#1a56db" /> : null}
      {badge ? <View style={st.badge}><Text style={st.badgeText}>{badge}</Text></View> : null}
      {rightElement || null}
      {onPress && !loading && !rightElement ? <Icon name="chevron-forward" size={18} color="#D1D5DB" /> : null}
    </TouchableOpacity>
  );

  return (
    <View style={st.container}>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* Sync Data */}
        <TouchableOpacity style={st.settingCard} onPress={handleSyncData} activeOpacity={0.7} disabled={syncing}>
          <Icon name="sync-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>{syncing ? 'Syncing...' : 'Sync Data'}</Text>
          {syncing ? <ActivityIndicator size="small" color="#1a3178" /> : <Icon name="chevron-forward" size={20} color="#9CA3AF" />}
        </TouchableOpacity>

        {/* Upload Data */}
        <TouchableOpacity style={st.settingCard} onPress={handleUploadData} activeOpacity={0.7} disabled={uploading}>
          <Icon name="sync-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>{uploading ? 'Uploading...' : 'Upload Data'}</Text>
          {uploading ? <ActivityIndicator size="small" color="#1a3178" /> : <Icon name="chevron-forward" size={20} color="#9CA3AF" />}
        </TouchableOpacity>

        {/* Upload Debug Logs */}
        <TouchableOpacity style={st.settingCard} onPress={handleUploadDebugLogs} activeOpacity={0.7} disabled={uploadingDebug}>
          <Icon name="arrow-up-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>{uploadingDebug ? 'Uploading...' : 'Upload Debug Logs'}</Text>
          {uploadingDebug ? <ActivityIndicator size="small" color="#1a3178" /> : <Icon name="chevron-forward" size={20} color="#9CA3AF" />}
        </TouchableOpacity>

        {/* Upload Delivery Logs */}
        <TouchableOpacity style={st.settingCard} onPress={handleUploadDeliveryLogs} activeOpacity={0.7} disabled={uploadingDelivery}>
          <Icon name="arrow-up-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>{uploadingDelivery ? 'Uploading...' : 'Upload Delivery logs'}</Text>
          {uploadingDelivery ? <ActivityIndicator size="small" color="#1a3178" /> : <Icon name="chevron-forward" size={20} color="#9CA3AF" />}
        </TouchableOpacity>

        {/* Change Password */}
        <TouchableOpacity style={st.settingCard} onPress={() => navigation.navigate('ChangePassword')} activeOpacity={0.7}>
          <Icon name="lock-closed-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>Change Password</Text>
          <Icon name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        {/* View Local Data — a debug inspector for the local WatermelonDB
            tables. Hidden from end users (field/release builds); only shown in
            development builds. */}
        {__DEV__ && (
          <TouchableOpacity style={st.settingCard} onPress={() => navigation.navigate('LocalData')} activeOpacity={0.7}>
            <Icon name="server-outline" size={24} color="#1a3178" />
            <Text style={st.settingLabel}>View Local Data</Text>
            <Icon name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Custom Camera */}
        <View style={st.settingCard}>
          <Icon name="camera-outline" size={24} color="#1a3178" />
          <Text style={st.settingLabel}>Custom Camera</Text>
          <Switch
            value={customCamera}
            onValueChange={toggleCustomCamera}
            trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
            thumbColor={customCamera ? '#1a3178' : '#f4f3f4'}
          />
        </View>
      </ScrollView>

      {/* Sync Time at bottom */}
      <Text style={st.syncTimeText}>Sync Time:{syncTime || '--'}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 54 : 34, paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  scroll: { flex: 1 },
  content: { padding: 12, paddingTop: 8 },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 10,
    gap: 14,
    ...Platform.select({
      android: { elevation: 1 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
    }),
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  syncTimeText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 8,
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a56db',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
    borderWidth: 3, borderColor: '#BFDBFE',
  },
  profileAvatarText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2, width: 12, height: 12,
    borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#FFFFFF',
  },
  profileInfo: { flex: 1 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  liveBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  liveBadgeText: { fontSize: 10, fontWeight: '700', color: '#16A34A' },
  profileRole: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  profileLogin: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
  card: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
    ...Platform.select({ android: { elevation: 1 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 } }),
  },
  sep: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  menuIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuTextBox: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#111827' },
  menuSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  badge: { backgroundColor: '#1a56db', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  logoutCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: 20, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  logoutSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  footer: { alignItems: 'center', marginTop: 24, paddingBottom: 20 },
  footerPowered: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 6 },
  footerLogo: { width: 140, height: 40, marginBottom: 6 },
  footerVersion: { fontSize: 11, color: '#9CA3AF' },
});
