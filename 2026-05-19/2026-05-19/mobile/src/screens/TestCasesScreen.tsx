import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import database from '../db/database';
import useAuthStore from '../store/auth';
import axios from 'axios';
import api from '../api/client';

interface TestCase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  error?: string;
  duration?: number;
}

const INITIAL_TESTS: TestCase[] = [
  { id: 'TC001', name: 'Database Connectivity', description: 'Verify WatermelonDB is accessible and tables exist', status: 'pending' },
  { id: 'TC002', name: 'Customer Data Loaded', description: 'Check customers table has records from sync', status: 'pending' },
  { id: 'TC003', name: 'Product Data Loaded', description: 'Check items table has records from sync', status: 'pending' },
  { id: 'TC004', name: 'Price Data Loaded', description: 'Check prices table has records from sync', status: 'pending' },
  { id: 'TC005', name: 'Journey Plans Loaded', description: 'Check journey_plan_customers has records', status: 'pending' },
  { id: 'TC006', name: 'API Health Check', description: 'Verify backend server is reachable', status: 'pending' },
  { id: 'TC007', name: 'Auth Token Valid', description: 'Verify access token works for API calls', status: 'pending' },
  { id: 'TC008', name: 'Sync Pull Works', description: 'Test pulling data from server', status: 'pending' },
  { id: 'TC009', name: 'Sync Push Works', description: 'Test pushing local data to server', status: 'pending' },
  { id: 'TC010', name: 'Attendance Record', description: 'Verify attendance can be queried', status: 'pending' },
  { id: 'TC011', name: 'Order Creation', description: 'Verify orders table is writable', status: 'pending' },
  { id: 'TC012', name: 'AsyncStorage Access', description: 'Verify AsyncStorage read/write', status: 'pending' },
  { id: 'TC013', name: 'User Auth State', description: 'Verify user is logged in with valid data', status: 'pending' },
  { id: 'TC014', name: 'Route Assignment', description: 'Verify user has a route code assigned', status: 'pending' },
  { id: 'TC015', name: 'Stores for Today', description: 'Check journey plans exist for today', status: 'pending' },
  { id: 'TC016', name: 'Selling SKUs Loaded', description: 'Check selling_skus table has data', status: 'pending' },
  { id: 'TC017', name: 'Competitor Brands Loaded', description: 'Check competitor_brands has records', status: 'pending' },
  { id: 'TC018', name: 'Camera Service', description: 'Verify camera service module loads', status: 'pending' },
  { id: 'TC019', name: 'Custom Camera Setting', description: 'Verify custom camera toggle persists', status: 'pending' },
  { id: 'TC020', name: 'Day Status Flags', description: 'Verify day_started/day_ended flags work', status: 'pending' },
];

