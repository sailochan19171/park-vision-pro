import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import useAuthStore from '../store/auth';
import { Colors } from '../utils/colors';
import {
  InvoiceRecord,
  buildInvoiceHtml,
  saveInvoice,
} from './SalesInvoiceScreen';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SerializedLine {
  id: string;
  lineNo: number;
  itemCode: string;
  itemName: string | null;
  quantity: number;
  priceUsed: number;
  taxPct: number;
  uom: string;
}

type RouteParams = {
  InvoiceDetail: {
    invoice: InvoiceRecord;
    lines: SerializedLine[];
  };
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InvoiceDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'InvoiceDetail'>>();
  const { invoice: initialInvoice, lines } = route.params;
  const user = useAuthStore((s) => s.user);

  const [invoice, setInvoice] = useState<InvoiceRecord>(initialInvoice);
  const [sharing, setSharing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ── Computed totals ────────────────────────────────────────────────────────

  const subtotal = lines.reduce((s, l) => s + l.priceUsed * l.quantity, 0);
  // GST/tax removed — Farmley does not apply tax on products
  const taxTotal = 0;
  const grandTotal = subtotal;

  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleGeneratePdf = useCallback(async () => {
    if (generatingPdf) return;
    setGeneratingPdf(true);
    try {
      const html = buildInvoiceHtml(invoice, lines as any);

      // Share the HTML content as plain text (acts as a shareable invoice document)
      const result = await Share.share(
        {
          title: `Invoice ${invoice.invoiceNumber}`,
          message: html,
        },
        {
          dialogTitle: `Invoice ${invoice.invoiceNumber}`,
          subject: `Invoice ${invoice.invoiceNumber} - ${invoice.customerName}`,
        },
      );

      if (result.action === Share.sharedAction) {
        const updated: InvoiceRecord = { ...invoice, status: 'shared' };
        await saveInvoice(updated);
        setInvoice(updated);
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not share invoice: ' + (err?.message ?? String(err)));
      }
    } finally {
      setGeneratingPdf(false);
    }
  }, [generatingPdf, invoice, lines]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const body = buildInvoiceTextSummary(invoice, lines, subtotal, taxTotal, grandTotal);
      const result = await Share.share(
        {
          title: `Invoice ${invoice.invoiceNumber}`,
          message: body,
        },
        {
          dialogTitle: `Share Invoice ${invoice.invoiceNumber}`,
          subject: `Invoice ${invoice.invoiceNumber} - ${invoice.customerName}`,
        },
      );

      if (result.action === Share.sharedAction) {
        const updated: InvoiceRecord = { ...invoice, status: 'shared' };
        await saveInvoice(updated);
        setInvoice(updated);
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not share: ' + (err?.message ?? String(err)));
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, invoice, lines, subtotal, taxTotal, grandTotal]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusColor =
    invoice.status === 'shared'
      ? '#15803d'
      : invoice.status === 'generated'
      ? Colors.primary
      : Colors.warning;

  const statusLabel =
    invoice.status === 'shared'
      ? 'Shared'
      : invoice.status === 'generated'
      ? 'Generated'
      : 'Draft';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Invoice header card */}
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceHeaderTop}>
            <View>
              <Text style={styles.invoiceLabel}>INVOICE</Text>
              <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Bill To</Text>
              <Text style={styles.metaValue}>{invoice.customerName || invoice.customerCode}</Text>
              <Text style={styles.metaSub}>{invoice.customerCode}</Text>
            </View>
            <View style={[styles.metaBlock, { alignItems: 'flex-end' }]}>
              <Text style={styles.metaLabel}>Invoice Date</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.invoiceDate)}</Text>
              <Text style={styles.metaSub}>Order: {invoice.orderId.slice(-8).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Line items */}
        <Text style={styles.sectionTitle}>Line Items ({lines.length})</Text>
        <View style={styles.linesCard}>
          {/* Table header */}
          <View style={styles.lineHeader}>
            <Text style={[styles.lineHeaderTxt, { flex: 3 }]}>Item</Text>
            <Text style={[styles.lineHeaderTxt, { flex: 1, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.lineHeaderTxt, { flex: 1.5, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.lineHeaderTxt, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
          </View>

          {lines.map((line, idx) => {
            const lineTotal = line.priceUsed * line.quantity;
            return (
              <View
                key={line.id}
                style={[
                  styles.lineRow,
                  idx % 2 === 1 && styles.lineRowAlt,
                  idx === lines.length - 1 && styles.lineRowLast,
                ]}
              >
                <View style={{ flex: 3 }}>
                  <Text style={styles.lineName} numberOfLines={2}>
                    {line.itemName ?? line.itemCode}
                  </Text>
                  <Text style={styles.lineCode}>{line.itemCode}</Text>
                </View>
                <Text style={styles.lineQty}>
                  {line.quantity}
                  {line.uom ? `\n${line.uom}` : ''}
                </Text>
                <Text style={styles.linePrice}>{fmt(line.priceUsed)}</Text>
                <Text style={styles.lineTotal}>{fmt(lineTotal)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{fmt(grandTotal)}</Text>
          </View>
        </View>

        {/* Generated meta */}
        <Text style={styles.footerNote}>
          Generated {new Date(invoice.generatedAt).toLocaleString('en-IN')}
          {user ? ` · ${user.name ?? user.code}` : ''}
        </Text>
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionOutline, (generatingPdf || sharing) && styles.actionDisabled]}
          activeOpacity={0.75}
          onPress={handleGeneratePdf}
          disabled={generatingPdf || sharing}
        >
          {generatingPdf ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Icon name="document-outline" size={18} color={Colors.primary} />
          )}
          <Text style={styles.actionOutlineText}>Generate PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary, (generatingPdf || sharing) && styles.actionDisabled]}
          activeOpacity={0.75}
          onPress={handleShare}
          disabled={generatingPdf || sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Icon name="share-social-outline" size={18} color={Colors.white} />
          )}
          <Text style={styles.actionPrimaryText}>Share Invoice</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Text summary helper ──────────────────────────────────────────────────────

function buildInvoiceTextSummary(
  invoice: InvoiceRecord,
  lines: SerializedLine[],
  subtotal: number,
  taxTotal: number,
  grandTotal: number,
): string {
  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  const dateStr = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lineStr = lines
    .map(
      (l, i) => {
        const lineTotal = l.priceUsed * l.quantity;
        return `  ${i + 1}. ${l.itemName ?? l.itemCode} (${l.itemCode})\n     Qty: ${l.quantity} ${l.uom ?? ''} x ${fmt(l.priceUsed)} = ${fmt(lineTotal)}`;
      },
    )
    .join('\n');

  return `INVOICE — ${invoice.invoiceNumber}
Date: ${dateStr}
Customer: ${invoice.customerName} (${invoice.customerCode})

ITEMS:
${lineStr}

─────────────────────────
Total: ${fmt(grandTotal)}
─────────────────────────

Generated by Farmley SFA`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },

  // Invoice header card
  invoiceHeader: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  invoiceHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  invoiceLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  invoiceNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 4,
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  metaSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },

  // Line items
  linesCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
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
  lineHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
  },
  lineHeaderTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  lineRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  lineRowAlt: {
    backgroundColor: Colors.primaryLight,
  },
  lineRowLast: {
    borderBottomWidth: 0,
  },
  lineName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 18,
  },
  lineCode: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  lineQty: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  linePrice: {
    flex: 1.5,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  lineTax: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  lineTotal: {
    flex: 1.5,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },

  // Totals
  totalsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
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
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  totalsLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  totalsValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.primary,
  },
  grandLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  grandValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
  },

  footerNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionPrimary: {
    backgroundColor: Colors.primary,
  },
  actionOutline: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPrimaryText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  actionOutlineText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
