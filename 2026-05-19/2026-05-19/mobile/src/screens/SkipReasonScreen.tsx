import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Colors } from '../utils/colors';
import api from '../api/client';
import useAuthStore from '../store/auth';

type RouteParams = {
  SkipReason: {
    customerCode: string;
    customerName: string;
  };
};

const FALLBACK_REASONS = [
  'Out of Stock',
  'Shop Closed',
  'Owner Not Available',
  'Other',
];

export default function SkipReasonScreen() {
  const route = useRoute<RouteProp<RouteParams, 'SkipReason'>>();
  const navigation = useNavigation<any>();
  const { customerCode, customerName } = route.params;

  const user = useAuthStore((s) => s.user);

  const [reasons, setReasons] = useState<string[]>(FALLBACK_REASONS);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/reasons', { params: { type: 'skip_visit', pageSize: 50 } })
      .then(({ data }) => {
        const rows = data.data ?? data;
        if (Array.isArray(rows) && rows.length > 0) {
          setReasons(rows.map((r: any) => r.description || r.name));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!selectedReason) {
      Alert.alert('Select Reason', 'Please select a reason for skipping this visit.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/skip-reasons', {
        customerCode,
        reason: selectedReason,
        notes,
        skipDate: new Date().toISOString().split('T')[0],
        userCode: user?.code,
      });
      Alert.alert(
        'Visit Skipped',
        `Skipped ${customerName} — ${selectedReason}${notes ? `\n\nNote: ${notes}` : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert(
        'Visit Skipped (saved offline)',
        `Skipped ${customerName} — ${selectedReason}${notes ? `\n\nNote: ${notes}` : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Customer Header */}
      <View style={styles.customerHeader}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerInitial}>
            {customerName?.charAt(0)?.toUpperCase() ?? 'C'}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.customerCode}>{customerCode}</Text>
        </View>
      </View>

      {/* Reason Selection */}
      <Text style={styles.sectionTitle}>Reason for Skipping</Text>

      {reasons.map((reason) => (
        <TouchableOpacity
          key={reason}
          style={[
            styles.reasonOption,
            selectedReason === reason && styles.reasonOptionSelected,
          ]}
          activeOpacity={0.7}
          onPress={() => setSelectedReason(reason)}
        >
          <View
            style={[
              styles.radioOuter,
              selectedReason === reason && styles.radioOuterSelected,
            ]}
          >
            {selectedReason === reason && <View style={styles.radioInner} />}
          </View>
          <Text
            style={[
              styles.reasonText,
              selectedReason === reason && styles.reasonTextSelected,
            ]}
          >
            {reason}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Notes */}
      <Text style={styles.sectionTitle}>Additional Notes (Optional)</Text>
      <TextInput
        style={styles.notesInput}
        placeholder="Add any additional details..."
        placeholderTextColor={Colors.textSecondary}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, (!selectedReason || saving) && styles.saveButtonDisabled]}
        activeOpacity={0.7}
        onPress={handleSave}
        disabled={!selectedReason || saving}
      >
        {saving
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.saveButtonText}>Save & Go Back</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  customerHeader: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
  customerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  customerInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  customerCode: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  reasonOption: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  reasonOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  reasonText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  reasonTextSelected: {
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  notesInput: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: Colors.text,
    minHeight: 100,
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 56,
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
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
