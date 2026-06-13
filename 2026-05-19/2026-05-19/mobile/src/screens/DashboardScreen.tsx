import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Image,
  StatusBar,
  Linking,
  BackHandler,
  InteractionManager,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import useAuthStore from '../store/auth';
import api from '../api/client';
import database from '../db/database';
import { useBottomInset } from '../utils/safeBottom';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { pushSync } from '../services/syncService';
import { RESTORE_MY_DAY_DONE_EVENT, DAY_ENDED_LOCALLY_EVENT } from '../services/restoreMyDay';
import useVisitStore from '../store/visit';

// Resume the open visit at most once per user per JS session. Without this
// guard a rep who navigates back from the Customer Dashboard to the home
// Dashboard would be force-redirected back to the customer on every mount.
// Keyed by user code so logging out and logging in as a different user
// re-runs the resume on the new user's cold launch.
let __activeVisitResumedFor: string | null = null;
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { logAutoEndDay } from '../services/activityLogger';
import { isInternetAvailable } from '../utils/netInfo';
import { v4 as uuidv4 } from 'uuid';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;
const sc = (size: number) => (SCREEN_WIDTH / 375) * size; // responsive scaling

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTodayDay(): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date().getDay()
  ];
}

interface KPI {
  visitsToday: number;
  ordersPlaced: number;
  revenue: number;
  target: number;
  achieved: number;
  gap: number;
  achievedPct: number;
  zeroSales: number;
  scheduled: number;
  strikeRate: number;
  linesPerInvoice: number;
  dropSize: number;
  avgInvoice: number;
  totalOutlets: number;
  untouchedOutlets: number;
  unbilledOutlets: number;
  serviceCompliance: number;
  returnOrders: number;
  returnItems: number;
  returnValue: number;
  returnReasons: { reason: string; count: number }[];
  brandDisplayData: { brand: string; currentPct: number; prevPct: number; growth: number }[];
  // activity counts for the current journey
  storeChecks: number;
  expiryChecks: number;
  competitorObs: number;
  openingStocks: number;
  physicalStocks: number;
  osoiPhotos: number;
  poCaptures: number;
  planogramExecs: number;
}

interface StorePreview {
  sequence: number;
  name: string;
  customerCode: string;
}

// ─── Live Elapsed Timer ───────────────────────────────────────────────────────
const TimerDisplay = memo(({ startTimestamp, startTimeStr }: { startTimestamp: string | null; startTimeStr: string | null }) => {
  const [elapsed, setElapsed] = useState('0:00:00');

  useEffect(() => {
    if (!startTimestamp) return;
    const start = new Date(startTimestamp).getTime();

    const tick = () => {
      const diff = Math.max(0, Date.now() - start);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTimestamp]);

  return (
    <View style={timerStyles.card}>
      <View style={timerStyles.row}>
        <View style={timerStyles.item}>
          <Text style={timerStyles.label}>START TIME</Text>
          <Text style={timerStyles.value}>{startTimeStr ?? '--:--'}</Text>
        </View>
        <View style={timerStyles.divider} />
        <View style={timerStyles.item}>
          <Text style={timerStyles.label}>WORKING</Text>
          <Text style={[timerStyles.value, { color: '#059669', fontVariant: ['tabular-nums'] }]}>{elapsed}</Text>
        </View>
        <View style={timerStyles.divider} />
        <View style={timerStyles.item}>
          <Text style={timerStyles.label}>DATE</Text>
          <Text style={timerStyles.value}>
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      </View>
    </View>
  );
});

const timerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a56db', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  item: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: '#BFDBFE', marginVertical: 4 },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1a56db',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E3A8A',
  },
});

// ─── Quick Action Tiles ──────────────────────────────────────────────────────
// Labels and MCIcons picked to match the design mockup: clean outline-style
// icons with subtle 3D card elevation (see styles.tile shadow).
interface Tile { label: string; mcIcon: string; screen?: string; testID?: string; }
const QUICK_TILES: Tile[] = [
  { label: 'Zimyo Check-in/out',        mcIcon: 'calendar-arrow-right',             screen: 'StartDay',           testID: 'task-hrms' },
  { label: 'My Store(s)',               mcIcon: 'card-account-details-outline',     screen: 'Stores',             testID: 'task-my-stores' },
  { label: 'Brand Training',            mcIcon: 'human-male-board',                 screen: 'BrandTraining',      testID: 'task-brand-training' },
  { label: 'Customer Interaction',      mcIcon: 'account-convert-outline',          screen: 'CustomerInteraction', testID: 'task-customer-interaction' },
  { label: 'Product Sampling',          mcIcon: 'food-outline',                     screen: 'ProductSampling',    testID: 'task-product-sampling' },
  { label: 'Escalation Matrix',         mcIcon: 'chart-bar',                        screen: 'EscalationMatrix',   testID: 'task-escalation-matrix' },
  { label: 'ROTA',                      mcIcon: 'calendar-check-outline',           screen: 'Rota',               testID: 'task-rota' },
];

// ─── Drawer Menu Items ───────────────────────────────────────────────────────
interface DrawerItem { label: string; screen: string; mcIcon: string; tlOnly?: boolean }

const DRAWER_ITEMS: DrawerItem[] = [
  { label: 'My Tasks',              screen: 'SurveyList',          mcIcon: 'clipboard-text-outline' },
  { label: 'My Store(s)',           screen: 'Stores',              mcIcon: 'handshake-outline' },
  { label: 'Target Vs Achievement', screen: 'TargetVsAchievement', mcIcon: 'clipboard-text-outline' },
  { label: 'Rota Creation',         screen: 'RotaCreate',          mcIcon: 'clipboard-text-outline' },
  { label: 'Reports',               screen: 'MobileReports',       mcIcon: 'clipboard-text-outline' },
  // Team-leader-only: approve / reject geo-code change requests submitted
  // by promoters from the field (Submit for Approval on CustomerVisit).
  { label: 'Location Approvals',    screen: 'LocationApproval',    mcIcon: 'map-marker-check-outline', tlOnly: true },
  { label: 'Others',                screen: 'Settings',            mcIcon: 'tune-vertical' },
];

const TL_USER_TYPES = new Set(['Team Leader', 'ATL', 'Manager', 'Senior Manager']);

// Drawer items that work in any day state — before Start Day, during the
// active day, or after Day End. Planning + reporting + settings + logout
// shouldn't be gated behind attendance.
const ALWAYS_ALLOWED = new Set(['RotaCreate', 'MobileReports', 'Settings']);

// ─── Side Drawer ─────────────────────────────────────────────────────────────
function SideDrawer({
  visible,
  onClose,
  user,
  onNavigate,
  onLogout,
  onEndDay,
  highlight,
  dayEnded,
}: {
  visible: boolean;
  dayEnded?: boolean;
  onClose: () => void;
  user: any;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  onEndDay: () => void;
  highlight?: string | null;
}) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [othersExpanded, setOthersExpanded] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible && (slideAnim as any).__getValue() === -DRAWER_WIDTH) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <View style={drawer.root}>
        {/* Overlay */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[drawer.overlay, { opacity: overlayAnim }]} />
        </TouchableWithoutFeedback>

        {/* Panel */}
        <Animated.View style={[drawer.panel, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header */}
          <LinearGradient colors={['#3040B0', '#4858CC']} style={drawer.header}>
            <View style={drawer.avatar}>
              <Icon name="person" size={40} color="#555" />
            </View>
            <View style={drawer.headerInfo}>
              <Text style={drawer.headerName} testID="drawer-user-name">{user?.name ?? user?.code ?? 'User'}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>[{user?.code ?? '-'}]</Text>
              <Text style={drawer.headerRole}>{user?.userType ?? 'User'}</Text>
              <Text style={drawer.headerRoute} testID="drawer-user-route">Route : {user?.routeCode ?? user?.code ?? '-'}</Text>
            </View>
          </LinearGradient>

          {/* Orange separator */}
          <View style={{ height: 3, backgroundColor: '#E5A100' }} />

          {/* Menu Items */}
          <ScrollView style={drawer.menuScroll} showsVerticalScrollIndicator={false}>
            {DRAWER_ITEMS.filter((item) => {
              // Hide TL-only items (e.g. Location Approvals) from regular users.
              if (item.tlOnly) return TL_USER_TYPES.has(user?.userType ?? '');
              return true;
            }).map((item, idx) => {
              const isHighlighted = highlight && item.screen === highlight;
              // After Day End every drawer item is visually blocked except
              // the always-allowed ones (Rota Creation, Reports, Others,
              // Settings). Blocked items are inert — no alert, no nav.
              const isBlocked = !!dayEnded
                && item.label !== 'Others'
                && !ALWAYS_ALLOWED.has(item.screen);
              return (
              <React.Fragment key={idx}>
                <TouchableOpacity
                  style={[
                    drawer.menuItem,
                    isHighlighted && { backgroundColor: 'rgba(229,161,0,0.25)', borderLeftWidth: 4, borderLeftColor: '#E5A100' },
                    isBlocked && { opacity: 0.4 },
                  ]}
                  onPress={() => {
                    if (isBlocked) return;
                    if (item.label === 'Others') {
                      setOthersExpanded(!othersExpanded);
                    } else {
                      onClose(); onNavigate(item.screen);
                    }
                  }}
                  disabled={isBlocked}
                  activeOpacity={isBlocked ? 1 : 0.7}
                >
                  <MCIcon name={item.mcIcon} size={26} color={isHighlighted ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} style={drawer.menuIconStyle} />
                  <Text style={[drawer.menuLabel, isHighlighted && { color: '#FFFFFF' }]}>{item.label}</Text>
                  {isBlocked ? (
                    <MCIcon name="lock" size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 'auto', marginRight: 8 }} />
                  ) : null}
                  {item.label === 'Others' && <Text style={drawer.menuChevron}>{othersExpanded ? 'v' : '>'}</Text>}
                </TouchableOpacity>
                {item.label === 'Others' && othersExpanded && (
                  <TouchableOpacity
                    style={[drawer.menuItem, { paddingLeft: 58 }]}
                    onPress={() => { onClose(); onNavigate('Settings'); }}
                    activeOpacity={0.7}
                  >
                    <MCIcon name="cog-outline" size={22} color="rgba(255,255,255,0.6)" style={drawer.menuIconStyle} />
                    <Text style={drawer.menuLabel}>Settings</Text>
                  </TouchableOpacity>
                )}
              </React.Fragment>
              );
            })}

            {/* Day End */}
            <TouchableOpacity
              style={[drawer.menuItem, dayEnded && { opacity: 0.4 }]}
              disabled={dayEnded}
              onPress={() => { if (dayEnded) return; onClose(); onEndDay(); }}
              activeOpacity={dayEnded ? 1 : 0.7}
            >
              <MCIcon name="pencil-outline" size={26} color="rgba(255,255,255,0.7)" style={drawer.menuIconStyle} />
              <Text style={drawer.menuLabel}>Day End</Text>
              {dayEnded ? (
                <MCIcon name="lock" size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 'auto', marginRight: 8 }} />
              ) : null}
            </TouchableOpacity>

            {/* Logout — do NOT call onClose here. Closing the drawer Modal
                at the same moment the loader Modal opens causes the loader
                to never render on Android (the dismissing drawer Modal
                swallows the new one). The drawer stays mounted underneath
                the loader; on successful logout the AppNavigator
                re-render to LoginScreen unmounts both. On failure the
                screen-level handler closes the drawer itself. */}
            <TouchableOpacity
              style={drawer.menuItem}
              onPress={onLogout}
              activeOpacity={0.7}
            >
              <MCIcon name="logout" size={26} color="rgba(255,255,255,0.7)" style={drawer.menuIconStyle} />
              <Text style={drawer.menuLabel}>Logout</Text>
            </TouchableOpacity>

          </ScrollView>

          {/* Footer - WINIT logo */}
          <View style={drawer.footer}>
            <Image source={require('../assets/winit-logo.png')} style={drawer.footerLogo} resizeMode="contain" testID="drawer-winit-logo" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Module-level cache of the last-known day status. Survives screen unmount
// (navigate to My Stores and back) so the bottom button initializes with
// the correct label instantly rather than flashing "Start Day" for 1-2s
// while the async loadDayStatus runs. Reset to defaults on JS reload
// (login, app restart) which is exactly when loadDayStatus is going to
// run anyway, so the stale-cache risk is zero.
let lastKnownDayStarted = false;
let lastKnownDayEnded = false;
let lastKnownDayEndTimestamp: string | null = null;
// Tracks whether loadDayStatus has resolved at least once in this JS
// session. Used to decide whether to show a tiny spinner in the bottom
// button on the very first cold mount (post-login) instead of flashing
// the default "Start Day" label before reconcile catches up.
let lastKnownDayStatusLoaded = false;

// Tracks the userCode the module-level day-status cache currently reflects.
// On user switch (logout + login as someone else, in the same JS session),
// the cache must be wiped or the new user would briefly see the previous
// user's "Continue" / "Day Ended" label before loadDayStatus rebinds state.
let lastKnownDayUserCode: string | null = null;

