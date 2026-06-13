import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Platform, Image, Animated, StatusBar, AppState,
} from 'react-native';
import useAuthStore from '../store/auth';
import { initialSync } from '../services/syncService';
// FastInitialSyncService was previously called here; it's a broken stub
// (see comments inside runSync below). The screen now uses initialSync
// directly.

export default function InitialSyncScreen() {
  const user = useAuthStore((s) => s.user);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const markSyncDone = useAuthStore((s) => s.markSyncDone);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether a sync attempt is currently in flight. Used to prevent
  // re-entering initialSync from both the initial mount effect and the
  // AppState foreground listener at the same time.
  const runningRef = useRef(false);
  const doneRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [resumed, setResumed] = useState(false);

  // Pulse animation on Farmley logo while syncing
  useEffect(() => {
    if (done) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [done]);

  // Run (or resume) the fast initial sync with SQLite file download
  const runSync = useCallback(async () => {
    if (runningRef.current || doneRef.current) return;
    if (offlineMode) {
      doneRef.current = true;
      setDone(true);
      markSyncDone();
      return;
    }
    runningRef.current = true;
    setError(null);
    try {
      // Go straight to initialSync — FastInitialSyncService is broken stub
      // code (missing backend endpoints + empty importFromMasterDatabase).
      // initialSync is now parallel across master modules and skips the
      // all-time transaction restore when local DB is already populated.
      // No per-module progress UI: counts shown mid-sync were misleading
      // (e.g. "1 customer" while pagination was still in flight).
      await initialSync(user?.routeCode ?? '', () => {
        // intentionally empty — sync runs to completion under a single
        // loader, dashboard reads real counts after navigation.
      });

      doneRef.current = true;
      setDone(true);
      setTimeout(() => markSyncDone(), 400);
    } catch (err: any) {
      setError(err?.message ?? 'Sync failed');
    } finally {
      runningRef.current = false;
    }
  }, [user?.routeCode, offlineMode, markSyncDone]);

  // Kick off sync on mount.
  useEffect(() => {
    runSync();
  }, [runSync]);

  // Auto-resume when the app comes back to the foreground. If the screen
  // turned off mid-sync (Android Doze, OS killed JS, user locked the phone,
  // etc.) the in-flight network request was interrupted — coming back to
  // the app re-arms initialSync() which picks up from the last cursor.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (doneRef.current) return;
      if (runningRef.current) return;
      // Sync was interrupted while we were backgrounded — flag a quick
      // banner and resume.
      setResumed(true);
      setTimeout(() => setResumed(false), 2500);
      runSync();
    });
    return () => sub.remove();
  }, [runSync]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Centered Farmley logo with circular loader around it.
          Previously the screen showed per-module counts during sync;
          those numbers updated live and frequently displayed stale
          values (e.g. "Customers: 1" when 9 were actually assigned)
          because the live updates fired in the middle of pagination.
          Replaced with a single unified loader — no counts, no
          per-module list — so users only see correct numbers AFTER
          sync completes on Dashboard. */}
      <View style={s.centerStack}>
        <View style={s.loaderRing}>
          <ActivityIndicator size="large" color="#1a56db" style={s.spinner} />
          <Animated.View style={[s.logoBox, { transform: [{ scale: pulseAnim }] }]}>
            <Image
              source={require('../assets/farmley_mobile_app_logo_backup.jpg')}
              style={s.logo}
              resizeMode="cover"
            />
          </Animated.View>
        </View>

        <Text style={s.title}>{done ? 'All Synced!' : 'Syncing your data...'}</Text>
        <Text style={s.subtitle}>
          {done ? 'Your data is ready' : 'Please wait while we load everything'}
        </Text>

        {resumed && !done && (
          <View style={s.resumedPill}>
            <Text style={s.resumedText}>Resumed — picking up where it left off</Text>
          </View>
        )}
      </View>

      {/* Error */}
      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>Some data failed to sync. You can continue and sync later.</Text>
        </View>
      )}

      {/* User info footer */}
      <View style={s.footer}>
        <Text style={s.footerText}>{user?.name ?? user?.code ?? ''} · {user?.userType ?? ''}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  centerStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderRing: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  spinner: {
    position: 'absolute',
    width: 160,
    height: 160,
    transform: [{ scale: 2.6 }],
  },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: { width: 100, height: 100 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    minHeight: 20,
  },
  hint: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
  resumedPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  resumedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  barOuter: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barInner: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#1a56db',
  },
  pctText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a56db',
    marginBottom: 20,
  },
  moduleList: {
    width: '100%',
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  moduleIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  moduleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    flex: 1,
  },
  moduleDone: {
    color: '#111827',
    fontWeight: '600',
  },
  moduleSyncing: {
    color: '#1a56db',
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 32,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a56db',
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
  },
  errorBanner: {
    marginTop: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#D1D5DB',
    fontWeight: '500',
  },
});
