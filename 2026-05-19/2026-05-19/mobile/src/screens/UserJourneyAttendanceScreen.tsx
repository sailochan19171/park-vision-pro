import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import useAuthStore from '../store/auth';
import api from '../api/client';

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

interface AttRow {
  month: string; userCode: string; userName: string; totalDays: number;
  actualWorkingDays: number; leave: number; holiday: number;
  weekOff: number; absent: number; workingMins: number;
}

function fmtWorkTime(mins: number): string {
  if (!mins || mins <= 0) return '0h 0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
interface Group { key: string; label: string; rows: AttRow[]; }

export default function UserJourneyAttendanceScreen() {
  const user = useAuthStore((s) => s.user);
  const [month, setMonth] = useState(currentMonthStr());
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftMonth, setDraftMonth] = useState(currentMonthStr());

  const loadData = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const totalDays = daysInMonth(m);

      // BACKEND-FIRST: pull the hierarchy-scoped attendance so a Team Leader
      // sees the merchandisers / promoters assigned to them (the local
      // attendance table only holds THIS rep's own rows, which is why a TL saw
      // only themselves). Rows are grouped by reports_to → each Team Leader card
      // lists its team members. Falls back to the local read below when offline.
      try {
        const dateFrom = `${m}-01`;
        const dateTo = `${m}-${String(totalDays).padStart(2, '0')}`;
        const { data } = await api.get('/reports/user-journey-attendance', { params: { dateFrom, dateTo } });
        const rows: any[] = Array.isArray(data?.data) ? data.data : [];
        if (rows.length > 0) {
          const gmap = new Map<string, Group>();
          for (const r of rows) {
            const tlCode = r.reportsTo || 'unassigned';
            const tlName = r.reportsToName || tlCode;
            if (!gmap.has(tlCode)) gmap.set(tlCode, { key: tlCode, label: `[${tlCode}] ${tlName}`, rows: [] });
            gmap.get(tlCode)!.rows.push({
              month: m, userCode: r.userCode, userName: r.userName ?? r.userCode,
              totalDays: Number(r.totalDays ?? 0),
              actualWorkingDays: Number(r.presentDays ?? 0),
              leave: Number(r.leaveDays ?? 0),
              holiday: Number(r.holidayDays ?? 0),
              weekOff: Number(r.weekOffDays ?? 0),
              absent: Number(r.absentDays ?? 0),
              workingMins: Number(r.workingMins ?? 0),
            });
          }
          const res = Array.from(gmap.values());
          setGroups(res);
          setExpanded(new Set(res.map((g) => g.key)));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[UserJourneyAttendance] backend fetch failed, using local:', e);
      }

      const records: any[] = await database.get('attendance_records')
        .query(Q.where('attendance_date', Q.like(`${m}%`)))
        .fetch();

      const groupMap = new Map<string, { userCode: string; dates: Set<string> }>();
      for (const r of records) {
        if (!r.isPresent) continue;
        if (!groupMap.has(r.userCode)) {
          groupMap.set(r.userCode, { userCode: r.userCode, dates: new Set() });
        }
        groupMap.get(r.userCode)!.dates.add(r.attendanceDate);
      }

      const result: Group[] = [];
      for (const [userCode, data] of groupMap) {
        const row: AttRow = {
          month: m, userCode,
          userName: userCode === user?.code ? (user?.name ?? userCode) : userCode,
          totalDays,
          actualWorkingDays: data.dates.size, leave: 0, holiday: 0,
          weekOff: 0, absent: 0, workingMins: 0,
        };
        const gk = userCode;
        result.push({ key: gk, label: `[${userCode}] ${userCode}`, rows: [row] });
      }

      // If no records but user exists, show current user with zeros
      if (result.length === 0 && user?.code) {
        result.push({
          key: user.code,
          label: `[${user.code}] ${user.name ?? user.code}`,
          rows: [{ month: m, userCode: user.code, userName: user.name ?? user.code, totalDays, actualWorkingDays: 0, leave: 0, holiday: 0, weekOff: 0, absent: 0, workingMins: 0 }],
        });
      }

      setGroups(result);
      setExpanded(new Set(result.map((g) => g.key)));
    } catch (err) {
      console.error('UserJourneyAttendance error:', err);
    } finally { setLoading(false); }
  }, [user?.code]);

  React.useEffect(() => { loadData(month); }, []);

  // Real-time: refresh whenever the screen regains focus so the report
  // reflects new attendance/visit data without a manual filter apply.
  useFocusEffect(
    useCallback(() => { loadData(month); }, [month, loadData])
  );

  const applyFilter = () => {
    setMonth(draftMonth); setFilterVisible(false); loadData(draftMonth);
  };
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.title}>User Journey Attendance Report</Text>
          <TouchableOpacity style={s.filterBtn} onPress={() => { setDraftMonth(month); setFilterVisible(true); }}>
            <Text style={s.filterBtnText}>Filters</Text>
          </TouchableOpacity>
        </View>

        <View style={s.criteriaBox}>
          <Text style={s.criteriaText}>
            <Text style={s.bold}>Search Criteria: </Text>
            <Text style={s.bold}>Start Month: </Text>{month}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" size="large" />
        ) : groups.length === 0 ? (
          <View style={s.emptyBox}><Text style={s.emptyText}>No attendance data found</Text></View>
        ) : groups.map((group) => {
          const isOpen = expanded.has(group.key);
          return (
            <View key={group.key} style={s.card}>
              <TouchableOpacity style={s.cardHeader} onPress={() => toggle(group.key)} activeOpacity={0.8}>
                <Text style={s.cardHeaderText}>{group.label}</Text>
                <Text style={s.arrow}>{isOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {isOpen && (
                <View>
                  <Text style={s.recCount}>User Journey Records ({group.rows.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View>
                      <View style={s.tableHeader}>
                        {['Month', 'User Name', 'User Code', 'Total Days', 'Actual Working Days', 'Leave', 'Holiday', 'Week Off', 'Absent', 'Total Working Time'].map((h) => (
                          <Text key={h} style={[s.thCell, (h === 'Actual Working Days' || h === 'Total Working Time') && { width: 110 }]}>{h}</Text>
                        ))}
                      </View>
                      {group.rows.map((row, i) => (
                        <View key={i} style={s.tableRow}>
                          <Text style={s.tdCell}>{row.month}</Text>
                          <Text style={s.tdCell}>{row.userName}</Text>
                          <Text style={s.tdCell}>{row.userCode}</Text>
                          <Text style={s.tdCell}>{row.totalDays}</Text>
                          <Text style={[s.tdCell, { width: 110 }]}>{row.actualWorkingDays}</Text>
                          <Text style={s.tdCell}>{row.leave}</Text>
                          <Text style={s.tdCell}>{row.holiday}</Text>
                          <Text style={s.tdCell}>{row.weekOff}</Text>
                          <Text style={s.tdCell}>{row.absent}</Text>
                          <Text style={[s.tdCell, { width: 110 }]}>{fmtWorkTime(row.workingMins)}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Month Filter Modal with month picker */}
      <Modal visible={filterVisible} animationType="slide" transparent onRequestClose={() => setFilterVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Select Month</Text>
            <MonthPicker value={draftMonth} onChange={setDraftMonth} />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setFilterVisible(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalApply} onPress={applyFilter}>
                <Text style={s.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const COL = 90;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = (value || '2026-01').split('-').map(Number);
  const [year, setYear] = React.useState(y || 2026);
  const selectedMonth = (m || 1) - 1;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10 }}>
        <TouchableOpacity onPress={() => setYear(year - 1)}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'‹'}</Text></TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{year}</Text>
        <TouchableOpacity onPress={() => setYear(year + 1)}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'›'}</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 }}>
        {MONTHS.map((mn, i) => {
          const sel = year === y && i === selectedMonth;
          return (
            <TouchableOpacity key={mn}
              style={{ width: '29%', paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: sel ? '#1a56db' : '#F3F4F6' }}
              onPress={() => onChange(`${year}-${String(i + 1).padStart(2, '0')}`)} activeOpacity={0.7}>
              <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color: sel ? '#FFF' : '#111827' }}>{mn}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', lineHeight: 26 },
  filterBtn: { borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  criteriaBox: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, marginBottom: 14 },
  criteriaText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 2 } }) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cardHeaderText: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  arrow: { fontSize: 12, color: '#6B7280' },
  recCount: { fontSize: 13, color: '#6B7280', padding: 12, paddingBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#4B5563' },
  thCell: { width: COL, padding: 10, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tdCell: { width: COL, padding: 10, fontSize: 12, color: '#374151' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6, marginTop: 12 },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, height: 46, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  modalApply: { flex: 1, backgroundColor: '#1a56db', borderRadius: 10, height: 46, alignItems: 'center', justifyContent: 'center' },
  modalApplyText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