/**
 * Called by App.tsx immediately after prefetchDayStatus + restoreMyDay
 * complete (still inside the splash-screen hold, before the navigator
 * renders). Seeds the module-level cache so DashboardScreen's very first
 * frame — driven by useState(lastKnownDayStarted) — already shows the
 * correct "Continue" / "Start Day" label without waiting for the async
 * loadDayStatus to run. Eliminates the uninstall + reinstall flicker where
 * the first render always defaulted to dayStarted=false.
 */
export function seedDayStatusCache(
  dayStarted: boolean,
  dayEnded: boolean,
  dayStatusLoaded: boolean,
  userCode: string,
): void {
  lastKnownDayStarted = dayStarted;
  lastKnownDayEnded = dayEnded;
  lastKnownDayStatusLoaded = dayStatusLoaded;
  lastKnownDayUserCode = userCode;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Wipe the module-level day-status cache when the signed-in user changes
  // from whoever populated it last. Runs synchronously during render so
  // useState initializers below see the cleared values on this same mount.
  if (user?.code && lastKnownDayUserCode !== user.code) {
    lastKnownDayUserCode = user.code;
    lastKnownDayStarted = false;
    lastKnownDayEnded = false;
    lastKnownDayEndTimestamp = null;
    lastKnownDayStatusLoaded = false;
  }

  // Cold-launch resume: if the rep killed the app while checked in to a
  // store, route them straight back to that customer's Dashboard (where
  // the Check Out button lives) so they don't have to find the store in
  // the list again. Source of truth is the local customer_visits row with
  // status='checked_in'; auto-checkout reconcile updates that row when
  // the server has closed the visit. Fires once per JS session — the
  // module-level flag is only stamped after a successful navigation so
  // a fresh-install login (where restoreMyDay is still hydrating when
  // this useEffect first runs) can retry from the listener below.
  const tryResumeActiveVisit = useCallback(async () => {
    if (!user?.code || __activeVisitResumedFor === user.code) return;
    try {
      // Day must be started by THIS specific user. AsyncStorage day_started
      // flags aren't user-scoped, so a "true" written by user A persists
      // through logout and would let user B's resume run even though B
      // hasn't marked attendance. The authoritative per-user check is the
      // local attendance_records row matched on (user_code, attendance_date)
      // — restoreMyDay rehydrates that table on login, so it's the truth
      // about whether the currently-signed-in rep has started today.
      const todayStr = new Date().toISOString().split('T')[0];
      let attCount = 0;
      try {
        attCount = await database.get('attendance_records').query(
          Q.where('user_code', user.code),
          Q.where('attendance_date', todayStr),
        ).fetchCount();
      } catch { /* ignore — fall through and treat as not-started */ }
      if (attCount === 0) return;

      // Resume any checked-in visit from today (local calendar midnight
      // as the floor). Previously this gated on day_start_timestamp,
      // which was strict but excluded legitimate same-day resumes when
      // the timestamp hadn't been written to AsyncStorage yet (cold-
      // launch race) — the rep then ended up on the Home Dashboard and
      // got "checkout customer X first" the moment they tried to check
      // in to another store. Midnight floor matches handleCheckIn's
      // active-visit detection so both sides see the same set.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const minCheckinMs = todayMidnight.getTime();

      const open: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user.code),
          Q.where('status', 'checked_in'),
          Q.where('checkin_time', Q.gte(minCheckinMs)),
        )
        .fetch();
      if (open.length === 0) return; // leave flag unset — retry after restore lands

      // If the rep's auto-EOD window has already elapsed, the day should
      // auto-end — do NOT resume the (now stale) open visit onto the checkout
      // page. The rep left the app with a store still checked in and reopened
      // after the window (e.g. 12 h); loadDayStatus's auto-EOD then closes the
      // open visit (when the auto-checkout toggle is enabled on the portal) and
      // ends the day, landing the rep on Start Day instead of a checkout screen
      // for a day that's over. Only applies when auto-EOD is actually enabled;
      // with it off there's no window, so a still-open visit resumes as before.
      try {
        const cfg = JSON.parse((await AsyncStorage.getItem('auto_eod_config')) ?? '{}');
        const autoEodEnabled = cfg?.applies !== false;
        const freqMs = (typeof cfg?.frequencyMinutes === 'number' && cfg.frequencyMinutes > 0)
          ? cfg.frequencyMinutes * 60000
          : 12 * 60 * 60 * 1000;
        const startTs = (await AsyncStorage.getItem(`day_start_finalized_timestamp_${todayStr}`))
          ?? (await AsyncStorage.getItem(`day_start_timestamp_${todayStr}`));
        const startMs = startTs ? new Date(startTs).getTime() : null;
        if (autoEodEnabled && startMs != null && Date.now() >= startMs + freqMs) {
          console.log('[Dashboard] auto-EOD window elapsed — skipping stale visit resume; day will auto-end');
          return;
        }
      } catch { /* best-effort — fall through and resume as normal */ }

      const v: any = open[0];
      const custs: any[] = await database
        .get('customers')
        .query(Q.where('code', v.customerCode))
        .fetch();
      const customerName = custs[0]?.name ?? v.customerCode;
      useVisitStore.getState().setActiveVisit({
        visitId: v.id,
        customerCode: v.customerCode,
        checkinTime: v.checkinTime ?? Date.now(),
        status: 'checked_in',
      });
      navigation.navigate('CustomerDashboard', {
        customerCode: v.customerCode,
        customerName,
        visitCode: v.visitCode ?? v.id,
      });
      // Stamp the once-per-session flag only AFTER navigation fires so a
      // partial run (e.g. the row hadn't been restored yet) doesn't lock
      // out future retries via the restoreMyDay event listener below.
      __activeVisitResumedFor = user.code;
    } catch (e) { console.warn('[Dashboard] resume active visit failed:', e); }
  }, [user?.code, navigation]);
  useEffect(() => { tryResumeActiveVisit(); }, [tryResumeActiveVisit]);
  // After restoreMyDay finishes writing today's visits/orders/stocks into
  // the local DB on a fresh install + login, the row this resume relies on
  // finally exists — re-run the check so the screen still navigates to the
  // open store without the user having to manually find it in My Stores.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RESTORE_MY_DAY_DONE_EVENT, () => {
      tryResumeActiveVisit();
    });
    return () => sub.remove();
  }, [tryResumeActiveVisit]);
  const [kpi, setKpi] = useState<KPI>({
    visitsToday: 0, ordersPlaced: 0, revenue: 0,
    target: 0, achieved: 0, gap: 0, achievedPct: 0,
    zeroSales: 0, scheduled: 0, strikeRate: 0, linesPerInvoice: 0,
    dropSize: 0, avgInvoice: 0, totalOutlets: 0, untouchedOutlets: 0,
    unbilledOutlets: 0, serviceCompliance: 0, returnOrders: 0,
    returnItems: 0, returnValue: 0, returnReasons: [],
    brandDisplayData: [], storeChecks: 0, expiryChecks: 0,
    competitorObs: 0, openingStocks: 0, physicalStocks: 0,
    osoiPhotos: 0, poCaptures: 0, planogramExecs: 0,
  });
  const [salesViewMode, setSalesViewMode] = useState<'today' | 'mtd'>('today');
  const [coverageViewMode, setCoverageViewMode] = useState<'today' | 'mtd'>('today');
  const [filterVisible, setFilterVisible] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<'mtd_ly' | 'mtd_lm' | 'ytd_ly'>('mtd_lm');
  const [stores, setStores] = useState<StorePreview[]>([]);
  const [todayShift, setTodayShift] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tileLoading, setTileLoading] = useState(false);
  // Start as `false` — render the dashboard immediately with whatever
  // cached/initial KPI values exist. setKpiLoading(false) at end of
  // loadKPIs is now a no-op for the first render but harmless.
  const [kpiLoading, setKpiLoading] = useState(false);
  // Initialize from the in-memory cache populated by the previous mount's
  // loadDayStatus. Without this, every navigate-back to Dashboard starts
  // with dayStarted=false → the button flashes "Start Day" for 1-2s until
  // the async load completes. Module-level cache survives screen unmount
  // but resets when the JS bundle reloads (login, app restart) — which is
  // exactly when loadDayStatus is going to run anyway.
  const [dayStarted, setDayStarted] = useState(lastKnownDayStarted);
  // Once true, never goes back to false — prevents the button from
  // disappearing when returning from My Stores or other screens.
  const dayStatusLoadedRef = useRef(false);
  // Generation counter — incremented at the START of every loadDayStatus
  // call. Before each state-write the call checks that its own generation
  // still matches the current value; if a newer call has started (counter
  // is higher), the older result is discarded. This eliminates the "Start
  // Day" flicker on Android 10/13 devices where the 5-second poll interval
  // and the focus-triggered load race each other: the stale call's
  // setDayStarted(false) from the server reconcile was overwriting the
  // correct "true" written by the focus call.
  const loadGenRef = useRef(0);
  // SINGLE-FLIGHT latch. loadGenRef only discards stale *writes* after the
  // fact; it does NOT stop a second, overlapping loadDayStatus call from
  // running its FAST PATH and repainting the button from the (possibly
  // stale) AsyncStorage day_started flag before the in-flight server
  // reconcile has cleared it. That overlap is the Continue↔Start Day
  // flicker. This latch makes loadDayStatus skip entirely while another
  // run is in progress — the 5 s poll simply re-runs it a moment later.
  const loadInFlightRef = useRef(false);
  // Tracks whether the auto-EOD "End of Day" popup has already been
  // shown so loadDayStatus doesn't open it repeatedly on every focus.
  const autoEodPromptShownRef = useRef(false);
  // Tracks whether the offline Auto-EOD warning popup has already been shown.
  const autoEodOfflineAlertShownRef = useRef(false);

  // Seed from the module-level flag so screen re-mounts (navigate back
   // from My Stores etc.) skip the spinner — the cached label is already
   // correct. Only the first cold mount in this JS session shows the
   // spinner while loadDayStatus runs.
  const [dayStatusLoaded, setDayStatusLoaded] = useState(lastKnownDayStatusLoaded);
  const [dayEnded, setDayEnded] = useState(lastKnownDayEnded);
  const [dayEndTimestamp, setDayEndTimestamp] = useState<string | null>(lastKnownDayEndTimestamp);
  const [prevDayEnded, setPrevDayEnded] = useState(true);
  // True when today's EOT is still reopenable by an admin (inside the Start
  // Day + frequency window). Drives the "ask admin to reopen EOT" popup that
  // appears when a rep who ended their day taps Start Day. Outside the window
  // this is false and Start Day proceeds to a fresh new day as normal.
  const [eotReopenWithinWindow, setEotReopenWithinWindow] = useState(false);

  // EndOfDayScreen emits DAY_ENDED_LOCALLY_EVENT the moment its server
  // EOT POST returns success — BEFORE it pops back to this screen. We
  // listen here and proactively flip our live state to (started=false,
  // ended=false) AND clear the module-level cache so the bottom button
  // paints "Start Day" on the very first frame after the goBack lands.
  // Without this, the back-navigation surfaces the Dashboard with its
  // pre-EOD state (dayStarted=true → "Continue") and the rep sees the
  // wrong label for 1-2 s until focus-fired loadDayStatus catches up.
  // Per requirement: post-EOD must show Start Day immediately, no flash.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DAY_ENDED_LOCALLY_EVENT, () => {
      setDayStarted(false);
      setDayEnded(false);
      setDayEndTimestamp(null);
      lastKnownDayStarted = false;
      lastKnownDayEnded = false;
      lastKnownDayEndTimestamp = null;
    });
    return () => sub.remove();
  }, []);
  const [dayStartTime, setDayStartTime] = useState<string | null>(null);
  const [dayStartTimestamp, setDayStartTimestamp] = useState<string | null>(null);
  const [dayEndTime, setDayEndTime] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Tracks the visible "Pushing pending data to the server…" overlay while
  // the auth store's logout() runs its pushSync. Without this the logout
  // looks like the app is frozen for a few seconds with no feedback.
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerHighlight, setDrawerHighlight] = useState<string | null>(null);
  const [interactionPopup, setInteractionPopup] = useState(false);

  // Location monitoring is handled globally in LocationGuardProvider —
  // see AppNavigator. Don't duplicate it here.

  // Respect gesture bar / home indicator so the Start Day / Continue button
  // isn't covered on Android gesture-nav phones or iPhones with a notch.
  // Use a higher floor on Android because some OEM ROMs (e.g. Oppo ColorOS
  // on A-series phones) report insets.bottom as 0 even with gesture nav
  // enabled — without the floor the button sits under the gesture pill.
  const rawInsets = useSafeAreaInsets();
  const bottomInset = Math.max(
    useBottomInset(16),
    Platform.OS === 'android' ? Math.max(24, rawInsets.bottom) : 0,
  );

  // If a child screen navigated back here with `openDrawer: '<screen>'`, open
  // the side drawer with that menu item highlighted (e.g. Cancel from Rota
  // Creation lands here with the hamburger drawer already open and pointing
  // to "Rota Creation").
  useFocusEffect(
    useCallback(() => {
      const openDrawerParam = route.params?.openDrawer;
      if (openDrawerParam) {
        setDrawerHighlight(openDrawerParam);
        setDrawerOpen(true);
        // Clear the param so refocusing the screen later doesn't reopen it.
        navigation.setParams({ openDrawer: undefined });
      }
    }, [route.params?.openDrawer, navigation]),
  );
  const userTypeLower = user?.userType?.toLowerCase() ?? '';
  // Only true admins see global counts. Managers / Senior Managers see their
  // own assigned stores (or none if not assigned), same as regular field users.
  const isAdmin = userTypeLower === 'admin';

  const loadKPIs = useCallback(async () => {
    const userCode = user?.code ?? '';
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const monthMs = monthStart.getTime();
    const prevMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
    const prevMonthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0, 23, 59, 59);

    // ── Orders (filtered by current user + prev-month window) ──
    // Load only the rows we actually need (prev month → now) instead of every
    // order the user has ever placed. Scanning thousands of historical rows
    // in JS is the main source of Dashboard lag on low-end devices.
    const prevMonthStartMs = prevMonthStart.getTime();
    const prevMonthEndMs = prevMonthEnd.getTime();
    const allOrders: any[] = await database.get('orders').query(
      Q.where('user_code', userCode),
      Q.where('trx_date', Q.gte(prevMonthStartMs)),
    ).fetch();
    const todayOrders = allOrders.filter((o: any) => o.trxDate >= todayMs);
    const mtdOrders = allOrders.filter((o: any) => o.trxDate >= monthMs);
    const prevMonthOrders = allOrders.filter((o: any) => o.trxDate >= prevMonthStartMs && o.trxDate <= prevMonthEndMs);

    // ── Visits (filtered by current user) ──
    const todayVisits: any[] = await database.get('customer_visits').query(
      Q.where('user_code', userCode),
      Q.where('checkin_time', Q.gte(todayMs)),
    ).fetch();
    const visitedCustomerCodes = new Set(todayVisits.map((v: any) => v.customerCode));
    const visitsToday = visitedCustomerCodes.size;
    const mtdVisits: any[] = await database.get('customer_visits').query(
      Q.where('user_code', userCode),
      Q.where('checkin_time', Q.gte(monthMs)),
    ).fetch();

    const revenue = todayOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0);
    const mtdRevenue = mtdOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0);
    const prevMonthRevenue = prevMonthOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0);

    // ── Target ──
    let target = 0;
    try {
      const commissions: any[] = await database.get('commission_masters').query(
        Q.where('user_code', userCode),
      ).fetch();
      if (commissions.length > 0) target = parseFloat(commissions[0].targetAmount) || 0;
    } catch { /* table may not exist */ }
    if (target === 0) target = 102599.98; // demo fallback

    const achieved = mtdRevenue;
    const gap = Math.max(0, target - achieved);
    const achievedPct = target > 0 ? Math.round((achieved / target) * 100) : 0;

    // ── Coverage & Productivity ──
    // Count the stores this user can see. Priority:
    //   1. Admin → all local customers.
    //   2. journey_plan_customers (route schedule) if any.
    //   3. Fallback → every synced customer in local DB (already region-
    //      scoped server-side, so this gives the correct count for users
    //      without a formal route schedule).
    let totalOutlets: number;
    if (isAdmin) {
      totalOutlets = await database.get('customers').query().fetchCount();
      console.log(`[Dashboard] Admin mode: ${totalOutlets} customers from DB`);
    } else {
      const jpc: any[] = await database.get('journey_plan_customers').query(
        Q.where('route_code', userCode),
      ).fetch();
      const assignedCodes = new Set(jpc.map((j: any) => j.customerCode ?? j._raw?.customer_code));
      totalOutlets = assignedCodes.size;
      console.log(`[Dashboard] JPC for ${userCode}: ${jpc.length} records, ${assignedCodes.size} unique codes`);
      // Fallback: if no JPC entries, count all synced customers (already
      // scoped to the user's region / assignments by the backend).
      if (totalOutlets === 0) {
        totalOutlets = await database.get('customers').query().fetchCount();
        console.log(`[Dashboard] Fallback to customers table: ${totalOutlets}`);
      }
    }

    const visitedCodes = new Set<string>();
    todayVisits.forEach((v: any) => visitedCodes.add(v.customerCode));
    const mtdVisitedCodes = new Set<string>();
    mtdVisits.forEach((v: any) => mtdVisitedCodes.add(v.customerCode));

    const billedCodes = new Set<string>();
    todayOrders.forEach((o: any) => billedCodes.add(o.customerCode));
    const mtdBilledCodes = new Set<string>();
    mtdOrders.forEach((o: any) => mtdBilledCodes.add(o.customerCode));

    const untouchedOutlets = Math.max(0, totalOutlets - visitedCodes.size);
    const unbilledOutlets = Math.max(0, visitedCodes.size - billedCodes.size);
    const scheduled = stores.length;
    const zeroSales = Math.max(0, visitedCodes.size - billedCodes.size);
    const strikeRate = visitedCodes.size > 0 ? Math.round((billedCodes.size / visitedCodes.size) * 100) : 0;

    // ── Lines per invoice, drop size, avg invoice ──
    // Only fetch lines for today's + return orders instead of every line in
    // the DB. Uses Q.oneOf so SQLite does the filtering.
    const todayOrderIds = todayOrders.map((o: any) => o.id);
    const todayOrderIdSet = new Set(todayOrderIds);
    const todayLines: any[] = todayOrderIds.length > 0
      ? await database.get('order_lines').query(Q.where('order_id', Q.oneOf(todayOrderIds))).fetch()
      : [];
    const totalLines = todayLines.length;
    const linesPerInvoice = todayOrders.length > 0 ? parseFloat((totalLines / todayOrders.length).toFixed(1)) : 0;
    const dropSize = todayOrders.length > 0 ? Math.round(totalLines / todayOrders.length) : 0;
    const avgInvoice = todayOrders.length > 0 ? Math.round(revenue / todayOrders.length) : 0;

    // ── Activity Counts (today, by user) ──
    const storeChecks = await database.get('store_checks').query(
      Q.where('user_code', userCode), Q.where('check_date', Q.gte(todayMs)),
    ).fetchCount();
    // expiry_checks/opening_stocks/physical_stocks store dates as strings, so we
    // can't do a numeric range filter cheaply. Scope by `visited_date`/`stock_date`
    // equality to today (YYYY-MM-DD) which SQLite handles fast.
    const todayDateStr = new Date(todayMs).toISOString().slice(0, 10);
    const expiryChecks = await database.get('expiry_checks').query(
      Q.where('user_code', userCode), Q.where('visited_date', todayDateStr),
    ).fetchCount();
    const competitorObs = await database.get('competitor_observations').query(
      Q.where('user_code', userCode), Q.where('observed_on', Q.gte(todayMs)),
    ).fetchCount();
    const openingStocks = await database.get('opening_stocks').query(
      Q.where('user_code', userCode), Q.where('stock_date', todayDateStr),
    ).fetchCount();
    const physicalStocks = await database.get('physical_stocks').query(
      Q.where('user_code', userCode), Q.where('stock_date', todayDateStr),
    ).fetchCount();
    const osoiPhotos = await database.get('osoi_photos').query(
      Q.where('user_code', userCode), Q.where('captured_on', Q.gte(todayMs)),
    ).fetchCount();
    const poCaptures = await database.get('po_captures').query(
      Q.where('user_code', userCode), Q.where('captured_on', Q.gte(todayMs)),
    ).fetchCount();
    const planogramExecs = await database.get('planogram_executions').query(
      Q.where('user_code', userCode), Q.where('performed_on', Q.gte(todayMs)),
    ).fetchCount();

    // ── Service compliance (all activities done / visits) ──
    const totalActivities = storeChecks + expiryChecks + competitorObs + osoiPhotos + planogramExecs;
    const serviceCompliance = visitsToday > 0 ? Math.min(100, Math.round((totalActivities / visitsToday) * 100)) : 0;

    // ── Return orders ──
    const returnOrdersList = allOrders.filter((o: any) => {
      const status = o.status;
      const trxType = (o.serverTrxCode || '').toUpperCase();
      return status < 0 || trxType.includes('RETURN') || trxType.includes('RET');
    });
    const returnValue = returnOrdersList.reduce((s: number, o: any) => s + Math.abs(parseFloat(o.totalAmount) || 0), 0);
    const returnOrderIds = returnOrdersList.map((o: any) => o.id);
    const returnLines: any[] = returnOrderIds.length > 0
      ? await database.get('order_lines').query(Q.where('order_id', Q.oneOf(returnOrderIds))).fetch()
      : [];
    const returnItemCount = returnLines.length;

    // Group return reasons
    const reasonMap: Record<string, number> = {};
    returnLines.forEach((l: any) => {
      const reason = l.itemName || 'Quality Complaint';
      reasonMap[reason] = (reasonMap[reason] || 0) + 1;
    });
    const returnReasons = Object.entries(reasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ── Brand Display Share (from store_check_items) ──
    const brandDisplayData: { brand: string; currentPct: number; prevPct: number; growth: number }[] = [];
    try {
      const todayStoreChecks: any[] = await database.get('store_checks').query(
        Q.where('user_code', userCode), Q.where('check_date', Q.gte(monthMs)),
      ).fetch();
      const checkIds = todayStoreChecks.map((sc: any) => sc.id);
      if (checkIds.length > 0) {
        const currentItems: any[] = await database.get('store_check_items').query(Q.where('store_check_id', Q.oneOf(checkIds))).fetch();
        const brandCounts: Record<string, { available: number; total: number }> = {};
        currentItems.forEach((ci: any) => {
          const brand = ci.brandName || ci.categoryName || 'Farmley';
          if (!brandCounts[brand]) brandCounts[brand] = { available: 0, total: 0 };
          brandCounts[brand].total++;
          if (ci.isAvailable) brandCounts[brand].available++;
        });
        Object.entries(brandCounts).forEach(([brand, counts]) => {
          const currentPct = counts.total > 0 ? Math.round((counts.available / counts.total) * 100) : 0;
          brandDisplayData.push({ brand, currentPct, prevPct: 0, growth: currentPct });
        });
        brandDisplayData.sort((a, b) => b.currentPct - a.currentPct);
      }
    } catch { /* skip if table not available */ }

    setKpi({
      visitsToday, ordersPlaced: todayOrders.length, revenue,
      target, achieved, gap, achievedPct,
      zeroSales, scheduled, strikeRate, linesPerInvoice, dropSize, avgInvoice,
      totalOutlets, untouchedOutlets, unbilledOutlets, serviceCompliance,
      returnOrders: returnOrdersList.length, returnItems: returnItemCount,
      returnValue, returnReasons,
      brandDisplayData, storeChecks, expiryChecks, competitorObs,
      openingStocks, physicalStocks, osoiPhotos, poCaptures, planogramExecs,
    });
    setKpiLoading(false);
  }, [user?.code, user?.routeCode, stores.length]);

  const loadStores = useCallback(async () => {
    if (!isAdmin && !user?.code) return;
    const jpcRecords: any[] = isAdmin
      ? await database
          .get('journey_plan_customers')
          .query(
            Q.sortBy('visit_sequence', Q.asc)
          )
          .fetch()
      : await database
          .get('journey_plan_customers')
          .query(
            Q.where('route_code', user!.code),
            Q.sortBy('visit_sequence', Q.asc)
          )
          .fetch();
    const previews: StorePreview[] = [];
    const seenCustomerCodes = new Set<string>();

    for (const jpc of jpcRecords) {
      if (seenCustomerCodes.has(jpc.customerCode)) continue;
      seenCustomerCodes.add(jpc.customerCode);

      const customers: any[] = await database
        .get('customers')
        .query(Q.where('code', jpc.customerCode))
        .fetch();
      previews.push({
        sequence: jpc.visitSequence ?? 0,
        name: customers[0]?.name ?? jpc.customerCode,
        customerCode: jpc.customerCode,
      });
      // Stop adding previews if we already have 3 unique stores
      if (previews.length >= 3) break;
    }
    setStores(previews);
  }, [isAdmin, user?.code]);

  const loadDayStatus = useCallback(async () => {
    // SINGLE-FLIGHT: bail if a previous run hasn't finished. The focus
    // effect, the day-state poll, and the restore/day-ended event listeners
    // all call this and frequently overlap; letting them run concurrently
    // makes each one's fast-path repaint the button while another's reconcile
    // is mid-flight, producing the flicker / "stuck on Continue". The latch
    // is released in the finally below so a thrown error can't wedge it on.
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    // Stamp a generation token at the very start. Any state-write by THIS
    // invocation is gated on the token still being current — if a newer
    // loadDayStatus call has started since, we discard the stale result
    // instead of overwriting correct state with wrong values.
    const myGen = ++loadGenRef.current;
    const isStale = () => loadGenRef.current !== myGen;
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // ── FAST PATH ──────────────────────────────────────────────────────
      // Paint the bottom button immediately based on the LOCAL attendance
      // row for the signed-in user. AsyncStorage day_* flags aren't user-
      // scoped, so trusting them blindly let a stale "true" from user A
      // surface as "Continue" the moment user B logged in. The attendance
      // row is the authoritative per-user marker — restoreMyDay rehydrates
      // it on login, and StartDayScreen writes it the moment the rep
      // marks attendance. Guarded by user-scoped attendance, AsyncStorage
      // is still consulted for the optimistic start/end paint so the
      // button settles instantly when it agrees with the row.
      try {
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const [fastStarted, fastEnded, attCount] = await Promise.all([
          AsyncStorage.getItem(`day_started_${todayStr}`),
          AsyncStorage.getItem(`day_ended_${todayStr}`),
          database.get('attendance_records').query(
            Q.where('user_code', user?.code ?? ''),
            Q.where('attendance_date', todayStr),
          ).fetchCount(),
        ]);
        const userStartedToday = attCount > 0;
        // Positive "Continue" paint needs TWO independent signals that BOTH
        // agree the day is active right now. Each one alone caused a real bug:
        //   • day_started_<today> flag alone — NOT user-scoped, so a stale
        //     'true' from a prior rep painted "Continue" for a brand-new user
        //     (the cross-user flicker).
        //   • attendance_records row alone — the row PERSISTS all day, even
        //     after End Day clears the flags, so it repainted "Continue" on
        //     every focus AFTER the rep ended their day (the stuck-on-Continue
        //     bug — the row can't be cleared, only the flags can).
        // Requiring (flag AND user row) fixes both: a new user has no row, and
        // a post-EOD user has no flag (EndOfDay multiRemove's it). The module
        // cache still covers the cases neither local signal can:
        //   • openDayDate — day started on a PRIOR date, so there's no today
        //     flag or today row; App.tsx seeds the cache true from the
        //     confirmed server prefetch → still paints Continue instantly.
        //   • a transient slow/empty AsyncStorage read on an active day — the
        //     cache holds the last confirmed true so we never flicker down.
        const fStarted = fastStarted === 'true';
        const fEnded = fastEnded === 'true';
        if (!isStale()) {
          // Fast path is WRITE-UPGRADE-ONLY for the started flag.
          // It may freely set dayStarted=true (both signals agree) or keep
          // dayStarted=false (no evidence, or the day was ended). It must
          // NEVER downgrade a confirmed-active day on a transient read: the
          // module cache holds true through a slow/empty AsyncStorage read.
          // The server reconcile below is the only thing that flips a genuine
          // Continue→Start Day.
          const safeStarted = (fStarted && userStartedToday) || lastKnownDayStarted;
          const safeEnded   = fEnded   && !safeStarted; // ended only if not active
          setDayStarted(safeStarted);
          setDayEnded(safeEnded);
          lastKnownDayStarted = safeStarted;
          lastKnownDayEnded   = safeEnded;
        }
        // Only declare "loaded" (hide the spinner) when the FAST PATH has
        // POSITIVE evidence of the state: a local attendance row for this user
        // (→ Continue) or an AsyncStorage started/ended flag. The previous
        // `!userStartedToday` shortcut treated "no local row" as a confident
        // "Start Day" — but on a fresh login / new device / post-master-data
        // sync / user switch the local DB is empty NOT because the day isn't
        // started, but because nothing has been restored yet. That painted a
        // wrong "Start Day" for a rep who had already started their day
        // elsewhere, until the server reconcile caught up. Now, with no local
        // evidence, we keep the spinner up and let the reconcile below (or the
        // App.tsx prefetch seed) decide — no wrong-label flash.
        const fastConfident = userStartedToday || fastStarted === 'true' || fastEnded === 'true';
        if (fastConfident && !dayStatusLoadedRef.current && !isStale()) {
          dayStatusLoadedRef.current = true;
          setDayStatusLoaded(true);
          lastKnownDayStatusLoaded = true;
        }
      } catch { /* fall through to full reconcile */ }

      // Check if previous day trip was ended
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const prevStarted = await AsyncStorage.getItem(`day_started_${yesterdayStr}`);
      const prevEnded = await AsyncStorage.getItem(`day_ended_${yesterdayStr}`);
      // Previous day is considered ended if it was never started OR it was ended
      setPrevDayEnded(!prevStarted || prevStarted !== 'true' || prevEnded === 'true');

      const [started, ended, startTime, startTimestamp, endTime, endTimestamp, finalizedTimestamp, autoEodPending] = await Promise.all([
        AsyncStorage.getItem(`day_started_${todayStr}`),
        AsyncStorage.getItem(`day_ended_${todayStr}`),
        AsyncStorage.getItem(`day_start_time_${todayStr}`),
        AsyncStorage.getItem(`day_start_timestamp_${todayStr}`),
        AsyncStorage.getItem(`day_end_time_${todayStr}`),
        AsyncStorage.getItem(`day_end_timestamp_${todayStr}`),
        AsyncStorage.getItem(`day_start_finalized_timestamp_${todayStr}`),
        AsyncStorage.getItem('auto_eod_pending'),
      ]);

      // Primary: AsyncStorage flag (set immediately at attendance mark)
      // Fallback: WatermelonDB attendance record — BUT only when the day for
      // this attendance date has NOT already been ended. The attendance_records
      // row PERSISTS after Day End (manual EOD / auto-EOD only clear the
      // AsyncStorage day_* flags, never the row), so trusting "row exists" alone
      // resurrected dayHasStarted=true on every poll AFTER the rep ended their
      // day. That re-wrote day_started_<today>='true', which then poisoned the
      // FAST PATH on the next poll → "Continue", while the server reconcile
      // (todayHasEot) flipped it back to "Start Day" → the Start Day <-> Continue
      // flicker the rep saw after Day End. The fast path was already hardened to
      // require (flag AND row); this full-reconcile fallback was the remaining
      // unguarded resurrection. `auto_eod_fired_for_<date>` is the durable local
      // "this day was ended" marker (written by manual EOD, auto-EOD and
      // logout-EOD; cleared by Reopen-EOT), so gate the row fallback on it.
      let dayHasStarted = started === 'true';
      if (!dayHasStarted) {
        const count = await database
          .get('attendance_records')
          .query(
            Q.where('user_code', user?.code ?? ''),
            Q.where('attendance_date', todayStr),
          )
          .fetchCount();
        if (count > 0) {
          const activeAttDate = (await AsyncStorage.getItem('active_attendance_date')) ?? todayStr;
          const [endedActive, endedToday] = await Promise.all([
            AsyncStorage.getItem(`auto_eod_fired_for_${activeAttDate}`),
            AsyncStorage.getItem(`auto_eod_fired_for_${todayStr}`),
          ]);
          const dayAlreadyEnded = endedActive === 'true' || endedToday === 'true';
          if (!dayAlreadyEnded) {
            dayHasStarted = true;
            await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
            // Intentionally do NOT write `day_start_timestamp_<today>` here.
            // The local attendance_records row has no start_time column, so
            // we don't know the actual start time. Writing Date.now() was
            // the previous behaviour and produced a misleading "Trip Start
            // Time" on Day End for a user who saw Continue from openDayDate
            // (PR101 report: Trip Start Time showed today 11:32 even though
            // the real start was on a prior date). The server reconcile a
            // few lines below will populate the correct startTime when
            // online; if offline, EOD will show N/A — strictly better
            // than a wrong timestamp.
          }
        }
      }

      // No fake-timestamp fallback. Downstream code reads
      // day_start_timestamp_<today> from AsyncStorage AFTER the
      // server reconcile populates it (openDayDate / dayStarted
      // branches), so the correct original start time is used.
      let effectiveEnded = ended === 'true';

      // Server-driven auto-EOD: read /settings/auto-eod/for-me to find out
      // if an admin has enabled the policy for this user and what window
      // they configured. Falls back to cached config if offline.
      let autoEodWindowMs = 15 * 60 * 60 * 1000;
      let autoEodEnabled = false; // Default to false if we don't know the policy

      try {
        const cachedStr = await AsyncStorage.getItem('auto_eod_config');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          autoEodEnabled = cached.applies !== false;
          if (cached.frequencyMinutes) autoEodWindowMs = cached.frequencyMinutes * 60 * 1000;
        }
      } catch (e) { /* ignore */ }

      try {
        const { data: cfg } = await api.get('/settings/auto-eod/for-me', { timeout: 3000 });
        if (cfg && typeof cfg === 'object') {
          AsyncStorage.setItem('auto_eod_config', JSON.stringify(cfg)).catch(() => {});
          if (cfg.applies === false) {
            autoEodEnabled = false;
          } else {
            autoEodEnabled = true;
            if (typeof cfg.frequencyMinutes === 'number' && cfg.frequencyMinutes > 0) {
              autoEodWindowMs = cfg.frequencyMinutes * 60 * 1000;
            }
          }
        }
      } catch (e) { console.warn('[Dashboard] auto-eod/for-me failed, using cached config:', e); }

      // Auto-EOD: if the day was started but the user never tapped End Day,
      // prompt the user once the configured window has elapsed. On OK the
      // existing handleAutoEod() (added below) pushes all pending data and
      // marks the day ended. Marks the day ended locally + logs END_DAY_AUTO
      // to activity_logs so the web portal sees it.
      let hydratedEndTimestampLocal: string | null = endTimestamp;
      // Auto-EOD check moved to AFTER the server reconcile so it sees the
      // openDayDate-hydrated state. Previously, when a user started day on
      // a prior date and opened the app days later, the pre-reconcile check
      // saw dayHasStarted=false and silently skipped, so the popup + server
      // EOT never fired — user saw Continue instead of Day Ended + Start Day.
      // The moved block lives below, after the re-read of the hydrated keys.
      // (Auto-EOD due-check moved below — see after the reconcile re-read.)

      // If the day ended more than the admin-configured auto-EOD window ago,
      // automatically clear the flags so the user lands on "Start Day" again
      // without any manual step. Uses autoEodWindowMs from
      // /settings/auto-eod/for-me (defaulted to 15 h only as a pre-fetch
      // fallback) — no hardcoded threshold.
      if (effectiveEnded && hydratedEndTimestampLocal) {
        // Field rule: once `start_time + frequency_minutes` has elapsed,
        // the reopen window is closed AND a fresh Start Day is unlocked
        // immediately — no calendar-day wait. The dashboard flips from
        // Day Ended to Start Day at that cutoff. We anchor on the start
        // timestamp (the canonical shift origin) rather than the end
        // timestamp; a manual EOD inside the window leaves the cutoff
        // unchanged and the rep doesn't gain extra time by ending early.
        const startTs = await AsyncStorage.getItem(`day_start_timestamp_${todayStr}`);
        const startMs = startTs ? new Date(startTs).getTime() : null;
        const cutoffMs = startMs != null ? startMs + autoEodWindowMs : null;
        if (cutoffMs != null && Date.now() >= cutoffMs) {
          console.log(`[Dashboard] Clearing day flags — start + freq cutoff (${new Date(cutoffMs).toISOString()}) has elapsed`);
          await AsyncStorage.multiRemove([
            `day_started_${todayStr}`,
            `day_ended_${todayStr}`,
            `day_start_time_${todayStr}`,
            `day_start_timestamp_${todayStr}`,
            `day_start_finalized_timestamp_${todayStr}`,
            `day_end_time_${todayStr}`,
            `day_end_timestamp_${todayStr}`,
            'auto_eod_pending',
          ]);
          dayHasStarted = false;
          effectiveEnded = false;
        }
      }

      // Always reconcile with the server so reinstalls / clock changes
      // still honour the 24-hour Day End lockout and so admin re-opens
      // flow back to the device. The server returns:
      //   dayEnded       — EOT exists for today
      //   latestEndTime  — most recent EOT across any date
      // After a fresh install, local AsyncStorage is empty. Hydrate
      // dayStarted / dayEnded from the server so the bottom button renders
      // the right state immediately (Continue if day in progress, Day Ended
      // with the correct time within the 24-h lockout window, or Start Day
      // only when both conditions are past).
      let hydratedEndTimestamp: string | null = endTimestamp;
      // Tracks whether the server reconcile actually completed with a usable
      // response. ONLY an authoritative server answer is allowed to flip the
      // button Continue→Start Day (downgrade dayHasStarted true→false). If
      // the request times out / fails (the catch below), we must NOT trust
      // the locally-computed dayHasStarted — on navigate-back several
      // loadDayStatus calls race and the failed ones used to write a stale
      // `false` over the correct `true`, producing the Continue→Start Day→
      // Continue flicker. See the downgrade guard at the final write below.
      let serverConfirmed = false;
      // Whether today's EOT is still reopenable by an admin (inside the
      // Start Day + frequency window). When true AND the day is shown as
      // ended (Start Day button), tapping Start Day surfaces the "ask admin
      // to reopen EOT" popup instead of starting a fresh second shift.
      let eotReopenable = false;
      try {
        const { data: srv } = await api.get('/attendance/my-day-status', { params: { date: todayStr } });
        if (srv) {
          serverConfirmed = true;
          // SERVER IS AUTHORITATIVE for today's day status, with one
          // important business rule:
          //   - If server says today's EOT exists → the button should
          //     show "Start Day" (a fresh new-day start). We DO NOT
          //     show Day Ended after EOD per user request.
          //   - If server says dayStarted=true and EOT does NOT exist
          //     for today (e.g. admin reopened EOT) → "Continue".
          //   - Otherwise → "Start Day".
          // `srv.dayEnded` is set by the backend by querying eot_records
          // WHERE eotDate = today, so it's already today-scoped. Don't
          // also gate on latestEotDate matching — that field can arrive
          // as a full ISO timestamp ("2026-05-14T00:00:00.000Z") which
          // fails the strict equality with todayStr ("2026-05-14") and
          // silently keeps the button as Continue after EOD.
          const todayHasEot = srv.dayEnded === true;
          console.log('[Dashboard] reconcile srv:', {
            dayStarted: srv.dayStarted, dayEnded: srv.dayEnded,
            latestEotDate: srv.latestEotDate, todayStr, todayHasEot,
          });

          if (todayHasEot) {
            // Inside the reopen window the EOT is not final — an admin can
            // still reopen it, so the rep must not start a fresh second
            // shift. Capture the server's authoritative window flag; the
            // Start Day button uses it to show the "ask admin to reopen"
            // popup. Outside the window this is false and Start Day works
            // normally for a brand-new day.
            eotReopenable = srv.eotReopenable === true;
            // Today's EOT is on the server. Clear ALL local day flags so
            // the dashboard shows Start Day. This is the post-EOD state
            // the user explicitly requested. The user can immediately
            // start a new day without any lockout from today's EOT.
            await AsyncStorage.multiRemove([
              `day_started_${todayStr}`,
              `day_ended_${todayStr}`,
              `day_start_time_${todayStr}`,
              `day_start_timestamp_${todayStr}`,
              `day_start_finalized_timestamp_${todayStr}`,
              `day_end_time_${todayStr}`,
              `day_end_timestamp_${todayStr}`,
              'active_attendance_date',
              'auto_eod_pending',
            ]);
            dayHasStarted = false;
            effectiveEnded = false;
            hydratedEndTimestamp = null;
          } else if (srv.dayStarted === true) {
            // Day in progress (attendance row exists, no EOT). Force
            // local to reflect this so admin's Reopen-EOT immediately
            // surfaces as Continue regardless of what AsyncStorage
            // has cached.
            if (!dayHasStarted) {
              await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
              await AsyncStorage.setItem('active_attendance_date', todayStr);
              if (srv.startTime) {
                const startIso = new Date(srv.startTime).toISOString();
                const timeStr = new Date(srv.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, startIso);
                await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);
              }
              dayHasStarted = true;
            }
            // The server says the day is in progress (attendance row, no EOT)
            // — e.g. an admin reopened today's EOT from the portal. Clear the
            // durable "this day was ended" markers so the offline row-fallback
            // above keeps "Continue" alive instead of treating the day as
            // ended on the next poll that can't reach the server.
            await AsyncStorage.multiRemove([
              `auto_eod_fired_for_${todayStr}`,
              `auto_eod_fired_for_${(await AsyncStorage.getItem('active_attendance_date')) ?? todayStr}`,
            ]);
            // Also clear any stale local ended flags (defense in depth).
            if (effectiveEnded) {
              await AsyncStorage.multiRemove([
                `day_ended_${todayStr}`,
                `day_end_time_${todayStr}`,
                `day_end_timestamp_${todayStr}`,
              ]);
              effectiveEnded = false;
              hydratedEndTimestamp = null;
            }
          } else if (srv.openDayDate) {
            // No attendance for TODAY, but the user has an attendance from
            // a prior date that no longer has an EOT (admin reopened it,
            // or the server cron hasn't fired yet). Resume is only valid
            // INSIDE the auto-EOD frequency window measured from the
            // original Start Day time. Once now() crosses startTime +
            // frequency, the window is closed — fresh Start Day.
            //
            // This mirrors the backend EOT_WINDOW_EXPIRED guard so both
            // layers agree:
            //   inside window  → honour openDayDate, show Continue
            //   past window    → ignore openDayDate, show Start Day
            //
            // Examples (freq = 12 h):
            //   Start 09:00 → reopen until 21:00 same day
            //   Start 20:00 → reopen until 08:00 next morning
            //   Open app at 08:01 next morning → window expired → fresh
            //
            // CRITICAL: the window cutoff ONLY applies when auto-EOD is
            // actually enabled for this user. When it's disabled (the
            // default), there is NO frequency window — an open day
            // (attendance without EOT) stays "Continue" indefinitely until
            // the rep manually ends it or an admin closes the shift. The
            // previous code applied the 15 h DEFAULT autoEodWindowMs even
            // when auto-EOD was off, so a prior-date open day for Demo_P /
            // Dharam silently expired after 15 h and the button wrongly
            // showed "Start Day" instead of "Continue". Default to honouring
            // the open day; only narrow the window when auto-EOD is on AND
            // we know the original start time.
            let withinWindow = true;
            if (autoEodEnabled && srv.openDayStartTime) {
              const sinceStart = Date.now() - new Date(srv.openDayStartTime).getTime();
              withinWindow = sinceStart < autoEodWindowMs;
            }

            if (withinWindow) {
              console.log('[Dashboard] reconcile: open day from', srv.openDayDate, '— inside auto-EOD window, show Continue');
              await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
              await AsyncStorage.setItem('active_attendance_date', srv.openDayDate);
              if (srv.openDayStartTime) {
                const startIso = new Date(srv.openDayStartTime).toISOString();
                const timeStr = new Date(srv.openDayStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, startIso);
                await AsyncStorage.setItem(`day_start_time_${todayStr}`, timeStr);
              }
              dayHasStarted = true;
              if (effectiveEnded) {
                await AsyncStorage.multiRemove([
                  `day_ended_${todayStr}`,
                  `day_end_time_${todayStr}`,
                  `day_end_timestamp_${todayStr}`,
                ]);
                effectiveEnded = false;
                hydratedEndTimestamp = null;
              }
            } else {
              console.log('[Dashboard] reconcile: open day from', srv.openDayDate, '— past auto-EOD window, show Start Day');
              // Treat as no open day. Clear any local flags that would
              // make the bottom button show Continue / Day Ended.
              if (dayHasStarted || effectiveEnded) {
                await AsyncStorage.multiRemove([
                  `day_started_${todayStr}`,
                  `day_ended_${todayStr}`,
                  `day_start_time_${todayStr}`,
                  `day_start_timestamp_${todayStr}`,
                  `day_start_finalized_timestamp_${todayStr}`,
                  `day_end_time_${todayStr}`,
                  `day_end_timestamp_${todayStr}`,
                  'active_attendance_date',
                  'auto_eod_pending',
                ]);
                dayHasStarted = false;
                effectiveEnded = false;
                hydratedEndTimestamp = null;
              }
            }
          } else {
            // Server reports no active day, no EOT, no openDayDate.
            //
            // We may still legitimately want to keep "Continue" if THIS user
            // marked attendance locally and the push sync hasn't reached the
            // server yet. But we must verify that with a USER-SCOPED signal —
            // NOT the AsyncStorage day_started flag or the module-level
            // lastKnownDayStarted cache, because neither is keyed per user.
            // On a shared device a "true" left by a previous user persists
            // through logout, so trusting it made a brand-new user (who never
            // marked attendance) wrongly see "Continue". The attendance_records
            // table IS user-scoped (user_code + attendance_date), so it's the
            // authoritative per-user marker: row present → genuine local start,
            // sync pending → keep Continue; row absent → no day for this user
            // → clear any stale (possibly cross-user) flags and show Start Day.
            const localAttCount = await database
              .get('attendance_records')
              .query(
                Q.where('user_code', user?.code ?? ''),
                Q.where('attendance_date', todayStr),
              )
              .fetchCount();
            if (localAttCount > 0) {
              console.log('[Dashboard] reconcile: server has no day record but THIS user has a local attendance row — sync pending, keeping Continue');
              dayHasStarted = true; // hold Continue; don't downgrade on a no-record response
              effectiveEnded = false;
            } else {
              // No local attendance for this user AND server has no record →
              // truly no day for this user. Clear any stale flags (which may
              // belong to a previous user on this device) so the button shows
              // Start Day.
              if (dayHasStarted || effectiveEnded) {
                console.log('[Dashboard] reconcile: no local attendance row for this user + server has no record — clearing stale flags, show Start Day');
                await AsyncStorage.multiRemove([
                  `day_started_${todayStr}`,
                  `day_ended_${todayStr}`,
                  `day_start_time_${todayStr}`,
                  `day_start_timestamp_${todayStr}`,
                  `day_start_finalized_timestamp_${todayStr}`,
                  `day_end_time_${todayStr}`,
                  `day_end_timestamp_${todayStr}`,
                  'active_attendance_date',
                  'auto_eod_pending',
                ]);
              }
              dayHasStarted = false;
              effectiveEnded = false;
              hydratedEndTimestamp = null;
              lastKnownDayStarted = false; // wipe stale cross-user cache
            }
          }
        }
      } catch { /* offline — keep local state, retry next focus */ }

      // Re-read the keys we may have just hydrated (reinstall case), so the
      // rendered time / timestamp reflect server values instead of the
      // initial empty locals.
      const [startTime2, startTimestamp2, endTime2, endTimestamp2] = await Promise.all([
        AsyncStorage.getItem(`day_start_time_${todayStr}`),
        AsyncStorage.getItem(`day_start_timestamp_${todayStr}`),
        AsyncStorage.getItem(`day_end_time_${todayStr}`),
        AsyncStorage.getItem(`day_end_timestamp_${todayStr}`),
      ]);

      // ── Auto-EOD due-check — runs AFTER the server reconcile ──
      // The original pre-reconcile check was skipped when a user started
      // day on a prior date and opened the app days later, because the
      // local dayHasStarted was false at that point. By the time the
      // reconcile hydrated dayHasStarted=true via openDayDate, the check
      // had already passed — so the popup + server EOT never fired and
      // the user wrongly saw Continue. Running it here, after the re-read
      // of hydrated keys, fixes that. Idempotency flag below also covers
      // the Reopen-EOT case (so admin re-open shows Continue, not popup).
      const finalizedTimestamp2 = await AsyncStorage.getItem(`day_start_finalized_timestamp_${todayStr}`);
      const autoEodAnchor = finalizedTimestamp2 ?? startTimestamp2 ?? finalizedTimestamp ?? startTimestamp;
      if (!dayHasStarted || effectiveEnded) {
        autoEodPromptShownRef.current = false;
        autoEodOfflineAlertShownRef.current = false;
      }
      if (autoEodEnabled && dayHasStarted && !effectiveEnded && autoEodAnchor) {
        const activeAttDate = (await AsyncStorage.getItem('active_attendance_date')) ?? todayStr;
        const alreadyFired = await AsyncStorage.getItem(`auto_eod_fired_for_${activeAttDate}`);
        const sinceStart = Date.now() - new Date(autoEodAnchor).getTime();
        const isEodDue = sinceStart >= autoEodWindowMs || autoEodPending === 'true';
        if (isEodDue && !autoEodPromptShownRef.current && alreadyFired !== 'true') {
          autoEodPromptShownRef.current = true;
          const minutes = Math.round(autoEodWindowMs / 60000);
          (async () => {
            const isOnline = await isInternetAvailable();
            if (!isOnline) {
              await AsyncStorage.setItem('auto_eod_pending', 'true');
              autoEodPromptShownRef.current = false;
              if (!autoEodOfflineAlertShownRef.current) {
                autoEodOfflineAlertShownRef.current = true;
                Alert.alert(
                  'Auto EOD Pending',
                  'Your Auto End of Day is due, but cannot be completed because there is no internet connection.\n\nAll transactional data is safe and will not be lost. The system will automatically push your data and end your day as soon as internet connectivity is restored.',
                  [{ text: 'OK' }],
                  { cancelable: false },
                );
              }
              return;
            }
            let visitsClosed = 0;
            let pushResultsSummary = '';
            try {
              await AsyncStorage.removeItem('auto_eod_pending');
              autoEodOfflineAlertShownRef.current = false;

              try {
                const { data: acCfg } = await api.get('/settings/auto-checkout');
                const acEnabled = !!acCfg?.data?.enabled;
                if (acEnabled && user?.code) {
                  const openVisits: any[] = await database
                    .get('customer_visits')
                    .query(
                      Q.where('user_code', user.code),
                      Q.where('checkout_time', null),
                    )
                    .fetch();
                  if (openVisits.length > 0) {
                    visitsClosed = openVisits.length;
                    const nowMs = Date.now();
                    await database.write(async () => {
                      for (const v of openVisits) {
                        try {
                          await v.update((rec: any) => {
                            rec._raw.checkout_time = nowMs;
                            rec._raw.checkout_type = 'auto';
                            rec._raw.status = 'CHECKED_OUT';
                            rec._raw.is_synced = false;
                            const checkin = rec._raw.checkin_time || nowMs;
                            rec._raw.duration_mins = Math.round((nowMs - checkin) / 60000);
                          });
                        } catch (e) { console.warn('[Dashboard] auto-eod visit close failed:', e); }
                      }
                    });
                  }
                }
              } catch (e) { console.warn('[Dashboard] auto-eod auto-checkout step failed:', e); }

              try {
                const { pushSync } = require('../services/syncService');
                const results: Array<{ entity: string; success: number; failed: number }> = await pushSync();
                const successParts: string[] = [];
                const retryParts: string[] = [];
                if (visitsClosed > 0) successParts.push(`closed ${visitsClosed} open visit(s)`);
                if (Array.isArray(results)) {
                  for (const r of results) {
                    if (!r || !r.entity) continue;
                    const label = String(r.entity).replace(/_/g, ' ');
                    if ((r.success ?? 0) > 0) successParts.push(`${r.success} ${label}`);
                    if ((r.failed ?? 0) > 0) retryParts.push(`${r.failed} ${label}`);
                  }
                }
                const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
                const todayMs = startOfDay.getTime();
                const myUserCode = user?.code ?? '';
                const COUNT_TABLES: Array<{ table: string; field: string; label: string }> = [
                  { table: 'osoi_photos', field: 'captured_on', label: 'OSOI photos' },
                  { table: 'planogram_executions', field: 'performed_on', label: 'Planogram executions' },
                  { table: 'product_samplings', field: 'visit_date', label: 'Product samplings' },
                  { table: 'po_captures', field: 'captured_on', label: 'PO captures' },
                  { table: 'physical_stocks', field: 'recorded_on', label: 'Physical stocks' },
                  { table: 'opening_stocks', field: 'recorded_on', label: 'Opening stocks' },
                  { table: 'orders', field: 'trx_date', label: 'Orders' },
                  { table: 'customer_visits', field: 'checkin_time', label: 'Visits' },
                  { table: 'competitor_observations', field: 'visit_date', label: 'Competitor checks' },
                  { table: 'expiry_checks', field: 'visited_date', label: 'Expiry checks' },
                  { table: 'permanent_display_checks', field: 'checked_on', label: 'Display checks' },
                  { table: 'survey_responses', field: 'completed_on', label: 'Survey responses' },
                  { table: 'collections', field: 'collection_date', label: 'Collections' },
                ];
                const todayParts: string[] = [];
                for (const t of COUNT_TABLES) {
                  try {
                    // Filter by user_code so the auto-EOD popup never
                    // attributes another user's transactions to the
                    // current user. Without this, on a shared device
                    // user TB0672 was seeing "2 Planogram executions,
                    // 3 Expiry checks" in the popup — those rows were
                    // left in the local DB by a previous user's session
                    // that day. The query was counting every row with
                    // today's date regardless of who created it.
                    const c = await database.get(t.table).query(
                      Q.where(t.field, Q.gte(todayMs)),
                      Q.where('user_code', myUserCode),
                    ).fetchCount();
                    if (c > 0) todayParts.push(`${c} ${t.label}`);
                  } catch { /* table may not exist, field name differs, or no user_code column — skip silently */ }
                }
                const sentence: string[] = [];
                if (successParts.length > 0) sentence.push(`Pushed now: ${successParts.join(', ')}`);
                if (retryParts.length > 0) sentence.push(`Will retry: ${retryParts.join(', ')}`);
                if (todayParts.length > 0) sentence.push(`Today on server: ${todayParts.join(', ')}`);
                if (sentence.length === 0) sentence.push('No transactions recorded today');
                pushResultsSummary = sentence.join(' • ');
              } catch (e) { console.warn('[Dashboard] auto-eod pushSync failed:', e); pushResultsSummary = 'push will retry on next sync'; }

              try {
                await api.post('/attendance/end-day', {
                  endTime: new Date().toISOString(),
                  eotDate: activeAttDate,
                  isAutoEod: true, // auto-EOD — must NOT be reopenable
                });
              } catch (e: any) {
                if (e?.response?.data?.error !== 'EOT_ALREADY_DONE') {
                  console.warn('[Dashboard] auto-eod /end-day failed:', e?.response?.data ?? e?.message);
                }
              }

              logAutoEndDay(`Auto EOD after ${minutes} min — ${pushResultsSummary}`);
              await AsyncStorage.setItem(`auto_eod_fired_for_${activeAttDate}`, 'true');

              // Backfill ABSENT rows for the gap between the original
              // start date and today. The user didn't open the app on
              // those days, so they're effectively absent. Without
              // explicit rows, backend reports treat the days as
              // "missing" (neither Present nor Absent) instead of
              // showing the user as Absent. Each absent row gets a
              // fresh uuid + isPresent=false + attendance_type='Absent'
              // and pushSync drains them to the server on the next
              // cycle (we kick a push after the writes below).
              try {
                if (user?.code && activeAttDate && activeAttDate < todayStr) {
                  const gapDates: string[] = [];
                  const cur = new Date(`${activeAttDate}T00:00:00Z`);
                  const end = new Date(`${todayStr}T00:00:00Z`);
                  cur.setUTCDate(cur.getUTCDate() + 1);
                  while (cur < end) {
                    gapDates.push(cur.toISOString().split('T')[0]);
                    cur.setUTCDate(cur.getUTCDate() + 1);
                  }
                  if (gapDates.length > 0) {
                    await database.write(async () => {
                      for (const gapDate of gapDates) {
                        const existing = await database.get('attendance_records').query(
                          Q.where('user_code', user.code),
                          Q.where('attendance_date', gapDate),
                        ).fetchCount();
                        if (existing > 0) continue;
                        await database.get('attendance_records').create((rec: any) => {
                          rec._raw.id = uuidv4();
                          rec.userCode = user.code;
                          rec.isPresent = false;
                          rec._raw.attendance_type = 'Absent';
                          rec.attendanceDate = gapDate;
                          rec.selfiePath = null;
                          rec.geoLat = null;
                          rec.geoLng = null;
                          rec.isSynced = false;
                        });
                      }
                    });
                    console.log(`[Dashboard] Backfilled ${gapDates.length} absent day(s):`, gapDates);
                    // Kick a push so the absent rows reach the server
                    // alongside the EOT that just landed.
                    pushSync().catch(() => {});
                  }
                }
              } catch (e) {
                console.warn('[Dashboard] absent backfill failed:', e);
              }

              await AsyncStorage.multiRemove([
                `day_started_${todayStr}`,
                `day_ended_${todayStr}`,
                `day_start_time_${todayStr}`,
                `day_start_timestamp_${todayStr}`,
                `day_start_finalized_timestamp_${todayStr}`,
                `day_end_time_${todayStr}`,
                `day_end_timestamp_${todayStr}`,
                'active_attendance_date',
                'auto_eod_pending',
              ]);
              setDayEnded(false);
              setDayEndTimestamp(null);
              setDayStarted(false);
              lastKnownDayEnded = false;
              lastKnownDayEndTimestamp = null;
              lastKnownDayStarted = false;
              console.log('[Dashboard] Auto-EOD applied —', pushResultsSummary);

              Alert.alert(
                'Day Ended',
                `Your day has ended.\n\nTransaction data has been pushed to the server.\n\n${pushResultsSummary}`,
                [{ text: 'OK' }],
                { cancelable: false },
              );
            } catch (e) {
              console.warn('[Dashboard] auto-eod handler error:', e);
            }
          })();
        }
      }

      // Discard this result if a newer loadDayStatus call has already
      // started — its result is more up-to-date and writing stale state
      // here would cause the "Start Day" flicker on Android 10/13 devices
      // where the server reconcile takes >200 ms and races the focus call.
      if (isStale()) return;
      // DOWNGRADE GUARD (mirrors the fast path): only an authoritative server
      // response may flip the button Continue→Start Day. If the reconcile
      // request failed (offline / timeout — we landed in the catch above and
      // serverConfirmed stayed false), never write a locally-computed `false`
      // over a known-started day. On navigate-back, multiple loadDayStatus
      // calls race; the ones whose /my-day-status timed out were writing a
      // stale dayHasStarted=false and the next successful call rewrote true,
      // producing the Continue→Start Day→Continue flicker the rep sees. When
      // the server DID answer, dayHasStarted is authoritative (including a
      // legitimate false from todayHasEot / window-expiry) and we trust it.
      const finalStarted = serverConfirmed ? dayHasStarted : (dayHasStarted || lastKnownDayStarted);
      setDayStarted(finalStarted);
      lastKnownDayStarted = finalStarted;
      if (!dayStatusLoadedRef.current) {
        dayStatusLoadedRef.current = true;
        setDayStatusLoaded(true);
        lastKnownDayStatusLoaded = true;
      }
      setDayEnded(effectiveEnded);
      lastKnownDayEnded = effectiveEnded;
      // Only trust the reopen-window flag from a confirmed server response.
      // On an offline poll we leave the previous value untouched so the
      // popup state doesn't flip just because one request failed.
      if (serverConfirmed) setEotReopenWithinWindow(eotReopenable);
      setDayStartTime(startTime2 ?? startTime);
      setDayStartTimestamp(startTimestamp2 ?? startTimestamp);
      setDayEndTime(endTime2 ?? endTime);
      const finalEndTs = effectiveEnded ? (endTimestamp2 ?? hydratedEndTimestamp ?? endTimestamp) : null;
      setDayEndTimestamp(finalEndTs);
      lastKnownDayEndTimestamp = finalEndTs;
    } catch (e) {
      console.warn('loadDayStatus error:', e);
    } finally {
      loadInFlightRef.current = false;
    }
  }, [user?.code]);

  // Android only: hardware back / swipe-back gesture on Home shows an exit
  // confirmation dialog instead of quitting silently.
  // iOS has no hardware back button — this is a no-op there.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBackPress = () => {
        Alert.alert(
          'Exit App',
          'Are you sure you want to exit?',
          [
            { text: 'No', style: 'cancel' },
            { text: 'Yes', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true },
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, []),
  );

  const loadTodayShift = useCallback(async () => {
    try {
      const { data } = await api.get('/rota', {
        params: { userCode: user?.code, pageSize: 50 },
      });
      const items = data.data ?? data.items ?? (Array.isArray(data) ? data : []);
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const match = items.find((item: any) => {
        const dateStr = item.rotaDate ?? item.date ?? '';
        return dateStr === todayKey;
      });
      setTodayShift(match ? (match.activityName ?? match.activity_name ?? null) : null);
    } catch {
      setTodayShift(null);
    }
  }, [user?.code]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadKPIs(), loadStores(), loadTodayShift(), loadDayStatus()]);
    setRefreshing(false);
  }, [loadKPIs, loadStores, loadTodayShift, loadDayStatus]);

  // Single focus effect — refresh in the background on every focus. We do
  // NOT delay the run (the old 150 ms setTimeout caused a visible blank
  // when returning from My Stores etc.) and we do NOT toggle any loading
  // state, so the previous render keeps showing while the DB queries
  // refresh quietly. The catch-up second pass that fired at 1.5 s used to
  // re-render and contributed to the same flicker — removed.
  const loadingRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      let cancelled = false;
      (async () => {
        try {
          await Promise.all([
            loadKPIs(),
            loadStores(),
            loadTodayShift(),
            loadDayStatus(),
          ]);
        } finally {
          if (!cancelled) loadingRef.current = false;
        }
      })();
      return () => { cancelled = true; loadingRef.current = false; };
    }, [loadKPIs, loadStores, loadTodayShift, loadDayStatus]),
  );

  // If restoreMyDay finishes AFTER the App.tsx splash already dismissed
  // (slow network → 6-s splash cap fires first → Dashboard mounts before
  // the restored attendance row + day_started flag land in local storage),
  // re-run loadDayStatus the moment restoreMyDay emits its done-event so
  // the bottom button picks up the freshly-restored state without waiting
  // for the next focus. Without this listener the rep could sit on the
  // Dashboard with the spinner / stale Start Day until they manually
  // navigated away and back to trigger useFocusEffect.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(RESTORE_MY_DAY_DONE_EVENT, () => {
      loadDayStatus();
    });
    return () => sub.remove();
  }, [loadDayStatus]);

  // While the day is in "ended" state, re-check once a minute so the 24-hour
  // Day-state polls — 5 s across all three states for near-real-time
  // response to portal-side changes (admin Reopen-EOT, auto-EOD elapse,
  // openDayDate from a prior-date reopen).
  const DAY_POLL_MS = 5 * 1000;

  // ONE poll for every day-state. This used to be three separate effects
  // keyed on dayStarted / dayEnded, so each interval was torn down and
  // recreated every time the button flipped — and the flip is exactly when
  // the flicker happens, so the teardown/recreate churn fed the race. A
  // single interval that depends only on the (stable, [user?.code]-scoped)
  // loadDayStatus callback polls in ALL states without re-subscribing on
  // every state change: Continue → detect auto-EOD elapse / today's EOT;
  // Day Ended / Start Day → detect an admin Reopen-EOT. Combined with the
  // single-flight latch, overlapping reconciles can no longer ping-pong
  // the button.
  useEffect(() => {
    const id = setInterval(() => {
      loadDayStatus();
    }, DAY_POLL_MS);
    return () => clearInterval(id);
  }, [loadDayStatus]);

  // Auto-refresh dashboard tiles every 2 minutes to pick up background sync
  // changes. Pull-to-refresh still re-fetches instantly on demand.
  useEffect(() => {
    const id = setInterval(() => {
      Promise.all([loadKPIs(), loadStores()]).catch(() => {});
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadKPIs, loadStores]);

  const formatCurrency = (n: number) =>
    '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Confirmation gate before the actual logout work. Yes runs
  // performLogout (push pending data, then sign out). No keeps the user
  // signed in and does NOT push anything.
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? Any pending data on this device will be pushed to the server before you are signed out.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => { performLogout(); } },
      ],
      { cancelable: true },
    );
  };

  const performLogout = async () => {
    // Tap shows the loader straight away. auth.logout() pushes pending
    // data first and only clears the session if the push succeeded.
    // If it failed after every retry, we keep the user signed in and
    // surface the failure so they can fix connectivity and retry —
    // logging them out with unsynced records on-device would silently
    // lose work because those records are scoped to the cleared user.
    setLoggingOut(true);
    try {
      // Auto-EOD on logout — but ONLY if the rep's shift window has already
      // elapsed. Logging out and back in (same user) must NOT end an active
      // shift: within the window we leave the day OPEN so the next login (or
      // app reopen) resumes "Continue" instead of forcing Start Day again.
      // Past the window the day should have ended anyway (the auto-EOD timer /
      // server cron close it regardless), so we close it here too. When auto-EOD
      // is disabled there is no window, so we NEVER auto-end on logout — the
      // open day persists until a manual End Day. Best-effort: any failure here
      // is non-fatal because auth.logout()'s own pushSync re-attempts data.
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const started = await AsyncStorage.getItem(`day_started_${todayStr}`);
        const ended = await AsyncStorage.getItem(`day_ended_${todayStr}`);

        // Has the shift's frequency window elapsed? Anchor on the finalized
        // Start-Day timestamp (falls back to the display start timestamp).
        let windowElapsed = false;
        try {
          const cfg = JSON.parse((await AsyncStorage.getItem('auto_eod_config')) ?? '{}');
          const autoEodEnabled = cfg?.applies !== false;
          const freqMs = (typeof cfg?.frequencyMinutes === 'number' && cfg.frequencyMinutes > 0)
            ? cfg.frequencyMinutes * 60000
            : 12 * 60 * 60 * 1000;
          const startTs = (await AsyncStorage.getItem(`day_start_finalized_timestamp_${todayStr}`))
            ?? (await AsyncStorage.getItem(`day_start_timestamp_${todayStr}`));
          const startMs = startTs ? new Date(startTs).getTime() : null;
          windowElapsed = autoEodEnabled && startMs != null && Date.now() >= startMs + freqMs;
        } catch { /* default: do NOT auto-end — leave the day open to resume */ }

        if (started === 'true' && ended !== 'true' && windowElapsed) {
          const eotDateStr = (await AsyncStorage.getItem('active_attendance_date')) ?? todayStr;
          const alreadyFired = await AsyncStorage.getItem(`auto_eod_fired_for_${eotDateStr}`);
          if (alreadyFired !== 'true') {
            try {
              await api.post('/attendance/end-day', {
                endTime: new Date().toISOString(),
                eotDate: eotDateStr,
                isAutoEod: true, // auto-EOD — must NOT be reopenable
              });
            } catch (e: any) {
              if (e?.response?.data?.error !== 'EOT_ALREADY_DONE') {
                console.warn('[Logout] auto-eod /end-day failed:', e?.response?.data ?? e?.message);
              }
            }
            await AsyncStorage.setItem(`auto_eod_fired_for_${eotDateStr}`, 'true');
            await AsyncStorage.multiRemove([
              `day_started_${todayStr}`,
              `day_ended_${todayStr}`,
              `day_start_time_${todayStr}`,
              `day_start_timestamp_${todayStr}`,
              `day_start_finalized_timestamp_${todayStr}`,
              `day_end_time_${todayStr}`,
              `day_end_timestamp_${todayStr}`,
              'active_attendance_date',
              'auto_eod_pending',
            ]);
            try {
              const { logAutoEndDay: log } = require('../services/activityLogger');
              log?.('Auto EOD on logout (user signed out without ending day)');
            } catch { /* non-blocking */ }
          }
        }
      } catch (e) {
        console.warn('[Logout] auto-eod-on-logout pre-step failed:', e);
      }

      await logout();
      // Success path: AppNavigator will switch to LoginScreen on the next
      // render, which unmounts both this dashboard and the still-open
      // drawer Modal. No explicit drawer close needed.
    } catch (err: any) {
      // Failure path: dismiss the loader Modal first, THEN close the
      // drawer Modal (sequencing matters on Android — two Modals can't
      // unmount simultaneously without artifacts), THEN show the alert.
      setLoggingOut(false);
      setDrawerOpen(false);
      // Small delay so the loader Modal has fully dismissed before the
      // Alert (which is yet another platform modal) shows up.
      setTimeout(() => {
        const msg = String(err?.message ?? '');
        if (msg.startsWith('PUSH_FAILED')) {
          Alert.alert(
            'Cannot Logout',
            'Your pending data could not be pushed to the server. Please check your internet connection and try again — your session will stay open until the data is safely synced.',
          );
        } else if (msg.startsWith('OFFLINE')) {
          Alert.alert(
            'No Internet Connection',
            'You appear to be offline. Logout requires an internet connection so any pending records can be pushed to the server before your session is cleared.',
          );
        } else {
          Alert.alert('Logout Failed', 'Something went wrong while logging out. Please try again.');
        }
      }, 250);
    }
  };

  return (
    <View style={styles.container} testID="dashboard-screen">
      {/* ── Side Drawer ── */}
      <SideDrawer
        visible={drawerOpen}
        highlight={drawerHighlight}
        dayEnded={dayEnded}
        onClose={() => { setDrawerOpen(false); setDrawerHighlight(null); }}
        user={user}
        onNavigate={(screen) => {
          // Always-allowed screens (Rota Creation, Reports, Settings) bypass
          // every gate — planning / reporting / settings work before Start
          // Day, during the day, and after Day End without any alert.
          if (ALWAYS_ALLOWED.has(screen)) {
            navigation.navigate(screen);
            return;
          }
          // Pre-Start-Day gate (before attendance) keeps its alert because
          // the user hasn't seen the lock state yet. After Day End the
          // drawer renders disabled rows, so this branch is only reached
          // for whitelisted items above — just nav.
          if (!dayStarted) {
            Alert.alert(
              'Start Day Required',
              'Please complete Zimyo check-in and Start Day before accessing this option.',
            );
            return;
          }
          if (screen === 'Stores') {
            navigation.navigate('Stores');
          } else {
            navigation.navigate(screen);
          }
        }}
        onLogout={handleLogout}
        onEndDay={() => {
          if (!dayStarted) {
            Alert.alert(
              'Start Day Required',
              'Please complete Zimyo check-in and Start Day before ending your day.',
            );
            return;
          }
          if (dayEnded) {
            // Day End row is already rendered disabled in the drawer
            // when dayEnded is true; if we ever reach this path just exit
            // silently rather than popping an alert.
            return;
          }
          navigation.navigate('EndOfDay');
        }}
      />

      {/* ── White Header with Farmley Logo ── */}
      <View style={styles.whiteHeader}>
        <TouchableOpacity
          style={styles.hamburgerBtn}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.7}
          testID="hamburger-button"
        >
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Image source={require('../assets/farmley_logo.png')} style={{ width: 165, height: 45 }} resizeMode="contain" />
        </View>

        <View style={{ width: sc(40) }} />
      </View>
      <View style={{ height: 3, backgroundColor: '#1a3a8f' }} />

      {/* removed blue gradient KPI section */}

      {/* Pending-sync banner removed — background sync runs every 30s,
          push is triggered immediately on each submit, and Clear-Storage
          restore re-pulls master + transactions. Surfacing a manual
          Push Now button confused users when the system was already
          handling it. */}

      {/* Body — no ScrollView. The dashboard now lays out as a single
          flex column between the header and the bottom button: the two
          cover cards sit at the top, the Tasks title + tile grid below
          them, and the residual `flex: 1` spacer at the bottom pushes
          the bottom Start Day button down to the safe area. This means
          the user never has to scroll and the layout adapts to all
          phone heights — content above stays anchored to the top,
          button stays anchored to the bottom. */}
      <View style={styles.body}>
        {/* Assigned vs Covered Stores */}
        <View style={styles.coverRow}>
          <View style={[styles.coverCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }]} testID="total-assigned-stores">
            <Text style={{ fontSize: sc(12), color: '#2D3748', fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>Assigned Stores</Text>
            <Text
              style={{ fontSize: kpi.totalOutlets > 999 ? 16 : 20, fontWeight: '800', color: '#111827', marginLeft: 4, textAlign: 'right' }}
              numberOfLines={1}
            >{kpi.totalOutlets}</Text>
          </View>
          <View style={[styles.coverCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }]} testID="total-covered-stores">
            <Text style={{ fontSize: sc(12), color: '#2D3748', fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>Covered Stores</Text>
            <Text
              style={{ fontSize: kpi.visitsToday > 999 ? 16 : 20, fontWeight: '800', color: '#111827', marginLeft: 4, textAlign: 'right' }}
              numberOfLines={1}
            >{kpi.visitsToday}</Text>
          </View>
        </View>

        {/* ── Tasks Grid ── */}
        <Text style={styles.sectionTitle2}>Tasks</Text>
        <View style={styles.tileGrid}>
          {QUICK_TILES.map((tile, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.tile}
              activeOpacity={0.7}
              testID={tile.testID}
              onPress={() => {
                // Zimyo tile is always allowed — that's how the user actually
                // marks attendance (external Zimyo app). Everything else is
                // gated by the active-day window.
                const isStartDayTile = tile.testID === 'task-hrms';
                if (!isStartDayTile && !dayStarted) {
                  Alert.alert(
                    'Start Day Required',
                    'Please complete Zimyo check-in and Start Day before using this task.',
                  );
                  return;
                }
                if (!isStartDayTile && dayEnded) {
                  Alert.alert(
                    'Day Ended',
                    'Your day has already ended. No further tasks can be performed until a new day is started.',
                  );
                  return;
                }
                if (isStartDayTile) {
                  Linking.openURL('https://play.google.com/store/apps/details?id=com.zimyo.hrms');
                } else if (tile.screen === 'BrandTraining') {
                  Alert.alert('Coming Soon', 'Brand Training feature is coming soon.');
                } else if (tile.screen === 'CustomerInteraction') {
                  setInteractionPopup(true);
                } else if (tile.screen) {
                  // Navigate immediately. The 300 ms loading overlay was
                  // visible BOTH on tile tap and briefly on the way back to
                  // the dashboard, which is what the user reads as "home
                  // page hides for 1-2 seconds". Native stack pushes the
                  // next screen on top fast enough that no overlay is
                  // needed.
                  navigation.navigate(tile.screen);
                }
              }}
            >
              <MCIcon name={tile.mcIcon} size={28} color="#555555" />
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Flex spacer pushes the bottom Start Day button down to the
            safe-area edge regardless of how tall the device is. */}
        <View style={{ flex: 1 }} />
      </View>

      {/* Bottom Button: Start Day / Continue / Day Ended.
           Bar is always visible (no layout jump), but the label is
           replaced with a small spinner on the very first cold mount
           (post-login) until loadDayStatus resolves. Without this gate
           a user with an open day saw "Start Day" for ~1 s before it
           flipped to "Continue". On screen re-mounts the module-level
           lastKnownDayStatusLoaded cache short-circuits the spinner. */}
      <View style={[styles.continueBar, { paddingBottom: bottomInset }]}>
        <TouchableOpacity
          style={[styles.continueBtn, dayEnded && { backgroundColor: '#6B7280' }]}
          activeOpacity={dayEnded || !dayStatusLoaded ? 1 : 0.8}
          testID="dashboard-action-button"
          // After the day has been ended no action is possible — the button
          // just displays the end time/date until the 24 h auto-reset kicks
          // in and flips the state back to "Start Day".
          disabled={dayEnded || !dayStatusLoaded}
          onPress={() => {
            if (dayEnded) return;
            if (dayStarted) {
              navigation.navigate('Stores');
              return;
            }
            // Within the reopen window (EOT end_time + frequency) we let the rep
            // proceed into the Start Day flow. On Proceed the backend returns
            // SHIFT_IN_PROGRESS and StartDayScreen shows the self-reopen
            // ("Reopen Previous Day") popup → Continue. Past the window the
            // backend accepts a fresh Start Day with no popup. Reopen is offered
            // to the rep, not admin-gated, per the reopen-window requirement.
            void eotReopenWithinWindow; // retained for state wiring; no longer blocks here
            Alert.alert(
              'Zimyo Check-In',
              'Have you completed your Zimyo check-in?',
              [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Yes',
                  onPress: () => navigation.navigate('StartDay'),
                },
              ],
              { cancelable: true },
            );
          }}
        >
          {!dayStatusLoaded ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : dayEnded ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.continueBtnText, { fontSize: 15 }]}>Day Ended</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                {(() => {
                  const ts = dayEndTimestamp ? new Date(dayEndTimestamp) : null;
                  const timePart = ts
                    ? ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : (dayEndTime ?? '');
                  const datePart = ts
                    ? ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '';
                  return [timePart, datePart].filter(Boolean).join(' · ');
                })()}
              </Text>
            </View>
          ) : (
            <Text style={styles.continueBtnText}>
              {dayStarted ? 'Continue' : 'Start Day'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Loading overlay */}
      {tileLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1a3178" />
          <Text style={styles.loadingOverlayText}>Loading...</Text>
        </View>
      )}

      {/* Customer Interaction Popup */}
      <Modal visible={interactionPopup} transparent animationType="fade" hardwareAccelerated onRequestClose={() => setInteractionPopup(false)}>
        <TouchableWithoutFeedback onPress={() => setInteractionPopup(false)}>
          <View style={styles.popupOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.popupSheet}>
                <View style={styles.popupGrid}>
                  <TouchableOpacity
                    style={styles.popupTile}
                    activeOpacity={0.7}
                    onPress={() => { setInteractionPopup(false); navigation.navigate('ProductFeedback'); }}
                  >
                    <MCIcon name="clipboard-check-outline" size={28} color="#6B7280" />
                    <Text style={styles.popupTileLabel}>Product Feedback</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.popupTile}
                    activeOpacity={0.7}
                    onPress={() => { setInteractionPopup(false); navigation.navigate('BroadcastInitiative'); }}
                  >
                    <MCIcon name="television-classic" size={28} color="#6B7280" />
                    <Text style={styles.popupTileLabel}>Broadcast Initiative</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Loader while logout's pushSync runs. Rendered as a Modal so it
          stacks ABOVE the still-open drawer Modal — the drawer is left
          open intentionally (see SideDrawer logout onPress) so the loader
          Modal mounts on top of a stable drawer Modal rather than racing
          against its dismiss animation. */}
      <Modal
        visible={loggingOut}
        transparent
        animationType="fade"
        onRequestClose={() => { /* block back press while pushing */ }}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', marginTop: 14, fontSize: 14, fontWeight: '600' }}>
            Pushing data to server…
          </Text>
        </View>
      </Modal>
    </View>
  );
}

