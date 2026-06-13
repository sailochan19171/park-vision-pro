import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  RefreshControl,
  Platform,
  ActivityIndicator,
  TextInput,
  StatusBar,
  Image,
  Modal,
  Animated,
  Dimensions,
  Alert,
  BackHandler,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import api from '../api/client';
import database from '../db/database';
import { pullSync, reconcileCustomerScope } from '../services/syncService';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getCurrentPosition, calculateDistance } from '../services/locationService';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;

const DRAWER_ITEMS = [
  { label: 'My Tasks',              screen: 'SurveyList',          mcIcon: 'clipboard-text-outline' },
  { label: 'My Store(s)',           screen: 'Stores',              mcIcon: 'handshake-outline' },
  { label: 'Target Vs Achievement', screen: 'TargetVsAchievement', mcIcon: 'clipboard-text-outline' },
  { label: 'Rota Creation',         screen: 'RotaCreate',          mcIcon: 'clipboard-text-outline' },
  { label: 'Reports',               screen: 'MobileReports',       mcIcon: 'clipboard-text-outline' },
  { label: 'Others',                screen: 'Settings',            mcIcon: 'tune-vertical' },
];
import type JourneyPlanCustomer from '../db/models/JourneyPlanCustomer';
import type Customer from '../db/models/Customer';

function getTodayDay(): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date().getDay()
  ];
}

type FilterTab = 'all' | 'pending' | 'visited';

interface StoreItem {
  id: string;
  sequence: number;
  customerCode: string;
  name: string;
  channel: string;
  region: string;
  address: string | null;
  visited: boolean;
  skipped: boolean;
  // True when the user has checked in but hasn't checked out yet — the
  // visit is still "open" and should not count as fully visited.
  inProgress: boolean;
  priceList: string | null;
  customerGroup: string | null;
  monthTarget: number;
  monthAchieved: number;
  latitude: string | null;
  longitude: string | null;
}

