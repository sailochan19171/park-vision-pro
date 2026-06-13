import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, Platform,
} from 'react-native';
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
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function tsToDateKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface VisitWindow { checkin: string; checkout: string }
interface TaskRow {
  date: string; checkinTime: string; checkoutTime: string; userCode: string;
  storeCode: string; storeName: string;
  // Every check-in / check-out pair for this customer on this date, ordered
  // by check-in time. Drives the "View" button so a rep who revisited the
  // same store multiple times sees each visit window (1st, 2nd, 3rd ...).
  visits: VisitWindow[];
  openingStock: number; planogram: number; ageing: number;
  competitor: number; dailySales: number; poCapture: number; totalDone: number;
}
interface Group { key: string; label: string; rows: TaskRow[]; }

export default function TaskDoneStatusReportScreen() {
  const user = useAuthStore((s) => s.user);
  const [startDate, setStartDate] = useState(daysAgoStr(7));
  const [endDate, setEndDate] = useState(todayStr());
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftStart, setDraftStart] = useState(daysAgoStr(7));
  const [draftEnd, setDraftEnd] = useState(todayStr());
  // Modal driven by the per-row "View" button — shows every check-in /
  // check-out pair for a rep's revisits to the same customer that day.
  const [visitsModal, setVisitsModal] = useState<{ title: string; visits: VisitWindow[] } | null>(null);

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      // BACKEND-FIRST (real-time, team): hierarchy-scoped task-done status so a
      // Team Leader sees their merchandisers'/promoters' completion, grouped
      // under the Team Leader. Falls back to the local per-user aggregation
      // below when offline.
      try {
        const { data } = await api.get('/reports/task-done-status', {
          params: { dateFrom: start, dateTo: end },
        });
        const srvRows: any[] = Array.isArray(data?.data) ? data.data : [];
        if (srvRows.length > 0) {
          const gmap = new Map<string, Group>();
          for (const r of srvRows) {
            const dateStr = String(r.date ?? '').slice(0, 10).split('-').reverse().join('-'); // DD-MM-YYYY
            const gk = `${r.userCode}|${dateStr}`;
            const row: TaskRow = {
              date: dateStr,
              checkinTime: r.checkinTime ? fmtTime(r.checkinTime) : '-',
              checkoutTime: r.checkoutTime ? fmtTime(r.checkoutTime) : '-',
              userCode: r.userCode,
              storeCode: r.customerCode,
              storeName: r.customerName ?? r.customerCode,
              visits: Array.isArray(r.visits) ? r.visits.map((vv: any) => ({
                checkin: vv?.checkin ? fmtTime(vv.checkin) : '—',
                checkout: vv?.checkout ? fmtTime(vv.checkout) : '—',
              })) : [],
              openingStock: Number(r.openingStock ?? 0), planogram: Number(r.planogram ?? 0),
              ageing: Number(r.ageing ?? 0), competitor: Number(r.competitor ?? 0),
              dailySales: Number(r.dailySales ?? 0), poCapture: Number(r.poCapture ?? 0),
              totalDone: Number(r.totalDone ?? 0),
            };
            if (!gmap.has(gk)) gmap.set(gk, { key: gk, label: `[${r.userCode}] ${r.userName ?? r.userCode} ${dateStr}`, rows: [] });
            gmap.get(gk)!.rows.push(row);
          }
          const res = Array.from(gmap.values());
          setGroups(res);
          setExpanded(new Set(res.map((g) => g.key)));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[TaskDoneStatus] backend fetch failed, using local:', e);
      }

      const startMs = parseMs(start);
      const endMs = parseMs(end, true);

      // Load all required data in parallel
      const userCode = user?.code ?? '';
      const [visits, openingStocks, planograms, expiryChecks, competitorObs, orders, poCaptures] = await Promise.all([
        database.get('customer_visits').query(Q.where('user_code', userCode), Q.where('checkin_time', Q.gte(startMs)), Q.where('checkin_time', Q.lte(endMs))).fetch(),
        database.get('opening_stocks').query(Q.where('user_code', userCode), Q.where('stock_date', Q.gte(start)), Q.where('stock_date', Q.lte(end))).fetch(),
        database.get('planogram_executions').query(Q.where('user_code', userCode), Q.where('performed_on', Q.gte(startMs)), Q.where('performed_on', Q.lte(endMs))).fetch(),
        database.get('expiry_checks').query(Q.where('user_code', userCode), Q.where('visited_date', Q.gte(start)), Q.where('visited_date', Q.lte(end))).fetch(),
        database.get('competitor_observations').query(Q.where('user_code', userCode), Q.where('observed_on', Q.gte(startMs)), Q.where('observed_on', Q.lte(endMs))).fetch(),
        // Only completed sales orders (status = 100) count as a "Daily
        // Sales Report" entry. Without the status filter, drafts / partial
        // orders / Return-Order rows inflated the totalDone tally — a rep
        // who had done 3 real activities saw 4 because an in-progress
        // order on the same customer+date was being counted. Matches the
        // Customer Dashboard tile's own definition of "sales done".
        database.get('orders').query(Q.where('user_code', userCode), Q.where('status', 100), Q.where('trx_date', Q.gte(startMs)), Q.where('trx_date', Q.lte(endMs))).fetch(),
        database.get('po_captures').query(Q.where('user_code', userCode), Q.where('captured_on', Q.gte(startMs)), Q.where('captured_on', Q.lte(endMs))).fetch(),
      ]);

      // Build lookup maps by visitCode
      const osVisitSet = new Set((openingStocks as any[]).map((r: any) => r.visitCode).filter(Boolean));
      const planVisitSet = new Set((planograms as any[]).map((r: any) => r.visitCode).filter(Boolean));
      const expiryDateSet = new Set((expiryChecks as any[]).map((r: any) => `${r.customerCode}|${r.visitedDate}`));
      const compVisitSet = new Set((competitorObs as any[]).map((r: any) => r.visitCode).filter(Boolean));
      const orderCustDateSet = new Set((orders as any[]).map((r: any) => `${r.customerCode}|${tsToDateKey(r.trxDate)}`));
      const poVisitSet = new Set((poCaptures as any[]).map((r: any) => r.visitCode).filter(Boolean));

      // Collect every visit per customer+date so the report can expose each
      // check-in/check-out pair via the "View" button (revisits to the same
      // store on the same day no longer collapse to just first-in/last-out).
      // The summary row still shows first-in/last-out for at-a-glance use.
      const filoMap = new Map<string, { firstIn: any; lastOut: any; allVisits: any[]; visitCodes: Set<string>; dateStr: string; dateKey: string }>();
      for (const v of visits as any[]) {
        const dateStr = fmtDate(v.checkinTime);
        const dateKey = tsToDateKey(v.checkinTime);
        const fk = `${v.customerCode}|${dateKey}`;
        const existing = filoMap.get(fk);
        if (!existing) {
          filoMap.set(fk, { firstIn: v, lastOut: v, allVisits: [v], visitCodes: new Set([v.visitCode].filter(Boolean)), dateStr, dateKey });
        } else {
          existing.allVisits.push(v);
          if ((v.checkinTime ?? 0) < (existing.firstIn.checkinTime ?? 0)) existing.firstIn = v;
          if ((v.checkoutTime ?? 0) > (existing.lastOut.checkoutTime ?? 0)) existing.lastOut = v;
          if (v.visitCode) existing.visitCodes.add(v.visitCode);
        }
      }

      const groupMap = new Map<string, Group>();
      for (const [, entry] of filoMap) {
        const v = entry.firstIn;
        const dateStr = entry.dateStr;
        const dateKey = entry.dateKey;
        const gk = `${v.userCode}|${dateStr}`;
        const custDateKey = `${v.customerCode}|${dateKey}`;

        // Merge task counts across ALL visit codes for this customer+date
        let os = 0, plan = 0, comp = 0, po = 0;
        for (const vc of entry.visitCodes) {
          if (osVisitSet.has(vc)) os = 1;
          if (planVisitSet.has(vc)) plan = 1;
          if (compVisitSet.has(vc)) comp = 1;
          if (poVisitSet.has(vc)) po = 1;
        }
        const ageing = expiryDateSet.has(custDateKey) ? 1 : 0;
        const sales = orderCustDateSet.has(custDateKey) ? 1 : 0;
        const total = os + plan + ageing + comp + sales + po;

        // Sort all visits by check-in time so the "View" modal shows them in
        // chronological order (1st, 2nd, 3rd visit of the day).
        const visitWindows: VisitWindow[] = (entry.allVisits as any[])
          .slice()
          .sort((a: any, b: any) => (a.checkinTime ?? 0) - (b.checkinTime ?? 0))
          .map((vv: any) => ({
            checkin: vv.checkinTime ? fmtTime(vv.checkinTime) : '—',
            checkout: vv.checkoutTime ? fmtTime(vv.checkoutTime) : '—',
          }));

        const row: TaskRow = {
          date: dateStr, checkinTime: fmtTime(entry.firstIn.checkinTime), checkoutTime: fmtTime(entry.lastOut.checkoutTime),
          userCode: v.userCode,
          storeCode: v.customerCode, storeName: v.customerName ?? v.customerCode,
          visits: visitWindows,
          openingStock: os, planogram: plan, ageing, competitor: comp,
          dailySales: sales, poCapture: po, totalDone: total,
        };

        if (!groupMap.has(gk)) {
          groupMap.set(gk, { key: gk, label: `[${v.userCode}] ${v.userCode} ${dateStr}`, rows: [] });
        }
        groupMap.get(gk)!.rows.push(row);
      }

      const result = Array.from(groupMap.values());
      setGroups(result);
      setExpanded(new Set(result.map((g) => g.key)));
    } catch (err) {
      console.error('TaskDoneStatusReport error:', err);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { loadData(startDate, endDate); }, []);

  const applyFilter = () => {
    setStartDate(draftStart); setEndDate(draftEnd);
    setFilterVisible(false); loadData(draftStart, draftEnd);
  };
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const COLS = ['Store\nCode', 'Store Name', 'Date', 'Check\nIn', 'Check\nOut', 'View', 'Ope\nSto', 'Plano\ngram', 'Ageing/\nNear Expiry', 'Competitor\nObs', 'Daily\nSales', 'PO\nCapture', 'Total\nDone'];
  const COL_W = [70, 140, 82, 72, 72, 60, 50, 65, 80, 80, 60, 65, 60];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.title}>Task Done Status Report</Text>
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
          <View style={s.emptyBox}><Text style={s.emptyText}>No task data found for selected dates</Text></View>
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
                  <Text style={s.recCount}>Task Status ({group.rows.length}):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View>
                      <View style={s.tableHeader}>
                        {COLS.map((h, i) => (
                          <Text key={i} style={[s.thCell, { width: COL_W[i] }]}>{h}</Text>
                        ))}
                      </View>
                      {group.rows.map((row, i) => (
                        <View key={i} style={s.tableRow}>
                          <Text style={[s.tdCell, { width: COL_W[0] }]}>{row.storeCode}</Text>
                          <Text style={[s.tdCell, { width: COL_W[1] }]} numberOfLines={2}>{row.storeName}</Text>
                          <Text style={[s.tdCell, { width: COL_W[2] }]}>{row.date}</Text>
                          <Text style={[s.tdCell, { width: COL_W[3] }]}>{row.checkinTime}</Text>
                          <Text style={[s.tdCell, { width: COL_W[4] }]}>{row.checkoutTime}</Text>
                          <View style={[{ width: COL_W[5], alignItems: 'center', justifyContent: 'center' }]}>
                            <TouchableOpacity style={s.viewBtn} onPress={() => setVisitsModal({ title: `${row.storeName} — ${row.date}`, visits: row.visits })} activeOpacity={0.7}>
                              <Text style={s.viewBtnText}>View</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={[s.tdCell, { width: COL_W[6] }]}>{row.openingStock}</Text>
                          <Text style={[s.tdCell, { width: COL_W[7] }]}>{row.planogram}</Text>
                          <Text style={[s.tdCell, { width: COL_W[8] }]}>{row.ageing}</Text>
                          <Text style={[s.tdCell, { width: COL_W[9] }]}>{row.competitor}</Text>
                          <Text style={[s.tdCell, { width: COL_W[10] }]}>{row.dailySales}</Text>
                          <Text style={[s.tdCell, { width: COL_W[11] }]}>{row.poCapture}</Text>
                          <Text style={[s.tdCell, { width: COL_W[12] }, s.totalCell]}>{row.totalDone}</Text>
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

      {/* Visits modal: lists every check-in / check-out pair for the chosen
          customer + date so a rep's repeat visits are visible in order. */}
      <Modal visible={!!visitsModal} transparent animationType="fade" onRequestClose={() => setVisitsModal(null)}>
        <TouchableOpacity style={s.visitsOverlay} activeOpacity={1} onPress={() => setVisitsModal(null)}>
          <View style={s.visitsModal}>
            <Text style={s.visitsTitle}>{visitsModal?.title ?? ''}</Text>
            <View style={s.visitsHeader}>
              <Text style={[s.visitsHeaderCell, { flex: 0.6 }]}>#</Text>
              <Text style={[s.visitsHeaderCell, { flex: 1.4 }]}>Check In</Text>
              <Text style={[s.visitsHeaderCell, { flex: 1.4 }]}>Check Out</Text>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {(visitsModal?.visits ?? []).map((v, i) => (
                <View key={i} style={s.visitsRow}>
                  <Text style={[s.visitsCell, { flex: 0.6, fontWeight: '700' }]}>{i + 1}</Text>
                  <Text style={[s.visitsCell, { flex: 1.4 }]}>{v.checkin}</Text>
                  <Text style={[s.visitsCell, { flex: 1.4 }]}>{v.checkout}</Text>
                </View>
              ))}
              {(visitsModal?.visits ?? []).length === 0 && (
                <Text style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 16 }}>No visit records.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={s.visitsCloseBtn} onPress={() => setVisitsModal(null)} activeOpacity={0.8}>
              <Text style={s.visitsCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Inline Calendar Picker ──────────────────────────────────────────
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
            const sel = day === selectedDay && month === viewDate.getMonth();
            return (
              <TouchableOpacity key={di} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? '#1a56db' : 'transparent' }}
                onPress={() => { if (day) { setSelectedDay(day); onSelect(new Date(year, month, day)); } }} disabled={!day}>
                <Text style={{ fontSize: 13, color: !day ? 'transparent' : sel ? '#FFF' : '#111827', fontWeight: sel ? '700' : '400' }}>{day ?? ''}</Text>
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
  const fmtDisplay = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
              <MiniCalendar date={new Date(picking === 'start' ? startDate : endDate)} onSelect={(d) => {
                if (picking === 'start') onChangeStart(toIso(d)); else onChangeEnd(toIso(d));
                setPicking(null);
              }} />
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
  thCell: { padding: 8, fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tdCell: { padding: 8, fontSize: 11, color: '#374151' },
  totalCell: { fontWeight: '700', color: '#1a56db' },
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

  // View-button (per row) + Visits modal
  viewBtn: { borderWidth: 1, borderColor: '#1a56db', backgroundColor: '#EFF3FB', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  viewBtnText: { fontSize: 11, fontWeight: '700', color: '#1a56db' },
  visitsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  visitsModal: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, elevation: 4 },
  visitsTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  visitsHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6 },
  visitsHeaderCell: { fontSize: 12, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  visitsRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  visitsCell: { fontSize: 13, color: '#111827', textAlign: 'center' },
  visitsCloseBtn: { marginTop: 14, backgroundColor: '#1a56db', borderRadius: 10, height: 42, alignItems: 'center', justifyContent: 'center' },
  visitsCloseText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
