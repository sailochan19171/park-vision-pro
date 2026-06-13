import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
  BackHandler,
  Alert,
  Share,
  StatusBar,
  Image,
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { Modal } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import api from '../api/client';
import useAuthStore from '../store/auth';
import Icon from 'react-native-vector-icons/Ionicons';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import RNShare from 'react-native-share';
import RNFS from 'react-native-fs';
import type Order from '../db/models/Order';

function safeFileName(input: string): string {
  // Android file systems can reject special characters in file names.
  return (input || 'report')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

async function sharePdf(html: string, fileName: string, title: string) {
  // Prefer file share. If storage/path fails (Android scoped storage), fall back to base64 share.
  const name = safeFileName(fileName);
  let lastError: any;

  console.log('[PDF] Starting PDF generation for:', name);

  // Attempt 1: Use Files directory (app-private, more reliable than Cache)
  try {
    console.log('[PDF] Attempt 1: Files directory');
    const file = await RNHTMLtoPDF.convert({
      html,
      fileName: name,
      directory: 'Files',
    });
    console.log('[PDF] Files result:', JSON.stringify(file));

    const filePath = file?.filePath;
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error(`Invalid filePath returned: ${filePath}`);
    }

    // On Android, use file:// prefix; on iOS the path might already be formatted
    const shareUrl = Platform.OS === 'android' && !filePath.startsWith('file://')
      ? `file://${filePath}`
      : filePath;

    console.log('[PDF] Sharing with URL:', shareUrl);
    await RNShare.open({
      url: shareUrl,
      type: 'application/pdf',
      title,
      failOnCancel: false,
    });
    console.log('[PDF] Share successful');
    return;
  } catch (err: any) {
    lastError = err;
    console.log('[PDF] Files directory failed:', err?.message || err);
  }

  // Attempt 2: Use Cache directory as fallback
  try {
    console.log('[PDF] Attempt 2: Cache directory');
    const file = await RNHTMLtoPDF.convert({
      html,
      fileName: name,
      directory: 'Cache',
    });
    console.log('[PDF] Cache result:', JSON.stringify(file));

    const filePath = file?.filePath;
    if (!filePath || typeof filePath !== 'string') {
      throw new Error(`Invalid filePath from cache: ${filePath}`);
    }

    const shareUrl = Platform.OS === 'android' && !filePath.startsWith('file://')
      ? `file://${filePath}`
      : filePath;

    console.log('[PDF] Sharing cache file:', shareUrl);
    await RNShare.open({
      url: shareUrl,
      type: 'application/pdf',
      title,
      failOnCancel: false,
    });
    console.log('[PDF] Cache share successful');
    return;
  } catch (err: any) {
    lastError = err;
    console.log('[PDF] Cache directory failed:', err?.message || err);
  }

  // Attempt 3: Base64 with manual file write using RNFS
  try {
    console.log('[PDF] Attempt 3: Base64 + RNFS write');
    const file = await RNHTMLtoPDF.convert({
      html,
      fileName: name,
      base64: true,
    } as any);

    const b64 = (file as any)?.base64;
    if (!b64 || typeof b64 !== 'string' || b64.trim() === '') {
      throw new Error('PDF base64 generation failed - empty or missing base64');
    }

    // Write to temp directory using RNFS
    const tempPath = `${RNFS.TemporaryDirectoryPath}/${name}.pdf`;
    console.log('[PDF] Writing to temp path:', tempPath);
    await RNFS.writeFile(tempPath, b64, 'base64');

    // Verify file exists
    const fileExists = await RNFS.exists(tempPath);
    if (!fileExists) {
      throw new Error(`PDF file not created at ${tempPath}`);
    }

    console.log('[PDF] File written successfully, sharing...');
    await RNShare.open({
      url: `file://${tempPath}`,
      type: 'application/pdf',
      title,
      failOnCancel: false,
    });
    console.log('[PDF] RNFS temp share successful');
    return;
  } catch (err: any) {
    lastError = err;
    console.log('[PDF] RNFS write failed:', err?.message || err);
  }

  // Attempt 4: Direct base64 data URL (last resort)
  try {
    console.log('[PDF] Attempt 4: Direct base64 data URL');
    const file = await RNHTMLtoPDF.convert({
      html,
      fileName: name,
      base64: true,
    } as any);

    const b64 = (file as any)?.base64;
    if (!b64 || typeof b64 !== 'string' || b64.trim() === '') {
      throw new Error('PDF base64 is empty');
    }

    const base64Url = `data:application/pdf;base64,${b64}`;
    console.log('[PDF] Sharing direct base64, length:', b64.length);
    await RNShare.open({
      url: base64Url,
      type: 'application/pdf',
      title,
      failOnCancel: false,
    });
    console.log('[PDF] Direct base64 share successful');
    return;
  } catch (err: any) {
    lastError = err;
    console.log('[PDF] Direct base64 failed:', err?.message || err);
  }

  // All attempts failed - throw the last error for proper handling
  throw lastError || new Error('PDF generation failed after all attempts');
}