/* ── REMOVED SECTIONS (Sales Performance, Coverage, Returns, etc.) ── */
/* These are now accessible via hamburger menu → Target Vs Achievement */

// keep rest of styles below
const _REMOVED_ = null; // placeholder


// ─── Drawer Styles ────────────────────────────────────────────────────────────
const drawer = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    width: DRAWER_WIDTH,
    backgroundColor: '#3D4FC4',
    height: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  header: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerRole: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 2,
  },
  headerRoute: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  headerChevron: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  menuScroll: {
    flex: 1,
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuIconStyle: {
    width: 32,
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  menuChevron: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    alignItems: 'center',
  },
  footerLogo: {
    width: 180,
    height: 50,
  },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    // Light grey backdrop so the white task tiles + KPI cards read as
    // raised "3D" surfaces against the page, matching the mockup. The
    // whiteHeader below still has its own #FFFFFF so the logo bar
    // stays on a clean white strip at the top.
    flex: 1,
    backgroundColor: '#F2F4F7',
  },

  // White Header — sits just below the status bar with minimal gap
  whiteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? sc(50) : (StatusBar.currentHeight ?? 24) + 4,
    paddingHorizontal: sc(16),
    paddingBottom: sc(6),
    backgroundColor: '#FFFFFF',
  },

  // Continue bar
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  loadingOverlayText: {
    marginTop: 12,
    fontSize: 14,
    color: '#1a3178',
    fontWeight: '500',
  },
  continueBar: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  continueBtn: {
    backgroundColor: '#1a3a8f',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Old header (kept for reference)
  header: {
    paddingTop: Platform.OS === 'ios' ? sc(54) : sc(36),
    paddingHorizontal: sc(16),
    paddingBottom: sc(20),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: sc(12),
  },
  hamburgerBtn: {
    width: sc(36),
    height: sc(36),
    justifyContent: 'center',
  },
  hamburgerLine: {
    height: 1.5,
    width: 22,
    backgroundColor: '#374151',
    marginVertical: 3,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  appTitle: {
    fontSize: sc(26),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  bellButton: {
    width: sc(40),
    height: sc(40),
    borderRadius: sc(10),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: sc(20),
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  greeting: {
    fontSize: sc(14),
    color: 'rgba(255,255,255,0.8)',
  },
  greetingName: {
    fontSize: sc(16),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: sc(12),
    color: 'rgba(255,255,255,0.65)',
    marginBottom: sc(16),
  },

  // KPI
  kpiLoader: { marginVertical: sc(12) },
  kpiRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: sc(12),
    padding: sc(14),
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
  },
  kpiDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: sc(4),
  },
  kpiValue: {
    fontSize: sc(20),
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: sc(9),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Body — flex column between the white header and the bottom Start
  // Day button. `flex: 1` claims all remaining vertical space, and a
  // trailing `<View style={{ flex: 1 }} />` inside this body pushes
  // anything below the tile grid downward to the safe area. Horizontal
  // padding is a fraction of screen width so the content keeps its
  // breathing room on both small and large phones.
  body: {
    flex: 1,
    paddingHorizontal: SCREEN_WIDTH * 0.04,
    paddingTop: SCREEN_HEIGHT * 0.02,
    paddingBottom: SCREEN_HEIGHT * 0.015,
  },

  // Covered row
  coverRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  coverCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  coverCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverLabel: {
    fontSize: 12,
    color: '#2D3748',
    lineHeight: 16,
    fontWeight: '500',
    maxWidth: '65%',
  },
  coverValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
  },

  startDayButton: {
    backgroundColor: '#1a56db',
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#1a56db', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  startDayText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  startDayArrow: { color: '#FFFFFF', fontSize: 18 },

  // Sync badge
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F97316', marginRight: 10 },
  syncText: { fontSize: 13, color: '#C2410C', fontWeight: '500' },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle2: {
    fontSize: sc(20),
    fontWeight: '700',
    color: '#111827',
    marginTop: SCREEN_HEIGHT * 0.025,
    marginBottom: SCREEN_HEIGHT * 0.018,
  },
  seeAll: { fontSize: 13, color: '#1a56db', fontWeight: '600' },

  // Empty
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  // Store cards
  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  storeSequence: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  storeSequenceText: { fontSize: 14, fontWeight: '700', color: '#1a56db' },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  storeCode: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  storeChevron: { fontSize: 22, color: '#D1D5DB', marginLeft: 8 },

  // Info cards
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  accentBar: {
    width: 4,
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: '#1a56db',
    borderRadius: 2,
  },
  infoCardLeft: { flex: 1, paddingLeft: 18 },
  infoCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  infoCardValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  infoCardArrow: { fontSize: 22, color: '#D1D5DB', marginLeft: 8 },

  // Task tiles grid
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tile: {
    // Half the body width minus a small gap — keeps a 2-column grid on
    // every device and stays proportional on small phones / tablets.
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: SCREEN_HEIGHT * 0.022,
    paddingHorizontal: SCREEN_WIDTH * 0.035,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    marginBottom: SCREEN_HEIGHT * 0.018,
    minHeight: SCREEN_HEIGHT * 0.12,
    // Bumped shadow + elevation so the white tiles sit visibly above
    // the light-grey container backdrop ("3D card" look in the mockup).
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  tileIcon: { marginBottom: 6 },
  tileLabel: {
    fontSize: sc(12),
    fontWeight: '500',
    color: '#333333',
    textAlign: 'center',
    lineHeight: sc(16),
    marginTop: SCREEN_HEIGHT * 0.012,
  },

  // Customer Interaction Popup
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  popupSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
  },
  popupGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  popupTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 100,
  },
  popupTileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },

  // End Day button
  endDayButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  endDayText: { color: '#1a56db', fontSize: 15, fontWeight: '600' },
  endDayArrow: { color: '#1a56db', fontSize: 18 },

  // Day Ended card (bottom)
  dayEndedCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  dayEndedCardLeft: { flex: 1 },
  dayEndedCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 2,
  },
  dayEndedCardSub: {
    fontSize: 12,
    color: '#1a56db',
    fontWeight: '500',
  },
  dayEndedCardLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a56db',
  },
});

