import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import useAuthStore from '../store/auth';
import api from '../api/client';
import database from '../db/database';
import { Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import { pushRotaDrafts } from '../services/syncService';

// ── Shift definitions ───────────────────────────────────────────────────────

type ShiftType = 'General Shift' | 'Morning Shift' | 'Evening Shift' | 'Night Shift' | 'Holiday' | 'Week Off' | 'Leave';

interface ShiftConfig {
  label: string;
  color: string;
  defaultFrom?: string;
  defaultTo?: string;
  hasTime: boolean;
}

const SHIFTS: { type: ShiftType; cfg: ShiftConfig }[] = [
  { type: 'General Shift', cfg: { label: 'General Shift', color: '#22c55e', defaultFrom: '09:00', defaultTo: '18:00', hasTime: true } },
  { type: 'Morning Shift', cfg: { label: 'Morning Shift', color: '#3b82f6', defaultFrom: '06:00', defaultTo: '14:00', hasTime: true } },
  { type: 'Evening Shift', cfg: { label: 'Evening Shift', color: '#f59e0b', defaultFrom: '14:00', defaultTo: '22:00', hasTime: true } },
  { type: 'Night Shift',   cfg: { label: 'Night Shift',   color: '#6366f1', defaultFrom: '22:00', defaultTo: '06:00', hasTime: true } },
  { type: 'Holiday',       cfg: { label: 'Holiday',       color: '#ef4444', hasTime: false } },
  { type: 'Week Off',      cfg: { label: 'Week Off',      color: '#9ca3af', hasTime: false } },
  { type: 'Leave',         cfg: { label: 'Leave',         color: '#ef4444', hasTime: false } },
];

const SHIFT_MAP = Object.fromEntries(SHIFTS.map(({ type, cfg }) => [type, cfg])) as Record<ShiftType, ShiftConfig>;

const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface DayState {
  date: Date;
  shift: ShiftType | null;
  fromTime: string;
  toTime: string;
  dropdownOpen: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateFull(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function buildInitialDays(): DayState[] {
  const monday = getMonday(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { date: d, shift: null, fromTime: '', toTime: '', dropdownOpen: false };
  });
}

// ── Clock Time Picker (Material Design style, 24-hour, touch drag) ──────────

import { TextInput, PanResponder, GestureResponderEvent } from 'react-native';

const CLOCK_SIZE = 264;
const OUTER_RADIUS = 104;
const INNER_RADIUS = 68;
const CENTER = CLOCK_SIZE / 2;
const NUM_SIZE = 40;
const DOT_SIZE = 34;

function polarXY(index: number, total: number, radius: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

// Outer: 12,1,2,...,11  Inner: 00,13,14,...,23
const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function format12h(timeStr: string) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface ClockPickerProps {
  visible: boolean;
  initialValue: string; // "HH:MM"
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

function ClockPicker({ visible, initialValue, onConfirm, onCancel }: ClockPickerProps) {
  const [clockMode, setClockMode] = useState<'hour' | 'minute'>('hour');
  const [inputMode, setInputMode] = useState<'clock' | 'keyboard'>('clock');
  const [hour24, setHour24] = useState(9);
  const [minute, setMinute] = useState(0);
  const [hourText, setHourText] = useState('09');
  const [minuteText, setMinuteText] = useState('00');
  const clockRef = React.useRef<View>(null);
  const clockLayoutRef = React.useRef({ x: 0, y: 0 });

  const handleOpen = useCallback(() => {
    const parts = initialValue.split(':');
    const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? '9', 10)));
    const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10)));
    setHour24(h);
    setMinute(m);
    setHourText(String(h % 12 || 12).padStart(2, '0'));
    setMinuteText(String(m).padStart(2, '0'));
    setClockMode('hour');
    setInputMode('clock');
  }, [initialValue]);

  React.useEffect(() => {
    if (visible) handleOpen();
  }, [visible]);

  // Convert touch position to angle and value
  const getValueFromTouch = useCallback((pageX: number, pageY: number) => {
    const layout = clockLayoutRef.current;
    const dx = pageX - layout.x - CENTER;
    const dy = pageY - layout.y - CENTER;
    // Angle in degrees, 0 = top (12 o'clock), clockwise
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { angleDeg, dist };
  }, []);

  const handleTouchOnClock = useCallback((pageX: number, pageY: number, isEnd: boolean) => {
    const { angleDeg, dist } = getValueFromTouch(pageX, pageY);

    if (clockMode === 'hour') {
      const idx = Math.round(angleDeg / 30) % 12;
      const h12 = OUTER_HOURS[idx];
      setHour24((prev) => (h12 % 12) + (prev >= 12 ? 12 : 0));
      setHourText(String(h12).padStart(2, '0'));
      if (isEnd) {
        // After releasing on hour, switch to minute mode
        setTimeout(() => setClockMode('minute'), 200);
      }
    } else {
      // Minute: any value 0-59 (smooth dragging)
      const m = Math.round(angleDeg / 6) % 60;
      setMinute(m);
      setMinuteText(String(m).padStart(2, '0'));
    }
  }, [clockMode, getValueFromTouch]);

  const panResponder = React.useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        handleTouchOnClock(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        handleTouchOnClock(evt.nativeEvent.pageX, evt.nativeEvent.pageY, false);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        handleTouchOnClock(evt.nativeEvent.pageX, evt.nativeEvent.pageY, true);
      },
    }),
  [handleTouchOnClock]);

  const handleOk = () => {
    let h = hour24;
    let m = minute;
    if (inputMode === 'keyboard') {
      let h12 = parseInt(hourText, 10) || 0;
      h12 = Math.min(12, Math.max(1, h12));
      const isPM = hour24 >= 12;
      h = (h12 % 12) + (isPM ? 12 : 0);
      m = Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
    }
    onConfirm(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    setClockMode('hour');
    setInputMode('clock');
  };

  const handleCancel = () => {
    onCancel();
    setClockMode('hour');
    setInputMode('clock');
  };

  const h12 = hour24 % 12 || 12;
  const isPM = hour24 >= 12;
  const displayH = String(h12).padStart(2, '0');
  const displayM = String(minute).padStart(2, '0');

  // Compute hand angle (degrees from top, clockwise) and radius
  let handAngleDeg = 0;
  let handRadius = OUTER_RADIUS;
  if (clockMode === 'hour') {
    const idx = OUTER_HOURS.indexOf(h12);
    handAngleDeg = idx * 30; // 0-330
  } else {
    handRadius = OUTER_RADIUS;
    handAngleDeg = minute * 6; // 0-354
  }
  // Convert to math angle (from 3 o'clock, CCW) for x/y calculation
  const handRad = ((handAngleDeg - 90) * Math.PI) / 180;
  const handEndX = CENTER + handRadius * Math.cos(handRad);
  const handEndY = CENTER + handRadius * Math.sin(handRad);

  // Hand line: drawn via rotation from center
  const handLen = handRadius;
  const handRotateDeg = handAngleDeg; // rotation from 12 o'clock position

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={cp.overlay}>
        <View style={cp.picker}>
          {inputMode === 'clock' ? (
            <>
              {/* Header with time display */}
              <View style={cp.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setClockMode('hour')}>
                    <Text style={[cp.timeDigits, clockMode === 'hour' && cp.timeDigitsActive]}>{displayH}</Text>
                  </TouchableOpacity>
                  <Text style={cp.timeSep}>:</Text>
                  <TouchableOpacity onPress={() => setClockMode('minute')}>
                    <Text style={[cp.timeDigits, clockMode === 'minute' && cp.timeDigitsActive]}>{displayM}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginLeft: 16, justifyContent: 'center' }}>
                  <TouchableOpacity onPress={() => setHour24(isPM ? hour24 - 12 : hour24)}>
                    <Text style={[cp.amPmText, !isPM && cp.amPmTextActive]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setHour24(!isPM ? hour24 + 12 : hour24)}>
                    <Text style={[cp.amPmText, isPM && cp.amPmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Clock face with touch drag */}
              <View style={cp.clockWrap}>
                <View
                  ref={clockRef}
                  style={cp.clockFace}
                  onLayout={() => {
                    clockRef.current?.measureInWindow((x, y) => {
                      clockLayoutRef.current = { x, y };
                    });
                  }}
                  {...panResponder.panHandlers}
                >
                  {/* Center dot */}
                  <View style={[cp.centerDot, { left: CENTER - 4, top: CENTER - 4 }]} />

                  {/* Hand line from center pointing outward */}
                  <View
                    style={[
                      cp.handLine,
                      {
                        left: CENTER - 1,
                        top: CENTER - handLen,
                        width: 2,
                        height: handLen,
                        transform: [{ rotate: `${handRotateDeg}deg` }],
                      },
                    ]}
                  />

                  {/* Hand end dot */}
                  <View style={[cp.handDot, { left: handEndX - DOT_SIZE / 2, top: handEndY - DOT_SIZE / 2 }]}>
                    {/* Small white inner dot */}
                    <View style={cp.handDotInner} />
                  </View>

                  {/* Hour mode: 12-hour ring (1-12) */}
                  {clockMode === 'hour' && (
                    <>
                      {OUTER_HOURS.map((h, i) => {
                        const pos = polarXY(i, 12, OUTER_RADIUS);
                        const isSelected = h12 === h;
                        return (
                          <View
                            key={`o${h}`}
                            style={[cp.numBtn, { left: pos.x - NUM_SIZE / 2, top: pos.y - NUM_SIZE / 2 }]}
                            pointerEvents="none"
                          >
                            <Text style={[cp.numText, isSelected && cp.numTextSelected]}>{h}</Text>
                          </View>
                        );
                      })}
                    </>
                  )}

                  {/* Minute mode: labels 00,05,...,55 but hand can point anywhere 0-59 */}
                  {clockMode === 'minute' && (
                    <>
                      {MINUTE_LABELS.map((m, i) => {
                        const pos = polarXY(i, 12, OUTER_RADIUS);
                        const isSelected = minute === m;
                        return (
                          <View
                            key={`m${m}`}
                            style={[cp.numBtn, { left: pos.x - NUM_SIZE / 2, top: pos.y - NUM_SIZE / 2 }]}
                            pointerEvents="none"
                          >
                            <Text style={[cp.numText, isSelected && cp.numTextSelected]}>
                              {String(m).padStart(2, '0')}
                            </Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                </View>
              </View>
            </>
          ) : (
            /* Keyboard input mode */
            <View style={cp.keyboardMode}>
              <Text style={cp.kbTitle}>Set time</Text>
              <Text style={cp.kbSubtitle}>Type in time</Text>
              <View style={cp.kbInputRow}>
                <View style={cp.kbInputWrap}>
                  <TextInput
                    style={cp.kbInput}
                    value={hourText}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      setHourText(cleaned);
                      const n = parseInt(cleaned, 10);
                      if (!isNaN(n) && n >= 0 && n <= 23) setHour24(n);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    selectTextOnFocus
                  />
                  <Text style={cp.kbInputLabel}>hour</Text>
                </View>
                <Text style={cp.kbColon}>:</Text>
                <View style={cp.kbInputWrap}>
                  <TextInput
                    style={cp.kbInput}
                    value={minuteText}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                      setMinuteText(cleaned);
                      const n = parseInt(cleaned, 10);
                      if (!isNaN(n) && n >= 0 && n <= 59) setMinute(n);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    selectTextOnFocus
                  />
                  <Text style={cp.kbInputLabel}>minute</Text>
                </View>
              </View>
            </View>
          )}

          {/* Bottom row: toggle icon + Cancel/OK */}
          <View style={cp.btnRow}>
            <TouchableOpacity
              style={cp.toggleBtn}
              onPress={() => {
                if (inputMode === 'clock') {
                  setHourText(String(h12).padStart(2, '0'));
                  setMinuteText(String(minute).padStart(2, '0'));
                  setInputMode('keyboard');
                } else {
                  let h = parseInt(hourText, 10);
                  const m = parseInt(minuteText, 10);
                  if (!isNaN(h)) {
                    h = Math.min(12, Math.max(1, h));
                    setHour24((h % 12) + (isPM ? 12 : 0));
                  }
                  if (!isNaN(m)) setMinute(Math.min(59, Math.max(0, m)));
                  setInputMode('clock');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={cp.toggleIcon}>{inputMode === 'clock' ? '⌨' : '🕐'}</Text>
            </TouchableOpacity>
            <View style={cp.btnRight}>
              <TouchableOpacity style={cp.actionBtn} onPress={handleCancel}>
                <Text style={cp.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cp.actionBtn} onPress={handleOk}>
                <Text style={cp.okText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cp = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  picker: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    width: CLOCK_SIZE + 56,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  header: {
    backgroundColor: '#37375F', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, paddingHorizontal: 24,
  },
  timeDigits: { fontSize: 52, fontWeight: '300', color: 'rgba(255,255,255,0.45)' },
  timeDigitsActive: { color: '#FFFFFF' },
  timeSep: { fontSize: 52, fontWeight: '300', color: 'rgba(255,255,255,0.7)', marginHorizontal: 2 },
  amPmText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.45)', paddingVertical: 4 },
  amPmTextActive: { color: '#FFFFFF' },
  clockWrap: { paddingVertical: 20, alignItems: 'center' },
  clockFace: {
    width: CLOCK_SIZE, height: CLOCK_SIZE,
    borderRadius: CLOCK_SIZE / 2,
    backgroundColor: '#EEEEF5',
    position: 'relative',
  },
  centerDot: {
    position: 'absolute', width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#37375F', zIndex: 10,
  },
  handLine: {
    position: 'absolute',
    backgroundColor: '#37375F',
    zIndex: 5,
    transformOrigin: 'bottom center',
  },
  handDot: {
    position: 'absolute', width: DOT_SIZE, height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2, backgroundColor: '#37375F',
    zIndex: 6, alignItems: 'center', justifyContent: 'center',
  },
  handDotInner: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF',
  },
  numBtn: {
    position: 'absolute', width: NUM_SIZE, height: NUM_SIZE,
    borderRadius: NUM_SIZE / 2, alignItems: 'center', justifyContent: 'center',
    zIndex: 8,
  },
  numText: { fontSize: 16, color: '#37375F', fontWeight: '500' },
  numTextInner: { fontSize: 13, color: '#6B7280', fontWeight: '400' },
  numTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  // Keyboard input mode
  keyboardMode: { padding: 24, paddingBottom: 16 },
  kbTitle: { fontSize: 22, fontWeight: '600', color: '#37375F', marginBottom: 4 },
  kbSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  kbInputRow: { flexDirection: 'row', alignItems: 'flex-start' },
  kbInputWrap: { alignItems: 'center' },
  kbInput: {
    fontSize: 36, fontWeight: '300', color: '#37375F',
    borderBottomWidth: 2, borderBottomColor: '#37375F',
    width: 80, textAlign: 'center', paddingVertical: 4,
  },
  kbInputLabel: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  kbColon: { fontSize: 36, fontWeight: '300', color: '#37375F', marginHorizontal: 8, marginTop: 4 },
  // Bottom buttons
  btnRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  toggleBtn: { padding: 8 },
  toggleIcon: { fontSize: 22 },
  btnRight: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#37375F' },
  okText: { fontSize: 15, fontWeight: '600', color: '#37375F' },
});

// ── Main Screen ──────────────────────────────────────────────────────────────

interface ClockTarget { dayIndex: number; field: 'fromTime' | 'toTime'; }

export default function RotaCreateScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [days, setDays] = useState<DayState[]>(buildInitialDays);
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [clockTarget, setClockTarget] = useState<ClockTarget | null>(null);
  const [clockInitVal, setClockInitVal] = useState('09:00');

  const openDropdown = useCallback((index: number) => {
    setDays((prev) => prev.map((d, i) => ({ ...d, dropdownOpen: i === index ? !d.dropdownOpen : false })));
  }, []);

  const selectShift = useCallback((index: number, shift: ShiftType | null) => {
    if (shift === null) {
      setDays((prev) => prev.map((d, i) =>
        i === index ? { ...d, shift: null, fromTime: '', toTime: '', dropdownOpen: false } : d,
      ));
      return;
    }
    const cfg = SHIFT_MAP[shift];
    setDays((prev) => prev.map((d, i) => {
      if (i !== index) return d;
      return {
        ...d, shift,
        fromTime: cfg.hasTime ? (cfg.defaultFrom ?? '') : '',
        toTime: cfg.hasTime ? (cfg.defaultTo ?? '') : '',
        dropdownOpen: false,
      };
    }));
  }, []);

  const openClock = (dayIndex: number, field: 'fromTime' | 'toTime') => {
    const current = field === 'fromTime' ? days[dayIndex].fromTime : days[dayIndex].toTime;
    setClockInitVal(current || '09:00');
    setClockTarget({ dayIndex, field });
  };

  const handleClockConfirm = (time: string) => {
    if (!clockTarget) return;
    setDays((prev) => prev.map((d, i) =>
      i === clockTarget.dayIndex ? { ...d, [clockTarget.field]: time } : d,
    ));
    setClockTarget(null);
  };

  const handleSubmit = async () => {
    const missingDays = days
      .map((d, i) => ({ index: i, shift: d.shift }))
      .filter((d) => d.shift === null);
    if (missingDays.length > 0) {
      Alert.alert(
        'All Days Required',
        'Please select a shift for all 7 days before submitting.',
      );
      return;
    }
    const userCode = user?.code;
    if (!userCode) {
      Alert.alert('Error', 'User not found. Please log in again.');
      return;
    }

    // Once-per-week rule: check if rota was already submitted for this week.
    // Ask the SERVER (not local DB) — local WatermelonDB gets wiped on app
    // reinstall, so a local-only check lets the same user resubmit after
    // reinstall. The server is the source of truth across installs.
    const monday = getMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayStr = formatDateISO(monday);
    const sundayStr = formatDateISO(sunday);

    try {
      const { data } = await api.get('/rota', {
        params: { userCode, from: mondayStr, to: sundayStr, pageSize: 10 },
        timeout: 15_000,
      });
      const serverRows: any[] = data?.data ?? data?.rotas ?? [];
      if (serverRows.length > 0) {
        Alert.alert(
          'Alert !',
          `Rota has already been created for this week (${mondayStr} to ${sundayStr}). You can only create rota once per week.`,
        );
        return;
      }
    } catch (e: any) {
      // If we couldn't reach the server, fall back to the local check so an
      // offline user isn't blocked from first-time submission. This keeps the
      // offline flow working while still enforcing the rule in the normal
      // online reinstall scenario.
      console.warn('[Rota] Server week-check failed, falling back to local:', e?.message);
      try {
        const localExisting: any[] = await database.get('rota_drafts').query(
          Q.where('user_code', userCode),
          Q.where('rota_date', Q.gte(mondayStr)),
          Q.where('rota_date', Q.lte(sundayStr)),
        ).fetch();
        if (localExisting.length > 0) {
          Alert.alert(
            'Alert !',
            `Rota has already been created for this week (${mondayStr} to ${sundayStr}). You can only create rota once per week.`,
          );
          return;
        }
      } catch { /* proceed to submit if local check also errors */ }
    }

    setSaving(true);
    try {
      const payload = days
        .filter((d) => d.shift !== null)
        .map((d) => ({
          userCode,
          activityName: d.shift,
          rotaDate: formatDateISO(d.date),
          ...(d.fromTime ? { startTime: d.fromTime } : {}),
          ...(d.toTime ? { endTime: d.toTime } : {}),
        }));
      // Offline-first: write every day's rota to the local rota_drafts table
      // first, then fire a best-effort push. If the device is offline the
      // drafts stay with is_synced=false and get flushed by backgroundSync
      // the moment connectivity returns.
      await database.write(async () => {
        for (const p of payload) {
          // Upsert by (user_code, rota_date) so re-submitting the same week
          // doesn't create duplicates locally.
          const existing: any[] = await database.get('rota_drafts').query(
            Q.where('user_code', p.userCode),
            Q.where('rota_date', p.rotaDate),
          ).fetch();
          if (existing.length > 0) {
            await existing[0].update((rec: any) => {
              rec.activityName = p.activityName;
              rec.startTime = (p as any).startTime ?? null;
              rec.endTime = (p as any).endTime ?? null;
              rec.createdBy = userCode;
              rec.isSynced = false;
            });
          } else {
            await database.get('rota_drafts').create((rec: any) => {
              rec._raw.id = uuidv4();
              rec.appTrxId = uuidv4();
              rec.userCode = p.userCode;
              rec.activityName = p.activityName;
              rec.rotaDate = p.rotaDate;
              rec.startTime = (p as any).startTime ?? null;
              rec.endTime = (p as any).endTime ?? null;
              rec.createdBy = userCode;
              rec.isSynced = false;
            });
          }
        }
      });

      // Push immediately so the user gets real-time feedback on server-side
      // rejections (e.g. once-per-week rule). Scoped to the current user so
      // stale drafts left behind by a previous account don't leak their
      // rejection messages into this session. Reconnect flush still retries
      // genuine transient failures.
      try {
        const pushRes = await pushRotaDrafts(user?.code);
        if (pushRes.reasons && pushRes.reasons.length > 0) {
          Alert.alert('Rota Not Saved', pushRes.reasons[0]);
          return;
        }
      } catch { /* transient — reconnect flush will retry */ }

      setSuccessVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.wrapper}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.pageTitle}>My ROTA Creation</Text>

        <View style={s.card}>
          <Text style={s.daysLabel}>Days</Text>

          {days.map((day, index) => {
            const cfg = day.shift ? SHIFT_MAP[day.shift] : null;
            const dayName = FULL_DAY_NAMES[index];

            return (
              <View key={index}>
                <View style={s.dayBox}>
                  {/* Day row */}
                  <View style={s.dayRow}>
                    <Text style={s.dayText}>
                      {formatDateFull(day.date)} ({dayName})
                    </Text>
                    <TouchableOpacity
                      style={s.selectBtn}
                      onPress={() => openDropdown(index)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.selectBtnText} numberOfLines={1}>
                        {day.shift ?? 'Select'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Time inputs */}
                  {cfg && cfg.hasTime && (
                    <View style={s.timeRow}>
                      <TouchableOpacity style={s.timeBox} onPress={() => openClock(index, 'fromTime')} activeOpacity={0.7}>
                        <Text style={[s.timeVal, !day.fromTime && s.timePlaceholder]}>
                          {day.fromTime ? format12h(day.fromTime) : 'From Time'}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ width: 12 }} />
                      <TouchableOpacity style={s.timeBox} onPress={() => openClock(index, 'toTime')} activeOpacity={0.7}>
                        <Text style={[s.timeVal, !day.toTime && s.timePlaceholder]}>
                          {day.toTime ? format12h(day.toTime) : 'To Time'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Inline dropdown */}
                  {day.dropdownOpen && (
                    <View style={s.dropdownMenu}>
                      {/* "Select" to clear */}
                      <TouchableOpacity
                        style={s.dropdownItem}
                        onPress={() => selectShift(index, null)}
                      >
                        <Text style={[s.dropdownItemText, !day.shift && s.dropdownItemTextActive]}>
                          Select
                        </Text>
                      </TouchableOpacity>
                      {SHIFTS.map(({ type, cfg: scfg }) => (
                        <TouchableOpacity
                          key={type}
                          style={s.dropdownItem}
                          onPress={() => selectShift(index, type)}
                        >
                          <Text style={[s.dropdownItemText, day.shift === type && s.dropdownItemTextActive]}>
                            {scfg.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                {index < 6 && <View style={s.divider} />}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.cancelBtn}
          onPress={() => {
            // Cancel returns to the home page and opens the side drawer
            // (hamburger menu) so the user immediately sees the menu with
            // Rota Creation listed/highlighted instead of being dropped into
            // a different screen.
            navigation.navigate('MainTabs', { openDrawer: 'RotaCreate' });
          }}
          activeOpacity={0.7}
        >
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.submitBtn, saving && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.submitBtnText}>Submit</Text>}
        </TouchableOpacity>
      </View>

      {/* Clock Picker */}
      <ClockPicker
        visible={clockTarget !== null}
        initialValue={clockInitVal}
        onConfirm={handleClockConfirm}
        onCancel={() => setClockTarget(null)}
      />

      {/* Success Dialog */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={s.successOverlay}>
          <View style={s.successBox}>
            <Text style={s.successTitle}>Success</Text>
            <Text style={s.successMsg}>Rota Created Successfully</Text>
            <TouchableOpacity
              style={s.successOkBtn}
              onPress={() => { setSuccessVisible(false); navigation.goBack(); }}
              activeOpacity={0.85}
            >
              <Text style={s.successOkText}>Ok</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 16 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  daysLabel: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },

  dayBox: { paddingVertical: 4 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 10,
  },
  dayText: { fontSize: 14, color: '#111827', flex: 1, marginRight: 12 },
  selectBtn: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#FFFFFF', minWidth: 110, alignItems: 'center',
  },
  selectBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  timeRow: { flexDirection: 'row', paddingBottom: 10 },
  timeBox: {
    flex: 1, height: 44, borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  timeVal: { fontSize: 15, color: '#111827' },
  timePlaceholder: { color: '#9CA3AF' },

  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    marginBottom: 8, marginLeft: 'auto',
    width: 180,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  dropdownItem: {
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: { fontSize: 15, color: '#374151' },
  dropdownItemTextActive: { color: '#1a56db', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#F3F4F6' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 12,
  },
  cancelBtn: {
    flex: 1, height: 52, borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  submitBtn: {
    flex: 2, height: 52, borderRadius: 10,
    backgroundColor: '#1a3fa0',
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  successOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  successBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#1a3fa0', padding: 20, paddingBottom: 8 },
  successMsg: { fontSize: 15, color: '#6B7280', paddingHorizontal: 20, paddingBottom: 20 },
  successOkBtn: {
    backgroundColor: '#1a3fa0', height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  successOkText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