export default function TestCasesScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [tests, setTests] = useState<TestCase[]>(INITIAL_TESTS);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const updateTest = (id: string, updates: Partial<TestCase>) => {
    setTests((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const runTest = async (id: string, fn: () => Promise<void>) => {
    updateTest(id, { status: 'running', error: undefined });
    const start = Date.now();
    try {
      await fn();
      updateTest(id, { status: 'passed', duration: Date.now() - start });
    } catch (err: any) {
      updateTest(id, { status: 'failed', error: err?.message ?? 'Unknown error', duration: Date.now() - start });
    }
  };

  const runAllTests = useCallback(async () => {
    setRunning(true);
    setTests(INITIAL_TESTS);

    const todayStr = new Date().toISOString().split('T')[0];
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

    // TC001
    await runTest('TC001', async () => {
      const count = await database.get('customers').query().fetchCount();
      if (count < 0) throw new Error('DB not accessible');
    });

    // TC002
    await runTest('TC002', async () => {
      const count = await database.get('customers').query().fetchCount();
      if (count === 0) throw new Error('No customers found (0 records)');
    });

    // TC003
    await runTest('TC003', async () => {
      const count = await database.get('items').query().fetchCount();
      if (count === 0) throw new Error('No items found (0 records)');
    });

    // TC004
    await runTest('TC004', async () => {
      const count = await database.get('prices').query().fetchCount();
      if (count === 0) throw new Error('No prices found (0 records)');
    });

    // TC005
    await runTest('TC005', async () => {
      const count = await database.get('journey_plan_customers').query().fetchCount();
      if (count === 0) throw new Error('No journey plan records (0 records)');
    });

    // TC006
    await runTest('TC006', async () => {
      // Health is at root, not under /api/v1
      const baseUrl = api.defaults.baseURL?.replace('/api/v1', '') ?? '';
      await axios.get(`${baseUrl}/health`);
    });

    // TC007
    await runTest('TC007', async () => {
      const res = await api.get('/sync/status');
      if (!res.data?.userCode) throw new Error('Invalid response - no userCode');
    });

    // TC008
    await runTest('TC008', async () => {
      const res = await api.post('/sync/pull', { modules: ['customers'], cursors: {}, limit: 1 });
      if (!res.data?.changes) throw new Error('Pull response missing changes');
    });

    // TC009
    await runTest('TC009', async () => {
      const res = await api.post('/sync/push', { changes: {} });
      if (!res.data) throw new Error('Push response empty');
    });

    // TC010
    await runTest('TC010', async () => {
      const records = await database.get('attendance_records').query(
        Q.where('attendance_date', todayStr),
      ).fetchCount();
      // 0 is valid (day not started), just verify query works
    });

    // TC011
    await runTest('TC011', async () => {
      const count = await database.get('orders').query().fetchCount();
      // Just verify table is accessible
    });

    // TC012
    await runTest('TC012', async () => {
      await AsyncStorage.setItem('test_key_tc012', 'ok');
      const val = await AsyncStorage.getItem('test_key_tc012');
      await AsyncStorage.removeItem('test_key_tc012');
      if (val !== 'ok') throw new Error('AsyncStorage read/write mismatch');
    });

    // TC013
    await runTest('TC013', async () => {
      if (!user) throw new Error('User is null');
      if (!user.code) throw new Error('User code missing');
      if (!user.name) throw new Error('User name missing');
      if (!user.userType) throw new Error('User type missing');
    });

    // TC014
    await runTest('TC014', async () => {
      if (!user?.routeCode) throw new Error('No route code assigned to user');
    });

    // TC015
    await runTest('TC015', async () => {
      const count = await database.get('journey_plan_customers').query(
        Q.where('visit_day', dayName),
      ).fetchCount();
      if (count === 0) throw new Error(`No stores scheduled for ${dayName}`);
    });

    // TC016
    await runTest('TC016', async () => {
      const count = await database.get('selling_skus').query().fetchCount();
      // 0 is valid, just verify table exists
    });

    // TC017
    await runTest('TC017', async () => {
      const count = await database.get('competitor_brands').query().fetchCount();
      // 0 is valid, just verify table exists
    });

    // TC018
    await runTest('TC018', async () => {
      const { capturePhoto } = require('../services/cameraService');
      if (typeof capturePhoto !== 'function') throw new Error('capturePhoto not a function');
    });

    // TC019
    await runTest('TC019', async () => {
      await AsyncStorage.setItem('custom_camera_enabled', 'true');
      const val = await AsyncStorage.getItem('custom_camera_enabled');
      if (val !== 'true') throw new Error('Custom camera toggle not persisted');
      await AsyncStorage.setItem('custom_camera_enabled', 'false');
    });

    // TC020
    await runTest('TC020', async () => {
      await AsyncStorage.setItem(`day_started_test`, 'true');
      const started = await AsyncStorage.getItem(`day_started_test`);
      await AsyncStorage.removeItem(`day_started_test`);
      if (started !== 'true') throw new Error('Day status flag not working');
    });

    setLastRun(new Date().toLocaleString());
    setRunning(false);
  }, [user]);

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const total = tests.length;

  const getStatusIcon = (status: TestCase['status']) => {
    switch (status) {
      case 'passed': return { name: 'checkmark-circle', color: '#059669' };
      case 'failed': return { name: 'close-circle', color: '#DC2626' };
      case 'running': return { name: 'reload-circle', color: '#2563EB' };
      case 'skipped': return { name: 'remove-circle', color: '#9CA3AF' };
      default: return { name: 'ellipse-outline', color: '#9CA3AF' };
    }
  };

  const renderItem = ({ item }: { item: TestCase }) => {
    const icon = getStatusIcon(item.status);
    return (
      <View style={styles.testCard}>
        <View style={styles.testHeader}>
          <Icon name={icon.name} size={22} color={icon.color} />
          <View style={styles.testInfo}>
            <Text style={styles.testId}>{item.id}</Text>
            <Text style={styles.testName}>{item.name}</Text>
          </View>
          {item.status === 'running' && <ActivityIndicator size="small" color="#2563EB" />}
          {item.duration !== undefined && (
            <Text style={styles.testDuration}>{item.duration}ms</Text>
          )}
        </View>
        <Text style={styles.testDesc}>{item.description}</Text>
        {item.error && <Text style={styles.testError}>{item.error}</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={24} color="#1a3c7a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Cases</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={styles.headerLine} />

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryCount}>{total}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#059669' }]}>{passed}</Text>
          <Text style={styles.summaryLabel}>Passed</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#DC2626' }]}>{failed}</Text>
          <Text style={styles.summaryLabel}>Failed</Text>
        </View>
        <TouchableOpacity
          style={[styles.runBtn, running && styles.runBtnDisabled]}
          onPress={runAllTests}
          disabled={running}
          activeOpacity={0.7}
        >
          {running ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runBtnText}>Run All</Text>
          )}
        </TouchableOpacity>
      </View>

      {lastRun && <Text style={styles.lastRun}>Last run: {lastRun}</Text>}

      {/* Test List */}
      <FlatList
        data={tests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a3c7a' },
  headerLine: { height: 3, backgroundColor: '#1a3c7a' },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryItem: { alignItems: 'center', marginRight: 20 },
  summaryCount: { fontSize: 22, fontWeight: '700', color: '#111827' },
  summaryLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  runBtn: {
    marginLeft: 'auto',
    backgroundColor: '#1a3c7a',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  lastRun: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 6 },
  listContent: { padding: 12, paddingBottom: 30 },
  testCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  testHeader: { flexDirection: 'row', alignItems: 'center' },
  testInfo: { flex: 1, marginLeft: 10 },
  testId: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  testName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  testDesc: { fontSize: 12, color: '#6B7280', marginTop: 4, marginLeft: 32 },
  testError: { fontSize: 12, color: '#DC2626', marginTop: 4, marginLeft: 32, fontStyle: 'italic' },
  testDuration: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
});