// ─── New Dashboard Section Styles ─────────────────────────────────────────────
const ds = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    padding: 16, marginTop: 16,
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  cardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#1E3A8A' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  toggleTextActive: { color: '#FFFFFF' },
  toggleRowFull: { flexDirection: 'row', marginBottom: 16, borderRadius: 8, overflow: 'hidden' },
  toggleBtnFull: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F3F4F6' },
  toggleBtnFullActive: { backgroundColor: '#1E3A8A' },
  toggleTextFull: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  toggleTextFullActive: { color: '#FFFFFF' },
  territoryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', padding: 10, marginBottom: 8 },
  territoryIcon: { fontSize: 14, color: '#6B7280', marginRight: 8 },
  territoryText: { flex: 1, fontSize: 14, color: '#374151' },
  territoryChevron: { fontSize: 14, color: '#6B7280' },
  comparisonBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10, marginBottom: 16 },
  comparisonIcon: { fontSize: 14, marginRight: 6 },
  comparisonText: { fontSize: 13, color: '#1a56db', fontWeight: '500' },

  // Gauge
  gaugeContainer: { alignItems: 'center', marginVertical: 20 },
  gaugeOuter: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  gaugeTrack: { width: 200, height: 200, borderRadius: 100, borderWidth: 14, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  gaugeFill: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 14, borderColor: '#F97316', borderTopColor: 'transparent', borderRightColor: 'transparent' },
  gaugeInner: { alignItems: 'center', justifyContent: 'center' },
  gaugePct: { fontSize: 36, fontWeight: '800', color: '#111827' },
  gaugeLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 1 },

  // Legend
  legendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#6B7280' },
  legendValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  // Performance Comparison
  perfCompare: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 14, marginTop: 16 },
  perfTitle: { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 12 },
  perfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  perfCol: { alignItems: 'center' },
  perfMonth: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  perfPct: { fontSize: 20, fontWeight: '700', color: '#111827' },
  perfSub: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  perfArrow: { fontSize: 20, color: '#059669', fontWeight: '700' },

  // Coverage & Productivity
  metricPairRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  metricPairCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 8 },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricPairLabel: { fontSize: 12, color: '#6B7280' },
  metricPairValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  metricPairSub: { fontSize: 10, color: '#9CA3AF', fontWeight: '400' },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#EF4444', marginBottom: 10, marginTop: 8 },

  // Productivity Metrics grid
  prodMetricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  prodMetricItem: { alignItems: 'center', flex: 1 },
  prodMetricIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  prodMetricLabel: { fontSize: 8, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 2 },
  prodMetricValue: { fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center' },

  // Outlet Health
  outletHealthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  outletHealthTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  outletHealthCount: { fontSize: 13, color: '#1a56db', fontWeight: '600' },
  outletCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, padding: 12 },
  outletCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  outletCardSub: { fontSize: 11, color: '#6B7280' },
  outletCardSubSmall: { fontSize: 10, color: '#9CA3AF', marginTop: 4, marginBottom: 6 },
  outletCardValue: { fontSize: 12, fontWeight: '600', color: '#111827' },
  outletCardUniverse: { fontSize: 10, color: '#9CA3AF' },

  // Service Compliance
  complianceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginTop: 12, gap: 10 },
  complianceTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  complianceSub: { fontSize: 11, color: '#6B7280', marginBottom: 6 },
  complianceBar: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  complianceFill: { height: 6, backgroundColor: '#059669', borderRadius: 3 },
  compliancePct: { fontSize: 22, fontWeight: '800' },

  // Return Orders
  mtdBadge: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  returnSummaryRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 12 },
  returnSummaryItem: { flex: 1, alignItems: 'center' },
  returnSummaryLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  returnSummaryValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  returnDivider: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 4 },
  donutRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  donutContainer: { alignItems: 'center', marginRight: 20 },
  donutOuter: { width: 100, height: 100, borderRadius: 50, borderWidth: 12, borderColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  donutInner: { alignItems: 'center' },
  donutCount: { fontSize: 22, fontWeight: '800', color: '#111827' },
  donutLabel: { fontSize: 10, color: '#6B7280' },
  donutPctLabel: { fontSize: 11, color: '#F97316', fontWeight: '600', marginTop: 4 },
  donutLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  donutLegendText: { fontSize: 13, color: '#374151' },
  donutLegendValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  reasonDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reasonDotText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  reasonText: { flex: 1, fontSize: 13, color: '#374151' },
  reasonCount: { fontSize: 13, fontWeight: '600', color: '#111827' },

  // Working Days
  workingDaysRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1,
    borderColor: '#E5E7EB', padding: 16, marginTop: 16,
    ...Platform.select({ android: { elevation: 2 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
  },
  workingDayItem: { flex: 1, alignItems: 'center' },
  workingDayDivider: { width: 1, backgroundColor: '#E5E7EB' },
  workingDayLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center', marginBottom: 6 },
  workingDayValue: { fontSize: 28, fontWeight: '800', color: '#111827' },

  // Brand Display Share table
  tableHeader: { flexDirection: 'row', backgroundColor: '#9CA3AF', borderRadius: 6, padding: 10, marginTop: 8 },
  tableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  noDataText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },
  tableRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableCell: { flex: 1, fontSize: 12, color: '#374151', textAlign: 'center' },

  // Filters bottom sheet
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  filterSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30 },
  filterHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filterTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  filterDivider: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 16 },
  filterSectionTitle: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 12 },
  filterOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10, gap: 12 },
  filterOptionActive: { borderColor: '#1a56db', backgroundColor: '#EFF6FF' },
  filterRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  filterRadioActive: { borderColor: '#1a56db' },
  filterRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1a56db' },
  filterOptionTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  filterOptionSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  filterActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  filterCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' },
  filterCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  filterApplyBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#1E3A8A', alignItems: 'center' },
  filterApplyText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
