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
import AsyncStorage from '@react-native-async-storage/async-storage';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function parseMs(s: string, end = false) {
  const [y, m, d] = s.split('-').map(Number);
  return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime();
}
/** Local calendar date as YYYY-MM-DD — must match attendance_records.attendance_date for map lookups */
function fmtDateIsoLocal(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateTime(ts: number | null) {
  if (!ts) return 'NA';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

interface AttRow {
  userCode: string; userName: string; date: string;
  startTime: string; endTime: string; attendance: string;
}
interface Group { key: string; label: string; rows: AttRow[]; }

export default function UserWiseAttendanceScreen() {
  const user = useAuthStore((s) => s.user);
  const [startDate, setStartDate] = useState(daysAgoStr(7));
  const [endDate, setEndDate] = useState(todayStr());
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftStart, setDraftStart] = useState(daysAgoStr(7));
  const [draftEnd, setDraftEnd] = useState(todayStr());

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      // BACKEND-FIRST: hierarchy-scoped attendance so a Team Leader sees their
      // whole team (merchandisers / promoters), grouped under the Team Leader,
      // with an Attendance status column — live (real-time). Falls back to the
      // local per-shift computation below (the rep's own day) when offline.
      try {
        const { data } = await api.get('/reports/user-wise-attendance', {
          params: { dateFrom: start, dateTo: end },
        });
        const rows: any[] = Array.isArray(data?.data) ? data.data : [];
        if (rows.length > 0) {
          const gmap = new Map<string, Group>();
          for (const r of rows) {
            const tlCode = r.reportsTo || 'unassigned';
            const tlName = r.reportsToName || tlCode;
            if (!gmap.has(tlCode)) gmap.set(tlCode, { key: tlCode, label: `[${tlCode}] ${tlName}`, rows: [] });
            const dateIso = String(r.date ?? '').slice(0, 10);
            gmap.get(tlCode)!.rows.push({
              userCode: r.userCode,
              userName: r.userName ?? r.userCode,
              date: dateIso ? dateIso.split('-').reverse().join('-') : 'NA', // DD-MM-YYYY
              startTime: r.startTime ? fmtDateTime(new Date(r.startTime).getTime()) : 'NA',
              endTime: r.endTime ? fmtDateTime(new Date(r.endTime).getTime()) : 'NA',
              attendance: r.attendanceType ?? 'Absent',
            });
          }
          // Within each Team Leader, newest date first.
          for (const g of gmap.values()) {
            g.rows.sort((a, b) => {
              const aIso = a.date.split('-').reverse().join('-');
              const bIso = b.date.split('-').reverse().join('-');
              return bIso.localeCompare(aIso);
            });
          }
          const res = Array.from(gmap.values());
          setGroups(res);
          setExpanded(new Set(res.map((g) => g.key)));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[UserWiseAttendance] hierarchy fetch failed, using local:', e);
      }

      // Source attendance from the SERVER (authoritative + complete) so the
      // report shows the rep's real attendance even when this device's local
      // DB doesn't hold those rows — e.g. they marked attendance on another
      // device, the history was never restored, or it predates the local data.
      // That local-only read was why R777 (logged in, with confirmed
      // attendance) saw an empty report. Falls back to the local
      // attendance_records table when offline.
      // Each record is one SHIFT (one attendance row). `id` keeps shifts that
      // share a calendar date distinct; `capturedAt` is that shift's Start Day
      // time on the server.
      let records: { id: string | number | null; userCode: string; attendanceDate: string; startTime: string | null; capturedAt: string | null }[] = [];
      try {
        const { data } = await api.get('/attendance', {
          params: { userCode: user?.code ?? '', from: start, to: end, pageSize: 500, sortDir: 'desc' },
        });
        const serverRows: any[] = data?.data ?? [];
        // The server matches userCode with a LIKE, so keep only this exact
        // user's rows (a self-report must never show another user's data).
        records = serverRows
          .filter((r) => String(r.userCode ?? '').toLowerCase() === String(user?.code ?? '').toLowerCase())
          // Normalize the date to YYYY-MM-DD. A `date` column can come back
          // as a full ISO timestamp from the driver, which would break the
          // EOT-by-date lookup (end time → "NA") and the DD-MM-YYYY display.
          .map((r) => ({ id: r.id ?? null, userCode: r.userCode, attendanceDate: String(r.attendanceDate).slice(0, 10), startTime: r.startTime ?? null, capturedAt: r.capturedAt ?? null }));
      } catch (e) {
        console.warn('[UserWiseAttendance] server attendance fetch failed, using local DB:', e);
        const local: any[] = await database.get('attendance_records')
          .query(Q.where('user_code', user?.code ?? ''), Q.where('attendance_date', Q.gte(start)), Q.where('attendance_date', Q.lte(end)))
          .fetch();
        records = local.map((r: any) => ({ id: r.id, userCode: r.userCode, attendanceDate: String(r.attendanceDate).slice(0, 10), startTime: null, capturedAt: null }));
      }

      // Load customer visits for the same date range to get start/end times
      const startMs = parseMs(start);
      const endMs = parseMs(end, true);
      const visits: any[] = await database.get('customer_visits')
        .query(Q.where('user_code', user?.code ?? ''), Q.where('checkin_time', Q.gte(startMs)), Q.where('checkin_time', Q.lte(endMs)))
        .fetch();

      // Build visit time map: userCode+date -> {min checkin, max checkout}
      const visitTimeMap = new Map<string, { minIn: number; maxOut: number | null }>();
      for (const v of visits) {
        const dateKey = fmtDateIsoLocal(v.checkinTime);
        const key = `${v.userCode}|${dateKey}`;
        const existing = visitTimeMap.get(key);
        if (!existing) {
          visitTimeMap.set(key, { minIn: v.checkinTime, maxOut: v.checkoutTime ?? null });
        } else {
          if (v.checkinTime < existing.minIn) existing.minIn = v.checkinTime;
          if (v.checkoutTime && (!existing.maxOut || v.checkoutTime > existing.maxOut)) {
            existing.maxOut = v.checkoutTime;
          }
        }
      }

      // Authoritative end-of-day times from the server's eot_records. Collect
      // ALL EOT end-times as a chronological list (NOT deduped by date — a date
      // can carry several EOTs when the rep ran multiple shifts), so each shift
      // can be paired with its own closing EOT below.
      const eotMsList: number[] = [];
      try {
        const { data } = await api.get('/attendance/my-eots', { params: { from: start, to: end } });
        const eots: any[] = data?.data ?? [];
        for (const e of eots) {
          if (e?.endTime) {
            const ms = new Date(e.endTime).getTime();
            if (!Number.isNaN(ms)) eotMsList.push(ms);
          }
        }
      } catch (e) {
        console.warn('[UserWiseAttendance] my-eots fetch failed:', e);
      }
      eotMsList.sort((a, b) => a - b);

      // The device records the rep's OWN Start-Day time in AsyncStorage
      // (day_start_timestamp_<date>) the moment they mark attendance — BEFORE it
      // syncs to the server. This report is the logged-in user's own attendance,
      // so use those keys as a reliable start-time source. Without this, a
      // just-started day (server start_time still null / not yet synced, and the
      // local attendance table has no start_time column) showed Start Time as
      // "NA".
      const localStartByDate = new Map<string, number>();
      try {
        const dates = Array.from(new Set(records.map((r) => r.attendanceDate)));
        await Promise.all(dates.map(async (d) => {
          try {
            const ts = await AsyncStorage.getItem(`day_start_timestamp_${d}`);
            if (ts) { const ms = new Date(ts).getTime(); if (!Number.isNaN(ms)) localStartByDate.set(d, ms); }
          } catch { /* ignore one date */ }
        }));
      } catch { /* best-effort */ }

      // One group PER SHIFT (one attendance row = one shift). A rep can run
      // several shifts on the SAME calendar date (Start Day → manual EOD → 12 h
      // window elapses → Start Day again), so grouping by date would collapse
      // them into one row and hide the previous/current/new shifts. Each shift's
      // start = the server Start Day time (capturedAt), falling back to the
      // first visit check-in. Shifts and EOTs are chronological (start, end,
      // start, end, …), so pairing each shift — in start-time order — with the
      // earliest not-yet-used EOT after its start matches them correctly even
      // across same-date shifts.
      const seenShift = new Set<string>();
      const shiftRecs = records
        .map((r) => {
          // Start time, most reliable first:
          //   1. the REAL server Start-Day time (startTime),
          //   2. the device's own recorded Start-Day time (day_start_timestamp),
          //      which exists even before the day syncs — fixes the "NA" on a
          //      just-started day,
          //   3. the first store check-in for that day (local visit),
          //   4. capturedAt — which may be the row's createdAt/sync time, so it
          //      is the LAST resort, not the first.
          const realStartMs = r.startTime ? new Date(r.startTime).getTime() : null;
          const capturedMs = r.capturedAt ? new Date(r.capturedAt).getTime() : null;
          const vt = visitTimeMap.get(`${r.userCode}|${r.attendanceDate}`);
          const localStartMs = localStartByDate.get(r.attendanceDate) ?? null;
          const startMs =
            (realStartMs != null && !Number.isNaN(realStartMs)) ? realStartMs
            : (localStartMs != null ? localStartMs
            : (vt ? vt.minIn
            : (capturedMs != null && !Number.isNaN(capturedMs) ? capturedMs : null)));
          return { ...r, startMs };
        })
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
        // Dedup identical shifts. The server can hold more than one attendance
        // row for the same shift (e.g. a duplicate push), which used to collapse
        // into a single date card but now renders as separate per-shift cards.
        // Two rows with the same date AND the same start time are the same
        // shift — keep one. Genuinely different same-date shifts have different
        // start times, so they are preserved.
        .filter((r) => {
          const k = `${r.userCode}|${r.attendanceDate}|${r.startMs ?? 'na'}`;
          if (seenShift.has(k)) return false;
          seenShift.add(k);
          return true;
        });

      const usedEot = new Array(eotMsList.length).fill(false);
      // Pair an EOT to a shift ONLY if it falls between this shift's start and
      // the NEXT shift's start. Without the upper bound, a started-but-not-ended
      // shift wrongly grabbed a LATER shift's EOT (any EOT after its start),
      // which is why a not-ended day showed an end time AND mis-aligned the
      // pairing for the following day. shiftRecs is sorted ascending by start.
      const takeEotBetween = (startMs: number | null, nextStartMs: number): number | null => {
        if (startMs == null) return null;
        for (let i = 0; i < eotMsList.length; i++) {
          if (!usedEot[i] && eotMsList[i] > startMs && eotMsList[i] < nextStartMs) {
            usedEot[i] = true;
            return eotMsList[i];
          }
        }
        return null;
      };

      const built = shiftRecs.map((r, idx) => {
        // End Time is only meaningful once this shift has actually ended (a
        // closing EOT exists between its start and the next shift's start).
        // Otherwise leave it blank.
        const nextStartMs = (idx + 1 < shiftRecs.length) ? (shiftRecs[idx + 1].startMs ?? Infinity) : Infinity;
        const endMs = takeEotBetween(r.startMs, nextStartMs);
        const dateDisp = r.attendanceDate.split('-').reverse().join('-'); // DD-MM-YYYY
        const row: AttRow = {
          userCode: r.userCode,
          userName: user?.name ?? r.userCode,
          date: dateDisp,
          startTime: r.startMs != null ? fmtDateTime(r.startMs) : 'NA',
          endTime: endMs != null ? fmtDateTime(endMs) : 'NA',
          attendance: r.startMs != null ? 'Present' : 'Absent',
        };
        return {
          row,
          // Sort DATE-first (ISO YYYY-MM-DD compares correctly), then by start
          // time within the day. Sorting purely by start ms pushed rows with no
          // start time (absent days: Leave / Holiday) to the bottom regardless
          // of their date, which is what broke the date-wise ordering.
          _sortDate: r.attendanceDate,
          _sortMs: r.startMs ?? 0,
        };
      });

      // Newest date first; within a date, latest shift first.
      built.sort((a, b) => {
        if (a._sortDate !== b._sortDate) return a._sortDate < b._sortDate ? 1 : -1;
        return b._sortMs - a._sortMs;
      });
      // Offline fallback can only see the rep's OWN attendance — show it as a
      // single group for the logged-in user.
      const localRows = built.map((b) => b.row);
      const result: Group[] = localRows.length > 0
        ? [{ key: user?.code ?? 'me', label: `[${user?.code ?? ''}] ${user?.name ?? user?.code ?? ''}`, rows: localRows }]
        : [];
      setGroups(result);
      setExpanded(new Set(result.map((g) => g.key)));
    } catch (err) {
      console.error('UserWiseAttendance error:', err);
    } finally { setLoading(false); }
  }, [user?.code]);

  React.useEffect(() => { loadData(startDate, endDate); }, [startDate, endDate, loadData]);

  // Refresh whenever the screen regains focus so the report tracks the
  // latest attendance/visits/EOTs without needing a manual filter apply.
  useFocusEffect(
    useCallback(() => { loadData(startDate, endDate); }, [startDate, endDate, loadData])
  );

  const applyFilter = () => {
    setStartDate(draftStart);
    setEndDate(draftEnd);
    setFilterVisible(false);
    // Apply on this single tap. Relying only on the [startDate,endDate] effect
    // missed cases where a value didn't change (or it raced the focus-effect
    // that also calls loadData), so the filter appeared to need a second tap.
    // Loading directly with the chosen drafts guarantees a one-tap apply.
    loadData(draftStart, draftEnd);
  };
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.title}>User Wise Attendance Report</Text>
          <TouchableOpacity style={s.filterBtn} onPress={() => { setDraftStart(startDate); setDraftEnd(endDate); setFilterVisible(true); }}>
            <Text style={s.filterBtnText}>Filters</Text>
          </TouchableOpacity>
        </View>

        <View style={s.criteriaBox}>
          <Text style={s.criteriaText}>
            <Text style={s.bold}>Search Criteria: </Text>
            <Text style={s.bold}>Start Date: </Text>{startDate}
            <Text style={s.bold}> | End Date: </Text>{endDate}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" size="large" />
        ) : groups.length === 0 ? (
          <View style={s.emptyBox}><Text style={s.emptyText}>No attendance data found for selected dates</Text></View>
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
                  <Text style={s.recCount}>Attendance Records ({group.rows.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View>
                      <View style={s.tableHeader}>
                        {['User Code', 'User Name', 'Date', 'Start Time', 'End Time', 'Attendance'].map((h) => (
                          <Text key={h} style={[s.thCell, (h === 'Start Time' || h === 'End Time') && { width: 160 }]}>{h}</Text>
                        ))}
                      </View>
                      {group.rows.map((row, i) => (
                        <View key={i} style={s.tableRow}>
                          <Text style={s.tdCell}>{row.userCode}</Text>
                          <Text style={s.tdCell}>{row.userName}</Text>
                          <Text style={s.tdCell}>{row.date}</Text>
                          <Text style={[s.tdCell, { width: 160 }]}>{row.startTime}</Text>
                          <Text style={[s.tdCell, { width: 160 }]}>{row.endTime}</Text>
                          <Text style={[s.tdCell, row.attendance === 'Present' ? s.attPresent : s.attAbsent]}>{row.attendance}</Text>
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

      <FilterModal
        visible={filterVisible} onClose={() => setFilterVisible(false)}
        startDate={draftStart} endDate={draftEnd}
        onChangeStart={setDraftStart} onChangeEnd={setDraftEnd} onApply={applyFilter}
      />
    </View>
  );
}

const COL = 90;
function MiniCalendar({ date, onSelect }: { date: Date; onSelect: (d: Date) => void }) {
  const [viewDate, setViewDate] = React.useState(new Date(date));
  const [selectedDay, setSelectedDay] = React.useState<number>(date.getDate());
  const year = viewDate.getFullYear(); const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const days: (number | null)[] = []; for (let i = 0; i < firstDay; i++) days.push(null); for (let i = 1; i <= daysInMonth; i++) days.push(i);
  const weeks: (number | null)[][] = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  if (weeks.length > 0) { const lw = weeks[weeks.length - 1]; while (lw.length < 7) lw.push(null); }
  return (<View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10 }}>
      <TouchableOpacity onPress={() => setViewDate(new Date(year, month - 1, 1))}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'‹'}</Text></TouchableOpacity>
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{monthName}</Text>
      <TouchableOpacity onPress={() => setViewDate(new Date(year, month + 1, 1))}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'›'}</Text></TouchableOpacity>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 6 }}>
      {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <Text key={d} style={{ width: 32, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#6B7280' }}>{d}</Text>)}
    </View>
    {weeks.map((week, wi) => (<View key={wi} style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 3 }}>
      {week.map((day, di) => { const sel = day === selectedDay && month === viewDate.getMonth(); return (
        <TouchableOpacity key={di} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? '#1a56db' : 'transparent' }}
          onPress={() => { if (day) { setSelectedDay(day); onSelect(new Date(year, month, day)); } }} disabled={!day}>
          <Text style={{ fontSize: 13, color: !day ? 'transparent' : sel ? '#FFF' : '#111827', fontWeight: sel ? '700' : '400' }}>{day ?? ''}</Text>
        </TouchableOpacity>); })}
    </View>))}
  </View>);
}
function FilterModal({ visible, onClose, startDate, endDate, onChangeStart, onChangeEnd, onApply }: any) {
  const [picking, setPicking] = React.useState<'start' | 'end' | null>(null);
  const fmtDisplay = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (<Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={s.modalOverlay}><View style={s.modalBox}>
      <Text style={s.modalTitle}>Filters</Text>
      <Text style={s.modalLabel}>Start Date</Text>
      <TouchableOpacity style={s.modalInput} onPress={() => setPicking('start')} activeOpacity={0.7}><Text style={{ fontSize: 15, color: '#111827' }}>{fmtDisplay(startDate)}</Text></TouchableOpacity>
      <Text style={s.modalLabel}>End Date</Text>
      <TouchableOpacity style={s.modalInput} onPress={() => setPicking('end')} activeOpacity={0.7}><Text style={{ fontSize: 15, color: '#111827' }}>{fmtDisplay(endDate)}</Text></TouchableOpacity>
      {picking && (<View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 8, backgroundColor: '#FAFAFA' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 4, textAlign: 'center' }}>{picking === 'start' ? 'Select Start Date' : 'Select End Date'}</Text>
        <MiniCalendar date={new Date(picking === 'start' ? startDate : endDate)} onSelect={(d) => { if (picking === 'start') onChangeStart(toIso(d)); else onChangeEnd(toIso(d)); setPicking(null); }} />
      </View>)}
      <View style={s.modalBtns}>
        <TouchableOpacity style={s.modalCancel} onPress={onClose}><Text style={s.modalCancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={s.modalApply} onPress={onApply}><Text style={s.modalApplyText}>Apply</Text></TouchableOpacity>
      </View>
    </View></View>
  </Modal>);
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
  attPresent: { color: '#15803D', fontWeight: '700' },
  attAbsent: { color: '#B91C1C', fontWeight: '700' },
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
