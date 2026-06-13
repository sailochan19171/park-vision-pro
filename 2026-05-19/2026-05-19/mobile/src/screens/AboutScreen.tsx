import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Colors } from '../utils/colors';

interface InfoRow {
  label: string;
  value: string;
  last?: boolean;
}

function InfoRowItem({ label, value, last = false }: InfoRow) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function AboutScreen() {
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerLogoCircle}>
          <Text style={styles.headerLogoEmoji}>🌾</Text>
        </View>
        <Text style={styles.headerAppName}>Farmley SFA</Text>
        <Text style={styles.headerVersion}>Version 2.0.0</Text>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <InfoRowItem label="App Version" value="2.0.0" />
        <InfoRowItem label="Build" value="200" />
        <InfoRowItem label="Company" value="Farmley India Pvt. Ltd." />
        <InfoRowItem label="Support" value="support@farmley.com" />
        <InfoRowItem label="Website" value="www.farmley.com" last />
      </View>

      {/* Footer */}
      <Text style={styles.footer}>© 2025 Farmley India. All rights reserved.</Text>
    </ScrollView>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // Header card
  headerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    ...cardShadow,
  },
  headerLogoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerLogoEmoji: {
    fontSize: 40,
  },
  headerAppName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  headerVersion: {
    fontSize: 14,
    color: Colors.textSecondary,
  },

  // Info card
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    marginBottom: 24,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },

  // Footer
  footer: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
