import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SyncTestService, SyncTestResult } from '../services/syncTestService';

export default function SyncTestScreen() {
  const [testResults, setTestResults] = useState<SyncTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      const results = await SyncTestService.runAllSyncTests();
      setTestResults(results);
      
      const summary = SyncTestService.getTestSummary(results);
      console.log('[SyncTest]', summary.summary);
      
      // Show summary alert
      Alert.alert(
        'Sync Test Results',
        summary.summary,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('[SyncTest] Error running tests:', error);
      Alert.alert(
        'Test Error',
        `Failed to run sync tests: ${error?.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsRunning(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    runTests();
  };

  const getTestColor = (result: SyncTestResult) => {
    return result.passed ? '#4CAF50' : '#F44336';
  };

  const renderTestResult = (result: SyncTestResult, index: number) => (
    <View key={index} style={[styles.testResult, { borderLeftColor: getTestColor(result) }]}>
      <View style={styles.testHeader}>
        <Text style={styles.testName}>{result.testName}</Text>
        <Text style={[styles.testStatus, { color: getTestColor(result) }]}>
          {result.passed ? 'PASS' : 'FAIL'}
        </Text>
      </View>
      <Text style={styles.testMessage}>{result.message}</Text>
      {result.details && (
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => {
            Alert.alert(
              'Test Details',
              JSON.stringify(result.details, null, 2),
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Functionality Tests</Text>
        <Text style={styles.subtitle}>
          Test automatic sync from backend to mobile app
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.runButton, isRunning && styles.runButtonDisabled]}
          onPress={runTests}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.runButtonText}>Run All Tests</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.resultsContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {testResults.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No test results yet. Tap "Run All Tests" to start testing sync functionality.
            </Text>
          </View>
        ) : (
          testResults.map(renderTestResult)
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Tests verify: User deactivation, Customer status, Items sync, Price updates, Auto-sync timing
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  actions: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  runButton: {
    backgroundColor: '#1240ab',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  runButtonDisabled: {
    backgroundColor: '#ccc',
  },
  runButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  testResult: {
    backgroundColor: '#fff',
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  testName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  testStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  testMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  detailsButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  detailsButtonText: {
    fontSize: 12,
    color: '#1240ab',
    fontWeight: '500',
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});
