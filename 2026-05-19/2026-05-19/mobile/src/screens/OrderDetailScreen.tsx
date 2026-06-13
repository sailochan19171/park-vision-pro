import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors } from '../utils/colors';
import database from '../db/database';
import type Order from '../db/models/Order';
import type OrderLine from '../db/models/OrderLine';

type RouteParams = {
  OrderDetail: { orderId: string };
};

export default function OrderDetailScreen() {
  const route = useRoute<RouteProp<RouteParams, 'OrderDetail'>>();
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const o: any = await database.get('orders').find(orderId);
        setOrder(o);
        const l: any[] = await o.orderLines.fetch();
        setLines(l.sort((a: any, b: any) => a.lineNo - b.lineNo));
      } catch {
        // Order not found
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const formatCurrency = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Order not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Order info card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Customer</Text>
          <Text style={styles.cardValue}>{order.customerName ?? order.customerCode}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Date</Text>
          <Text style={styles.cardValue}>
            {formatDate(order.trxDate)} at {formatTime(order.trxDate)}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Status</Text>
          <View style={styles.syncRow}>
            <View
              style={[
                styles.syncDot,
                { backgroundColor: order.isSynced ? Colors.success : Colors.warning },
              ]}
            />
            <Text style={styles.cardValue}>
              {order.isSynced ? 'Synced' : 'Pending sync'}
            </Text>
          </View>
        </View>
        {order.serverTrxCode ? (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Server code</Text>
            <Text style={[styles.cardValue, styles.mono]}>{order.serverTrxCode}</Text>
          </View>
        ) : null}
      </View>

      {/* Line items */}
      <Text style={styles.sectionTitle}>
        Items ({lines.length})
      </Text>

      <View style={styles.linesCard}>
        {/* Header */}
        <View style={styles.lineHeader}>
          <Text style={[styles.lineHeaderText, styles.lineItem]}>Item</Text>
          <Text style={[styles.lineHeaderText, styles.lineQty]}>Qty</Text>
          <Text style={[styles.lineHeaderText, styles.linePrice]}>Price</Text>
          <Text style={[styles.lineHeaderText, styles.lineTotal]}>Total</Text>
        </View>

        {lines.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <View style={styles.lineItem}>
              <Text style={styles.lineName} numberOfLines={2}>
                {line.itemName ?? line.itemCode}
              </Text>
              <Text style={styles.lineCode}>{line.itemCode}</Text>
            </View>
            <Text style={styles.lineQty}>{line.quantity}</Text>
            <Text style={styles.linePrice}>{formatCurrency(line.priceUsed)}</Text>
            <Text style={styles.lineTotal}>
              {formatCurrency(line.priceUsed * line.quantity)}
            </Text>
          </View>
        ))}

        {/* Order total — GST removed */}
        {(() => {
          const subtotal = lines.reduce((s, l) => s + l.priceUsed * l.quantity, 0);
          return (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
            </View>
          );
        })()}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
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
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cardLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  cardValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  linesCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
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
  lineHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lineRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  lineItem: {
    flex: 3,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  lineCode: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  lineQty: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  linePrice: {
    flex: 1.5,
    fontSize: 14,
    color: Colors.text,
    textAlign: 'right',
  },
  lineTotal: {
    flex: 1.5,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  subtotalLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  subtotalValue: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primaryLight,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
});
