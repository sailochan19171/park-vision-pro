import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { Colors } from '../utils/colors';
import type Order from '../db/models/Order';
import type OrderLine from '../db/models/OrderLine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceRecord {
  invoiceNumber: string;
  orderId: string;
  customerCode: string;
  customerName: string;
  invoiceDate: number;
  trxDate: number;
  userCode: string;
  status: 'draft' | 'generated' | 'shared';
  generatedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INVOICE_STORAGE_KEY = 'invoices_v1';

export async function loadInvoices(): Promise<InvoiceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(INVOICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveInvoice(record: InvoiceRecord): Promise<void> {
  const all = await loadInvoices();
  const idx = all.findIndex((r) => r.orderId === record.orderId);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  await AsyncStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(all));
}

export async function getInvoiceForOrder(orderId: string): Promise<InvoiceRecord | null> {
  const all = await loadInvoices();
  return all.find((r) => r.orderId === orderId) ?? null;
}

export function generateInvoiceNumber(userCode: string, orderId: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `INV-${yy}${mm}${dd}-${userCode.toUpperCase()}-${suffix}`;
}

export function buildInvoiceHtml(
  invoice: InvoiceRecord,
  lines: OrderLine[],
): string {
  const subtotal = lines.reduce((s, l) => s + l.priceUsed * l.quantity, 0);
  // GST/tax removed — Farmley does not apply tax on products
  const taxTotal = 0;
  const grandTotal = subtotal;

  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  const invoiceDateStr = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lineRows = lines
    .map(
      (l, i) => {
        const lineAmt = l.priceUsed * l.quantity;
        return `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8faff'}">
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
            <strong>${l.itemName ?? l.itemCode}</strong><br/>
            <span style="color:#6b7280;font-size:12px;">${l.itemCode}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${l.quantity} ${l.uom ?? ''}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(l.priceUsed)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmt(lineAmt)}</td>
        </tr>`;
      },
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; color: #111827; }
    .page { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a56db, #1e40af); padding: 32px 40px; color: #fff; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .brand-sub { font-size: 13px; opacity: 0.75; margin-top: 2px; }
    .inv-title { text-align: right; }
    .inv-title h1 { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
    .inv-title .inv-num { font-size: 14px; opacity: 0.85; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; padding: 28px 40px; border-bottom: 1px solid #e5e7eb; background: #f8faff; }
    .meta-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; margin-bottom: 6px; }
    .meta-block p { font-size: 15px; font-weight: 600; color: #111827; }
    .meta-block .sub { font-size: 13px; color: #6b7280; font-weight: 400; margin-top: 2px; }
    .items { padding: 28px 40px; }
    .items h2 { font-size: 15px; font-weight: 700; color: #374151; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead tr { background: #1a56db; color: #fff; }
    thead th { padding: 11px 12px; text-align: left; font-size: 12px; font-weight: 600; letter-spacing: 0.4px; }
    thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(6) { text-align: right; }
    thead th:nth-child(3) { text-align: center; }
    thead th:nth-child(5) { text-align: center; }
    .totals { padding: 0 40px 28px; }
    .totals-inner { margin-left: auto; width: 280px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .totals-row { display: flex; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .totals-row.grand { background: #1a56db; color: #fff; font-weight: 700; font-size: 16px; border-bottom: none; }
    .footer { background: #f8faff; border-top: 1px solid #e5e7eb; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-row">
      <div>
        <div class="brand">Farmley</div>
        <div class="brand-sub">Sales Force Automation</div>
      </div>
      <div class="inv-title">
        <h1>INVOICE</h1>
        <div class="inv-num">${invoice.invoiceNumber}</div>
      </div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <h3>Bill To</h3>
      <p>${invoice.customerName || invoice.customerCode}</p>
      <p class="sub">${invoice.customerCode}</p>
    </div>
    <div class="meta-block" style="text-align:right">
      <h3>Invoice Date</h3>
      <p>${invoiceDateStr}</p>
      <p class="sub">Order ref: ${invoice.orderId.slice(-8).toUpperCase()}</p>
    </div>
  </div>

  <div class="items">
    <h2>Line Items</h2>
    <table>
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th>Description</th>
          <th>Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th>Tax %</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>

  <div class="totals">
    <div class="totals-inner">
      <div class="totals-row grand">
        <span>Total</span><span>${fmt(grandTotal)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    Generated by Farmley SFA &bull; ${new Date().toLocaleString('en-IN')} &bull; Sales Rep: ${invoice.userCode}
  </div>
</div>
</body>
</html>`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SalesInvoiceScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceRecord>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const todayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const results: any[] = await database
        .get('orders')
        .query(
          Q.where('user_code', user.code),
          Q.where('trx_date', Q.gte(todayStart)),
          Q.sortBy('trx_date', Q.desc),
        )
        .fetch();
      setOrders(results as Order[]);

      // Load invoice statuses
      const all = await loadInvoices();
      const map: Record<string, InvoiceRecord> = {};
      all.forEach((inv) => {
        map[inv.orderId] = inv;
      });
      setInvoiceMap(map);
    } finally {
      setLoading(false);
    }
  }, [user, todayStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadData());
    return unsub;
  }, [navigation, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleGenerateInvoice = useCallback(
    async (order: Order) => {
      if (generatingId) return;
      setGeneratingId(order.id);
      try {
        // Fetch lines
        const lines: OrderLine[] = await (order as any).orderLines.fetch();
        const sortedLines = [...lines].sort((a: any, b: any) => a.lineNo - b.lineNo);

        // Build or reuse invoice record
        let record = invoiceMap[order.id] ?? null;
        if (!record) {
          record = {
            invoiceNumber: generateInvoiceNumber(user?.code ?? 'USR', order.id),
            orderId: order.id,
            customerCode: order.customerCode,
            customerName: order.customerName ?? order.customerCode,
            invoiceDate: Date.now(),
            trxDate: order.trxDate,
            userCode: user?.code ?? '',
            status: 'draft',
            generatedAt: Date.now(),
          };
        }
        record.status = 'generated';
        record.generatedAt = Date.now();
        await saveInvoice(record);

        setInvoiceMap((prev) => ({ ...prev, [order.id]: record! }));

        // Navigate to detail screen with full data
        navigation.navigate('InvoiceDetail', {
          invoice: record,
          lines: sortedLines.map((l: any) => ({
            id: l.id,
            lineNo: l.lineNo,
            itemCode: l.itemCode,
            itemName: l.itemName,
            quantity: l.quantity,
            priceUsed: l.priceUsed,
            taxPct: l.taxPct,
            uom: l.uom,
          })),
        });
      } catch (err: any) {
        Alert.alert('Error', 'Could not generate invoice: ' + (err?.message ?? String(err)));
      } finally {
        setGeneratingId(null);
      }
    },
    [generatingId, invoiceMap, navigation, user],
  );

  const formatCurrency = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const statusBadge = (orderId: string) => {
    const rec = invoiceMap[orderId];
    if (!rec) return { label: 'Not Generated', color: Colors.textSecondary, bg: Colors.border };
    if (rec.status === 'shared') return { label: 'Shared', color: '#15803d', bg: '#dcfce7' };
    if (rec.status === 'generated') return { label: 'Generated', color: Colors.primaryDark, bg: Colors.primaryLight };
    return { label: 'Draft', color: Colors.warning, bg: '#fff7ed' };
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const badge = statusBadge(item.id);
    const isGenerating = generatingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customerName ?? item.customerCode}
            </Text>
            <Text style={styles.cardMeta}>
              {item.customerCode} &bull; {formatTime(item.trxDate)}
            </Text>
            <Text style={styles.itemsCount}>
              {item.linesCount} item{item.linesCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{formatCurrency(item.totalAmount)}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, isGenerating && styles.actionBtnDisabled]}
            activeOpacity={0.75}
            onPress={() => handleGenerateInvoice(item)}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Icon name="document-text-outline" size={16} color={Colors.white} />
            )}
            <Text style={styles.actionBtnPrimaryText}>
              {invoiceMap[item.id] ? 'View Invoice' : 'Generate Invoice'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Sales Invoices</Text>
            <Text style={styles.headerSub}>Today's orders</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{orders.length}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="receipt-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>No orders today</Text>
            <Text style={styles.emptySub}>Orders placed today will appear here and can be converted to invoices.</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerBadgeText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 18,
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  itemsCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  badge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.primary,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnPrimaryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
