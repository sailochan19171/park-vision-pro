import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { Database, ChevronLeft, RefreshCw, Search, ChevronRight, X as XIcon } from 'lucide-react-native';
import database from '../db/database';
import { schema } from '../db/schema';
import { useNavigation } from '@react-navigation/native';

// Friendly labels for known tables. Any table not in this map falls back to
// a Title-Case version of its raw name, so newly-added tables show up
// automatically — they just won't have a hand-picked label.
const LABEL_OVERRIDES: Record<string, string> = {
  customers: 'Customers',
  items: 'Products',
  prices: 'Prices',
  competitor_brands: 'Competitor Brands',
  initiatives: 'Initiatives',
  surveys: 'Surveys',
  permanent_displays: 'Permanent Displays',
  planogram_setups: 'Planogram Setups',
  selling_skus: 'Selling SKUs (MSL)',
  journey_plan_customers: 'Journey Plan Customers',
  orders: 'Orders',
  order_lines: 'Order Lines',
  attendance_records: 'Attendance',
  customer_visits: 'Customer Visits',
  store_checks: 'Store Checks',
  store_check_items: 'Store Check Items',
  planogram_executions: 'Planogram Executions',
  expiry_checks: 'Expiry / Ageing',
  competitor_observations: 'Competitor Observations',
  opening_stocks: 'Opening Stocks',
  physical_stocks: 'Physical Stocks',
  osoi_photos: 'OSOI Photos',
  po_captures: 'PO Captures',
  po_capture_items: 'PO Capture Items',
  product_samplings: 'Product Samplings',
  initiative_executions: 'Initiative Executions',
  permanent_display_checks: 'Permanent Display Checks',
  survey_responses: 'Survey Responses',
  prospects: 'Prospects',
  collections: 'Collections',
  van_stock_records: 'Van Stock',
  price_checks: 'Price Checks',
  approval_records: 'Approvals',
  rota_drafts: 'Rota Drafts',
  sync_meta: 'Sync Cursors',
};

const titleCase = (snake: string) =>
  snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Auto-discovered from the WatermelonDB schema. Any new table added to
// mobile/src/db/schema.ts shows up here automatically — no edits needed.
// schema.tables is `{ [tableName]: { name, columns } }` per WatermelonDB.
const TABLES: { name: string; label: string }[] = Object
  .keys(schema.tables)
  .sort()
  .map((name) => ({ name, label: LABEL_OVERRIDES[name] ?? titleCase(name) }));

const PAGE_SIZE = 50;

