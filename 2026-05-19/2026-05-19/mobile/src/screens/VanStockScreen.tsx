import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

const VAN_STOCK_KEY = 'van_stock_data';

interface VanItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  loadedQty: number;
  soldQty: number;
}

function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function VanStockScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<VanItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all active items from WatermelonDB
      const allItems: any[] = await database
        .get('items')
        .query(Q.where('is_active', true))
        .fetch();

      // Load today's order lines to calculate sold qty
      const todayStr = getTodayString();
      let soldMap = new Map<string, number>();

      try {
        const todayOrders: any[] = await database
          .get('orders')
          .query(Q.where('order_date', todayStr))
          .fetch();

        const orderIds = todayOrders.map((o: any) => o.id ?? o._raw?.id);

        if (orderIds.length > 0) {
          const orderLines: any[] = await database
            .get('order_lines')
            .query(Q.where('order_id', Q.oneOf(orderIds)))
            .fetch();

          for (const line of orderLines) {
            const prev = soldMap.get(line.itemCode) ?? 0;
            soldMap.set(line.itemCode, prev + (line.quantity ?? 0));
          }
        }
      } catch {
        // order lines not available or table doesn't exist yet
      }

      // Load previous saved stock from AsyncStorage
      let savedStockMap = new Map<string, number>();
      try {
        const stockKey = `${VAN_STOCK_KEY}_${user?.code ?? 'unknown'}_${getTodayString()}`;
        const raw = await AsyncStorage.getItem(stockKey);
        if (raw) {
          const parsed: Record<string, number> = JSON.parse(raw);
          savedStockMap = new Map(Object.entries(parsed));
        }
      } catch {
        // no previous stock
      }

      const vanItems: VanItem[] = allItems.map((item: any) => ({
        code: item.code,
        name: item.name,
        category: item.category ?? 'Uncategorized',
        brand: item.brand ?? '',
        loadedQty: savedStockMap.get(item.code) ?? 0,
        soldQty: soldMap.get(item.code) ?? 0,
      }));

      vanItems.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });

      setItems(vanItems);
    } catch (err) {
      Alert.alert('Error', 'Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateLoadedQty = useCallback((code: string, text: string) => {
    const parsed = parseInt(text, 10);
    const qty = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setItems((prev) =>
      prev.map((item) => (item.code === code ? { ...item, loadedQty: qty } : item)),
    );
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q),
    );
  }, [items, search]);

  const summary = useMemo(() => {
    const totalLoaded = items.reduce((s, i) => s + i.loadedQty, 0);
    const totalSold = items.reduce((s, i) => s + i.soldQty, 0);
    const totalBalance = totalLoaded - totalSold;
    const totalItems = items.filter((i) => i.loadedQty > 0).length;
    return { totalLoaded, totalSold, totalBalance, totalItems };
  }, [items]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const stockData: Record<string, number> = {};
      for (const item of items) {
        if (item.loadedQty > 0) {
          stockData[item.code] = item.loadedQty;
        }
      }
      const stockKey = `${VAN_STOCK_KEY}_${user?.code ?? 'unknown'}_${getTodayString()}`;
      await AsyncStorage.setItem(stockKey, JSON.stringify(stockData));
      Alert.alert('Saved', 'Van stock saved successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save van stock.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading van stock...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Icon name="arrow-back" size={22} color={Colors.white} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Van Stock</Text>
              <Text style={styles.headerSub}>
                {summary.totalItems} item{summary.totalItems !== 1 ? 's' : ''} loaded
              </Text>
            </View>
          </View>
          <View style={styles.headerValueBadge}>
            <Text style={styles.headerValueLabel}>Total Loaded</Text>
            <Text style={styles.headerValueText}>{summary.totalLoaded}</Text>
          </View>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Icon name="search-outline" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, code, category..."
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear}>
            <Icon name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Column headers */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, { flex: 1 }]}>Product</Text>
        <Text style={[styles.tableHeaderText, styles.tableHeaderNum]}>Loaded</Text>
        <Text style={[styles.tableHeaderText, styles.tableHeaderNum]}>Sold</Text>
        <Text style={[styles.tableHeaderText, styles.tableHeaderNum]}>Balance</Text>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => {
          const balance = item.loadedQty - item.soldQty;
          const balanceColor =
            balance < 0 ? Colors.danger : balance === 0 ? Colors.textSecondary : Colors.success;
          return (
            <View style={styles.itemRow}>
              <View style={styles.itemInfoCol}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {item.code}
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </View>
              <TextInput
                style={styles.qtyInput}
                value={item.loadedQty > 0 ? String(item.loadedQty) : ''}
                onChangeText={(t) => updateLoadedQty(item.code, t)}
                placeholder="0"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <Text style={styles.qtyCell}>{item.soldQty}</Text>
              <Text style={[styles.qtyCell, { color: balanceColor, fontWeight: '700' }]}>
                {balance}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="cube-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>No items found</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />

      {/* Summary card + save button */}
      <View style={styles.bottomBar}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Total Loaded</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>{summary.totalLoaded}</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Total Sold</Text>
            <Text style={[styles.summaryValue, { color: Colors.warning }]}>{summary.totalSold}</Text>
          </View>
          <View style={styles.summarySep} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: summary.totalBalance < 0 ? Colors.danger : Colors.success },
              ]}
            >
              {summary.totalBalance}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Icon name="save-outline" size={18} color={Colors.white} />
              <Text style={styles.saveBtnText}>Save Stock</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerValueBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  headerValueLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerValueText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: Colors.text,
  },
  searchClear: {
    padding: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableHeaderNum: {
    width: 64,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 200,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  itemInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  itemMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  qtyInput: {
    width: 64,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  qtyCell: {
    width: 64,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 16,
    paddingBottom: SAFE_BOTTOM_PADDING,
    gap: 12,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summarySep: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
