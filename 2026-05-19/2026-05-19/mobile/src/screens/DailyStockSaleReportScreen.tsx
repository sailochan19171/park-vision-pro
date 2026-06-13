import React, { useState, useCallback, useEffect, useRef } from 'react';
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
function tsToDateKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface ProductRow { name: string; opening: number; salesQty: number; salesValue: number; }
// One card PER (field user, store, date): a summary header (store + user +
// totals) shown once, then the per-product breakdown in `products`.
interface StoreCard {
  key: string;
  tlCode: string; tlName: string;
  userCode: string; userName: string; date: string;
  storeCode: string; storeName: string; chainName: string;
  totalOpening: number; totalSalesQty: number; totalSalesValue: number;
  products: ProductRow[];
}
// Top-level group = TEAM LEADER, like the attendance reports: the TL is the
// section header and the team's store cards sit underneath.
interface TLGroup { key: string; label: string; cards: StoreCard[]; }

// Group the per-store cards under their Team Leader.
function groupCardsByTL(cards: StoreCard[]): TLGroup[] {
  const m = new Map<string, TLGroup>();
  for (const c of cards) {
    const tlc = c.tlCode || 'unassigned';
    if (!m.has(tlc)) m.set(tlc, { key: tlc, label: `[${tlc}] ${c.tlName || tlc}`, cards: [] });
    m.get(tlc)!.cards.push(c);
  }
  return Array.from(m.values());
}

