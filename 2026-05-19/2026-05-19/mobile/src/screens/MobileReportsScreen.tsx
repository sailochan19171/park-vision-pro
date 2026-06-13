import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

interface ReportTile {
  label: string;
  icon: string;
  screen?: string;
  description: string;
}

const REPORT_TILES: ReportTile[] = [
  {
    label: 'Daily Stock &\nSale Report',
    icon: 'cube-outline',
    screen: 'DailyStockSaleReport',
    description: 'Daily stock and sales summary',
  },
  {
    label: 'Store User\nVisit Report',
    icon: 'storefront-outline',
    screen: 'StoreUserVisitReport',
    description: 'Store-wise visit details',
  },
  {
    label: 'User Journey\nAttendance',
    icon: 'map-outline',
    screen: 'UserJourneyAttendance',
    description: 'Journey plan attendance',
  },
  {
    label: 'User Wise\nAttendance',
    icon: 'person-outline',
    screen: 'UserWiseAttendance',
    description: 'Attendance by user',
  },
  {
    label: 'Task Done\nStatus Report',
    icon: 'checkmark-done-outline',
    screen: 'TaskDoneStatusReport',
    description: 'Completed task status',
  },
];

export default function MobileReportsScreen() {
  const navigation = useNavigation<any>();
  const [tapping, setTapping] = React.useState<string | null>(null);

  const handleTileTap = (screen?: string) => {
    if (!screen || tapping) return;
    setTapping(screen);
    // Navigate immediately — the tiny delay lets the press visual register
    requestAnimationFrame(() => {
      navigation.navigate(screen);
      setTimeout(() => setTapping(null), 500);
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      <View style={styles.banner}>
        <Icon name="phone-portrait-outline" size={28} color="#FFFFFF" />
        <Text style={styles.bannerTitle}>Mobile Reports</Text>
        <Text style={styles.bannerSub}>Select a report to view</Text>
      </View>

      {/* Tiles Grid */}
      <View style={styles.grid}>
        {REPORT_TILES.map((tile, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.tile, tapping === tile.screen && { opacity: 0.6 }]}
            activeOpacity={0.6}
            onPress={() => handleTileTap(tile.screen)}
            disabled={!!tapping}
          >
            <Icon name={tile.icon} size={30} color="#374151" />
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileDesc}>{tile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  banner: {
    backgroundColor: '#1a56db',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#1a56db',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  bannerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '47.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 130,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  tileIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  tileDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 15,
  },
});