type RouteParams = {
  MTDSummary: {
    customerCode: string;
    customerName: string;
  };
};

type TabKey = 'today' | 'all';

const formatCurrency = (n: number) =>
  '\u20B9' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const formatDateDisplay = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function getTodayRange(): { start: number; end: number } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime(),
  };
}

function getSixMonthRange(): { start: number; end: number } {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  return {
    start: sixMonthsAgo.getTime(),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime(),
  };
}

interface OrderLine {
  itemName: string;
  quantity: number;
  priceUsed: number;
}

/* ── Inline CalendarPicker ── */
function CalendarPicker({ initialDate, onSelect, onCancel }: { initialDate: Date; onSelect: (d: Date) => void; onCancel: () => void }) {
  const [viewDate, setViewDate] = useState(new Date(initialDate));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
  if (weeks.length > 0) {
    const lastWeek = weeks[weeks.length - 1];
    while (lastWeek.length < 7) lastWeek.push(null);
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <View>
      <View style={calSt.header}>
        <TouchableOpacity onPress={prevMonth}><Icon name="chevron-back" size={22} color="#1a56db" /></TouchableOpacity>
        <Text style={calSt.monthText}>{monthName}</Text>
        <TouchableOpacity onPress={nextMonth}><Icon name="chevron-forward" size={22} color="#1a56db" /></TouchableOpacity>
      </View>
      <View style={calSt.weekHeader}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <Text key={d} style={calSt.weekDay}>{d}</Text>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={calSt.weekRow}>
          {week.map((day, di) => (
            <TouchableOpacity
              key={di}
              style={[calSt.dayCell, selectedDay === day && calSt.dayCellActive]}
              onPress={() => day && setSelectedDay(day)}
              disabled={!day}
            >
              <Text style={[calSt.dayText, selectedDay === day && calSt.dayTextActive, !day && { color: 'transparent' }]}>
                {day ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={calSt.actions}>
        <TouchableOpacity style={calSt.cancelBtn} onPress={onCancel}><Text style={calSt.cancelText}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[calSt.okBtn, !selectedDay && { opacity: 0.5 }]} onPress={() => {
          if (selectedDay) onSelect(new Date(year, month, selectedDay));
        }}>
          <Text style={calSt.okText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const calSt = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12 },
  monthText: { fontSize: 17, fontWeight: '700', color: '#111827' },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
  weekDay: { width: 36, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#6B7280' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  dayCell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayCellActive: { backgroundColor: '#1a56db' },
  dayText: { fontSize: 14, color: '#111827' },
  dayTextActive: { color: '#FFFFFF', fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 12, paddingHorizontal: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  okBtn: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#1a56db', borderRadius: 8 },
  okText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});

export default function MTDSummaryScreen() {
  const route = useRoute<RouteProp<RouteParams, 'MTDSummary'>>();
  const navigation = useNavigation<any>();
  const { customerCode } = route.params;
  const user = useAuthStore((s) => s.user);

  // Back button — go to previous page, not checkout
  useEffect(() => {
    const onBack = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigation]);

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLines, setPreviewLines] = useState<OrderLine[]>([]);
  const [previewTitle, setPreviewTitle] = useState('');

  // Editable date range
  const [fromDate, setFromDate] = useState(() => new Date(getSixMonthRange().start));
  const [toDate, setToDate] = useState(() => new Date(getSixMonthRange().end));
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const loadOrders = useCallback(async () => {
    const range = activeTab === 'today'
      ? getTodayRange()
      : { start: fromDate.getTime(), end: new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999).getTime() };
    console.log(`[MTD] Loading orders for customer: ${customerCode}, tab: ${activeTab}, range: ${new Date(range.start).toISOString()} - ${new Date(range.end).toISOString()}`);

    // ALL tab → fetch REAL-TIME from the backend for the selected calendar
    // range, so PREVIOUS months show too. The local orders table only holds
    // recent / restored rows, which is why earlier-month MTD was missing (the
    // previous code read local only, and onRefresh fetched /orders but threw
    // the result away). Falls back to the local DB if the server is unreachable.
    // BOTH tabs fetch REAL-TIME from the backend, scoped to the session user's
    // whole TEAM (teamScope) so a Team Leader sees the sales their merchandisers
    // / promoters made to THIS customer — not just their own — per the hierarchy.
    // A plain rep resolves to just themselves, so their view is unchanged. Falls
    // back to the local DB if the server is unreachable.
    {
      try {
        // Full ISO timestamps (start-of-day → end-of-day), NOT just YYYY-MM-DD.
        // The backend compares trx_date <= new Date(to); a date-only `to` is
        // midnight, which DROPPED transactions on the end date itself. range.end
        // is already 23:59:59.999, so this includes the whole final day.
        const from = new Date(range.start).toISOString();
        const to = new Date(range.end).toISOString();
        // PAGINATE through every page so the All tab matches the web portal — a
        // single page (pageSize) was capping the result, so larger date ranges /
        // bigger teams showed only the first slice.
        const PAGE = 1000;
        const rows: any[] = [];
        let page = 1;
        while (page <= 100) {
          const { data } = await api.get('/orders', {
            params: { teamScope: true, customerCode, from, to, page, pageSize: PAGE, sortDir: 'desc' },
          });
          const pageRows: any[] = data?.data ?? [];
          rows.push(...pageRows);
          const total = Number(data?.pagination?.total ?? rows.length);
          if (pageRows.length < PAGE || rows.length >= total) break;
          page++;
        }
        const mapped = rows.map((o: any) => ({
          id: String(o.id),
          serverTrxCode: o.trxCode ?? null,
          appTrxId: o.appTrxId ?? o.trxCode ?? null,
          trxDate: o.trxDate ? new Date(o.trxDate).getTime() : 0,
          totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : parseFloat(o.totalAmount ?? '0'),
          customerCode: o.customerCode,
          customerName: o.customerName,
          status: o.status,
          // Per-order user (team-scoped MTD returns orders from different reps);
          // the PDF must show EACH order's own user, not the logged-in TL.
          userCode: o.userCode ?? null,
          userName: o.userName ?? o.userCode ?? null,
        }));
        console.log(`[MTD] Backend returned ${mapped.length} orders for range (team-scoped)`);
        setOrders(mapped as unknown as Order[]);
        setLoading(false);
        return;
      } catch (e) {
        console.warn('[MTD] backend orders fetch failed, falling back to local:', e);
        /* fall through to the local query below */
      }
    }

    // TODAY tab (or backend failed): read the local DB so freshly-entered,
    // not-yet-synced orders show immediately.
    // First try with customer_code filter
    let results: any[] = await database
      .get('orders')
      .query(
        Q.where('customer_code', customerCode),
        Q.where('trx_date', Q.gte(range.start)),
        Q.where('trx_date', Q.lte(range.end)),
        Q.sortBy('trx_date', Q.desc),
      )
      .fetch();

    // If no results, try loading ALL orders in range (customer code might not match)
    if (results.length === 0) {
      const allOrders: any[] = await database
        .get('orders')
        .query(
          Q.where('trx_date', Q.gte(range.start)),
          Q.where('trx_date', Q.lte(range.end)),
          Q.sortBy('trx_date', Q.desc),
        )
        .fetch();
      console.log(`[MTD] No orders for ${customerCode}, but found ${allOrders.length} total orders. Codes: ${allOrders.map((o: any) => o.customerCode ?? o._raw?.customer_code).join(', ')}`);
      // Show all orders for this user regardless of customer
      results = allOrders;
    }

    console.log(`[MTD] Found ${results.length} orders`);
    setOrders(results as Order[]);
    setLoading(false);
  }, [activeTab, customerCode, fromDate, toDate, user?.code]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // loadOrders now fetches the backend for the ALL tab itself.
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadOrders();
    }, [loadOrders]),
  );

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (o.serverTrxCode ?? '').toLowerCase().includes(q) ||
        (o.appTrxId ?? '').toLowerCase().includes(q),
    );
  }, [orders, search]);

  const handleOrderPress = async (order: Order) => {
    try {
      const lines: any[] = await database.get('order_lines')
        .query(Q.where('order_id', order.id))
        .fetch();
      let mapped = lines.map((l: any) => ({
        itemName: l.itemName ?? l._raw?.item_name ?? l.itemCode ?? '',
        quantity: l.quantity ?? l._raw?.quantity ?? 0,
        priceUsed: l.priceUsed ?? l._raw?.price_used ?? 0,
      }));
      // Backend order (ALL tab, previous months) isn't in the local DB, so its
      // lines aren't local — fetch them from the server so the preview isn't
      // empty.
      const trxCode = (order as any).serverTrxCode;
      if (mapped.length === 0 && trxCode) {
        try {
          const { data } = await api.get(`/orders/${encodeURIComponent(trxCode)}`);
          const srvLines: any[] = data?.lines ?? [];
          mapped = srvLines.map((l: any) => ({
            itemName: l.itemName ?? l.itemCode ?? '',
            quantity: Number(l.quantity ?? 0),
            priceUsed: Number(l.priceUsed ?? 0),
          }));
        } catch (e) { console.warn('[MTD] backend order lines fetch failed:', e); }
      }
      setPreviewLines(mapped);
      setPreviewTitle('Sales Report Preview');
      setShowPreview(true);
    } catch {
      setPreviewLines([]);
    }
  };

  const handleShare = async () => {
    try {
      const totalValue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);
      const lines: string[] = [
        `MTD Sales Summary — ${route.params.customerName} (${customerCode})`,
        `Period: ${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`,
        `Tab: ${activeTab.toUpperCase()}`,
        `Total Orders: ${filteredOrders.length}`,
        `Total Value: ${formatCurrency(totalValue)}`,
        '',
        '--- Order Details ---',
      ];
      for (const o of filteredOrders) {
        lines.push(
          `${o.serverTrxCode || o.appTrxId?.slice(0, 16) || '-'}  |  ${formatDate(o.trxDate)}  |  ${formatCurrency(o.totalAmount)}`,
        );
      }
      lines.push('', 'Shared from Farmley SFA');

      await Share.share({
        message: lines.join('\n'),
        title: `Sales Summary — ${route.params.customerName}`,
      });
    } catch { /* user cancelled */ }
  };

  const handleSharePDF = async () => {
    try {
      setLoading(true);
      const totalValue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);
      const userLabel = user?.name ?? user?.code ?? '-';

      // Build a DETAILED sales report — each order with its line items (item
      // name, qty, price, total) — for BOTH Today and All tabs (it used to be a
      // bare Trx/Date/Amount summary). Lines come from the local DB; backend-only
      // orders (ALL tab / previous months) pull theirs from /orders/:trxCode.
      const sections: string[] = [];
      for (const o of filteredOrders) {
        const localLines: any[] = await database.get('order_lines')
          .query(Q.where('order_id', o.id)).fetch();
        let items = localLines.map((l: any) => ({
          name: l.itemName ?? l._raw?.item_name ?? l.itemCode ?? '',
          qty: Number(l.quantity ?? l._raw?.quantity ?? 0),
          price: Number(l.priceUsed ?? l._raw?.price_used ?? 0),
        }));
        const trxCode = (o as any).serverTrxCode;
        if (items.length === 0 && trxCode) {
          try {
            const { data } = await api.get(`/orders/${encodeURIComponent(trxCode)}`);
            const srv: any[] = data?.lines ?? [];
            items = srv.map((l: any) => ({
              name: l.itemName ?? l.itemCode ?? '',
              qty: Number(l.quantity ?? 0),
              price: Number(l.priceUsed ?? 0),
            }));
          } catch (e) { console.warn('[MTD PDF] order lines fetch failed:', e); }
        }
        const itemRows = items.map((it, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${it.name}</td>
            <td style="text-align:center;">${it.qty}</td>
            <td style="text-align:right;">${it.price.toFixed(2)}</td>
            <td style="text-align:right;">${(it.qty * it.price).toFixed(2)}</td>
          </tr>`).join('');
        sections.push(`
          <div class="order">
            <div class="ordhdr">
              <strong>Trx Code:</strong> ${(o as any).serverTrxCode || (o as any).appTrxId?.slice(0, 16) || '-'} &nbsp;|&nbsp;
              <strong>Date:</strong> ${formatDate(o.trxDate)} &nbsp;|&nbsp;
              <strong>User:</strong> ${((o as any).userName ?? (o as any).userCode) || userLabel}${(o as any).userCode ? ` (${(o as any).userCode})` : ''} &nbsp;|&nbsp;
              <strong>Amount:</strong> ${formatCurrency(o.totalAmount)}
            </div>
            <table>
              <thead>
                <tr><th>#</th><th>Item Name</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr>
              </thead>
              <tbody>${itemRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No line items</td></tr>'}</tbody>
            </table>
          </div>`);
      }

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1a56db; padding-bottom: 10px; }
              .title { font-size: 22px; font-weight: bold; color: #1a56db; }
              .info { margin-bottom: 16px; line-height: 1.6; font-size: 13px; }
              .order { margin-bottom: 18px; }
              .ordhdr { background:#eef2ff; padding:8px 10px; border:1px solid #c7d2fe; border-radius:4px; font-size:12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 6px; }
              th { background-color: #f3f4f6; text-align: left; padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; }
              td { padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; }
              .grand { font-weight: bold; background:#f9fafb; padding:10px; border:1px solid #e5e7eb; margin-top:8px; text-align:right; font-size:14px; }
              .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">Sales Report</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Farmley SFA — ${activeTab === 'today' ? 'Today' : 'Date Range'}</div>
            </div>
            <div class="info">
              <strong>Customer:</strong> ${route.params.customerName} (${customerCode})<br/>
              <strong>User:</strong> ${userLabel}<br/>
              <strong>Period:</strong> ${activeTab === 'today' ? formatDateDisplay(new Date()) : `${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`}<br/>
              <strong>Total Orders:</strong> ${filteredOrders.length}
            </div>
            ${sections.join('') || '<div style="text-align:center;color:#9ca3af;padding:30px;">No orders for this period</div>'}
            <div class="grand">Total Value: ${formatCurrency(totalValue)}</div>
            <div class="footer">
              Generated on ${new Date().toLocaleString('en-IN')} via Farmley SFA Mobile App
            </div>
          </body>
        </html>
      `;
      await sharePdf(
        html,
        `SalesReport_${customerCode}_${new Date().getTime()}`,
        'Share Sales Report PDF',
      );
    } catch (err: any) {
      console.error('PDF generation error:', err);
      const errorMessage = err?.message || String(err);
      Alert.alert(
        'PDF Generation Failed',
        `Error: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleShareSingle = async (order: Order) => {
    try {
      setLoading(true);
      const localLines: any[] = await database.get('order_lines')
        .query(Q.where('order_id', order.id))
        .fetch();
      let items = localLines.map((l: any) => ({
        name: l.itemName ?? l._raw?.item_name ?? l.itemCode ?? '',
        qty: Number(l.quantity ?? l._raw?.quantity ?? 0),
        price: Number(l.priceUsed ?? l._raw?.price_used ?? 0),
      }));
      // Backend / team-scoped orders (ALL tab, other reps, previous months) have
      // NO local order_lines, so the single-order PDF was blank. Fetch the lines
      // from the server, same as the All-tab PDF and the on-screen preview do.
      const trxCode = (order as any).serverTrxCode;
      if (items.length === 0 && trxCode) {
        try {
          const { data } = await api.get(`/orders/${encodeURIComponent(trxCode)}`);
          const srv: any[] = data?.lines ?? [];
          items = srv.map((l: any) => ({
            name: l.itemName ?? l.itemCode ?? '',
            qty: Number(l.quantity ?? 0),
            price: Number(l.priceUsed ?? 0),
          }));
        } catch (e) { console.warn('[MTD single PDF] backend order lines fetch failed:', e); }
      }
      const rows = items.map((it, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${it.name}</td>
            <td style="text-align: center;">${it.qty}</td>
            <td style="text-align: right;">${it.price.toFixed(2)}</td>
            <td style="text-align: right;">${(it.qty * it.price).toFixed(2)}</td>
          </tr>
        `).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a56db; padding-bottom: 10px; }
              .title { font-size: 20px; font-weight: bold; color: #1a56db; }
              .info { margin-bottom: 20px; line-height: 1.6; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th { background-color: #f3f4f6; text-align: left; padding: 10px; border: 1px solid #e5e7eb; font-size: 12px; }
              td { padding: 10px; border: 1px solid #e5e7eb; font-size: 12px; }
              .total-row { font-weight: bold; background-color: #f9fafb; }
              .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">Sales Report</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Transaction Detail</div>
            </div>
            <div class="info">
              <strong>Customer:</strong> ${route.params.customerName} (${customerCode})<br/>
              <strong>Trx Code:</strong> ${order.serverTrxCode || order.appTrxId?.slice(0, 16) || '-'}<br/>
              <strong>Date:</strong> ${formatDate(order.trxDate)}<br/>
              <strong>Total Amount:</strong> ${formatCurrency(order.totalAmount)}
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Name</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Price</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="total-row">
                  <td colspan="4">Grand Total</td>
                  <td style="text-align: right;">${formatCurrency(order.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
            <div class="footer">
              Generated via Farmley SFA Mobile App
            </div>
          </body>
        </html>
      `;
      await sharePdf(
        html,
        `Order_${order.serverTrxCode || order.appTrxId?.slice(0, 8) || 'sales'}`,
        'Share Sales Report PDF',
      );
    } catch (err: any) {
      console.error('Single PDF generation error:', err);
      const errorMessage = err?.message || String(err);
      Alert.alert(
        'PDF Generation Failed',
        `Error: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity style={st.orderCard} onPress={() => handleOrderPress(item)} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={[st.orderTrxCode, { marginBottom: 0, flex: 1 }]}>{item.serverTrxCode || item.appTrxId?.slice(0, 16) || item.id?.slice(0, 16)}</Text>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); handleShareSingle(item); }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="share-social-outline" size={15} color="#1a56db" />
        </TouchableOpacity>
      </View>
      <View style={st.orderRow}>
        <Text style={st.orderCustomer} numberOfLines={1}>({customerCode}) {item.customerName ?? route.params.customerName}</Text>
        <Text style={st.orderDate}>{formatDate(item.trxDate)}</Text>
      </View>
      <Text style={st.orderAmount}>Total Value: {formatCurrency(item.totalAmount)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={st.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Farmley header + back + share */}
      <View style={st.topHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Icon name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image source={require('../assets/farmley_logo.png')} style={{ height: 36, width: 130 }} resizeMode="contain" />
        </View>
        <TouchableOpacity onPress={handleSharePDF} activeOpacity={0.7}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a56db', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="document-text-outline" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ height: 3, backgroundColor: '#1a3a8f' }} />

      {/* Filter card */}
      <View style={st.headerCard}>
        <Text style={st.title}>MTD Sales Summary</Text>

        {/* Date + Search row — compact single row */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          <TouchableOpacity style={st.dateField} onPress={() => setShowFromPicker(true)} activeOpacity={0.7}>
            <Icon name="calendar-outline" size={16} color="#6B7280" />
            <Text style={st.dateValue} numberOfLines={1}>{formatDateDisplay(fromDate)}</Text>
          </TouchableOpacity>
          <Text style={{ alignSelf: 'center', color: '#9CA3AF', fontSize: 12 }}>to</Text>
          <TouchableOpacity style={st.dateField} onPress={() => setShowToPicker(true)} activeOpacity={0.7}>
            <Icon name="calendar-outline" size={16} color="#6B7280" />
            <Text style={st.dateValue} numberOfLines={1}>{formatDateDisplay(toDate)}</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={st.searchRow}>
          <Icon name="search" size={18} color="#9CA3AF" />
          <TextInput style={st.searchInput} placeholder="Search TrxCode" placeholderTextColor="#9CA3AF"
            value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
        </View>
      </View>

      {/* Tabs + Summary */}
      <View style={st.tabRow}>
        {(['today', 'all'] as TabKey[]).map((tab) => (
          <TouchableOpacity key={tab} style={[st.tab, activeTab === tab && st.tabActive]}
            onPress={() => { setActiveTab(tab); setSearch(''); }} activeOpacity={0.7}>
            <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>{tab.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick summary strip */}
      {!loading && filteredOrders.length > 0 && (
        <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
          <Text style={{ flex: 1, fontSize: 12, color: '#6B7280' }}>
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
            Total: {formatCurrency(filteredOrders.reduce((s, o) => s + (o.totalAmount ?? 0), 0))}
          </Text>
        </View>
      )}

      {/* Order List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1a3a8f" />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={st.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a3a8f" />
          }
          ListEmptyComponent={
            <View style={st.emptyContainer}>
              <Text style={st.emptyText}>No orders found</Text>
            </View>
          }
        />
      )}

      {/* From Date Picker */}
      <Modal visible={showFromPicker} transparent animationType="fade">
        <TouchableOpacity style={st.calOverlay} activeOpacity={1} onPress={() => setShowFromPicker(false)}>
          <View style={st.calModal} onStartShouldSetResponder={() => true}>
            <CalendarPicker
              initialDate={fromDate}
              onSelect={(d) => { setFromDate(d); setShowFromPicker(false); }}
              onCancel={() => setShowFromPicker(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* To Date Picker */}
      <Modal visible={showToPicker} transparent animationType="fade">
        <TouchableOpacity style={st.calOverlay} activeOpacity={1} onPress={() => setShowToPicker(false)}>
          <View style={st.calModal} onStartShouldSetResponder={() => true}>
            <CalendarPicker
              initialDate={toDate}
              onSelect={(d) => { setToDate(d); setShowToPicker(false); }}
              onCancel={() => setShowToPicker(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sales Report Preview */}
      {showPreview && (
        <Modal visible={true} animationType="slide" onRequestClose={() => setShowPreview(false)}>
          <View style={st.previewContainer}>
            <View style={st.previewHeader}>
              <TouchableOpacity onPress={() => setShowPreview(false)} style={{ padding: 4 }}>
                <Icon name="arrow-back" size={22} color="#333" />
              </TouchableOpacity>
              <Text style={st.previewTitle}>{previewTitle}</Text>
            </View>
            <View style={{ height: 3, backgroundColor: '#1a3178' }} />

            <FlatList
              data={previewLines}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={{ padding: 12 }}
              renderItem={({ item: line }) => (
                <View style={st.previewCard}>
                  <Text style={st.previewItemName} numberOfLines={1}>{line.itemName}</Text>
                  <View style={st.previewRow}>
                    <View>
                      <Text style={st.previewLabel}>Set Price</Text>
                      <Text style={st.previewValue}>{line.priceUsed.toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text style={st.previewLabel}>Order Qty</Text>
                      <Text style={st.previewValue}>{line.quantity}</Text>
                    </View>
                    <View>
                      <Text style={st.previewLabel}>Total Price</Text>
                      <Text style={st.previewValue}>{(line.quantity * line.priceUsed).toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={st.emptyText}>No line items</Text>}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  // Top header with logo
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },

  // Filter card
  headerCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: '#F9FAFB',
  },
  dateValue: { fontSize: 12, fontWeight: '600', color: '#111827', flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', padding: 0 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#1a3a8f' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.3 },
  tabTextActive: { color: '#1a3a8f' },

  // List
  list: { padding: 10, paddingBottom: 30 },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  orderTrxCode: { fontSize: 13, fontWeight: '700', color: '#1a3a8f', marginBottom: 4 },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  orderCustomer: { fontSize: 12, fontWeight: '500', color: '#374151', flex: 1, marginRight: 6 },
  orderAmount: { fontSize: 14, fontWeight: '700', color: '#111827' },
  orderDate: { fontSize: 11, color: '#9CA3AF' },

  // Calendar modal
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    width: 320,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },

  // Preview
  previewContainer: {
    flex: 1,
    backgroundColor: '#ECECEC',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingBottom: 10,
    gap: 12,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  previewItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a3178',
  },
});
