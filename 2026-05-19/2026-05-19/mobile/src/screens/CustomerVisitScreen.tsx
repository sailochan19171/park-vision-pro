import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  StatusBar,
  Linking,
  Dimensions,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView from 'react-native-maps';
import apiClient from '../api/client';
import { API_BASE_URL } from '../config';
import { useBottomInset } from '../utils/safeBottom';
import { useWatermark } from '../hooks/useWatermark';

import useAuthStore from '../store/auth';
import useVisitStore from '../store/visit';
import database from '../db/database';
import { pushSync, uploadPhoto } from '../services/syncService';
import { capturePhoto } from '../services/cameraService';
import { getCurrentPosition, getCachedPosition, calculateDistance } from '../services/locationService';
import { reverseGeocode } from '../services/reverseGeocode';
import { geocodeAddress } from '../services/geocodeAddress';
import { logActivity, logCheckIn } from '../services/activityLogger';
import { verifyUserActiveNow } from '../services/realtimeSync';
import { EODService } from '../services/eodService';
import PhotoPreviewModal from '../components/common/PhotoPreviewModal';
import { v4 as uuidv4 } from 'uuid';
import Icon from 'react-native-vector-icons/Ionicons';

const { width: SW } = Dimensions.get('window');
const DEFAULT_REGION = { latitude: 25.2048, longitude: 55.2708, latitudeDelta: 0.5, longitudeDelta: 0.5 };

const CHECKIN_RADIUS_METERS = 1000; // 1km radius for check-in

type RouteParams = {
  CustomerVisit: {
    customerCode: string;
    customerName: string;
    channelCode?: string;
    customerGroup?: string;
    priceList?: string;
    // Per-customer overrides for the geofence check. When false, the user
    // can check-in / check-out without GPS being inside the radius.
    forceCheckinEnabled?: boolean;
    forceCheckoutEnabled?: boolean;
  };
};

interface StoreStats {
  customerType: string;
  lastMonthBilled: boolean;
  storeGrowth: number;
  creditLimit: number;
  availableLimit: number;
  currentOutstanding: number;
  dueAmount: number;
  todaysTarget: number;
  lastOrderAmount: number;
  mtdSalesValue: number;
  salesHistory: { month: string; value: number }[];
}