export default function DailyStockSaleReportScreen() {
  const user = useAuthStore((s) => s.user);
  const [startDate, setStartDate] = useState(daysAgoStr(7));
  const [endDate, setEndDate] = useState(todayStr());
  const [groups, setGroups] = useState<TLGroup[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftStart, setDraftStart] = useState(daysAgoStr(7));
  const [draftEnd, setDraftEnd] = useState(todayStr());

  const loadData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      // BACKEND-FIRST: pull the SAME report the web uses for the selected date
      // range, so EVERY transaction in the filter shows. The local DB only holds
      // recent / synced rows, so older dates in the range were missing entirely.
      // Falls back to the local aggregation below if the server is unreachable.
      try {
        // PAGINATE through every page so the ENTIRE filtered dataset comes back
        // (the report must match the web portal's row count). One page was
        // capping the result for larger ranges / bigger teams.
        const PAGE = 2000;
        const srvRows: any[] = [];
        let page = 1;
        while (page <= 100) {
          const { data } = await api.get('/reports/daily-stock-sales', {
            params: { dateFrom: start, dateTo: end, userCode: user?.code ?? '', page, pageSize: PAGE },
          });
          const pageRows: any[] = Array.isArray(data?.data) ? data.data : [];
          srvRows.push(...pageRows);
          const total = Number(data?.total ?? srvRows.length);
          if (pageRows.length < PAGE || srvRows.length >= total) break;
          page++;
        }
        if (srvRows.length > 0) {
          // One CARD per (field user, store, date): the store/user summary is
          // shown once and each product becomes a row in the card's table. The
          // backend rows are already per-product, so accumulate them per store.
          const cmap = new Map<string, StoreCard>();
          for (const r of srvRows) {
            const uc = r['Field User Code'] ?? user?.code ?? '';
            const un = r['Field User Name'] ?? uc;
            const date = String(r['Date'] ?? ''); // DD/MM/YYYY
            const storeCode = r['Store Code'] ?? '';
            const key = `${uc}|${storeCode}|${date}`;
            let c = cmap.get(key);
            if (!c) {
              c = {
                key, tlCode: r['TL Code'] ?? '', tlName: r['TL Name'] ?? '',
                userCode: uc, userName: un, date,
                storeCode, storeName: r['Store Name'] ?? storeCode, chainName: r['Chain Name'] ?? '-',
                totalOpening: 0, totalSalesQty: 0, totalSalesValue: 0, products: [],
              };
              cmap.set(key, c);
            }
            const opening = Number(r['Opening Stocks'] ?? 0) || 0;
            const salesQty = Number(r['Secondary Sales'] ?? 0) || 0;
            const salesValue = Number(r['Secondary Sales Revenue'] ?? 0) || 0;
            c.products.push({ name: r['Product Name'] ?? '', opening, salesQty, salesValue });
            c.totalOpening += opening;
            c.totalSalesQty += salesQty;
            c.totalSalesValue += salesValue;
          }
          // Newest date first. Backend "Date" is DD/MM/YYYY → ISO for compare.
          const sortedCards = Array.from(cmap.values()).sort((a, b) => {
            const aIso = a.date.split('/').reverse().join('-');
            const bIso = b.date.split('/').reverse().join('-');
            return bIso.localeCompare(aIso);
          });
          const res = groupCardsByTL(sortedCards);
          setGroups(res);
          setTotalRows(srvRows.length); // total stock-check rows for the filter
          // Expand the TL groups and the store cards by default.
          setExpanded(new Set([...res.map((g) => g.key), ...sortedCards.map((c) => c.key)]));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[DailyStockSale] backend report fetch failed, using local:', e);
      }

      const startMs = parseMs(start);
      const endMs = parseMs(end, true);
      const userCode = user?.code ?? '';
      const orders: any[] = await database.get('orders')
        .query(Q.where('user_code', userCode), Q.where('trx_date', Q.gte(startMs)), Q.where('trx_date', Q.lte(endMs)))
        .fetch();
      const openingStocks: any[] = await database.get('opening_stocks')
        .query(Q.where('user_code', userCode), Q.where('stock_date', Q.gte(start)), Q.where('stock_date', Q.lte(end)))
        .fetch();

      // Sum opening stock per (customerCode, dateKey).
      const osByKey = new Map<string, number>();
      for (const os of openingStocks) {
        const k = `${os.customerCode}|${os.stockDate}`;
        osByKey.set(k, (osByKey.get(k) ?? 0) + (os.quantity ?? 0));
      }

      // Customer metadata (name + chain) for every customer touched by
      // EITHER orders or opening stocks — previously only orders' customers
      // were looked up, which is why opening-stock-only customers had no
      // row at all in the report.
      const customerCodes = Array.from(new Set([
        ...orders.map((o: any) => o.customerCode).filter(Boolean),
        ...openingStocks.map((os: any) => os.customerCode).filter(Boolean),
      ]));
      const customerMeta = new Map<string, { name: string; chain: string }>();
      if (customerCodes.length > 0) {
        const customerRows: any[] = await database.get('customers')
          .query(Q.where('code', Q.oneOf(customerCodes)))
          .fetch();
        for (const c of customerRows) {
          customerMeta.set(c.code, { name: (c as any).name ?? c.code, chain: c.customerGroup ?? '-' });
        }
      }

      // Aggregate orders per (userCode, customerCode, dateKey) so multiple
      // orders to one store on the same day collapse into a single row.
      interface OrderAgg { id: string; qty: number; value: number; customerName: string | null; }
      const orderAgg = new Map<string, OrderAgg>();
      for (const o of orders) {
        const dateKey = tsToDateKey(o.trxDate);
        const k = `${o.userCode}|${o.customerCode}|${dateKey}`;
        const prev = orderAgg.get(k);
        if (prev) {
          prev.qty += (o.linesCount ?? 0);
          prev.value += (o.totalAmount ?? 0);
        } else {
          orderAgg.set(k, {
            id: o.id,
            qty: o.linesCount ?? 0,
            value: o.totalAmount ?? 0,
            customerName: o.customerName ?? null,
          });
        }
      }

      // Union of all (userCode, customerCode, dateKey) triples — orders
      // contribute their values, opening-stock-only rows surface with 0
      // sales but their stock count.
      const allKeys = new Set<string>();
      for (const o of orders) {
        allKeys.add(`${o.userCode}|${o.customerCode}|${tsToDateKey(o.trxDate)}`);
      }
      for (const os of openingStocks) {
        if (!os.customerCode || !os.stockDate) continue;
        allKeys.add(`${userCode}|${os.customerCode}|${os.stockDate}`);
      }

      // Offline: one card per (user, store, date) with the store-level totals.
      // The local DB doesn't carry a per-product sales breakdown, so the card's
      // products table is left empty here — the online path fills it.
      const cardMap = new Map<string, StoreCard>();
      for (const key of allKeys) {
        const [uc, cc, dateKey] = key.split('|');
        const dateStr = fmtDate(parseMs(dateKey));
        const ord = orderAgg.get(key);
        const meta = customerMeta.get(cc);
        const osKey = `${cc}|${dateKey}`;
        cardMap.set(`${uc}|${cc}|${dateStr}`, {
          key: `${uc}|${cc}|${dateStr}`,
          // Offline only has the rep's own rows; group under the rep.
          tlCode: user?.code ?? uc, tlName: user?.name ?? uc,
          userCode: uc, userName: user?.name ?? uc, date: dateStr,
          storeCode: cc,
          storeName: ord?.customerName ?? meta?.name ?? cc,
          chainName: meta?.chain ?? '-',
          totalOpening: osByKey.get(osKey) ?? 0,
          totalSalesQty: ord?.qty ?? 0,
          totalSalesValue: ord?.value ?? 0,
          products: [],
        });
      }
      // Newest date first (card.date is DD-MM-YYYY → ISO for compare).
      const sortedCards = Array.from(cardMap.values()).sort((a, b) => {
        const aIso = a.date.split('-').reverse().join('-');
        const bIso = b.date.split('-').reverse().join('-');
        return bIso.localeCompare(aIso);
      });
      const result = groupCardsByTL(sortedCards);
      setGroups(result);
      setTotalRows(sortedCards.length);
      setExpanded(new Set([...result.map((g) => g.key), ...sortedCards.map((c) => c.key)]));
    } catch (err) {
      console.error('DailyStockSaleReport error:', err);
    } finally { setLoading(false); }
  }, [user?.code]);

  // Single source of truth for "what data is on screen": refetch whenever
  // the applied startDate / endDate change. Previously the Apply tap had to
  // call loadData explicitly AND a useFocusEffect re-ran with stale deps,
  // which left the criteria text on the new range but the rows on the old
  // one whenever React batched the state updates differently. With one
  // effect on [startDate, endDate] the data always matches the criteria
  // box.
  React.useEffect(() => { loadData(startDate, endDate); }, [startDate, endDate, loadData]);

  // Real-time: also refresh whenever the screen regains focus so new
  // orders / opening stocks recorded elsewhere appear without a manual
  // filter apply. Reads the LIVE date refs (not closure-captured values)
  // so a focus-fired refresh doesn't accidentally pull the previous range.
  const datesRef = useRef({ start: startDate, end: endDate });
  useEffect(() => { datesRef.current = { start: startDate, end: endDate }; }, [startDate, endDate]);
  useFocusEffect(
    useCallback(() => {
      loadData(datesRef.current.start, datesRef.current.end);
    }, [loadData])
  );

  const applyFilter = () => {
    setStartDate(draftStart);
    setEndDate(draftEnd);
    setFilterVisible(false);
    // The [startDate, endDate] effect above will refire loadData with the
    // new dates as soon as React flushes the setState — no need to call
    // loadData here too (double-fetch).
  };
  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });


  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.titleRow}>
          <Text style={s.title}>Daily Stock And Sale Report</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.filterBtn} onPress={() => { setDraftStart(startDate); setDraftEnd(endDate); setFilterVisible(true); }}>
              <Text style={s.filterBtnText}>Filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.criteriaBox}>
          <Text style={s.criteriaText}>
            <Text style={s.bold}>Search Criteria: </Text>
            <Text style={s.bold}>Start Date: </Text>{startDate}
            <Text style={s.bold}> | End Date: </Text>{endDate}
          </Text>
          {!loading && (
            <Text style={[s.criteriaText, { marginTop: 4 }]}>
              <Text style={s.bold}>Stock Check Rows: </Text>{totalRows}
            </Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" size="large" />
        ) : groups.length === 0 ? (
          <View style={s.emptyBox}><Text style={s.emptyText}>No data found for selected date range</Text></View>
        ) : groups.map((tl) => {
          const tlOpen = expanded.has(tl.key);
          return (
            <View key={tl.key} style={s.card}>
              <TouchableOpacity style={s.cardHeader} onPress={() => toggle(tl.key)} activeOpacity={0.8}>
                <Text style={s.cardHeaderText}>{tl.label}</Text>
                <Text style={s.arrow}>{tlOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {tlOpen && tl.cards.map((card) => {
                const isOpen = expanded.has(card.key);
                return (
                <View key={card.key} style={s.subCard}>
                  <TouchableOpacity style={s.subCardHeader} onPress={() => toggle(card.key)} activeOpacity={0.8}>
                    <Text style={s.subCardHeaderText}>
                      [{card.userCode}] {card.userName}<Text style={s.cardHeaderDate}>  {card.date}</Text>
                    </Text>
                    <Text style={s.arrow}>{isOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {isOpen && (
                  <View style={s.kvBlock}>
                  <KVPair left="Date" lv={card.date} right="Field User Code" rv={card.userCode} />
                  <KVPair left="Field User Name" lv={card.userName} right="Store Code" rv={card.storeCode} />
                  <KVPair left="Store Name" lv={card.storeName} right="Chain Name" rv={card.chainName} />
                  <KVPair left="Total Opening Stocks" lv={String(card.totalOpening)} right="Total Sales Qty" rv={String(card.totalSalesQty)} />
                  <View style={s.kvRow}>
                    <View style={s.kvCell}>
                      <Text style={s.kvLabel}>Total Sales Value</Text>
                      <Text style={s.kvValue}>{card.totalSalesValue}</Text>
                    </View>
                    <View style={s.kvCell} />
                  </View>

                  <Text style={s.productsTitle}>Products ({card.products.length}):</Text>
                  {card.products.length === 0 ? (
                    <Text style={s.noProducts}>No product breakdown available offline</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View>
                        <View style={s.tableHeader}>
                          <Text style={[s.thCell, { width: 170 }]}>Product Name</Text>
                          <Text style={[s.thCell, { width: 80 }]}>Opening Stocks</Text>
                          <Text style={[s.thCell, { width: 80 }]}>Secondary Sales</Text>
                          <Text style={[s.thCell, { width: 90 }]}>Secondary Sales Revenue</Text>
                        </View>
                        {card.products.map((p, i) => (
                          <View key={i} style={s.tableRow}>
                            <Text style={[s.tdCell, { width: 170 }]}>{p.name}</Text>
                            <Text style={[s.tdCell, { width: 80 }]}>{p.opening}</Text>
                            <Text style={[s.tdCell, { width: 80 }]}>{p.salesQty}</Text>
                            <Text style={[s.tdCell, { width: 90 }]}>{p.salesValue}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  </View>
                  )}
                </View>
                );
              })}
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

function KVPair({ left, lv, right, rv }: { left: string; lv: string; right: string; rv: string }) {
  return (
    <View style={s.kvRow}>
      <View style={s.kvCell}><Text style={s.kvLabel}>{left}</Text><Text style={s.kvValue}>{lv}</Text></View>
      <View style={s.kvCell}><Text style={s.kvLabel}>{right}</Text><Text style={s.kvValue}>{rv}</Text></View>
    </View>
  );
}

function MiniCalendar({ date, onSelect }: { date: Date; onSelect: (d: Date) => void }) {
  const [viewDate, setViewDate] = React.useState(new Date(date));
  const [selectedDay, setSelectedDay] = React.useState<number>(date.getDate());
  const year = viewDate.getFullYear(); const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
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
  filterBtn: { borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center' },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  criteriaBox: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, marginBottom: 14 },
  criteriaText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 2 } }) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cardHeaderText: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  cardHeaderDate: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
  arrow: { fontSize: 12, color: '#6B7280' },
  subCard: { marginHorizontal: 8, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: '#EEF1F5', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  subCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#FCFCFD', borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  subCardHeaderText: { fontSize: 13, fontWeight: '600', color: '#1F2937', flex: 1 },
  kvBlock: { padding: 12, gap: 0 },
  productsTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 8, marginHorizontal: 4 },
  noProducts: { fontSize: 12, color: '#9CA3AF', marginHorizontal: 4, marginBottom: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#6B7280' },
  thCell: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', padding: 8, borderRightWidth: 1, borderColor: '#9CA3AF' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F3F4F6' },
  tdCell: { fontSize: 12, color: '#374151', padding: 8, borderRightWidth: 1, borderColor: '#F3F4F6' },
  kvRow: { flexDirection: 'row', paddingVertical: 6 },
  kvCell: { flex: 1, paddingHorizontal: 4 },
  kvLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 2 },
  kvValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
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
