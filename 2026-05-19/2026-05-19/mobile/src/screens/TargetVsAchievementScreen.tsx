import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import Svg, { Path, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '../db/database';
import useAuthStore from '../store/auth';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Simple Dropdown ────────────────────────────────────────────────────────
function Dropdown<T extends string | number>({
  label,
  items,
  selectedValue,
  onSelect,
  renderLabel,
}: {
  label: string;
  items: T[];
  selectedValue: T;
  onSelect: (val: T) => void;
  renderLabel: (val: T) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={dropStyles.col}>
      <Text style={dropStyles.label}>{label}</Text>
      <TouchableOpacity style={dropStyles.box} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={dropStyles.value}>{renderLabel(selectedValue)}</Text>
        <Text style={dropStyles.chevron}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={dropStyles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={dropStyles.listContainer}>
            <FlatList
              data={items}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[dropStyles.listItem, item === selectedValue && dropStyles.listItemSelected]}
                  onPress={() => { onSelect(item); setOpen(false); }}
                >
                  <Text style={[dropStyles.listText, item === selectedValue && dropStyles.listTextSelected]}>
                    {renderLabel(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const dropStyles = StyleSheet.create({
  col: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 6 },
  box: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    backgroundColor: '#F9FAFB', height: 48, paddingHorizontal: 14,
  },
  value: { fontSize: 15, color: '#374151' },
  chevron: { fontSize: 12, color: '#6B7280' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 40 },
  listContainer: { backgroundColor: '#FFF', borderRadius: 12, maxHeight: 350, overflow: 'hidden' },
  listItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  listItemSelected: { backgroundColor: '#EEF2FF' },
  listText: { fontSize: 16, color: '#374151' },
  listTextSelected: { color: '#1a56db', fontWeight: '700' },
});

// ─── Half-Circle Gauge Chart ────────────────────────────────────────────────

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function GaugeChart({
  percentage,
  achieved,
  target,
}: {
  percentage: number;
  achieved: number;
  target: number;
}) {
  const size = SCREEN_WIDTH * 0.85;
  const svgH = size * 0.65;
  const cx = size / 2;
  const cy = size * 0.55;
  const pct = Math.min(100, Math.max(0, percentage));
  const remaining = Math.max(0, target - achieved);

  // Arc angles: 180° to 360° (left to right, bottom open)
  const START = -90;  // left end (9 o'clock)
  const END = 90;     // right end (3 o'clock)
  const SWEEP = END - START; // 180°

  // Three concentric arcs
  const outerR = size / 2 - 20;
  const midR = size / 2 - 52;
  const innerR = size / 2 - 82;

  // Outer blue arc: always full semicircle (target)
  const outerBgPath = describeArc(cx, cy, outerR, START, END);
  // Middle red arc: proportional to achieved %
  const achievedAngle = START + (SWEEP * pct) / 100;
  const midBgPath = describeArc(cx, cy, midR, START, END);
  const midFillPath = pct > 0 ? describeArc(cx, cy, midR, START, Math.min(achievedAngle, END)) : '';
  // Inner arc: background only
  const innerBgPath = describeArc(cx, cy, innerR, START, END);

  return (
    <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
      <Svg width={size} height={svgH}>
        {/* Outer ring - bg */}
        <Path d={outerBgPath} fill="none" stroke="#D4DEFF" strokeWidth={22} strokeLinecap="round" />
        {/* Outer ring - blue fill (full = target) */}
        <Path d={outerBgPath} fill="none" stroke="#1a3c8f" strokeWidth={22} strokeLinecap="round" />

        {/* Middle ring - bg */}
        <Path d={midBgPath} fill="none" stroke="#FEE2E2" strokeWidth={22} strokeLinecap="round" />
        {/* Middle ring - red fill (achieved %) */}
        {pct > 0 && (
          <Path d={midFillPath} fill="none" stroke="#DC2626" strokeWidth={22} strokeLinecap="round" />
        )}

        {/* Inner ring - light bg */}
        <Path d={innerBgPath} fill="none" stroke="#E8EAF0" strokeWidth={16} strokeLinecap="round" />

        {/* Center percentage text */}
        <SvgText x={cx} y={cy - 12} textAnchor="middle" fontSize={40} fontWeight="bold" fill="#2ecc71">
          {Math.round(pct)}%
        </SvgText>
        <SvgText x={cx} y={cy + 12} textAnchor="middle" fontSize={14} fontWeight="600" fill="#2ecc71">
          Achieved
        </SvgText>
      </Svg>

      {/* Values below the gauge arcs */}
      <View style={gaugeValStyles.row}>
        <Text style={[gaugeValStyles.val, { color: '#1a3c8f' }]}>{remaining.toFixed(1)}</Text>
        <Text style={[gaugeValStyles.val, { color: '#DC2626' }]}>{achieved.toFixed(1)}</Text>
        <Text style={[gaugeValStyles.val, { color: '#1a3c8f' }]}>{target.toFixed(1)}</Text>
      </View>
    </View>
  );
}

const gaugeValStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '85%', marginTop: -8,
  },
  val: { fontSize: 14, fontWeight: '700' },
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function TargetVsAchievementScreen() {
  const user = useAuthStore((s) => s.user);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [achievement, setAchievement] = useState({ visits: 0, orders: 0, revenue: 0 });
  const [totalTarget, setTotalTarget] = useState(0);
  const [totalAchieved, setTotalAchieved] = useState(0);

  const monthLabel = `${MONTHS[selectedMonth]}-${selectedYear}`;

  const years: number[] = [];
  for (let y = 2024; y <= now.getFullYear() + 1; y++) years.push(y);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0).getTime();
      const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).getTime();

      // Scope to the currently signed-in user. The local DB can hold a
      // previous user's rows (logout does not wipe WatermelonDB) so an
      // unfiltered query would surface their work as this user's stats.
      const userCode = user?.code ?? '';
      const [ordersResult, visitsResult, storeChecksResult] = await Promise.all([
        database.get('orders').query(
          Q.where('user_code', userCode),
          Q.where('trx_date', Q.gte(start)),
          Q.where('trx_date', Q.lte(end)),
        ).fetch(),
        database.get('customer_visits').query(
          Q.where('user_code', userCode),
          Q.where('checkin_time', Q.gte(start)),
          Q.where('checkin_time', Q.lte(end)),
        ).fetch(),
        database.get('store_checks').query(
          Q.where('user_code', userCode),
          Q.where('check_date', Q.gte(start)),
          Q.where('check_date', Q.lte(end)),
        ).fetch(),
      ]);

      const orders = ordersResult as any[];
      const revenue = orders.reduce((sum, o) => sum + (o.totalAmount ?? o._raw?.total_amount ?? 0), 0);
      const visits = (visitsResult as any[]).length + (storeChecksResult as any[]).length;

      setAchievement({ orders: orders.length, revenue, visits });

      // Read real targets from AsyncStorage (synced from server every 15s)
      const month = selectedMonth + 1;
      const year = selectedYear;
      let sumTarget = 0;
      let sumAchieved = 0;
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const targetKeys = allKeys.filter(k => k.startsWith('target_') && k.endsWith(`_${month}_${year}`));
        const targetValues = await AsyncStorage.multiGet(targetKeys);
        for (const [, val] of targetValues) {
          if (val) {
            const t = JSON.parse(val);
            sumTarget += t.targetAmount ?? 0;
            sumAchieved += t.achievedAmount ?? 0;
          }
        }
      } catch (e) { console.warn("[App]", e); }
      setTotalTarget(sumTarget);
      setTotalAchieved(sumAchieved > 0 ? sumAchieved : revenue);
    } catch (err) {
      console.warn('[Target] Load error:', err);
      setAchievement({ visits: 0, orders: 0, revenue: 0 });
    }

    setLoading(false);
  }, [selectedMonth, selectedYear]);

  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData]),
  );

  const achievedPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>My Target</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.monthYearLabel}>{monthLabel}</Text>

        <View style={styles.pickerRow}>
          <Dropdown
            label="Month Selection"
            items={MONTHS.map((_, i) => i)}
            selectedValue={selectedMonth}
            onSelect={setSelectedMonth}
            renderLabel={(i) => MONTHS[i]}
          />
          <View style={{ width: 12 }} />
          <Dropdown
            label="Year Selection"
            items={years}
            selectedValue={selectedYear}
            onSelect={setSelectedYear}
            renderLabel={(y) => String(y)}
          />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1a56db" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <GaugeChart
            percentage={achievedPct}
            achieved={totalAchieved}
            target={totalTarget}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerBar: { backgroundColor: '#1a3c8f', paddingVertical: 14, paddingHorizontal: 20 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  monthYearLabel: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 8 },
  pickerRow: { flexDirection: 'row', marginBottom: 8 },
  loadingContainer: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { fontSize: 15, color: '#6B7280' },
});
