import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import api from '../api/client';
import useAuthStore from '../store/auth';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function parseMs(s: string, end = false) {
  const [y, m, d] = s.split('-').map(Number);
  return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime();
}
function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}
function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

interface VisitRow { date: string; userCode: string; userName: string; storeName: string; chainName: string; checkinTime: string; checkoutTime: string; lat: string; lng: string; }
interface Group { key: string; label: string; rows: VisitRow[]; }

// Shared FILO aggregation + grouping used by both the live (backend) and the
// offline (local) paths. `visits` items carry epoch checkin/checkout times,
// the customer + user info, and the check-in lat/lng.
interface RawVisit {
  userCode: string; userName: string;
  reportsTo?: string | null; reportsToName?: string | null;
  customerCode: string; customerName: string | null;
  chainName: string; checkinTime: number | null; checkoutTime: number | null;
  lat: number | null; lng: number | null;
}
function buildVisitGroups(visits: RawVisit[]): Group[] {
  // FILO per (user, customer, date): first check-in + last check-out so
  // tea-break re-entries collapse into one row.
  const byKey = new Map<string, { firstIn: RawVisit; lastOut: RawVisit; dateStr: string }>();
  for (const v of visits) {
    if (!v.checkinTime) continue;
    const dateStr = fmtDate(v.checkinTime);
    const key = `${v.userCode}|${v.customerCode}|${dateStr}`;
    const ex = byKey.get(key);
    if (!ex) { byKey.set(key, { firstIn: v, lastOut: v, dateStr }); }
    else {
      if ((v.checkinTime ?? 0) < (ex.firstIn.checkinTime ?? 0)) ex.firstIn = v;
      if ((v.checkoutTime ?? 0) > (ex.lastOut.checkoutTime ?? 0)) ex.lastOut = v;
    }
  }
  // Group by TEAM LEADER (reports_to) so the report reads like the attendance
  // reports: the TL name is the section header and the team's visits are the
  // rows underneath (each row shows the Field User Name).
  const groupMap = new Map<string, Group>();
  for (const [, entry] of byKey) {
    const v = entry.firstIn;
    const tlCode = v.reportsTo || v.userCode || 'unassigned';
    const tlName = v.reportsToName || v.userName || tlCode;
    const row: VisitRow = {
      date: entry.dateStr,
      userCode: v.userCode,
      userName: v.userName ?? v.userCode,
      storeName: v.customerName ?? v.customerCode,
      chainName: v.chainName ?? '-',
      checkinTime: fmtTime(entry.firstIn.checkinTime),
      checkoutTime: fmtTime(entry.lastOut.checkoutTime),
      lat: entry.firstIn.lat != null ? entry.firstIn.lat.toFixed(6) : '-',
      lng: entry.firstIn.lng != null ? entry.firstIn.lng.toFixed(6) : '-',
    };
    if (!groupMap.has(tlCode)) groupMap.set(tlCode, { key: tlCode, label: `[${tlCode}] ${tlName}`, rows: [] });
    groupMap.get(tlCode)!.rows.push(row);
  }
  // Within each Team Leader, newest visit date first.
  for (const g of groupMap.values()) {
    g.rows.sort((a, b) => b.date.split('-').reverse().join('-').localeCompare(a.date.split('-').reverse().join('-')));
  }
  return Array.from(groupMap.values());
}

