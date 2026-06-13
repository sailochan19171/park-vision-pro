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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';
import { buildPriceMap } from '../services/priceLookup';
import { SAFE_BOTTOM_PADDING } from '../utils/safeBottom';

const PRICE_CHECK_KEY = 'price_check_data';

type RouteParams = {
  PriceCheck: {
    customerCode: string;
    customerName: string;
    visitCode?: string;
    priceList?: string;
  };
};

interface PriceCheckItem {
  code: string;
  name: string;
  category: string;
  brand: string;
  expectedPrice: number;
  actualPrice: string; // string for input
  currency: string;
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isCompliant(item: PriceCheckItem): boolean {
  const actual = parseFloat(item.actualPrice);
  if (isNaN(actual) || item.actualPrice === '') return true; // not checked
  return actual === item.expectedPrice;
}

function isChecked(item: PriceCheckItem): boolean {
  return item.actualPrice !== '';
}

export default function PriceCheckScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'PriceCheck'>>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, visitCode, priceList = 'GT' } = route.params;

  const [items, setItems] = useState<PriceCheckItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<'ALL' | 'NON_COMPLIANT'>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all active items
      const allItems: any[] = await database
        .get('items')
        .query(Q.where('is_active', true))
        .fetch();

      // Region-preferred prices (regional override → base → GT) for this customer.
      let priceMap = new Map<string, { price: number; currency: string }>();
      try {
        const [cust]: any[] = await database
          .get('customers')
          .query(Q.where('code', customerCode))
          .fetch();
        const regionCode: string | null = cust?._raw?.region_code ?? null;
        const effective = await buildPriceMap(database, priceList, regionCode);
        for (const [itemCode, info] of effective) {
          priceMap.set(itemCode, { price: info.price ?? 0, currency: 'INR' });
        }
      } catch {
        // prices table may be empty
      }

      // Restore previously saved checks
      let savedMap = new Map<string, string>();
      try {
        const key = `${PRICE_CHECK_KEY}_${customerCode}_${getTodayString()}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.items) {
            for (const it of parsed.items) {
              savedMap.set(it.code, it.actualPrice ?? '');
            }
          }
        }
      } catch {
        // no previous
      }

      const checkItems: PriceCheckItem[] = allItems.map((item: any) => {
        const priceInfo = priceMap.get(item.code);
        return {
          code: item.code,
          name: item.name,
          category: item.category ?? 'Uncategorized',
          brand: item.brand ?? '',
          expectedPrice: priceInfo?.price ?? 0,
          actualPrice: savedMap.get(item.code) ?? '',
          currency: priceInfo?.currency ?? 'AED',
        };
      });

      // Sort by category, then name
      checkItems.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });

      setItems(checkItems);
    } catch (err) {
      Alert.alert('Error', 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [customerCode, priceList]);

  useEffect(() => {
    loadData();
    const sub = database.collections.get('prices').changes.subscribe(() => {
      loadData();
    });
    return () => sub.unsubscribe();
  }, [loadData]);

  const updateActualPrice = useCallback((code: string, text: string) => {
    setItems((prev) =>
      prev.map((item) => (item.code === code ? { ...item, actualPrice: text } : item)),
    );
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterMode === 'NON_COMPLIANT') {
      result = result.filter((i) => isChecked(i) && !isCompliant(i));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, search, filterMode]);

  const summary = useMemo(() => {
    const checked = items.filter(isChecked);
    const compliant = checked.filter(isCompliant);
    const nonCompliant = checked.filter((i) => !isCompliant(i));
    return {
      total: items.length,
      checked: checked.length,
      compliant: compliant.length,
      nonCompliant: nonCompliant.length,
    };
  }, [items]);

  const handleSave = async () => {
    const checkedItems = items.filter(isChecked);
    if (checkedItems.length === 0) {
      Alert.alert('No Data', 'Enter actual prices for at least one item before saving.');
      return;
    }

    setSaving(true);
    try {
      const key = `${PRICE_CHECK_KEY}_${customerCode}_${getTodayString()}`;
      const payload = {
        customerCode,
        customerName,
        visitCode,
        userCode: user?.code ?? '',
        date: getTodayString(),
        priceList,
        items: checkedItems.map((i) => ({
          code: i.code,
          name: i.name,
          category: i.category,
          expectedPrice: i.expectedPrice,
          actualPrice: i.actualPrice,
          currency: i.currency,
          compliant: isCompliant(i),
        })),
        summary: {
          total: checkedItems.length,
          compliant: checkedItems.filter(isCompliant).length,
          nonCompliant: checkedItems.filter((i) => !isCompliant(i)).length,
        },
        savedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(payload));

      Alert.alert(
        'Price Check Saved',
        `${checkedItems.length} items checked.\n${payload.summary.nonCompliant} non-compliant.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert('Error', 'Failed to save price check.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Price Check</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{customerName}</Text>
          </View>
          {summary.nonCompliant > 0 && (
            <View style={styles.mismatchBadge}>
              <Icon name="alert-circle" size={14} color={Colors.white} />
              <Text style={styles.mismatchBadgeText}>{summary.nonCompliant}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryCellValue}>{summary.total}</Text>
          <Text style={styles.summaryCellLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryCellValue}>{summary.checked}</Text>
          <Text style={styles.summaryCellLabel}>Checked</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryCellValue, { color: Colors.success }]}>
            {summary.compliant}
          </Text>
          <Text style={styles.summaryCellLabel}>Compliant</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryCellValue, { color: Colors.danger }]}>
            {summary.nonCompliant}
          </Text>
          <Text style={styles.summaryCellLabel}>Mismatch</Text>
        </View>
      </View>

      {/* Search + filter */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={Colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Icon name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, filterMode === 'NON_COMPLIANT' && styles.filterBtnActive]}
          onPress={() =>
            setFilterMode((m) => (m === 'ALL' ? 'NON_COMPLIANT' : 'ALL'))
          }
          activeOpacity={0.7}
        >
          <Icon
            name="alert-circle-outline"
            size={16}
            color={filterMode === 'NON_COMPLIANT' ? Colors.white : Colors.danger}
          />
          <Text
            style={[
              styles.filterBtnText,
              filterMode === 'NON_COMPLIANT' && styles.filterBtnTextActive,
            ]}
          >
            Mismatches
          </Text>
        </TouchableOpacity>
      </View>

      {/* Column headers */}
      <View style={styles.columnHeader}>
        <Text style={[styles.colHeaderText, { flex: 1 }]}>Product</Text>
        <Text style={[styles.colHeaderText, styles.colHeaderNum]}>Expected</Text>
        <Text style={[styles.colHeaderText, styles.colHeaderNum]}>Actual</Text>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => {
          const checked = isChecked(item);
          const compliant = isCompliant(item);
          const mismatch = checked && !compliant;
          const actualNum = parseFloat(item.actualPrice);
          const diff = checked && !isNaN(actualNum)
            ? actualNum - item.expectedPrice
            : null;

          return (
            <View
              style={[
                styles.itemRow,
                mismatch && styles.itemRowMismatch,
              ]}
            >
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemMeta}>{item.code} · {item.category}</Text>
                {mismatch && diff !== null && (
                  <Text style={styles.diffText}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)} vs expected
                  </Text>
                )}
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.expectedPrice}>
                  {item.expectedPrice > 0
                    ? `${item.currency} ${item.expectedPrice.toFixed(2)}`
                    : 'N/A'}
                </Text>
              </View>
              <View style={styles.actualPriceCell}>
                <TextInput
                  style={[
                    styles.actualInput,
                    mismatch && styles.actualInputMismatch,
                    checked && compliant && styles.actualInputCompliant,
                  ]}
                  value={item.actualPrice}
                  onChangeText={(t) => updateActualPrice(item.code, t)}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                {checked && (
                  <Icon
                    name={compliant ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={compliant ? Colors.success : Colors.danger}
                    style={styles.statusIcon}
                  />
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="pricetag-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>
              {filterMode === 'NON_COMPLIANT'
                ? 'No mismatches found'
                : 'No products found'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />

      {/* Bottom save bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomInfoMain}>
            {summary.checked} / {summary.total} checked
          </Text>
          {summary.nonCompliant > 0 && (
            <Text style={styles.bottomInfoSub}>
              {summary.nonCompliant} price mismatch{summary.nonCompliant !== 1 ? 'es' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, summary.checked === 0 && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || summary.checked === 0}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
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
  mismatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  mismatchBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryCellValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryCellLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    height: 40,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingHorizontal: 10,
    height: 40,
    gap: 4,
    backgroundColor: '#fff5f5',
  },
  filterBtnActive: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.danger,
  },
  filterBtnTextActive: {
    color: Colors.white,
  },
  columnHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colHeaderNum: {
    width: 90,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 120,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  itemRowMismatch: {
    backgroundColor: '#fff5f5',
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  itemInfo: {
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
  diffText: {
    fontSize: 11,
    color: Colors.danger,
    fontWeight: '600',
    marginTop: 3,
  },
  priceCell: {
    width: 90,
    alignItems: 'center',
  },
  expectedPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  actualPriceCell: {
    width: 90,
    alignItems: 'center',
    position: 'relative',
  },
  actualInput: {
    width: 80,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  actualInputMismatch: {
    borderColor: Colors.danger,
    backgroundColor: '#fff5f5',
    color: Colors.danger,
  },
  actualInputCompliant: {
    borderColor: Colors.success,
    backgroundColor: '#f0fdf4',
    color: Colors.success,
  },
  statusIcon: {
    position: 'absolute',
    top: -6,
    right: 2,
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomInfo: {
    flex: 1,
  },
  bottomInfoMain: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  bottomInfoSub: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 2,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
