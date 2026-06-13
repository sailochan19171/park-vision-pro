import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CustomerInteractionScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Select Interaction Type</Text>
      <Text style={styles.subheading}>Choose the type of customer interaction you want to record</Text>

      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('ProductFeedback')}
      >
        <View style={styles.cardIconBox}>
          <Text style={styles.cardIcon}>💬</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Product Feedback</Text>
          <Text style={styles.cardDesc}>
            Record end-customer feedback on products — store, SKU, feedback type, contact details and photo evidence.
          </Text>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('BroadcastInitiative')}
      >
        <View style={[styles.cardIconBox, { backgroundColor: '#EEF2FF' }]}>
          <Text style={styles.cardIcon}>📣</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Broadcast Initiative</Text>
          <Text style={styles.cardDesc}>
            Record initiative broadcast participation — capture store, participant details and photo evidence.
          </Text>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    padding: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    marginTop: 8,
  },
  subheading: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 28,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  cardIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardIcon: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  cardArrow: {
    fontSize: 26,
    color: '#9CA3AF',
    marginLeft: 8,
  },
});