export default function StoreUserVisitReportScreen() {
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
      // BACKEND-FIRST (real-time, team): hierarchy-scoped visits with check-in
      // lat/lng, so a Team Leader tracks their merchandisers / promoters live.
      // Falls back to the local visits below when offline.
      try {
        const { data } = await api.get('/reports/store-user-visits', {
          params: { dateFrom: start, dateTo: end },
        });
        const rows: any[] = Array.isArray(data?.data) ? data.data : [];
        if (rows.length > 0) {
          const visits: RawVisit[] = rows.map((r) => ({
            userCode: r.userCode, userName: r.userName ?? r.userCode,
            reportsTo: r.reportsTo ?? null, reportsToName: r.reportsToName ?? null,
            customerCode: r.customerCode, customerName: r.customerName ?? r.customerCode,
            chainName: r.chainName ?? '-',
            checkinTime: r.checkinTime ?? null, checkoutTime: r.checkoutTime ?? null,
            lat: r.lat ?? null, lng: r.lng ?? null,
          }));
          const result = buildVisitGroups(visits);
          setGroups(result);
          setExpanded(new Set(result.map((g) => g.key)));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[StoreUserVisit] backend fetch failed, using local:', e);
      }

      const startMs = parseMs(start);
      const endMs = parseMs(end, true);
      const local: any[] = await database.get('customer_visits')
        .query(Q.where('user_code', user?.code ?? ''), Q.where('checkin_time', Q.gte(startMs)), Q.where('checkin_time', Q.lte(endMs)))
        .fetch();

      // Customer lookup for chainName.
      const custCodes = [...new Set(local.map((v: any) => v.customerCode))];
      const custMap = new Map<string, any>();
      if (custCodes.length > 0) {
        const custs: any[] = await database.get('customers')
          .query(Q.where('code', Q.oneOf(custCodes)))
          .fetch();
        custs.forEach((c: any) => custMap.set(c.code, c));
      }

      const visits: RawVisit[] = local.map((v: any) => ({
        userCode: v.userCode,
        userName: user?.name ?? v.userCode,
        // Offline only has the rep's own visits; group them under the rep.
        reportsTo: user?.code ?? v.userCode,
        reportsToName: user?.name ?? v.userCode,
        customerCode: v.customerCode,
        customerName: v.customerName ?? custMap.get(v.customerCode)?.name ?? v.customerCode,
        chainName: custMap.get(v.customerCode)?.customerGroup ?? '-',
        checkinTime: v.checkinTime ?? null,
        checkoutTime: v.checkoutTime ?? null,
        lat: v.checkinLat ?? v._raw?.checkin_lat ?? null,
        lng: v.checkinLng ?? v._raw?.checkin_lng ?? null,
      }));
      const result = buildVisitGroups(visits);
      setGroups(result);
      setExpanded(new Set(result.map((g) => g.key)));
    } catch (err) {
      console.error('StoreUserVisitReport error:', err);
    } finally { setLoading(false); }
  }, [user?.code]);

  React.useEffect(() => { loadData(startDate, endDate); }, []);

  // Real-time: refresh whenever the screen regains focus so newly-completed
  // visits appear without needing a manual filter apply.
  useFocusEffect(
    useCallback(() => { loadData(startDate, endDate); }, [startDate, endDate, loadData])
  );

  const applyFilter = () => {
    setStartDate(draftStart); setEndDate(draftEnd);
    setFilterVisible(false); loadData(draftStart, draftEnd);
  };
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.title}>Store User Visit Report</Text>
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
          <View style={s.emptyBox}><Text style={s.emptyText}>No data found for selected date range</Text></View>
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
                  <Text style={s.visitCount}>Visits ({group.rows.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View>
                      <View style={s.tableHeader}>
                        {['Date', 'Field User Name', 'Store Name', 'Chain Name', 'Check In Time', 'Check Out Time', 'Latitude', 'Longitude'].map((h) => (
                          <Text key={h} style={[s.thCell, (h === 'Field User Name' || h === 'Store Name') && { width: 150 }, (h === 'Check In Time' || h === 'Check Out Time') && { width: 120 }]}>{h}</Text>
                        ))}
                      </View>
                      {group.rows.map((row, i) => (
                        <View key={i} style={s.tableRow}>
                          <Text style={s.tdCell}>{row.date}</Text>
                          <Text style={[s.tdCell, { width: 150 }]} numberOfLines={2}>{row.userName}</Text>
                          <Text style={[s.tdCell, { width: 150 }]} numberOfLines={2}>{row.storeName}</Text>
                          <Text style={s.tdCell}>{row.chainName}</Text>
                          <Text style={[s.tdCell, { width: 120 }]}>{row.checkinTime}</Text>
                          <Text style={[s.tdCell, { width: 120 }]}>{row.checkoutTime}</Text>
                          <Text style={s.tdCell}>{row.lat}</Text>
                          <Text style={s.tdCell}>{row.lng}</Text>
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

// ─── Inline Calendar Picker (allows past + future dates) ──────────────
function MiniCalendar({ date, onSelect }: { date: Date; onSelect: (d: Date) => void }) {
  const [viewDate, setViewDate] = React.useState(new Date(date));
  const [selectedDay, setSelectedDay] = React.useState<number>(date.getDate());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  if (weeks.length > 0) { const lw = weeks[weeks.length - 1]; while (lw.length < 7) lw.push(null); }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10 }}>
        <TouchableOpacity onPress={() => setViewDate(new Date(year, month - 1, 1))}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'‹'}</Text></TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{monthName}</Text>
        <TouchableOpacity onPress={() => setViewDate(new Date(year, month + 1, 1))}><Text style={{ fontSize: 20, color: '#1a56db' }}>{'›'}</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 6 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <Text key={d} style={{ width: 32, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#6B7280' }}>{d}</Text>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 3 }}>
          {week.map((day, di) => {
            const isSelected = day === selectedDay && month === viewDate.getMonth();
            return (
              <TouchableOpacity
                key={di}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? '#1a56db' : 'transparent' }}
                onPress={() => {
                  if (day) {
                    setSelectedDay(day);
                    onSelect(new Date(year, month, day));
                  }
                }}
                disabled={!day}
              >
                <Text style={{ fontSize: 13, color: !day ? 'transparent' : isSelected ? '#FFFFFF' : '#111827', fontWeight: isSelected ? '700' : '400' }}>{day ?? ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FilterModal({ visible, onClose, startDate, endDate, onChangeStart, onChangeEnd, onApply }: any) {
  const [picking, setPicking] = React.useState<'start' | 'end' | null>(null);

  const fmtDisplay = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  };
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>Filters</Text>

          <Text style={s.modalLabel}>Start Date</Text>
          <TouchableOpacity style={s.modalInput} onPress={() => setPicking('start')} activeOpacity={0.7}>
            <Text style={{ fontSize: 15, color: '#111827' }}>{fmtDisplay(startDate)}</Text>
          </TouchableOpacity>

          <Text style={s.modalLabel}>End Date</Text>
          <TouchableOpacity style={s.modalInput} onPress={() => setPicking('end')} activeOpacity={0.7}>
            <Text style={{ fontSize: 15, color: '#111827' }}>{fmtDisplay(endDate)}</Text>
          </TouchableOpacity>

          {picking && (
            <View style={{ marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 8, backgroundColor: '#FAFAFA' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 4, textAlign: 'center' }}>
                {picking === 'start' ? 'Select Start Date' : 'Select End Date'}
              </Text>
              <MiniCalendar
                date={new Date(picking === 'start' ? startDate : endDate)}
                onSelect={(d) => {
                  const iso = toIso(d);
                  if (picking === 'start') onChangeStart(iso);
                  else onChangeEnd(iso);
                  setPicking(null);
                }}
              />
            </View>
          )}

          <View style={s.modalBtns}>
            <TouchableOpacity style={s.modalCancel} onPress={onClose}><Text style={s.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.modalApply} onPress={onApply}><Text style={s.modalApplyText}>Apply</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const TABLE_COL = 110;
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
  visitCount: { fontSize: 13, color: '#6B7280', padding: 12, paddingBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#4B5563' },
  thCell: { width: TABLE_COL, padding: 10, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tdCell: { width: TABLE_COL, padding: 10, fontSize: 12, color: '#374151' },
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
