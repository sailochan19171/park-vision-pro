import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { Colors } from '../utils/colors';

// react-native-webview is not installed in this project.
// To enable this screen, run: npm install react-native-webview
// then rebuild native code (npx pod-install for iOS, rebuild for Android).

export default function EndorsementScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Endorsement</Text>
        <Text style={styles.subtitle}>Customer endorsements portal</Text>
      </View>

      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackIcon}>🌐</Text>
        <Text style={styles.fallbackTitle}>WebView not available</Text>
        <Text style={styles.fallbackMessage}>
          Please install react-native-webview to enable the Endorsement portal.
        </Text>
        <View style={styles.instructionBox}>
          <Text style={styles.instructionLabel}>Install command:</Text>
          <Text style={styles.instructionCode}>npm install react-native-webview</Text>
          <Text style={styles.instructionLabel} style={{ marginTop: 8 }}>Then rebuild the app.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  fallbackCard: {
    margin: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
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
  fallbackIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  fallbackMessage: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  instructionBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  instructionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  instructionCode: {
    fontSize: 14,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
});