export default function JourneyPlanScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigation = useNavigation<any>();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // Android only: hardware back goes to home from My Stores.
  // iOS uses the visible back button instead (no hardware back).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        navigation.navigate('MainTabs');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation]),
  );

  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };
  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setDrawerVisible(false));
  };
  const [othersExpanded, setOthersExpanded] = useState(false);
  const handleDrawerNav = (screen: string) => {
    closeDrawer();
    setTimeout(() => navigation.navigate(screen), 250);
  };
  const handleLogout = () => {
    closeDrawer();
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: async () => {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
        logout();
      }},
    ]);
  };
  const handleEndDay = () => {
    closeDrawer();
    setTimeout(() => navigation.navigate('EndOfDay'), 250);
  };
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchText, setSearchText] = useState('');
  const [showUnplannedModal, setShowUnplannedModal] = useState(false);
  const [unplannedSearch, setUnplannedSearch] = useState('');

  // Geo-edit state
  const [geoEditStore, setGeoEditStore] = useState<StoreItem | null>(null);
  const [geoNewLat, setGeoNewLat] = useState('');
  const [geoNewLng, setGeoNewLng] = useState('');
  const [geoSubmitting, setGeoSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const userTypeLower = user?.userType?.toLowerCase() ?? '';
  // Only true admins see all stores. Managers / Senior Managers see their own
  // assigned stores via journey_plan_customers like regular field users.
  const isAdmin = userTypeLower === 'admin';

  const fetchFromAPI = useCallback(async () => {
    if (!user?.code) return;
    try {
      const { data } = await api.get('/user-customers', {
        params: { userCode: user.code, pageSize: 5000 },
      });
      const groups = data.data ?? [];
      // Flatten: groups is [{userCode, customers: [{customerCode, ...}]}]
      const customerCodes: string[] = [];
      for (const group of groups) {
        if (Array.isArray(group.customers)) {
          for (const c of group.customers) {
            if (c.customerCode) customerCodes.push(c.customerCode);
          }
        }
      }
      if (customerCodes.length === 0) return;

      // Store in local journey_plan_customers table for offline use
      await database.write(async () => {
        const existing = await database
          .get('journey_plan_customers')
          .query(Q.where('route_code', user.code))
          .fetch();
        for (const r of existing) {
          await r.destroyPermanently();
        }

        let seq = 1;
        for (const group of groups) {
          for (const c of (group.customers ?? [])) {
            await database.get('journey_plan_customers').create((rec) => {
              rec._raw.id = `jpc_${c.customerCode}_${user.code}`;
              (rec as any).customerCode = c.customerCode;
              (rec as any).routeCode = user.code;
              (rec as any).visitDay = 'Daily';
              (rec as any).visitSequence = seq++;
              (rec as any).frequency = c.frequency ?? 'Daily';
            });
          }
        }
      });

      // Sync customer master data if missing
      const existingCustomers: any[] = await database
        .get('customers')
        .query(Q.where('code', Q.oneOf(customerCodes)))
        .fetch();
      const existingCodes = new Set(existingCustomers.map((c: any) => c.code));
      const missingCodes = customerCodes.filter((c: string) => !existingCodes.has(c));

      if (missingCodes.length > 0 || existingCustomers.length === 0) {
        try {
          const { data: custData } = await api.get('/customers', {
            params: { pageSize: 5000 },
          });
          const customers = custData.data ?? custData;
          if (Array.isArray(customers)) {
            await database.write(async () => {
              for (const c of customers) {
                const existing = await database
                  .get('customers')
                  .query(Q.where('code', c.code))
                  .fetch();
                if (existing.length > 0) {
                  await existing[0].update((rec: any) => {
                    rec._raw.server_id = c.id?.toString() ?? rec._raw.server_id ?? '';
                    rec._raw.name = c.name;
                    rec._raw.address = c.address ?? null;
                    rec._raw.city_code = c.cityCode ?? null;
                    rec._raw.region_code = c.regionCode ?? null;
                    rec._raw.channel_code = c.channelCode ?? null;
                    rec._raw.customer_group = c.customerGroup ?? null;
                    rec._raw.price_list = c.priceList ?? null;
                    rec._raw.latitude = c.latitude ?? null;
                    rec._raw.longitude = c.longitude ?? null;
                    rec._raw.is_active = c.isActive ?? true;
                    rec._raw.server_updated_at = Date.now();
                  });
                } else {
                  await database.get('customers').create((rec) => {
                    rec._raw.id = `cust_${c.code}`;
                    (rec as any).serverId = c.id?.toString() ?? '';
                    (rec as any).code = c.code;
                    (rec as any).name = c.name;
                    (rec as any).address = c.address ?? null;
                    (rec as any).cityCode = c.cityCode ?? null;
                    (rec as any).regionCode = c.regionCode ?? null;
                    (rec as any).channelCode = c.channelCode ?? null;
                    (rec as any).customerGroup = c.customerGroup ?? null;
                    (rec as any).priceList = c.priceList ?? null;
                    (rec as any).latitude = c.latitude ?? null;
                    (rec as any).longitude = c.longitude ?? null;
                    (rec as any).isActive = c.isActive ?? true;
                    (rec as any).serverUpdatedAt = Date.now();
                  });
                }
              }
            });
          }
        } catch (_e) {}
      }
    } catch (_e) {}
  }, [user?.code]);

  const queryJpc = useCallback(() => {
    return isAdmin
      ? database.get('journey_plan_customers').query(
          Q.sortBy('visit_sequence', Q.asc),
        )
      : database.get('journey_plan_customers').query(
          Q.where('route_code', user?.code ?? ''),
          Q.sortBy('visit_sequence', Q.asc),
        );
  }, [isAdmin, user?.code]);

  const loadStores = useCallback(async () => {
    if (!isAdmin && !user?.code) {
      setLoading(false);
      return;
    }

    try {
      let jpcRecords: any[] = await queryJpc().fetch();

      if (jpcRecords.length === 0) {
        await fetchFromAPI();
        jpcRecords = await queryJpc().fetch();
      }

      // Fallback — if there's still no route schedule (no routeCode on user,
      // no explicit assignments), show every customer the user is allowed to
      // see from the synced customers table. Those are already region-scoped
      // server-side, so for Lochan this lands the 227 Telangana customers.
      if (jpcRecords.length === 0) {
        const syncedCustomers: any[] = await database.get('customers').query().fetch();
        jpcRecords = syncedCustomers.map((c: any, idx: number) => ({
          id: `virtual_${c.code}`,
          customerCode: c.code,
          visitSequence: idx + 1,
          routeCode: user?.routeCode ?? user?.code ?? '',
        }));
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const visits: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('checkin_time', Q.gte(todayStart.getTime())),
        )
        .fetch();
      // Fully visited = check-in AND a USER-DRIVEN check-out (with photo).
      // Visits closed by the server-side auto-checkout cron (checkout_type
      // === 'auto') don't have a real checkout photo, so they don't count
      // as Visited — they stay in "Pending" so the user must re-visit and
      // properly check out. Without this filter, a user killing the app
      // after check-in would see "Visited" on the store later even though
      // they never completed the proper checkout flow.
      const visitedCodes = new Set(
        visits
          .filter((v) => v.status === 'completed' && (v.checkoutType ?? v._raw?.checkout_type) !== 'auto')
          .map((v) => v.customerCode),
      );
      // In-progress = checked in today but not yet checked out.
      const inProgressCodes = new Set(visits.filter((v) => v.status === 'checked_in').map((v) => v.customerCode));
      const skippedCodes = new Set(visits.filter((v) => v.status === 'skipped').map((v) => v.customerCode));

      // Load monthly order totals for achievement
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const allOrders: any[] = await database.get('orders').query(
        Q.where('trx_date', Q.gte(monthStart.getTime())),
      ).fetch();
      const ordersByCustomer = new Map<string, number>();
      for (const o of allOrders) {
        const cc = o.customerCode ?? o._raw?.customer_code ?? '';
        ordersByCustomer.set(cc, (ordersByCustomer.get(cc) ?? 0) + (o.totalAmount ?? o._raw?.total_amount ?? 0));
      }

      const items: StoreItem[] = [];
      const seenCustomerCodes = new Set<string>();

      for (const jpc of jpcRecords) {
        if (seenCustomerCodes.has(jpc.customerCode)) continue;
        seenCustomerCodes.add(jpc.customerCode);

        const customers: any[] = await database
          .get('customers')
          .query(Q.where('code', jpc.customerCode))
          .fetch();
        const cust = customers[0];
        items.push({
          id: jpc.id,
          sequence: jpc.visitSequence ?? 0,
          customerCode: jpc.customerCode,
          name: cust?.name ?? jpc.customerCode,
          channel: cust?.channelCode ?? '-',
          region: cust?.regionCode ?? '-',
          address: cust?.address ?? null,
          visited: visitedCodes.has(jpc.customerCode),
          skipped: skippedCodes.has(jpc.customerCode),
          inProgress: inProgressCodes.has(jpc.customerCode),
          priceList: cust?.priceList ?? null,
          customerGroup: cust?.customerGroup ?? null,
          monthTarget: 0,
          monthAchieved: ordersByCustomer.get(jpc.customerCode) ?? 0,
          latitude: cust?.latitude ?? null,
          longitude: cust?.longitude ?? null,
        });
      }
      setStores(items);
    } catch (err) {
      console.error('loadStores error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.code, fetchFromAPI, queryJpc]);

  const loadingStoresRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (loadingStoresRef.current) return;
    loadingStoresRef.current = true;
    const id = setTimeout(() => {
      loadStores().finally(() => { loadingStoresRef.current = false; });
    }, 100);
    // Auto-refresh every 2 minutes to pick up background sync changes
    const refreshId = setInterval(() => {
      if (!loadingStoresRef.current) {
        loadingStoresRef.current = true;
        loadStores().finally(() => { loadingStoresRef.current = false; });
      }
    }, 2 * 60 * 1000);
    return () => { clearTimeout(id); clearInterval(refreshId); loadingStoresRef.current = false; };
  }, [loadStores]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Pull the scoped customers + price list + JPC fresh from the server,
      // then reconcile so anything newly revoked by an admin is purged.
      // This is what makes portal assignments feel "real-time" on mobile —
      // the user just tugs My Stores downwards and sees their updated list.
      await pullSync({
        modules: ['customers', 'prices', 'journey_plan_customers', 'user_customers'],
        limit: 1000,
        routeCode: user?.routeCode ?? user?.code ?? '',
      });
      await reconcileCustomerScope();
    } catch (err) {
      console.warn('[Stores] pull-to-refresh sync failed:', err);
    }
    await fetchFromAPI();
    await loadStores();
    setRefreshing(false);
  }, [fetchFromAPI, loadStores, user?.routeCode, user?.code]);

  const filteredStores = useMemo(() => {
    let list = stores;

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.customerCode.toLowerCase().includes(q) ||
          (s.address ?? '').toLowerCase().includes(q),
      );
    }

    if (activeTab === 'visited') return list.filter((s) => s.visited);
    // Pending = not fully visited and not skipped (includes in-progress visits).
    if (activeTab === 'pending') return list.filter((s) => !s.visited && !s.skipped);
    return list;
  }, [stores, searchText, activeTab]);

  const counts = useMemo(
    () => ({
      all: stores.length,
      pending: stores.filter((s) => !s.visited && !s.skipped).length,
      visited: stores.filter((s) => s.visited).length,
    }),
    [stores],
  );

  const getStatusConfig = (item: StoreItem) => {
    // Any visit today (checked in or completed) counts as Visited because
    // checkout is mandatory — user can't leave without checking out.
    if (item.visited || item.inProgress) return { label: 'Visited', bg: '#D1FAE5', text: '#065F46' };
    if (item.skipped) return { label: 'Skipped', bg: '#FEF3C7', text: '#92400E' };
    return { label: 'Pending', bg: '#EFF6FF', text: Colors.primaryDark };
  };

  const handleUnplannedSearch = useCallback(async () => {
    const query = unplannedSearch.trim();
    if (!query) return;
    setSearching(true);
    try {
      const results: any[] = await database
        .get('customers')
        .query(
          Q.or(
            Q.where('code', Q.like(`%${Q.sanitizeLikeString(query)}%`)),
            Q.where('name', Q.like(`%${Q.sanitizeLikeString(query)}%`)),
          ),
          Q.take(20),
        )
        .fetch();
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [unplannedSearch]);

  const selectUnplannedCustomer = useCallback(
    (customer: any) => {
      setShowUnplannedModal(false);
      setUnplannedSearch('');
      setSearchResults([]);
      navigation.navigate('CustomerVisit', {
        customerCode: customer.code,
        customerName: customer.name,
        channelCode: customer.channelCode ?? '-',
        customerGroup: customer.customerGroup ?? null,
        priceList: customer.priceList ?? null,
      });
    },
    [navigation],
  );

  const openGeoEdit = async (store: StoreItem) => {
    setGeoEditStore(store);
    setGeoNewLat('');
    setGeoNewLng('');

    // 1. If the local customer row has no coords, ask the server for them
    //    and refresh both the modal AND the local DB. The /customers/:code
    //    endpoint also falls back to the latest pending geo-code submission,
    //    so a store that's been geo-coded on the portal but hasn't reached
    //    the device via the periodic sync stops showing "N/A" right away.
    let serverCoordsFound = false;
    if (!store.latitude || !store.longitude) {
      try {
        const { data } = await api.get(`/customers/${encodeURIComponent(store.customerCode)}`, { timeout: 5000 });
        const srvLat = typeof data?.latitude === 'number' ? data.latitude : parseFloat(data?.latitude);
        const srvLng = typeof data?.longitude === 'number' ? data.longitude : parseFloat(data?.longitude);
        if (Number.isFinite(srvLat) && Number.isFinite(srvLng) && srvLat !== 0 && srvLng !== 0) {
          const latStr = String(srvLat);
          const lngStr = String(srvLng);
          // Refresh the modal payload so "Existing Shop Location" reads the
          // real coords (not "Not set"). State-wise we mutate the local
          // store object — JourneyPlanScreen reloads its list elsewhere.
          setGeoEditStore({ ...store, latitude: latStr, longitude: lngStr });
          serverCoordsFound = true;
          // Persist back to local DB so the next screen sees them too.
          try {
            const rows: any[] = await database.get('customers').query(Q.where('code', store.customerCode)).fetch();
            const rec = rows[0];
            if (rec) {
              await database.write(async () => {
                await rec.update((r: any) => {
                  r._raw.latitude = srvLat;
                  r._raw.longitude = srvLng;
                  r._raw.server_updated_at = Date.now();
                });
              });
            }
          } catch (e) { console.warn('[GeoEdit] local geo-code write failed:', e); }
        }
      } catch (e) { console.warn('[GeoEdit] live coords fetch failed:', e); }
    }

    // 1b. Still no coords (no approved geo-code, no pending submission, no
    //     local row data) — forward-geocode the customer's saved address
    //     so the modal pins an approximate location instead of N/A. Tagged
    //     "(from address)" so reps can tell it's a best-guess, not an
    //     authoritative coord. NOT written back to the local DB — only
    //     real submissions through the New Location flow should persist.
    if (!serverCoordsFound && (!store.latitude || !store.longitude) && store.address) {
      try {
        const { geocodeAddress } = require('../services/geocodeAddress');
        const geo = await geocodeAddress(store.address);
        if (geo) {
          setGeoEditStore({
            ...store,
            latitude: `${geo.lat.toFixed(7)} (from address)`,
            longitude: `${geo.lng.toFixed(7)} (from address)`,
          });
        }
      } catch (e) { console.warn('[GeoEdit] address geocode failed:', e); }
    }

    // 2. Auto-fill the "New Location" inputs with the rep's current GPS so
    //    the modal isn't blank when the store has no existing coords. Try
    //    the cached fast read first so the modal pops with values within a
    //    frame, then upgrade with a fresh fix if the cache was empty.
    try {
      const cached = await getCurrentPosition(true);
      if (cached) {
        setGeoNewLat(String(cached.lat));
        setGeoNewLng(String(cached.lng));
        return;
      }
      const fresh = await getCurrentPosition(false);
      if (fresh) {
        setGeoNewLat(String(fresh.lat));
        setGeoNewLng(String(fresh.lng));
      }
    } catch (e) { console.warn("[App]", e); }
  };

  const submitGeoEdit = async () => {
    if (!geoEditStore || !geoNewLat || !geoNewLng) { Alert.alert('Required', 'Enter latitude and longitude.'); return; }
    const lat = parseFloat(geoNewLat);
    const lng = parseFloat(geoNewLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) { Alert.alert('Invalid', 'Enter valid latitude and longitude values.'); return; }
    setGeoSubmitting(true);
    try {
      await api.post('/geo-codes', { customerCode: geoEditStore.customerCode, latitude: lat, longitude: lng });
      Alert.alert('Submitted', 'Location update request sent for approval.', [{ text: 'OK' }]);
      setGeoEditStore(null);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to submit location update.');
    } finally { setGeoSubmitting(false); }
  };

  const renderStore = ({ item, index }: { item: StoreItem; index: number }) => {
    const status = getStatusConfig(item);
    return (
      <TouchableOpacity
        style={styles.storeCard}
        activeOpacity={0.7}
        testID={`store-card-${index}`}
        onPress={() =>
          navigation.navigate('CustomerVisit', {
            customerCode: item.customerCode,
            customerName: item.name,
            channelCode: item.channel,
            customerGroup: item.customerGroup,
            priceList: item.priceList,
          })
        }
      >
        <View style={styles.storeCardContent}>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.storeCode}>{item.customerCode}</Text>
          {item.address ? (
            <Text style={styles.addressText} numberOfLines={2}>{item.address}</Text>
          ) : null}
          {/* Achievement row — small price-tag icon so the value reads
              as a currency amount at a glance, matching the icons on the
              Target / Achieved / Pending row in CustomerVisit. */}
          <View style={styles.achievementRow}>
            <Icon name="pricetag-outline" size={13} color="#16a34a" style={{ marginRight: 4 }} />
            <Text style={styles.achievementLabel}>MTD Achieved: </Text>
            <Text style={styles.achievementValue}>
              {item.monthAchieved > 0 ? `₹${item.monthAchieved.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'pending', label: `Pending (${counts.pending})` },
    { key: 'visited', label: `Visited (${counts.visited})` },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading stores...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="stores-screen">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Farmley Header */}
      <View style={styles.farmleyBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: Platform.OS === 'ios' ? 64 : 32 }}>
          {Platform.OS === 'ios' && (
            <TouchableOpacity onPress={() => navigation.navigate('MainTabs')} style={styles.backBtn}>
              <Icon name="chevron-back" size={24} color="#333" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openDrawer} style={styles.hamburgerBtn}>
            <Icon name="menu" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image source={require('../assets/farmley_logo.png')} style={styles.farmleyLogo} resizeMode="contain" />
        </View>
        <View style={{ width: Platform.OS === 'ios' ? 64 : 32 }} />
      </View>
      <View style={styles.blueLine} />

      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.title}>My Store(s)</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>Route </Text>
          <Text style={styles.routeValue}>{user?.routeCode ?? user?.code ?? 'Default'}</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by store code/name/address"
            placeholderTextColor="#9CA3AF"
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            testID="store-search-input"
          />
          <Icon name="search-outline" size={20} color="#9CA3AF" />
        </View>
      </View>

      {/* Store List */}
      <FlatList
        data={filteredStores}
        keyExtractor={(item) => item.id}
        renderItem={renderStore}
        testID="store-list"
        contentContainerStyle={styles.list}
        removeClippedSubviews
        maxToRenderPerBatch={15}
        windowSize={7}
        initialNumToRender={10}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="business-outline" size={56} color={Colors.border} />
            <Text style={styles.emptyTitle}>
              {searchText ? 'No stores match your search' : 'No stores today'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchText ? 'Try a different search term' : 'Pull down to refresh'}
            </Text>
          </View>
        }
      />

      {/* Side Drawer — same as home page */}
      {drawerVisible && (
        <Modal transparent visible={true} onRequestClose={closeDrawer} animationType="none">
          <View style={styles.drawerRoot}>
            <TouchableWithoutFeedback onPress={closeDrawer}>
              <Animated.View style={[styles.drawerOverlay, { opacity: overlayAnim }]} />
            </TouchableWithoutFeedback>
            <Animated.View style={[styles.drawerPanel, { transform: [{ translateX: slideAnim }] }]}>
              {/* Blue Header */}
              <LinearGradient colors={['#3040B0', '#4858CC']} style={styles.drawerHeader}>
                <View style={styles.drawerAvatar}>
                  <Icon name="person" size={40} color="#555" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerName}>{user?.name ?? user?.code ?? 'User'}</Text>
                  <Text style={styles.drawerRoute}>Route : {user?.routeCode ?? user?.code ?? '-'}</Text>
                </View>
                <Text style={styles.drawerChevron}>{'>'}</Text>
              </LinearGradient>
              <View style={{ height: 3, backgroundColor: '#E5A100' }} />

              {/* Menu */}
              <View style={{ flex: 1, paddingTop: 12 }}>
                {DRAWER_ITEMS.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => {
                      if (item.label === 'Others') { setOthersExpanded(!othersExpanded); }
                      else { handleDrawerNav(item.screen); }
                    }} activeOpacity={0.7}>
                      <MCIcon name={item.mcIcon} size={26} color="rgba(255,255,255,0.7)" style={{ width: 32, marginRight: 12 }} />
                      <Text style={styles.drawerLabel}>{item.label}</Text>
                      {item.label === 'Others' && <Text style={styles.drawerItemChevron}>{othersExpanded ? 'v' : '>'}</Text>}
                    </TouchableOpacity>
                    {item.label === 'Others' && othersExpanded && (
                      <TouchableOpacity style={[styles.drawerItem, { paddingLeft: 58 }]} onPress={() => handleDrawerNav('Settings')} activeOpacity={0.7}>
                        <MCIcon name="cog-outline" size={22} color="rgba(255,255,255,0.6)" style={{ width: 32, marginRight: 12 }} />
                        <Text style={styles.drawerLabel}>Settings</Text>
                      </TouchableOpacity>
                    )}
                  </React.Fragment>
                ))}
                <TouchableOpacity style={styles.drawerItem} onPress={handleEndDay} activeOpacity={0.7}>
                  <MCIcon name="pencil-outline" size={26} color="rgba(255,255,255,0.7)" style={{ width: 32, marginRight: 12 }} />
                  <Text style={styles.drawerLabel}>Day End</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={handleLogout} activeOpacity={0.7}>
                  <MCIcon name="logout" size={26} color="rgba(255,255,255,0.7)" style={{ width: 32, marginRight: 12 }} />
                  <Text style={styles.drawerLabel}>Logout</Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.drawerFooter}>
                <Image source={require('../assets/winit-logo.png')} style={styles.drawerFooterLogo} resizeMode="contain" />
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
      {/* Geo Edit Modal */}
      {geoEditStore && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setGeoEditStore(null)}>
          <View style={geoSt.overlay}>
            <View style={geoSt.modal}>
              <Text style={geoSt.title}>Edit Store Location</Text>
              <Text style={geoSt.storeName}>{geoEditStore.name}</Text>
              <Text style={geoSt.storeCode}>{geoEditStore.customerCode}</Text>

              {/* Existing Location — what's currently saved on the customer
                  record. Renamed from "Current Shop Location" because reps
                  were reading "Current" as "rep's current GPS" instead of
                  "what's already on file for this store". */}
              <View style={geoSt.section}>
                <Text style={geoSt.sectionLabel}>Existing Shop Location</Text>
                <View style={geoSt.coordRow}>
                  <Text style={geoSt.coordLabel}>Latitude:</Text>
                  <Text style={geoSt.coordValue}>{geoEditStore.latitude ?? 'Not set'}</Text>
                </View>
                <View style={geoSt.coordRow}>
                  <Text style={geoSt.coordLabel}>Longitude:</Text>
                  <Text style={geoSt.coordValue}>{geoEditStore.longitude ?? 'Not set'}</Text>
                </View>
              </View>

              {/* New Location — editable */}
              <View style={geoSt.section}>
                <Text style={geoSt.sectionLabel}>New Location</Text>
                <View style={geoSt.inputRow}>
                  <Text style={geoSt.inputLabel}>Latitude:</Text>
                  <TextInput style={geoSt.input} value={geoNewLat} onChangeText={setGeoNewLat} keyboardType="numeric" placeholder="Enter latitude" placeholderTextColor="#9CA3AF" />
                </View>
                <View style={geoSt.inputRow}>
                  <Text style={geoSt.inputLabel}>Longitude:</Text>
                  <TextInput style={geoSt.input} value={geoNewLng} onChangeText={setGeoNewLng} keyboardType="numeric" placeholder="Enter longitude" placeholderTextColor="#9CA3AF" />
                </View>
              </View>

              {/* Distance */}
              {geoEditStore.latitude && geoNewLat && geoNewLng ? (
                <View style={geoSt.distanceRow}>
                  <Icon name="navigate-outline" size={16} color="#059669" />
                  <Text style={geoSt.distanceText}>
                    Distance: {(() => { const d = calculateDistance(parseFloat(geoEditStore.latitude || '0'), parseFloat(geoEditStore.longitude || '0'), parseFloat(geoNewLat), parseFloat(geoNewLng)); return d > 1000 ? (d/1000).toFixed(2) + ' KM' : Math.round(d) + ' m'; })()}
                  </Text>
                </View>
              ) : null}

              {/* Use Current GPS button */}
              <TouchableOpacity style={geoSt.gpsBtn} onPress={async () => {
                try { const pos = await getCurrentPosition(false); if (pos) { setGeoNewLat(String(pos.lat)); setGeoNewLng(String(pos.lng)); } else { Alert.alert('GPS', 'Could not get location.'); } } catch { Alert.alert('GPS', 'Location not available.'); }
              }} activeOpacity={0.7}>
                <Icon name="locate-outline" size={18} color="#1a56db" />
                <Text style={geoSt.gpsBtnText}>Use My Current Location</Text>
              </TouchableOpacity>

              {/* Buttons */}
              <View style={geoSt.btnRow}>
                <TouchableOpacity style={geoSt.cancelBtn} onPress={() => setGeoEditStore(null)}>
                  <Text style={geoSt.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[geoSt.submitBtn, geoSubmitting && { opacity: 0.6 }]} onPress={submitGeoEdit} disabled={geoSubmitting}>
                  {geoSubmitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={geoSt.submitText}>Update</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const geoSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 24 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  storeName: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 },
  storeCode: { fontSize: 12, color: '#9CA3AF', marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  coordRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  coordLabel: { fontSize: 13, color: '#6B7280' },
  coordValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  inputLabel: { fontSize: 13, color: '#6B7280', width: 80 },
  input: { flex: 1, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: '#111827' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', padding: 10, borderRadius: 8, marginBottom: 12 },
  distanceText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderWidth: 1.5, borderColor: '#1a56db', borderRadius: 10, marginBottom: 16 },
  gpsBtnText: { fontSize: 13, fontWeight: '600', color: '#1a56db' },
  btnRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  submitBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#1a56db', alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: {
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

  // Farmley top bar
  farmleyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 58 : 42,
    paddingBottom: 10,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  hamburgerBtn: {
    padding: 4,
  },
  farmleyLogo: {
    height: 34,
    width: 140,
  },
  blueLine: {
    height: 3,
    backgroundColor: '#1a3178',
  },
  // Header
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  routeLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  routeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    padding: 0,
  },

  // List
  list: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 30,
  },

  // Store Card
  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  storeCardContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 6,
  },
  geoEditBtn: {
    padding: 4,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  visitedBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visitedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  storeCode: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  achievementRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 6,
  },
  achievementLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500' as const,
  },
  achievementValue: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#059669',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Drawer
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawerPanel: {
    width: DRAWER_WIDTH, backgroundColor: '#3D4FC4', height: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  drawerHeader: {
    padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 24,
    flexDirection: 'row', alignItems: 'center',
  },
  drawerAvatar: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden',
  },
  drawerName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  drawerRoute: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  drawerChevron: { fontSize: 22, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  drawerLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  drawerItemChevron: { fontSize: 20, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  drawerFooter: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, alignItems: 'center' },
  drawerFooterLogo: { width: 180, height: 50 },
});
