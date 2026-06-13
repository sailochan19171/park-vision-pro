import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';

const TRAINING_MODULES = [
  { title: 'Product Knowledge', desc: 'Learn about Farmley product range, ingredients & USPs', icon: 'package-variant', available: false },
  { title: 'Sales Techniques', desc: 'Effective selling & negotiation at retail counters', icon: 'target', available: false },
  { title: 'Store Merchandising', desc: 'Planogram standards and shelf execution guidelines', icon: 'store-outline', available: false },
  { title: 'Brand Guidelines', desc: 'Visual identity, dos & don\'ts, brand positioning', icon: 'star-outline', available: false },
  { title: 'Digital Tools', desc: 'How to use Farmley SFA for maximum efficiency', icon: 'cellphone-check', available: false },
];

export default function BrandTrainingScreen() {
  const navigation = useNavigation<any>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Banner */}
      <View style={styles.banner}>
        <MCIcon name="school-outline" size={48} color="#FFFFFF" style={{ marginBottom: 12 }} />
        <Text style={styles.bannerTitle}>Brand Training</Text>
        <Text style={styles.bannerSubtitle}>
          Enhance your skills and knowledge with curated training modules
        </Text>
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>COMING SOON</Text>
        </View>
      </View>

      {/* Modules */}
      <Text style={styles.sectionTitle}>TRAINING MODULES</Text>
      {TRAINING_MODULES.map((m, i) => (
        <View key={i} style={styles.moduleCard}>
          <View style={styles.moduleIconBox}>
            <MCIcon name={m.icon} size={24} color="#1a56db" />
          </View>
          <View style={styles.moduleInfo}>
            <Text style={styles.moduleTitle}>{m.title}</Text>
            <Text style={styles.moduleDesc}>{m.desc}</Text>
          </View>
          <Icon name="lock-closed" size={18} color="#9CA3AF" />
        </View>
      ))}

      <Text style={styles.note}>
        Training modules will be available in the next release. Contact your manager for offline training materials.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  banner: {
    backgroundColor: '#1a56db',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  comingSoonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  moduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    opacity: 0.7,
  },
  moduleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EBF0FF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  moduleInfo: { flex: 1 },
  moduleTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  moduleDesc: { fontSize: 12, color: '#6B7280', lineHeight: 16 },
  note: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