export default function CustomerVisitScreen() {
  const route = useRoute<RouteProp<RouteParams, 'CustomerVisit'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { customerCode, customerName, channelCode, customerGroup, priceList, forceCheckinEnabled = true, forceCheckoutEnabled = true } = route.params;

  const [checkedIn, setCheckedIn] = useState(false);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  // Channel resolved from the latest local DB customer row. JourneyPlanScreen
  // passes channelCode as a route param built from the customer snapshot it
  // had at list-render time. When the portal assigns a channel AFTER the rep
  // opened My Stores, the param is stale but the local DB has the fresh
  // value once the next periodic /customers sync lands. This state lets the
  // screen prefer the DB value, falling back to the route param.
  const [channelFromDb, setChannelFromDb] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  // Seed userCoords from the synchronous in-memory GPS cache so the map's
  // tier-3 fallback has something to render on the FIRST paint — without
  // this the very first frame fell through to DEFAULT_REGION (Dubai) for
  // the few hundred ms before the mount-time GPS warmup resolved. The
  // cache is loaded from AsyncStorage at locationService module init, so
  // anything between the second screen of any session and forever after
  // has a usable position ready synchronously.
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const cached = getCachedPosition();
    return cached ? { lat: cached.lat, lng: cached.lng } : null;
  });
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [locationDistance, setLocationDistance] = useState<number | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  // Fire-and-forget: kick a GPS read the moment the screen mounts so the map
  // has SOMETHING to centre on by the time it paints. The other effects
  // below also populate customerCoords / mapCenter under specific
  // conditions, but reps in countries other than Dubai were seeing the
  // hard-coded DEFAULT_REGION while those conditional branches resolved.
  // Updating userCoords feeds the map's tier-3 fallback in mapRegion below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await getCurrentPosition(true);
        if (!cancelled && cached) {
          setUserCoords({ lat: cached.lat, lng: cached.lng });
          return;
        }
        const fresh = await getCurrentPosition(false);
        if (!cancelled && fresh) setUserCoords({ lat: fresh.lat, lng: fresh.lng });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // Pin overlay state — we project the customer's lat/lng to screen pixels
  // every time the map region changes, then absolute-position a View at
  // those pixels. This keeps the pin glued to the actual store location
  // through pan / zoom (unlike a fixed-centre overlay which slides as you
  // scroll). We can't use <Marker> because react-native-maps 1.27 +
  // RN 0.84 Fabric crashes with "undefined is not a function".
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>(null);
  const [pinLabelOpen, setPinLabelOpen] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonSearch, setReasonSearch] = useState('');
  const [forceCheckInData, setForceCheckInData] = useState<{ userLoc: any } | null>(null);
  const { burnWatermark, WatermarkRenderer } = useWatermark(customerName, customerCode);
  const [checkinPhotoPreview, setCheckinPhotoPreview] = useState(false);
  const [checkinPhotoUri, setCheckinPhotoUri] = useState<string | null>(null);
  const [checkinPhotoTs, setCheckinPhotoTs] = useState<number | null>(null);
  const [checkinPhotoLat, setCheckinPhotoLat] = useState<number | null>(null);
  const [checkinPhotoLng, setCheckinPhotoLng] = useState<number | null>(null);
  const [checkinPhotoResolve, setCheckinPhotoResolve] = useState<((uri: string | null) => void) | null>(null);

  // Bottom padding that respects Android gesture nav / iOS home indicator
  // so the Check In button isn't cut off on modern phones.
  const bottomInset = useBottomInset(16);

  // Last captured/accepted check-in photo for this customer. Persisted in
  // AsyncStorage with a 24 h TTL so the thumbnail is still visible even after
  // the user navigates away and comes back.
  const [savedCheckinPhoto, setSavedCheckinPhoto] = useState<{ uri: string; ts: number; lat: number | null; lng: number | null } | null>(null);
  // View-only viewer for the persisted thumbnail — no retake / use-image
  // buttons, just the image so the user can inspect it.
  const [viewOnlyPhoto, setViewOnlyPhoto] = useState<{ uri: string; ts: number; lat: number | null; lng: number | null } | null>(null);
  const SAVED_PHOTO_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  // Scope the persisted check-in photo by USER so a DIFFERENT rep checking into
  // the SAME customer never sees the previous rep's captured photo. The key used
  // to be customer-only and isn't wiped on user switch, so the photo leaked
  // across users for the same store.
  const savedPhotoKey = `lastCheckinPhoto_${user?.code ?? 'anon'}_${customerCode}`;

  // Status of the user's last geo-code submission for this customer. When a
  // TL rejects it we surface the rejection reason right here so the promoter
  // knows what to fix and can resubmit.
  const [geoRequestStatus, setGeoRequestStatus] = useState<
    { status: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectionReason: string | null; createdAt: string } | null
  >(null);

  // Flush any geo-code submissions that were queued while offline. Runs on
  // every screen focus so a tb-pattern of "submit offline, come back online,
  // open the store page" reliably delivers the pending request.
  useEffect(() => {
    (async () => {
      try {
        const queueKey = `geoCodeQueue_${user?.code ?? 'anon'}`;
        const raw = await AsyncStorage.getItem(queueKey);
        if (!raw) return;
        const queue: Array<{ customerCode: string; latitude: number; longitude: number; queuedAt: number }> = JSON.parse(raw);
        if (queue.length === 0) return;
        const remaining: typeof queue = [];
        for (const entry of queue) {
          try {
            await apiClient.post('/geo-codes', {
              customerCode: entry.customerCode,
              latitude: entry.latitude,
              longitude: entry.longitude,
            });
          } catch (e) {
            console.warn('[GeoCode] retry still failing, keeping in queue');
            remaining.push(entry);
          }
        }
        if (remaining.length === 0) {
          await AsyncStorage.removeItem(queueKey);
          console.log('[GeoCode] queue flushed');
        } else {
          await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
        }
      } catch { /* ignore */ }
    })();
  }, [user?.code, customerCode]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get('/geo-codes/my-latest', { params: { customerCode } });
        if (data && data.status) {
          setGeoRequestStatus(data);
          // Show a one-time popup if the TL rejected this user's last
          // submission — only after they haven't already been notified for
          // this specific request id.
          if (data.status === 'REJECTED' && data.id) {
            const seenKey = `geoRejectSeen_${data.id}`;
            const already = await AsyncStorage.getItem(seenKey);
            if (!already) {
              Alert.alert(
                'Location Update Rejected',
                data.rejectionReason
                  ? `Your team leader rejected the new location.\n\nReason: ${data.rejectionReason}`
                  : 'Your team leader rejected the new location you submitted.',
              );
              AsyncStorage.setItem(seenKey, '1').catch(() => {});
            }
          }
        } else {
          setGeoRequestStatus(null);
        }
      } catch { /* offline / no submission — ignore */ }
    })();
  }, [customerCode]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(savedPhotoKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { uri: string; ts: number; lat?: number | null; lng?: number | null };
          if (Date.now() - parsed.ts < SAVED_PHOTO_TTL_MS) {
            setSavedCheckinPhoto({ uri: parsed.uri, ts: parsed.ts, lat: parsed.lat ?? null, lng: parsed.lng ?? null });
            return;
          }
          // Expired — wipe it and fall through to the server-image fallback.
          await AsyncStorage.removeItem(savedPhotoKey);
        }

        // Fallback after a fresh install / reinstall: the AsyncStorage thumbnail
        // cache AND the original local file:// photo are both gone, but
        // restoreMyDay rehydrated customer_visits with the SERVER-uploaded
        // check-in image (a "/public/..." URL). Surface that so the thumbnail
        // still shows instead of going blank. Only http / "/public" URLs are
        // usable — a leftover local file:// path points at a file this install
        // no longer has.
        try {
          const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
          const rows: any[] = await database.get('customer_visits').query(
            Q.where('user_code', user?.code ?? ''),
            Q.where('customer_code', customerCode),
            Q.where('checkin_time', Q.gte(todayMidnight.getTime())),
          ).fetch();
          let latest: any = null;
          for (const r of rows) {
            const img = r.checkinImage ?? r._raw?.checkin_image ?? null;
            if (!img) continue;
            if (!latest || (r.checkinTime ?? 0) > (latest.checkinTime ?? 0)) latest = r;
          }
          if (latest) {
            const img: string = latest.checkinImage ?? latest._raw?.checkin_image;
            const uri = img.startsWith('http')
              ? img
              : (img.startsWith('/public') ? `${API_BASE_URL}${img}` : null);
            if (uri) {
              setSavedCheckinPhoto({ uri, ts: latest.checkinTime ?? Date.now(), lat: null, lng: null });
            }
          }
        } catch { /* no restored visit — ignore */ }
      } catch { /* malformed entry — ignore */ }
    })();
  }, [customerCode, user?.code, savedPhotoKey]);
  const mapRef = useRef<any>(null);

  // Force flags are synced via background sync (every 2 min) into AsyncStorage
  // Check-in reads from AsyncStorage — fully offline

  // Project the customer's lat/lng to screen pixels on the current map
  // viewport. Fired on every region change so the pin tracks the store
  // even during pan / zoom. Uses pointForCoordinate which works on the
  // new arch (only Marker has the bug).
  const updatePinPosition = useCallback(async () => {
    if (!mapRef.current || !customerCoords || customerCoords.lat === 0) return;
    try {
      const point = await mapRef.current.pointForCoordinate({
        latitude: customerCoords.lat,
        longitude: customerCoords.lng,
      });
      setPinPos({ x: point.x, y: point.y });
    } catch {
      /* map not ready yet — try again on next region change */
    }
  }, [customerCoords]);

  // Re-project once when coords arrive after the map mounts.
  useEffect(() => {
    if (customerCoords && customerCoords.lat !== 0) {
      const t = setTimeout(updatePinPosition, 350);
      return () => clearTimeout(t);
    }
  }, [customerCoords, updatePinPosition]);

  const [stats, setStats] = useState<StoreStats>({
    customerType: 'CREDIT', lastMonthBilled: false, storeGrowth: 0,
    creditLimit: 50, availableLimit: 0, currentOutstanding: 0, dueAmount: 0,
    todaysTarget: 0, lastOrderAmount: 0, mtdSalesValue: 0, salesHistory: [],
  });
  // Tracks the async /customer-targets API call. While true the target
  // column shows "..." instead of ₹0 so reps don't mistake "not loaded
  // yet" for "no target set" (the G22 intermittent-target complaint).
  const [targetLoading, setTargetLoading] = useState(true);

  const { activeVisit, setActiveVisit } = useVisitStore();

  // Load customer data + stats
  useEffect(() => {
    async function load() {
      try {
        const customers: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
        if (customers.length > 0) {
          const c = customers[0];
          const dbChannel = (c.channelCode ?? c._raw?.channel_code ?? '') as string;
          if (dbChannel && dbChannel.trim()) setChannelFromDb(dbChannel.trim());
          let lat = parseFloat(c.latitude) || 0;
          let lng = parseFloat(c.longitude) || 0;
          if (lat !== 0 && lng !== 0) {
            setCustomerCoords({ lat, lng });
          } else {
            // Local cache is missing coords. Reps were getting "store
            // location is not mapped → force check-in" prompts even on
            // stores that DO have lat/lng on the web portal, because the
            // periodic /customers pull hadn't picked up the geo-code yet
            // (e.g. lat/lng was added after the initial sync, or the geo
            // approval landed mid-shift). Hit the server directly for this
            // one customer and write the fresh coords back to local DB so
            // the check-in flow accepts a normal in-radius check-in.
            try {
              const { data } = await apiClient.get(`/customers/${encodeURIComponent(customerCode)}`, { timeout: 5000 });
              const srvLat = typeof data?.latitude === 'number' ? data.latitude : parseFloat(data?.latitude);
              const srvLng = typeof data?.longitude === 'number' ? data.longitude : parseFloat(data?.longitude);
              if (Number.isFinite(srvLat) && Number.isFinite(srvLng) && srvLat !== 0 && srvLng !== 0) {
                lat = srvLat;
                lng = srvLng;
                setCustomerCoords({ lat, lng });
                try {
                  await database.write(async () => {
                    await c.update((rec: any) => {
                      rec._raw.latitude = lat;
                      rec._raw.longitude = lng;
                      rec._raw.server_updated_at = Date.now();
                    });
                  });
                } catch (e) { console.warn('[CustomerVisit] local geo-code write failed:', e); }
              }
            } catch (e) { console.warn('[CustomerVisit] live coords fetch failed:', e); }

            if (lat === 0 || lng === 0) {
              // Still no customer coordinates from either local DB or live
              // server fetch. Try forward-geocoding the customer's saved
              // address so the map pins the actual shop region (e.g.
              // Hyderabad) instead of the hard-coded DEFAULT_REGION
              // (Dubai). If the address can't be geocoded either, fall
              // back to the rep's own GPS so they at least see
              // themselves.
              const addressParts = [c.address, c.cityCode ?? c._raw?.city_code, c.regionCode ?? c._raw?.region_code].filter(Boolean);
              const addressForGeo = addressParts.join(', ');
              try {
                const geocoded = addressForGeo ? await geocodeAddress(addressForGeo) : null;
                if (geocoded) {
                  setMapCenter({ lat: geocoded.lat, lng: geocoded.lng });
                } else {
                  const cached = await getCurrentPosition(true);
                  if (cached) {
                    setMapCenter({ lat: cached.lat, lng: cached.lng });
                  } else {
                    const fresh = await getCurrentPosition(false);
                    if (fresh) setMapCenter({ lat: fresh.lat, lng: fresh.lng });
                  }
                }
              } catch (e) { console.warn("[App]", e); }
            }
          }
          // Compose full address from available fields
          const parts = [c.address, c.cityCode ?? c._raw?.city_code, c.regionCode ?? c._raw?.region_code].filter(Boolean);
          if (parts.length > 0) setAddress(parts.join(', '));
        }

        // Orders for this customer by current user
        const allOrders: any[] = await database.get('orders').query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
        ).fetch();

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

        const mtdOrders = allOrders.filter((o: any) => o.trxDate >= monthStart);
        const prevMonthOrders = allOrders.filter((o: any) => o.trxDate >= prevMonthStart && o.trxDate <= prevMonthEnd);
        const mtdSales = mtdOrders.reduce((s: number, o: any) => s + (parseFloat(o.totalAmount) || 0), 0);
        const prevSales = prevMonthOrders.reduce((s: number, o: any) => s + (parseFloat(o.totalAmount) || 0), 0);

        const lastOrder = allOrders.sort((a: any, b: any) => b.trxDate - a.trxDate)[0];
        const lastOrderAmount = lastOrder ? parseFloat(lastOrder.totalAmount) || 0 : 0;

        const growth = prevSales > 0 ? ((mtdSales - prevSales) / prevSales) * 100 : (mtdSales > 0 ? 100 : 0);

        // Sales history last 8 months
        const salesHistory: { month: string; value: number }[] = [];
        for (let i = 7; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mStart = d.getTime();
          const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
          const mOrders = allOrders.filter((o: any) => o.trxDate >= mStart && o.trxDate <= mEnd);
          const mSales = mOrders.reduce((s: number, o: any) => s + (parseFloat(o.totalAmount) || 0), 0);
          salesHistory.push({ month: d.toLocaleString('en-US', { month: 'short' }), value: mSales });
        }

        // Outstanding = sum of all orders - assume no payments tracked
        const totalOrdered = allOrders.reduce((s: number, o: any) => s + (parseFloat(o.totalAmount) || 0), 0);

        setStats({
          customerType: customerGroup || 'CREDIT',
          lastMonthBilled: prevMonthOrders.length > 0,
          storeGrowth: parseFloat(growth.toFixed(1)),
          creditLimit: 50,
          availableLimit: 50 - totalOrdered,
          currentOutstanding: totalOrdered,
          dueAmount: 0,
          todaysTarget: 0, // will be updated below
          lastOrderAmount,
          mtdSalesValue: mtdSales,
          salesHistory,
        });
        // Fetch customer target from API
        try {
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          const res = await apiClient.get(`/customer-targets?customerCode=${customerCode}&month=${month}&year=${year}&pageSize=1`);
          const targets = res.data?.data ?? [];
          if (targets.length > 0) {
            setStats(prev => prev ? { ...prev, todaysTarget: targets[0].targetAmount ?? 0 } : prev);
          }
        } catch (err) {
          console.warn('[CustomerVisit] Target fetch error:', err);
        } finally {
          setTargetLoading(false);
        }
      } catch (e) { console.warn('load error', e); }
    }
    load();
  }, [customerCode, user?.code]);

  // Restore visit state
  useEffect(() => {
    (async () => {
      if (activeVisit && activeVisit.customerCode === customerCode && activeVisit.status === 'checked_in') {
        setVisitId(activeVisit.visitId);
        setCheckedIn(true);
        return;
      }
      try {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const visits: any[] = await database.get('customer_visits').query(
          Q.where('customer_code', customerCode),
          Q.where('checkin_time', Q.gte(todayStart.getTime())),
          Q.sortBy('checkin_time', Q.desc), Q.take(1),
        ).fetch();
        if (visits.length > 0 && visits[0].status === 'checked_in') {
          setVisitId(visits[0].id);
          setCheckedIn(true);
          setActiveVisit({ visitId: visits[0].id, customerCode, checkinTime: visits[0].checkinTime, status: 'checked_in' });
        }
      } catch (e) { console.warn("[App]", e); }
    })();
  }, [customerCode]);

  const handleNavigate = useCallback(() => {
    if (!customerCoords) return;
    const { lat, lng } = customerCoords;
    const label = encodeURIComponent(customerName);
    if (Platform.OS === 'ios') {
      const gmaps = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      Linking.canOpenURL(gmaps)
        .then((ok) => Linking.openURL(ok ? gmaps : `maps:0,0?q=${label}@${lat},${lng}`))
        .catch(() => Linking.openURL(`maps:0,0?q=${label}@${lat},${lng}`));
    } else {
      // Explicit Intent URI pinned to the Google Maps package — bypasses the
      // Android "Open with…" chooser even if Uber/Ola/etc. register for
      // `google.navigation:`. If Google Maps isn't installed, fall back to the
      // HTTPS URL (which the browser will handle).
      const intentUrl =
        `intent://maps.google.com/maps?daddr=${lat},${lng}&mode=d` +
        `#Intent;scheme=https;package=com.google.android.apps.maps;end`;
      Linking.openURL(intentUrl).catch(() =>
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
      );
    }
  }, [customerCoords, customerName]);

  // (Old "update pin position when coords load" effect removed — Marker
  // is bound to customerCoords via JSX so it follows automatically.)



  // OTP state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpCheckinLoc, setOtpCheckinLoc] = useState<{ lat: number; lng: number } | null>(null);

  const proceedWithCheckIn = async (userLoc: { lat: number; lng: number } | null, reason?: string, needsPhoto: boolean = true, checkinType: string = 'normal') => {
    setCheckingIn(true);
    try {
      let photoUri: string | null = null;

      // Only capture photo if required (not needed when user is at customer location)
      if (needsPhoto) {
        try {
          const photo = await capturePhoto(false, user?.name ?? user?.code, customerName);
          if (photo) {
            // Fetch GPS in background — updates overlay while user reviews
            const ts = Date.now();
            let loc: { lat: number, lng: number } | null = null;
            try { const pos = await getCurrentPosition(true); if (pos) { loc = { lat: pos.lat, lng: pos.lng }; } } catch (e) { console.warn("[App]", e); }
            
            const stampedUri = await burnWatermark(photo.uri, ts, loc?.lat ?? null, loc?.lng ?? null);

            setCheckinPhotoUri(stampedUri);
            setCheckinPhotoTs(ts);
            setCheckinPhotoLat(loc?.lat ?? null);
            setCheckinPhotoLng(loc?.lng ?? null);

            const acceptedUri = await new Promise<string | null>((resolve) => {
              setCheckinPhotoResolve(() => resolve);
              setCheckinPhotoPreview(true);
            });

            if (!acceptedUri) {
              setCheckingIn(false);
              return;
            }
            photoUri = acceptedUri;
          } else {
            Alert.alert('Alert !', 'Please capture a photo to check in.');
            setCheckingIn(false);
            return;
          }
        } catch (camErr) {
          Alert.alert('Alert !', 'Camera not available. Please allow camera permission.');
          setCheckingIn(false);
          return;
        }
      }

      const now = Date.now();

      // OPTIMISTIC CHECK-IN. Create the visit row with the LOCAL photo URI and
      // is_synced=false, then navigate IMMEDIATELY. The photo upload, reverse-
      // geocode and backend post all run in the BACKGROUND below. Previously all
      // three network calls were awaited before navigating, so check-in stalled
      // for several seconds after the rep accepted the photo — worst on the
      // field 2G/3G handsets. The local row is enough for the dashboard to open;
      // the background task (and the 30 s pushSync safety net) reconcile the
      // server image URL + place name + backend record without blocking the rep.
      const code = uuidv4();
      await database.write(async () => {
        await database.get('customer_visits').create((rec: any) => {
          rec._raw.id = code;
          rec._raw.visit_code = code;
          rec._raw.user_code = user?.code ?? '';
          rec._raw.customer_code = customerCode;
          rec._raw.customer_name = customerName;
          rec._raw.checkin_time = now;
          rec._raw.checkin_lat = userLoc?.lat ?? null;
          rec._raw.checkin_lng = userLoc?.lng ?? null;
          rec._raw.checkin_place = null; // resolved in the background below
          rec._raw.status = 'checked_in';
          rec._raw.checkin_type = checkinType;
          rec._raw.is_synced = false;
          try { rec._raw.checkin_image = photoUri; } catch (e) { console.warn("[App]", e); }
        });
      });
      if (photoUri) {
        AsyncStorage.setItem(`checkin_image_${code}`, photoUri).catch(() => {});
      }
      if (reason) {
        AsyncStorage.setItem(`checkin_reason_${code}`, reason).catch(() => {});
      }
      setActiveVisit({ visitId: code, customerCode, checkinTime: now, status: 'checked_in' });

      // Detached background work — runs after navigation and survives this
      // screen's unmount (it touches NO React state). Uploads the photo,
      // geocodes the place, adopts coords for an unmapped store, then posts to
      // the backend. pushSync is the safety net that retries + marks synced.
      void (async () => {
        let serverCheckinImg = photoUri;
        if (photoUri) {
          try {
            const uploaded = await uploadPhoto(photoUri, 'checkin');
            if (uploaded) serverCheckinImg = uploaded;
          } catch (e) { console.warn('[CheckIn] Photo upload failed:', e); }
        }

        // Reverse-geocode the check-in GPS to a human-readable place name.
        let checkinPlace: string | null = null;
        if (userLoc?.lat != null && userLoc?.lng != null) {
          try {
            checkinPlace = await reverseGeocode(userLoc.lat, userLoc.lng);
          } catch (e) { console.warn('[CheckIn] reverseGeocode failed:', e); }
        }

        // Stamp the resolved server image + place onto the local visit row so
        // the next sync pushes them (the row is still is_synced=false).
        try {
          const rows: any[] = await database.get('customer_visits').query(Q.where('visit_code', code)).fetch();
          if (rows[0]) {
            await database.write(async () => {
              await rows[0].update((r: any) => {
                r._raw.checkin_image = serverCheckinImg;
                r._raw.checkin_place = checkinPlace;
              });
            });
          }
        } catch (e) { console.warn("[App]", e); }

        // Adopt the rep's location only for a genuinely-unmapped store. Verify
        // against the AUTHORITATIVE customer record first so a MAPPED store whose
        // coords hadn't loaded yet isn't overwritten (the bogus "not mapped"
        // geo-approval bug).
        if (userLoc) {
          try {
            const customers: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
            const c = customers[0];
            const dbLat = c ? parseFloat(c.latitude ?? c._raw?.latitude) : NaN;
            const dbLng = c ? parseFloat(c.longitude ?? c._raw?.longitude) : NaN;
            const storeMapped =
              (!!customerCoords && customerCoords.lat !== 0 && customerCoords.lng !== 0) ||
              (Number.isFinite(dbLat) && Number.isFinite(dbLng) && dbLat !== 0 && dbLng !== 0);
            if (!storeMapped && c) {
              await database.write(async () => {
                await c.update((rec: any) => {
                  rec._raw.latitude = String(userLoc.lat);
                  rec._raw.longitude = String(userLoc.lng);
                });
              });
              console.log(`[CheckIn] Mapped previously-unmapped store ${customerCode} to ${userLoc.lat}, ${userLoc.lng}`);
            }
          } catch (e) { console.warn("[App]", e); }
        }

        // Post check-in to backend directly — carries the force-checkin reason,
        // which the generic /sync/push payload does not.
        try {
          await apiClient.post('/customer-visits', {
            visitCode: code,
            userCode: user?.code ?? '',
            customerCode,
            customerName,
            checkinTime: new Date(now).toISOString(),
            checkinLat: userLoc?.lat ?? null,
            checkinLng: userLoc?.lng ?? null,
            checkinPlace,
            checkinImage: serverCheckinImg,
            forceCheckin: !!reason,
            forceCheckinReason: reason ?? null,
            checkinType,
            status: 'checked_in',
          });
        } catch (err) {
          console.warn('[CheckIn] API post failed (will sync later):', err);
        }
        pushSync().catch(() => {});
      })();

      // Log check-in
      try { logCheckIn(customerCode, customerName, userLoc?.lat, userLoc?.lng); } catch {}
      navigation.replace('CustomerDashboard', { customerCode, customerName, visitCode: code });
    } catch (err: any) {
      console.error('[CheckIn] Error:', err);
      try { logActivity({ action: 'CHECK_IN', status: 'failed', module: 'visit', customerCode, customerName, errorMessage: err?.message }); } catch {}
      Alert.alert('Error', `Failed to check in: ${err?.message ?? 'Unknown error'}`);
    } finally { setCheckingIn(false); }
  };

  const handleCheckIn = async () => {
    // 0-pre. Re-verify the user is still active on the server. Without this,
    // a user deactivated by admin in the last 5 min can still check in
    // (between realtimeSync's throttled checks). verifyUserActiveNow forces
    // a fresh check and force-logs out if deactivated.
    const stillActive = await verifyUserActiveNow();
    if (!stillActive) return;

    // 0. Ensure the day has been started before allowing any check-in
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let dayHasStarted = (await AsyncStorage.getItem(`day_started_${todayStr}`)) === 'true';
      if (!dayHasStarted) {
        const count = await database
          .get('attendance_records')
          .query(
            Q.where('user_code', user?.code ?? ''),
            Q.where('attendance_date', todayStr),
          )
          .fetchCount();
        dayHasStarted = count > 0;
        if (dayHasStarted) {
          await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
        }
      }
      if (!dayHasStarted) {
        Alert.alert(
          'Start Day Required',
          'Please complete Zimyo check-in and Start Day before checking in to a store.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('MainTabs'),
            },
          ],
          { cancelable: false },
        );
        return;
      }
    } catch (e) {
      console.warn('[CheckIn] Day-start check failed:', e);
    }

    // 0b. Block check-in if user has an active (unchecked-out) visit at a
    // DIFFERENT store today. If the unchecked-out visit is at the SAME store
    // we're trying to check into, allow it (the user is just resuming) — the
    // existing visit will be reused on the customer dashboard.
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const activeVisits: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('checkin_time', Q.gte(todayStart.getTime())),
          Q.where('status', 'checked_in'),
        )
        .fetch();
      // Filter for visits at OTHER customers that truly have no checkout_time
      const uncheckedOutOther = activeVisits.filter((v: any) => {
        const code = v.customerCode ?? v._raw?.customer_code;
        const noCheckout = !v.checkoutTime && !v._raw?.checkout_time;
        return noCheckout && code !== customerCode;
      });
      if (uncheckedOutOther.length > 0) {
        const storeName = uncheckedOutOther[0].customerName ?? uncheckedOutOther[0]._raw?.customer_name ?? 'a store';
        Alert.alert(
          'Checkout Required',
          `You have an active visit at "${storeName}" that has not been checked out. Please check out first before checking into another store.`,
          [{ text: 'OK', style: 'cancel' }],
        );
        return;
      }
    } catch (e) {
      console.warn('[CheckIn] Active visit check failed:', e);
    }

    setCheckingIn(true);
    try {
      // ── Active-visit detection ──
      // If the user already has an open visit at this customer today, we
      // need to ask what they want to do — continue the existing visit
      // or check out from it. Previously this branch silently resumed
      // the visit, but field users couldn't see they were still inside
      // a visit and never checked out properly. Now we prompt explicitly
      // (works for hardware back, gesture back, navigation tile, etc.
      // since this runs the moment they tap the store).
      const todayStart2 = new Date();
      todayStart2.setHours(0, 0, 0, 0);
      const existingVisits: any[] = await database
        .get('customer_visits')
        .query(
          Q.where('user_code', user?.code ?? ''),
          Q.where('customer_code', customerCode),
          Q.where('checkin_time', Q.gte(todayStart2.getTime())),
        )
        .fetch();

      // Sort by check-in time so we always work with the FIRST visit of the day.
      const sortedVisits = existingVisits.sort(
        (a: any, b: any) => (a.checkinTime ?? 0) - (b.checkinTime ?? 0),
      );
      const firstVisit = sortedVisits[0];

      // Helper: resume the existing visit silently (current FILO behaviour).
      // If the visit was previously checked out (re-visit on the same day),
      // we MUST clear checkout_time and related fields when flipping the
      // row back to 'checked_in'. Otherwise the CustomerDashboard's
      // beforeRemove listener sees the stale checkout_time, decides the
      // user is already checked out, and lets a back gesture / button
      // navigate away silently — bypassing the mandatory Checkout
      // Required popup. (Repro: PR101 → C1 Prestige re-visit → back
      // gesture exited with no prompt.)
      const resumeExistingVisit = async () => {
        if (!firstVisit) return;
        const visitId = firstVisit.id ?? firstVisit._raw?.id;
        const wasCheckedOut =
          firstVisit.status === 'completed' ||
          firstVisit._raw?.status === 'completed' ||
          !!firstVisit.checkoutTime ||
          !!firstVisit._raw?.checkout_time;
        // Re-checkin timestamp — only refresh when the visit was genuinely
        // checked out first. If the visit is still 'checked_in' (rep
        // navigated back without checking out) we keep the original time.
        const reCheckinMs = wasCheckedOut ? Date.now() : null;
        if (wasCheckedOut) {
          await database.write(async () => {
            await firstVisit.update((rec: any) => {
              rec._raw.status = 'checked_in';
              // Stamp the new check-in time so the Customer Dashboard's
              // "Check In" row shows the current re-visit time, not the
              // stale time from the first visit earlier in the day.
              rec._raw.checkin_time = reCheckinMs;
              rec._raw.checkout_time = null;
              rec._raw.checkout_lat = null;
              rec._raw.checkout_lng = null;
              rec._raw.checkout_place = null;
              rec._raw.checkout_image = null;
              rec._raw.checkout_type = null;
              rec._raw.duration_mins = null;
              rec._raw.is_synced = false;
            });
          });
        }
        setActiveVisit({ visitId, customerCode, checkinTime: reCheckinMs ?? firstVisit.checkinTime, status: 'checked_in' });
        setCheckingIn(false);
        navigation.replace('CustomerDashboard', { customerCode, customerName, visitCode: visitId });
      };

      if (firstVisit) {
        // Silent resume for any existing visit (active or already checked
        // out). The checkout decision belongs on the Customer Dashboard
        // where the photo + GPS + server-post flow lives — interrupting
        // the check-in tap with a three-button Alert was confusing field
        // users in practice (popup blocks the map, "Location update
        // rejected" toast fires behind it, etc.). The dashboard already
        // exposes Check Out clearly; let the user navigate normally.
        await resumeExistingVisit();
        return;
      }

      // ── First check-in of the day — full flow ──

      // 1. Get current GPS location
      let userLoc: { lat: number; lng: number } | null = null;
      try {
        const pos = await getCurrentPosition();
        if (pos) userLoc = { lat: pos.lat, lng: pos.lng };
      } catch {
        console.warn('[CheckIn] GPS failed');
      }

      // 2. Resolve the store's coords RIGHT NOW. customerCoords (component
      // state) is populated asynchronously by the load() effect (local DB →
      // live server fetch → address geocode). If the rep taps Check In before
      // that settles — or the local /customers cache simply hasn't synced the
      // lat/lng yet — a genuinely MAPPED store is seen as unmapped, which both
      // skips its real geofence AND makes proceedWithCheckIn overwrite the
      // store's location with the rep's GPS + fire a bogus "store location not
      // mapped" geo-approval. Re-fetch the live coords here and write them
      // back so the store is evaluated against its real geofence and never
      // re-mapped.
      let effectiveCoords: { lat: number; lng: number } | null =
        customerCoords && customerCoords.lat !== 0 && customerCoords.lng !== 0 ? customerCoords : null;
      if (!effectiveCoords) {
        try {
          const { data } = await apiClient.get(`/customers/${encodeURIComponent(customerCode)}`, { timeout: 5000 });
          const srvLat = typeof data?.latitude === 'number' ? data.latitude : parseFloat(data?.latitude);
          const srvLng = typeof data?.longitude === 'number' ? data.longitude : parseFloat(data?.longitude);
          if (Number.isFinite(srvLat) && Number.isFinite(srvLng) && srvLat !== 0 && srvLng !== 0) {
            effectiveCoords = { lat: srvLat, lng: srvLng };
            setCustomerCoords(effectiveCoords);
            try {
              const custs: any[] = await database.get('customers').query(Q.where('code', customerCode)).fetch();
              if (custs[0]) {
                await database.write(async () => {
                  await custs[0].update((rec: any) => {
                    rec._raw.latitude = srvLat;
                    rec._raw.longitude = srvLng;
                    rec._raw.server_updated_at = Date.now();
                  });
                });
              }
            } catch (e) { console.warn('[CheckIn] geo write-back failed:', e); }
          }
        } catch (e) { console.warn('[CheckIn] live coords fetch failed:', e); }
      }

      // 3. Check radius
      if (userLoc && effectiveCoords) {
        const distance = calculateDistance(userLoc.lat, userLoc.lng, effectiveCoords.lat, effectiveCoords.lng);
        console.log(`[CheckIn] User: ${userLoc.lat.toFixed(6)},${userLoc.lng.toFixed(6)} | Customer: ${effectiveCoords.lat.toFixed(6)},${effectiveCoords.lng.toFixed(6)} | Distance: ${distance}m | Radius: ${CHECKIN_RADIUS_METERS}m`);

        if (distance <= CHECKIN_RADIUS_METERS) {
          // User IS at customer location — capture photo but no force check-in
          await proceedWithCheckIn(userLoc, undefined, true);
          return;
        } else {
          // User is NOT at customer location — read force check-in flag from AsyncStorage (offline)
          let canForceCheckin = true;
          try {
            const flag = await AsyncStorage.getItem(`force_checkin_${customerCode}`);
            if (flag === 'false') canForceCheckin = false;
          } catch (e) { console.warn("[App]", e); }
          if (!canForceCheckin) {
            Alert.alert(
              'Access Denied',
              'You are not within the store radius and force check-in is disabled by admin for this store.',
              [
                { text: 'OK', style: 'cancel' },
                {
                  text: 'Use OTP',
                  onPress: () => {
                    const today = new Date().toISOString().slice(0, 10);
                    const seed = `${user?.code ?? ''}:${customerCode}:${today}`;
                    let hash = 0;
                    for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0; }
                    setOtpChallenge(String(Math.abs(hash) % 10000).padStart(4, '0'));
                    setOtpInput('');
                    setOtpError('');
                    setOtpCheckinLoc(userLoc);
                    setShowOtpModal(true);
                  },
                },
              ],
            );
            setCheckingIn(false);
            return;
          }
          // Ask for force check-in
          const proceed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Force Check In',
              'You are not within the store radius. This will be recorded as a force check in. Continue?',
              [
                { text: 'No', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Yes', onPress: () => resolve(true) },
              ],
            );
          });
          if (!proceed) {
            setCheckingIn(false);
            return;
          }
          // Show Select Reason modal
          setForceCheckInData({ userLoc });
          setShowReasonModal(true);
          setCheckingIn(false);
          return;
        }
      }

      // 4. Store genuinely has NO mapped coordinates (not local, not on the
      // server) — there is no geofence to evaluate, so this can't be an
      // out-of-radius "force" check-in. Treat it as a NORMAL check-in.
      // Previously an unmapped store forced every check-in even when the rep
      // was standing inside it (the "0.00 km / no distance still shows force
      // check-in" complaint). Capture the photo for proof and proceed.
      if (!effectiveCoords) {
        await proceedWithCheckIn(userLoc, undefined, true);
        return;
      }

      // 4. No GPS available — proceed with check-in
      await proceedWithCheckIn(userLoc, undefined, false);
    } catch (err: any) {
      console.error('[CheckIn] Error:', err);
      Alert.alert('Error', `Failed to check in: ${err?.message ?? 'Unknown error'}`);
      setCheckingIn(false);
    }
  };

  const handleContinue = () => {
    navigation.replace('CustomerDashboard', { customerCode, customerName, visitCode: visitId });
  };

  // Map centering priority:
  //   1. The store's saved coords (best — pin matches the actual location).
  //   2. mapCenter from the rep's GPS (filled when the store has no coords
  //      OR when its coords haven't loaded yet from local DB).
  //   3. userCoords from the "Use My Location" tap.
  //   4. DEFAULT_REGION (Dubai) — last-resort only so reps in other
  //      countries don't see Dubai when GPS is briefly unavailable.
  const mapRegion = customerCoords
    ? { latitude: customerCoords.lat, longitude: customerCoords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : mapCenter
    ? { latitude: mapCenter.lat, longitude: mapCenter.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : userCoords
    ? { latitude: userCoords.lat, longitude: userCoords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  const creditUsedPct = stats.creditLimit > 0 ? Math.min(100, Math.round((stats.currentOutstanding / stats.creditLimit) * 100)) : 0;
  const maxSales = Math.max(...stats.salesHistory.map(h => h.value), 1);

  return (
    <View style={st.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Back button — iOS only (Android has hardware back) */}
      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={st.floatingBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Icon name="chevron-back" size={22} color="#333" />
        </TouchableOpacity>
      )}

      {/* Map — takes ~45% of screen. Shows the user's blue dot. The store
          pin is rendered below as an absolute-positioned View, projected
          from the customer's lat/lng to screen pixels via
          mapRef.current.pointForCoordinate(). Updated on every region
          change so it tracks the store as the user pans / zooms. */}
      <View style={st.mapBox}>
        <MapView
          ref={mapRef}
          style={st.map}
          initialRegion={mapRegion}
          showsUserLocation={true}
          showsMyLocationButton={true}
          mapType={mapType}
          onMapReady={updatePinPosition}
          onRegionChange={updatePinPosition}
          onRegionChangeComplete={updatePinPosition}
        />
        {/* Map/Satellite toggle — matches native Google Maps style */}
        <View style={st.mapToggle}>
          <TouchableOpacity
            style={[st.mapToggleBtn, mapType === 'standard' && st.mapToggleBtnActive]}
            onPress={() => setMapType('standard')}
            activeOpacity={0.8}
          >
            <Text style={[st.mapToggleText, mapType === 'standard' && st.mapToggleTextActive]}>Map</Text>
          </TouchableOpacity>
          <View style={st.mapToggleDivider} />
          <TouchableOpacity
            style={[st.mapToggleBtn, mapType === 'satellite' && st.mapToggleBtnActive]}
            onPress={() => setMapType('satellite')}
            activeOpacity={0.8}
          >
            <Text style={[st.mapToggleText, mapType === 'satellite' && st.mapToggleTextActive]}>Satellite</Text>
          </TouchableOpacity>
        </View>
        {/* Store pin overlay — anchored to the actual customer coordinates
            via pointForCoordinate, so it stays glued to the store as the
            user pans / zooms the map. Tappable: shows the store name on
            press. Replaces <Marker>, which crashes on RN 0.84 Fabric. */}
        {customerCoords && customerCoords.lat !== 0 && pinPos && (
          <>
            {pinLabelOpen && (
              <View
                pointerEvents="none"
                style={[st.pinLabel, { top: pinPos.y - 80, left: pinPos.x - 90 }]}
              >
                <Text style={st.pinLabelText} numberOfLines={1}>{customerName}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[st.pinWrap, { top: pinPos.y - 40, left: pinPos.x - 14 }]}
              activeOpacity={0.8}
              onPress={() => setPinLabelOpen(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={st.pinHead} />
              <View style={st.pinTail} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={st.navBtn} onPress={handleNavigate} activeOpacity={0.8}>
          <Icon name="navigate" size={16} color="#4A7BF7" />
          <Text style={st.navBtnText}>Navigate</Text>
        </TouchableOpacity>
      </View>

      {/* Store Info Card — overlaps the map slightly */}
      <View style={st.cardWrapper}>
        <View style={st.infoCard}>
          {/* Store Name + Address + Edit */}
          <View style={st.nameRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={st.storeName} numberOfLines={2}>{customerName}</Text>
              {!!address && (
                <Text style={st.storeAddress} numberOfLines={3}>{address}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => {
              // Open the edit modal INSTANTLY. Previously this awaited a fresh
              // GPS fix BEFORE opening, so on low-end / smaller devices the
              // pencil felt unresponsive — the modal only appeared once the
              // (slow) location fix returned. Now open immediately and fill the
              // rep's GPS into the "New Location" fields in the background.
              setShowLocationModal(true);
              (async () => {
                try {
                  const pos = await getCurrentPosition();
                  if (pos) {
                    setUserCoords({ lat: pos.lat, lng: pos.lng });
                    setNewLat(String(pos.lat));
                    setNewLng(String(pos.lng));
                    if (customerCoords && customerCoords.lat !== 0) {
                      setLocationDistance(calculateDistance(customerCoords.lat, customerCoords.lng, pos.lat, pos.lng) / 1000);
                    }
                  }
                } catch (e) { console.warn('[CheckIn] edit GPS prefill failed:', e); }
              })();
            }} activeOpacity={0.7}>
              <Icon name="create-outline" size={22} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          <View style={st.divider} />

          {/* Customer Code & Channel */}
          <View style={st.detailRow}>
            <View style={st.detailCol}>
              <Text style={st.detailLabel}>Customer Code:</Text>
              <Text style={st.detailValue}>{customerCode}</Text>
            </View>
            <View style={st.detailCol}>
              <Text style={st.detailLabel}>Channel:</Text>
              <Text style={st.detailValue}>{channelFromDb || (channelCode && channelCode.trim()) || '-'}</Text>
            </View>
          </View>

          {/* Target / Achieved / Pending. Each cell gets a small icon
              so reps can scan the three numbers at a glance instead of
              reading the labels — Target = flag, Achieved = trending up,
              Pending = hourglass. Currency prefix on the values makes it
              obvious these are amounts in ₹, not raw counts. */}
          <View style={st.targetRow}>
            <View style={st.targetCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="flag-outline" size={13} color="#6B7280" />
                <Text style={st.targetLabel}>Target:</Text>
              </View>
              <Text style={st.targetValue}>{targetLoading ? '...' : `₹${stats.todaysTarget.toFixed(1)}`}</Text>
            </View>
            <View style={st.targetCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="trending-up-outline" size={13} color="#16a34a" />
                <Text style={st.targetLabel}>Achieved:</Text>
              </View>
              <Text style={[st.targetValue, { color: '#16a34a' }]}>₹{stats.mtdSalesValue.toFixed(1)}</Text>
            </View>
            <View style={st.targetCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="hourglass-outline" size={13} color="#b45309" />
                <Text style={st.targetLabel}>Pending:</Text>
              </View>
              <Text style={[st.targetValue, { color: '#b45309' }]}>{targetLoading ? '...' : `₹${Math.max(0, stats.todaysTarget - stats.mtdSalesValue).toFixed(1)}`}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom Check In Button */}
      <View style={[st.bottomBar, { paddingBottom: bottomInset }]}>
        {/* Geo-code submission status banner — visible whenever the user has
            a submission on file for this customer. Shows reason if rejected. */}
        {geoRequestStatus ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start',
            padding: 10, borderRadius: 10, marginBottom: 10,
            backgroundColor:
              geoRequestStatus.status === 'REJECTED' ? '#FEE2E2'
              : geoRequestStatus.status === 'APPROVED' ? '#D1FAE5'
              : '#FEF3C7',
            borderWidth: 1,
            borderColor:
              geoRequestStatus.status === 'REJECTED' ? '#FCA5A5'
              : geoRequestStatus.status === 'APPROVED' ? '#6EE7B7'
              : '#FCD34D',
          }}>
            <Icon
              name={
                geoRequestStatus.status === 'REJECTED' ? 'close-circle'
                : geoRequestStatus.status === 'APPROVED' ? 'checkmark-circle'
                : 'time'
              }
              size={20}
              color={
                geoRequestStatus.status === 'REJECTED' ? '#B91C1C'
                : geoRequestStatus.status === 'APPROVED' ? '#047857'
                : '#B45309'
              }
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 13, fontWeight: '700',
                color:
                  geoRequestStatus.status === 'REJECTED' ? '#991B1B'
                  : geoRequestStatus.status === 'APPROVED' ? '#065F46'
                  : '#92400E',
              }}>
                {geoRequestStatus.status === 'REJECTED' ? 'Location update rejected'
                  : geoRequestStatus.status === 'APPROVED' ? 'Location update approved'
                  : 'Location update pending approval'}
              </Text>
              {geoRequestStatus.status === 'REJECTED' && geoRequestStatus.rejectionReason ? (
                <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2 }}>
                  Reason: {geoRequestStatus.rejectionReason}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {savedCheckinPhoto ? (
          <TouchableOpacity
            onPress={() => setViewOnlyPhoto(savedCheckinPhoto)}
            activeOpacity={0.8}
            style={{
              flexDirection: 'row', alignItems: 'center', marginBottom: 10,
              padding: 8, backgroundColor: '#F3F4F6', borderRadius: 10,
              borderWidth: 1, borderColor: '#E5E7EB',
            }}
          >
            <Image
              source={{ uri: savedCheckinPhoto.uri }}
              style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: '#E5E7EB' }}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>Check-in photo ready</Text>
              <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Tap to view · saved for 24 hrs</Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[st.checkInBtn, checkingIn && { opacity: 0.7 }]}
          onPress={handleCheckIn} activeOpacity={0.8} disabled={checkingIn}
        >
          <Text style={st.checkInBtnText}>{checkingIn ? 'Checking In...' : 'Check In'}</Text>
        </TouchableOpacity>
      </View>

      {/* Select Reason Modal — for force check-in */}
      <Modal visible={showReasonModal} transparent animationType="fade" onRequestClose={() => setShowReasonModal(false)}>
        <View style={st.reasonOverlay}>
          <View style={st.reasonBox}>
            <View style={st.reasonHeader}>
              <Text style={st.reasonTitle}>Select Reason</Text>
              <TouchableOpacity onPress={() => { setShowReasonModal(false); setForceCheckInData(null); }}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={st.reasonSearchRow}>
              <Icon name="search-outline" size={20} color="#9CA3AF" />
              <TextInput
                style={st.reasonSearchInput}
                placeholder="Search Reason"
                placeholderTextColor="#9CA3AF"
                value={reasonSearch}
                onChangeText={setReasonSearch}
              />
            </View>
            <View style={st.reasonDivider} />
            {['Others'].filter(r => !reasonSearch || r.toLowerCase().includes(reasonSearch.toLowerCase())).map((reason) => (
              <TouchableOpacity
                key={reason}
                style={st.reasonItem}
                onPress={() => {
                  setShowReasonModal(false);
                  setReasonSearch('');
                  proceedWithCheckIn(forceCheckInData?.userLoc ?? null, reason, true, 'force');
                  setForceCheckInData(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={st.reasonItemText}>{reason}</Text>
                <View style={st.reasonRadio} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Location Edit Modal */}
      {showLocationModal && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setShowLocationModal(false)}>
          <View style={st.modalOverlay}>
            <View style={st.modalBox}>
              <Text style={st.modalTitle}>Location</Text>

              {/* Existing coords on file for this store. Renamed from
                  "Current Shop Location" because reps were reading "Current"
                  as "rep's current GPS" when this section is showing the
                  authoritative coords already saved against the customer.
                  Falls through to the GPS-warmup / forward-geocoded mapCenter
                  used by the map behind the modal so the rep sees a real
                  lat/lng instead of N/A when the customer has no approved
                  geo-code yet. */}
              <Text style={st.modalSectionLabel}>Existing Shop Location</Text>
              <View style={st.modalRow}>
                <View style={st.modalCol}>
                  <Text style={st.modalFieldLabel}>Latitude</Text>
                  <Text style={st.modalFieldValue}>{(customerCoords?.lat ?? mapCenter?.lat ?? userCoords?.lat)?.toFixed(6) ?? 'N/A'}</Text>
                </View>
                <View style={st.modalCol}>
                  <Text style={st.modalFieldLabel}>Longitude</Text>
                  <Text style={st.modalFieldValue}>{(customerCoords?.lng ?? mapCenter?.lng ?? userCoords?.lng)?.toFixed(6) ?? 'N/A'}</Text>
                </View>
              </View>

              <Text style={st.modalSectionLabel}>New</Text>
              <View style={st.modalRow}>
                <View style={st.modalCol}>
                  <Text style={st.modalFieldLabel}>Latitude</Text>
                  <TextInput style={st.modalInput} value={newLat} onChangeText={(t) => { setNewLat(t); const lat = parseFloat(t); if (!isNaN(lat) && customerCoords) setLocationDistance(calculateDistance(customerCoords.lat, customerCoords.lng, lat, parseFloat(newLng) || 0) / 1000); }} keyboardType="numeric" placeholder="Enter latitude" placeholderTextColor="#9CA3AF" />
                </View>
                <View style={st.modalCol}>
                  <Text style={st.modalFieldLabel}>Longitude</Text>
                  <TextInput style={st.modalInput} value={newLng} onChangeText={(t) => { setNewLng(t); const lng = parseFloat(t); if (!isNaN(lng) && customerCoords) setLocationDistance(calculateDistance(customerCoords.lat, customerCoords.lng, parseFloat(newLat) || 0, lng) / 1000); }} keyboardType="numeric" placeholder="Enter longitude" placeholderTextColor="#9CA3AF" />
                </View>
              </View>

              <Text style={st.modalSectionLabel}>Distance</Text>
              <Text style={st.modalDistanceText}>
                Distance (GPS coordinates): {locationDistance !== null ? locationDistance.toFixed(2) : '0.00'} km
              </Text>

              <View style={st.modalBtnRow}>
                <TouchableOpacity style={st.modalCloseBtn} onPress={() => setShowLocationModal(false)} activeOpacity={0.7}>
                  <Text style={st.modalCloseBtnText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.modalUpdateBtn, updatingLocation && { opacity: 0.6 }]}
                  disabled={updatingLocation}
                  activeOpacity={0.7}
                  onPress={async () => {
                    const lat = parseFloat(newLat);
                    const lng = parseFloat(newLng);
                    if (isNaN(lat) || isNaN(lng)) { Alert.alert('Invalid', 'Enter valid latitude and longitude.'); return; }
                    setUpdatingLocation(true);
                    try {
                      // OPTIMISTIC submit: queue the request, show success and
                      // close the modal IMMEDIATELY, then push in the background.
                      // The user never waits on the network or sees a false
                      // "offline" error — the server dedupes by (customer,
                      // submitter, PENDING), and the on-focus queue flush retries
                      // until it lands. Earlier this awaited a blocking axios POST
                      // that threw a false "Network Error" on Android (Hermes),
                      // so a submission the server actually accepted was reported
                      // as "Queued Offline" even with Wi-Fi/data on.
                      const queueKey = `geoCodeQueue_${user?.code ?? 'anon'}`;
                      const entry = { customerCode, latitude: lat, longitude: lng, queuedAt: Date.now() };
                      try {
                        const raw = await AsyncStorage.getItem(queueKey);
                        const queue = raw ? JSON.parse(raw) : [];
                        queue.push(entry);
                        await AsyncStorage.setItem(queueKey, JSON.stringify(queue));
                      } catch { /* best-effort */ }

                      // Do NOT update local customer coords yet — the TL must
                      // approve first; the map pin stays put until approval.
                      setShowLocationModal(false);
                      setGeoRequestStatus({ status: 'PENDING', rejectionReason: null, createdAt: new Date().toISOString() });
                      Alert.alert('Submitted', 'Location update request sent for admin approval.');
                      setUpdatingLocation(false);

                      // Fire-and-forget background push; on success drop it from
                      // the queue, on failure leave it for the flush to retry.
                      apiClient.post('/geo-codes', { customerCode, latitude: lat, longitude: lng })
                        .then(async () => {
                          try {
                            const raw = await AsyncStorage.getItem(queueKey);
                            const q: any[] = raw ? JSON.parse(raw) : [];
                            const idx = q.findIndex((e) => e.customerCode === customerCode && e.latitude === lat && e.longitude === lng && e.queuedAt === entry.queuedAt);
                            if (idx >= 0) { q.splice(idx, 1); await AsyncStorage.setItem(queueKey, JSON.stringify(q)); }
                          } catch { /* leave for flush */ }
                        })
                        .catch((e: any) => console.warn('[GeoCode] background submit failed, will retry from queue:', e?.message));
                    } catch (err: any) {
                      setUpdatingLocation(false);
                      Alert.alert('Error', err?.message ?? 'Failed to submit location update.');
                    }
                  }}
                >
                  <Text style={st.modalUpdateBtnText}>{updatingLocation ? 'Submitting...' : 'Submit for Approval'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Off-screen watermark burner */}
      <WatermarkRenderer />

      {/* Check-in Photo Preview */}
      <PhotoPreviewModal
        visible={checkinPhotoPreview}
        photoUri={checkinPhotoUri}
        timestamp={checkinPhotoTs ?? undefined}
        latitude={checkinPhotoLat}
        longitude={checkinPhotoLng}
        customerCode={customerCode}
        customerName={customerName}
        title="Check-In Photo"
        onAccept={() => {
          setCheckinPhotoPreview(false);
          // Persist the accepted photo so the thumbnail survives navigation
          // and app restarts for up to 24 h.
          if (checkinPhotoUri) {
            const entry = {
              uri: checkinPhotoUri,
              ts: checkinPhotoTs ?? Date.now(),
              lat: checkinPhotoLat,
              lng: checkinPhotoLng,
            };
            setSavedCheckinPhoto(entry);
            AsyncStorage.setItem(savedPhotoKey, JSON.stringify(entry)).catch(() => {});
          }
          checkinPhotoResolve?.(checkinPhotoUri);
        }}
        onRetake={async () => {
          setCheckinPhotoPreview(false);
          // Re-capture
          try {
            const photo = await capturePhoto(false, user?.name ?? user?.code, customerName);
            if (photo) {
              const ts = Date.now();
              let lat: number | null = null, lng: number | null = null;
              try { const pos = await getCurrentPosition(true); lat = pos?.lat ?? null; lng = pos?.lng ?? null; } catch (e) { console.warn("[App]", e); }
              
              const stampedUri = await burnWatermark(photo.uri, ts, lat, lng);
              
              setCheckinPhotoUri(stampedUri);
              setCheckinPhotoTs(ts);
              setCheckinPhotoLat(lat);
              setCheckinPhotoLng(lng);
              setTimeout(() => setCheckinPhotoPreview(true), 300);
            } else {
              checkinPhotoResolve?.(null);
            }
          } catch {
            checkinPhotoResolve?.(null);
          }
        }}
      />
      {/* OTP Modal for Check-In */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1f2937', textAlign: 'center' }}>Unlock Force Check-In</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 18 }}>
              Force check-in is disabled for this store. Contact your manager with the code below.
            </Text>

            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 6 }}>YOUR CHALLENGE CODE</Text>
            <View style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: '#1e40af', letterSpacing: 12 }}>{otpChallenge}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#3b82f6', textAlign: 'center', marginTop: 6 }}>Read this code to your manager</Text>

            <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 6, marginTop: 20 }}>ENTER RESPONSE OTP</Text>
            <TextInput
              style={{ height: 52, fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: 12, color: '#1f2937', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 }}
              value={otpInput}
              onChangeText={t => { setOtpInput(t.replace(/\D/g, '').slice(0, 4)); setOtpError(''); }}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="0000"
              placeholderTextColor="#d1d5db"
            />
            {otpError ? <Text style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', marginTop: 6 }}>{otpError}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, height: 44, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setShowOtpModal(false)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: 44, backgroundColor: otpInput.length < 4 ? '#d1d5db' : '#1e3a5f', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                disabled={otpInput.length < 4}
                onPress={async () => {
                  // Verify OTP using same algorithm as web portal
                  const OTP_SECRET = 'FARMLEY_SFA_2026';
                  const today = new Date().toISOString().slice(0, 10);
                  const seed = `${otpChallenge}:${customerCode}:${today}:${OTP_SECRET}`;
                  let hash = 0;
                  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0; }
                  const expected = String(Math.abs(hash) % 10000).padStart(4, '0');
                  if (otpInput === expected) {
                    setShowOtpModal(false);
                    // Log OTP approval to backend
                    try {
                      await apiClient.post('/customer-visits/otp-approval', { challenge: otpChallenge, customerCode });
                    } catch (e) {
                      console.warn('[OTP] Approval log failed:', e);
                    }
                    proceedWithCheckIn(otpCheckinLoc, 'OTP Override', true, 'force_otp');
                  } else {
                    setOtpError('Invalid OTP. Please check with your manager.');
                  }
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Verify & Check In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View-only photo viewer — no Retake / Use Photo buttons. Triggered
          when the user taps the saved check-in thumbnail. Shows the captured
          latitude / longitude / timestamp over the image. */}
      <Modal visible={!!viewOnlyPhoto} transparent animationType="fade" onRequestClose={() => setViewOnlyPhoto(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <TouchableOpacity
            onPress={() => setViewOnlyPhoto(null)}
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setViewOnlyPhoto(null)}>
            {viewOnlyPhoto ? (
              <Image source={{ uri: viewOnlyPhoto.uri }} style={{ flex: 1, width: '100%', height: '100%' }} resizeMode="contain" />
            ) : null}
          </TouchableOpacity>

          {/* Metadata overlay panel removed — timestamp + lat/lng are
              already burned into the JPEG via BurnWatermark. */}
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  // Floating back button over map
  floatingBackBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8,
    left: 14,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
    }),
  },
  // Map
  mapBox: {
    height: '42%',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  // Map/Satellite toggle — native Google Maps style
  mapToggle: {
    position: 'absolute',
    top: 10,
    left: 8,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2 },
    }),
  },
  mapToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  mapToggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  mapToggleDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  mapToggleText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666666',
  },
  mapToggleTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  // Red pin — absolute positioned, moved by pinPos. The wrapper's bottom
  // edge sits at pinPos.y so the tail tip points at the exact coord.
  pinWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },
  // Floating label bubble — separate absolute element above the pin so it
  // doesn't displace the pin tip from the customer's lat/lng.
  pinLabel: {
    position: 'absolute',
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    zIndex: 11,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
    }),
  },
  pinLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  pinHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EA4335',
    borderWidth: 3,
    borderColor: '#B91C1C',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EA4335',
    marginTop: -4,
  },
  pinDot: {
    width: 8,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginTop: 2,
  },
  navBtn: {
    position: 'absolute',
    // Card wrapper below the map uses marginTop: -20, so keep the button
    // clear of that overlap zone (was bottom: 10 → button got hidden by card).
    bottom: 36,
    right: 12,
    backgroundColor: '#3C3C3C',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    ...Platform.select({
      android: { elevation: 5 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
    }),
  },
  navBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Card wrapper
  cardWrapper: {
    flex: 1,
    marginTop: -20,
    paddingHorizontal: 14,
  },
  // Info Card
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
    }),
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  storeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  storeAddress: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  // Detail rows — Customer Code & Channel
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  // Target / Achieved / Pending row
  targetRow: {
    flexDirection: 'row',
  },
  targetCol: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
    marginBottom: 2,
  },
  targetValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  // Bottom
  bottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#F3F4F6',
  },
  checkInBtn: {
    backgroundColor: '#1a3178',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#1a3178', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    }),
  },
  checkInBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  // Location Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  modalSectionLabel: {
    fontSize: 15,
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: 12,
  },
  modalRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  modalCol: {
    flex: 1,
  },
  modalFieldLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  modalFieldValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalInput: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    backgroundColor: '#F9FAFB',
  },
  modalDistanceText: {
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
    marginBottom: 24,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
  },
  modalCloseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalCloseBtnText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  modalUpdateBtn: {
    backgroundColor: '#1a3178',
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  modalUpdateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Select Reason Modal
  reasonOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  reasonBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '60%',
  },
  reasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reasonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  reasonSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  reasonSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  reasonDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  reasonItemText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  reasonRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
});
