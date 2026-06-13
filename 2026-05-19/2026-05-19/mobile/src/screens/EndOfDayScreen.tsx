import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import { pushSync } from '../services/syncService';
import useAuthStore from '../store/auth';
import api from '../api/client';
import { DeviceEventEmitter } from 'react-native';
import { DAY_ENDED_LOCALLY_EVENT } from '../services/restoreMyDay';
import { useBottomInset } from '../utils/safeBottom';

export default function EndOfDayScreen() {
  const bottomInset = useBottomInset(16);
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [tripStartTime, setTripStartTime] = useState('N/A');
  const [tripEndTime, setTripEndTime] = useState('N/A');
  const [uploadStatus, setUploadStatus] = useState('Pending');
  const [eotStatus, setEotStatus] = useState('Pending');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [syncPct, setSyncPct] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = useCallback(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const startTime = await AsyncStorage.getItem(`day_start_time_${todayStr}`);
    const startTimestamp = await AsyncStorage.getItem(`day_start_timestamp_${todayStr}`);
    const endTime = await AsyncStorage.getItem(`day_end_time_${todayStr}`);
    const dayEnded = await AsyncStorage.getItem(`day_ended_${todayStr}`);

    if (startTimestamp) {
      const d = new Date(startTimestamp);
      const formatted = `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}, ${d.getFullYear()} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
      setTripStartTime(formatted);
    } else if (startTime) {
      setTripStartTime(startTime);
    }

    if (endTime) {
      setTripEndTime(endTime);
    }

    if (dayEnded === 'true') {
      setEotStatus('Completed');
      setUploadStatus('Completed');
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSubmit = async () => {
    // Block Day End if the LAST visit today has no checkout.
    // Only checks the most recent visit — ignores old stale records.
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayVisits: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('checkin_time', Q.gte(todayStart.getTime())),
          Q.sortBy('checkin_time', Q.desc),
        )
        .fetch();

      if (todayVisits.length > 0) {
        const lastVisit = todayVisits[0]._raw || {};
        const hasCheckout = (typeof lastVisit.checkout_time === 'number' && lastVisit.checkout_time > 0) || lastVisit.status === 'completed';
        if (!hasCheckout) {
          const storeName = lastVisit.customer_name || lastVisit.customer_code || 'a store';
          Alert.alert(
            'Checkout Pending',
            `Please check out from "${storeName}" before ending the day.`,
            [{ text: 'OK', style: 'cancel' }],
          );
          return;
        }
      }
    } catch (e) {
      console.warn('[EOD] Visit check failed:', e);
    }

    // First push unposted data with progress tracking
    setSyncing(true);
    setSyncProgress('Pushing unposted data to server...');
    setSyncPct(0);
    try {
      const results = await pushSync((info) => {
        setSyncPct(info.overallPct);
        setSyncProgress(`Syncing ${info.entity.replace(/_/g, ' ')}... (${info.overallPct}%)`);
      });
      const totalFailed = results.reduce((s, r) => s + r.failed, 0);
      if (totalFailed === 0) {
        setUploadStatus('Completed');
      } else {
        setUploadStatus(`Partial (${totalFailed} failed)`);
      }
    } catch (err: any) {
      console.warn('[EOD] Sync error:', err?.message);
      // Continue even if sync fails — user can retry
    }
    setSyncing(false);
    setSyncProgress('');
    // Show confirmation dialog
    setShowConfirm(true);
  };

  const handleConfirmYes = async () => {
    setShowConfirm(false);
    setSyncing(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const now = new Date();
      const endTimeFormatted = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      // Try server first — if it succeeds we mark locally and navigate
      // back silently. If it fails we show an error alert and let the
      // user retry. No success popup — smooth transition.
      let serverOk = false;
      // Hoisted so the auto_eod_fired_for_<date> flag below the try-catch
      // can reference the same date the EOT was posted against.
      let eotDateStr = todayStr;
      try {
        try {
          const stored = await AsyncStorage.getItem('active_attendance_date');
          if (stored) {
            eotDateStr = stored;
          } else {
            const recentAtt: any[] = await database.get('attendance_records').query(
              Q.where('user_code', user?.code ?? ''),
              Q.where('is_present', true),
              Q.sortBy('attendance_date', Q.desc)
            ).fetch();
            if (recentAtt.length > 0) eotDateStr = recentAtt[0].attendanceDate;
          }
        } catch { /* fallback to todayStr */ }

        await api.post('/attendance/end-day', { endTime: now.toISOString(), eotDate: eotDateStr });
        serverOk = true;
      } catch (e: any) {
        const serverMsg = e?.response?.data?.message;
        const status = e?.response?.status;
        // EOT_ALREADY_DONE means the server already has the record — treat
        // it as success (duplicate is harmless).
        if (e?.response?.data?.error === 'EOT_ALREADY_DONE') {
          serverOk = true;
        } else if (status === 401) {
          setSyncing(false);
          setSuccessMsg('Session expired. Please logout and login again.');
          setShowSuccess(true);
          return;
        } else {
          console.warn('[EOD] End day API failed:', e);
          setSyncing(false);
          setSuccessMsg(serverMsg ?? 'Failed to submit EOT. Please try again');
          setShowSuccess(true);
          return;
        }
      }

      // Server accepted. Per user requirement: after manual EOD the
      // dashboard should flip straight back to "Start Day" (no lingering
      // "Day Ended" state). Clear all day_* flags for today so the
      // bottom button label resets the moment the user returns to
      // Dashboard.
      // Also stamp the auto_eod_fired_for_<eotDate> flag so that if an
      // admin Reopens this EOT later, the auto-EOD popup does NOT fire
      // again — the user already ended the day intentionally, the auto
      // path should only kick in when manual EOD was SKIPPED.
      await AsyncStorage.setItem(`auto_eod_fired_for_${eotDateStr}`, 'true');
      await AsyncStorage.multiRemove([
        `day_started_${todayStr}`,
        `day_ended_${todayStr}`,
        `day_start_time_${todayStr}`,
        `day_start_timestamp_${todayStr}`,
        `day_start_finalized_timestamp_${todayStr}`,
        `day_end_time_${todayStr}`,
        `day_end_timestamp_${todayStr}`,
      ]);

      // Tell the still-mounted Dashboard that the day just ended so it
      // flips its live state to (started=false, ended=false) AND clears
      // its module-level cache — BEFORE the goBack lands. Without this,
      // navigation.goBack just re-focuses the Dashboard (it never
      // unmounted while EndOfDay was pushed on top), so its state stays
      // at the pre-EOD "Continue" value and the rep sees the wrong label
      // for 1-2 s until focus-fired loadDayStatus catches up. The
      // listener in DashboardScreen handles both the live setState calls
      // and resetting the cache for any future remount.
      DeviceEventEmitter.emit(DAY_ENDED_LOCALLY_EVENT);

      setTripEndTime(endTimeFormatted);
      setEotStatus('Completed');
      setUploadStatus('Completed');
      setSyncing(false);

      // Log end day
      try { const { logEndDay } = require('../services/activityLogger'); logEndDay('success'); } catch {}
      navigation.goBack();
    } catch (err: any) {
      setSyncing(false);
      try { const { logEndDay } = require('../services/activityLogger'); logEndDay('failed', err?.message); } catch {}
      setSuccessMsg(err?.message ?? 'Failed to submit EOT. Please try again');
      setShowSuccess(true);
    }
  };

  const handleConfirmNo = () => {
    setShowConfirm(false);
  };

  const handleSuccessOk = () => {
    setShowSuccess(false);
    navigation.goBack();
  };

  return (
    <View style={st.container} testID="end-of-day-screen">
      {/* Title */}
      <Text style={st.title}>Day End</Text>

      {/* Status Card */}
      <View style={st.card}>
        <View style={st.statusRow}>
          <View style={st.statusCol}>
            <View style={st.statusHeader}>
              <View style={st.statusBar} />
              <Text style={st.statusLabel}>Upload Status</Text>
            </View>
            <Text style={st.statusValue}>{uploadStatus}</Text>
          </View>
          <View style={st.statusDivider} />
          <View style={st.statusCol}>
            <View style={st.statusHeader}>
              <View style={[st.statusBar, { backgroundColor: '#1a3178' }]} />
              <Text style={st.statusLabel}>EOT Status</Text>
            </View>
            <Text style={st.statusValue}>{eotStatus}</Text>
          </View>
        </View>

        <View style={st.timeDivider} />

        <View style={st.timeRow}>
          <View style={st.timeCol}>
            <Text style={st.timeLabel}>Trip Start Time</Text>
            <Text style={st.timeValue}>{tripStartTime}</Text>
          </View>
          <View style={st.timeCol}>
            <Text style={st.timeLabel}>Trip End Time</Text>
            <Text style={st.timeValue}>{tripEndTime}</Text>
          </View>
        </View>
      </View>

      {/* Syncing Overlay */}
      {syncing && (
        <View style={st.syncOverlay}>
          <ActivityIndicator size="large" color="#4A7BF7" />
          <Text style={st.syncText}>{syncProgress || 'Pushing unposted data to server...'}</Text>
          {syncPct > 0 && (
            <View style={st.progressBarContainer}>
              <View style={[st.progressBarFill, { width: `${syncPct}%` }]} />
            </View>
          )}
          {syncPct > 0 && <Text style={st.syncPctText}>{syncPct}%</Text>}
        </View>
      )}

      {/* Submit Button */}
      <View style={[st.bottomBar, { paddingBottom: bottomInset }]}>
        <TouchableOpacity
          style={[st.submitBtn, syncing && { opacity: 0.6 }]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={syncing}
        >
          <Text style={st.submitBtnText}>Submit</Text>
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Alert !</Text>
            <Text style={st.modalMsg}>Do you want to submit Day End?</Text>
            <View style={st.modalBtnRow}>
              <TouchableOpacity style={st.modalBtnNo} onPress={handleConfirmNo} activeOpacity={0.7}>
                <Text style={st.modalBtnNoText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.modalBtnYes} onPress={handleConfirmYes} activeOpacity={0.7}>
                <Text style={st.modalBtnYesText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Alert !</Text>
            <Text style={st.modalMsg}>{successMsg}</Text>
            <TouchableOpacity style={st.modalBtnYesFull} onPress={handleSuccessOk} activeOpacity={0.7}>
              <Text style={st.modalBtnYesText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECEEF2',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusCol: {
    flex: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusBar: {
    width: 3,
    height: 20,
    backgroundColor: '#1a3178',
    borderRadius: 2,
    marginRight: 10,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  statusValue: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 13,
    marginTop: 2,
  },
  statusDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  timeDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  timeRow: {
    flexDirection: 'row',
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  syncOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  syncText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  progressBarContainer: {
    width: '70%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4A7BF7',
    borderRadius: 3,
  },
  syncPctText: {
    fontSize: 13,
    color: '#4A7BF7',
    fontWeight: '600',
    marginTop: 6,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#ECEEF2',
  },
  submitBtn: {
    backgroundColor: '#1a3178',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  modalMsg: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnNo: {
    flex: 1,
    backgroundColor: '#B0B0B0',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnNoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBtnYes: {
    flex: 1,
    backgroundColor: '#1a3178',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnYesText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBtnYesFull: {
    backgroundColor: '#1a3178',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
