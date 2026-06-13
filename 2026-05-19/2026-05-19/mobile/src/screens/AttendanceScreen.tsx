import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentPosition } from '../services/locationService';
import { captureSelfie } from '../services/cameraService';

export default function AttendanceScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [marking, setMarking] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [markedTime, setMarkedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const checkExisting = useCallback(async () => {
    const existing = await database
      .get('attendance_records')
      .query(
        Q.where('user_code', user?.code ?? ''),
        Q.where('attendance_date', todayStr),
      )
      .fetch();

    if (existing.length > 0) {
      // If day was ended but user is restarting, clear the ended flag and reset timer
      const dayEnded = await AsyncStorage.getItem(`day_ended_${todayStr}`);
      if (dayEnded === 'true') {
        await AsyncStorage.removeItem(`day_ended_${todayStr}`);
        // Reset start timestamp so the timer restarts from now
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);
        await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, now.toISOString());
      }
      setAlreadyMarked(true);
      const rec = existing[0] as any;
      // Show the time it was marked
      const d = new Date(todayStr);
      setMarkedTime(
        d.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      );
    }
    setLoading(false);
  }, [user?.code, todayStr]);

  useEffect(() => {
    checkExisting();
  }, [checkExisting]);

  const handleMarkAttendance = async () => {
    setMarking(true);

    try {
      // GPS capture (non-blocking)
      const position = await getCurrentPosition();
      // Selfie is captured separately via the "Take Selfie" button
      const id = uuidv4();
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      await database.write(async () => {
        await database.get('attendance_records').create((rec: any) => {
          rec._raw.id = id;
          rec.userCode = user?.code ?? '';
          rec.isPresent = true;
          rec.selfiePath = selfieUri;
          rec.attendanceDate = todayStr;
          rec.geoLat = position?.lat ?? null;
          rec.geoLng = position?.lng ?? null;
          rec.isSynced = false;
        });
      });

      // Store start time + ISO timestamp for dashboard display and live timer
      await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
      await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);
      await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, now.toISOString());
      // Auto-EOD anchor — same as day_start_timestamp here since this flow
      // doesn't have a separate selfie/proceed gap, but keep the key in sync
      // with the StartDayScreen contract.
      await AsyncStorage.setItem(`day_start_finalized_timestamp_${todayStr}`, now.toISOString());
      // Clear day-ended flag so timer shows again after restarting the day
      await AsyncStorage.removeItem(`day_ended_${todayStr}`);

      Alert.alert(
        'Day Started',
        'Attendance marked. Have a productive day!',
        [
          {
            text: 'Go to Dashboard',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{
                  name: 'MainTabs',
                  state: { index: 0, routes: [{ name: 'Home' }] },
                }],
              });
            },
          },
        ],
      );
    } catch (err: any) {
      console.error('Attendance error:', err);
      Alert.alert('Error', `Failed to mark attendance. ${err?.message ?? ''}`);
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Status Icon */}
        <View style={[styles.iconCircle, alreadyMarked && styles.iconCircleDone]}>
          <Text style={styles.iconEmoji}>{alreadyMarked ? '✓' : '☀️'}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {alreadyMarked ? 'Day Already Started' : 'Start Your Day'}
        </Text>
        <Text style={styles.subtitle}>
          {alreadyMarked
            ? `Attendance marked for ${todayStr}`
            : 'Mark your attendance to begin today\'s route'}
        </Text>

        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userInitial}>
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name ?? 'User'}</Text>
            <Text style={styles.userCode}>{user?.code ?? ''}</Text>
            <Text style={styles.userRoute}>Route: {user?.routeCode ?? 'N/A'}</Text>
          </View>
        </View>

        {/* Date */}
        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Date</Text>
          <Text style={styles.dateValue}>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Action Button */}
        {!alreadyMarked ? (
          <>
            {/* Optional selfie */}
            <TouchableOpacity
              style={[styles.selfieBtn, selfieUri && styles.selfieBtnDone]}
              activeOpacity={0.7}
              onPress={async () => {
                const photo = await captureSelfie();
                if (photo) setSelfieUri(photo.uri);
              }}
            >
              <Text style={[styles.selfieBtnText, selfieUri && styles.selfieBtnTextDone]}>
                {selfieUri ? '✓ Selfie Captured' : 'Take Selfie (Optional)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.markBtn}
              activeOpacity={0.7}
              onPress={handleMarkAttendance}
              disabled={marking}
            >
              {marking ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.markBtnText}>Mark Attendance & Start Day</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.continueBtn}
            activeOpacity={0.7}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{
                  name: 'MainTabs',
                  state: { index: 0, routes: [{ name: 'Home' }] },
                }],
              });
            }}
          >
            <Text style={styles.continueBtnText}>Continue to Stores →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconCircleDone: {
    backgroundColor: Colors.primary,
  },
  iconEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  userCode: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  userRoute: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  dateCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  selfieBtn: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    height: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  selfieBtnDone: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  selfieBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  selfieBtnTextDone: {
    color: Colors.primaryDark,
  },
  markBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 60,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  markBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  continueBtn: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  continueBtnText: {
    color: Colors.primaryDark,
    fontSize: 17,
    fontWeight: '600',
  },
});