export default function LocalDataScreen() {
  const navigation = useNavigation<any>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [search, setSearch] = useState('');
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<any[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openRowSearch, setOpenRowSearch] = useState('');
  const [page, setPage] = useState(0);

  // Manual refresh — kept for the pull-to-refresh control. Live observers
  // below already keep counts current; this is just a "force re-fetch now".
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    const result: Record<string, number> = {};
    await Promise.all(
      TABLES.map(async (t) => {
        try {
          result[t.name] = await database.get(t.name).query().fetchCount();
        } catch {
          result[t.name] = -1;
        }
      }),
    );
    setCounts(result);
    setLoadingCounts(false);
  }, []);

  // Live row-count subscriptions — WatermelonDB's `observeCount()` emits a
  // new value every time the underlying table changes (sync write, local
  // form save, delete, etc.). Each table we can read from gets one
  // subscription; tables that error out (missing on this build) are flagged
  // -1 once and skipped. All subscriptions are unsubscribed on unmount.
  useEffect(() => {
    const subs: Array<{ unsubscribe: () => void }> = [];
    let cancelled = false;
    (async () => {
      for (const t of TABLES) {
        try {
          const observable = database.get(t.name).query().observeCount();
          const sub = observable.subscribe((n: number) => {
            if (cancelled) return;
            setCounts((prev) => (prev[t.name] === n ? prev : { ...prev, [t.name]: n }));
          });
          subs.push(sub);
        } catch {
          setCounts((prev) => ({ ...prev, [t.name]: -1 }));
        }
      }
      // First emission of every observable lands in setCounts above; flip
      // the loading flag once we've registered all subscriptions.
      if (!cancelled) setLoadingCounts(false);
    })();
    return () => {
      cancelled = true;
      for (const s of subs) {
        try { s.unsubscribe(); } catch { /* ignore */ }
      }
    };
  }, []);

  const openTableDetail = useCallback((name: string) => {
    setOpenTable(name);
    setOpenRowSearch('');
    setPage(0);
    setOpenLoading(true);
    setOpenRows([]);
  }, []);

  // Live subscription to the currently-open table's rows. Re-fetches the
  // raw column values every time the table changes (sync write, etc.) so
  // the detail view stays in sync without the user having to back out.
  useEffect(() => {
    if (!openTable) return;
    let cancelled = false;
    let sub: { unsubscribe: () => void } | null = null;
    try {
      sub = database
        .get(openTable)
        .query()
        .observe()
        .subscribe((records: any[]) => {
          if (cancelled) return;
          setOpenRows(records.map((r) => r._raw));
          setOpenLoading(false);
        });
    } catch {
      setOpenLoading(false);
    }
    return () => {
      cancelled = true;
      try { sub?.unsubscribe(); } catch { /* ignore */ }
    };
  }, [openTable]);

  const closeDetail = () => {
    setOpenTable(null);
    setOpenRows([]);
    setOpenRowSearch('');
    setPage(0);
  };

  // Top-level filtered table list
  const filteredTables = TABLES.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Detail-view row filtering — match any column value containing the search text
  const filteredRows = openRowSearch
    ? openRows.filter((row) =>
        Object.values(row).some((v) =>
          v != null && String(v).toLowerCase().includes(openRowSearch.toLowerCase()),
        ),
      )
    : openRows;

  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  // ── Detail view ────────────────────────────────────────────────────────
  if (openTable) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={closeDetail} style={s.headerBtn}>
            <ChevronLeft size={22} color="#1a3178" />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{openTable}</Text>
          <Text style={s.headerSub}>{filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}</Text>
        </View>

        <View style={s.searchBar}>
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={openRowSearch}
            onChangeText={(t) => { setOpenRowSearch(t); setPage(0); }}
            placeholder="Search any value…"
            placeholderTextColor="#9CA3AF"
            style={s.searchInput}
          />
          {openRowSearch.length > 0 && (
            <TouchableOpacity onPress={() => { setOpenRowSearch(''); setPage(0); }}>
              <XIcon size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {openLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#1a3178" />
          </View>
        ) : pageRows.length === 0 ? (
          <View style={s.center}>
            <Database size={48} color="#D1D5DB" />
            <Text style={s.emptyText}>{openRows.length === 0 ? 'No rows in this table' : 'No rows match the search'}</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
            {pageRows.map((row, idx) => (
              <View key={idx} style={s.rowCard}>
                {Object.entries(row)
                  .filter(([k]) => !k.startsWith('_'))
                  .map(([k, v]) => (
                    <View key={k} style={s.kv}>
                      <Text style={s.kvKey}>{k}</Text>
                      <Text style={s.kvVal} selectable>{formatVal(v)}</Text>
                    </View>
                  ))}
              </View>
            ))}
          </ScrollView>
        )}

        {totalPages > 1 && (
          <View style={s.pager}>
            <TouchableOpacity
              disabled={page === 0}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              style={[s.pagerBtn, page === 0 && s.pagerBtnDisabled]}
            >
              <Text style={s.pagerBtnText}>Prev</Text>
            </TouchableOpacity>
            <Text style={s.pagerText}>Page {page + 1} of {totalPages}</Text>
            <TouchableOpacity
              disabled={page >= totalPages - 1}
              onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              style={[s.pagerBtn, page >= totalPages - 1 && s.pagerBtnDisabled]}
            >
              <Text style={s.pagerBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Tables list view ────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <ChevronLeft size={22} color="#1a3178" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Local Data</Text>
        <TouchableOpacity onPress={loadCounts} style={s.headerBtn}>
          <RefreshCw size={18} color="#1a3178" />
        </TouchableOpacity>
      </View>

      <View style={s.searchBar}>
        <Search size={16} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search tables…"
          placeholderTextColor="#9CA3AF"
          style={s.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XIcon size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={loadingCounts} onRefresh={loadCounts} tintColor="#1a3178" />}
      >
        {filteredTables.map((t) => {
          const n = counts[t.name];
          const empty = n === 0;
          const error = n === -1;
          return (
            <TouchableOpacity
              key={t.name}
              style={s.tableCard}
              activeOpacity={0.7}
              onPress={() => !error && openTableDetail(t.name)}
              disabled={error}
            >
              <View style={s.tableIcon}>
                <Database size={18} color={error ? '#EF4444' : empty ? '#9CA3AF' : '#1a3178'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tableLabel}>{t.label}</Text>
                <Text style={s.tableName}>{t.name}</Text>
              </View>
              <View style={[s.countBadge, error && s.countBadgeError, empty && s.countBadgeEmpty]}>
                <Text style={[s.countText, error && s.countTextError, empty && s.countTextEmpty]}>
                  {error ? 'err' : loadingCounts && n == null ? '…' : (n ?? 0).toLocaleString()}
                </Text>
              </View>
              {!error && <ChevronRight size={18} color="#9CA3AF" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function formatVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    // Heuristic: large numbers that look like timestamps get a date hint
    if (v > 1_000_000_000_000 && v < 4_000_000_000_000) {
      return `${v}  (${new Date(v).toLocaleString()})`;
    }
    return String(v);
  }
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  headerSub: { fontSize: 11, color: '#6B7280', position: 'absolute', right: 16, top: Platform.OS === 'ios' ? 78 : 46 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    margin: 12, marginBottom: 0,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  tableCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    marginBottom: 8,
  },
  tableIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  tableLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  tableName: { fontSize: 11, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
  countBadge: {
    minWidth: 44, alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: '#EEF2FF',
  },
  countBadgeEmpty: { backgroundColor: '#F3F4F6' },
  countBadgeError: { backgroundColor: '#FEF2F2' },
  countText: { fontSize: 12, fontWeight: '700', color: '#1a3178' },
  countTextEmpty: { color: '#9CA3AF' },
  countTextError: { color: '#EF4444' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { marginTop: 12, fontSize: 13, color: '#6B7280' },
  rowCard: {
    backgroundColor: '#FFFFFF', borderRadius: 10,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  kv: { flexDirection: 'row', paddingVertical: 4, gap: 8, alignItems: 'flex-start' },
  kvKey: {
    width: 130, fontSize: 11, fontWeight: '700', color: '#374151',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  kvVal: { flex: 1, fontSize: 12, color: '#111827' },
  pager: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
  },
  pagerBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 6, backgroundColor: '#1a3178',
  },
  pagerBtnDisabled: { backgroundColor: '#D1D5DB' },
  pagerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  pagerText: { fontSize: 12, fontWeight: '600', color: '#374151' },
});
