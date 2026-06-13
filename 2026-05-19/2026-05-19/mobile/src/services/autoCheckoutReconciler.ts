import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import database from '../db/database';
import api from '../api/client';
import CustomerVisit from '../db/models/CustomerVisit';

// Key for the AsyncStorage set of visit_codes whose auto-close alert the user
// has already seen. Prevents re-alerting on every foreground tick.
const SHOWN_KEY = 'auto_checkout_alerts_shown_v1';

interface ServerVisit {
  visitCode: string;
  customerCode: string;
  customerName: string | null;
  checkinTime: string;
  checkoutTime: string | null;
  checkoutType: string | null;
  autoClosed: boolean;
  status: string;
}

export interface AutoClosureNotice {
  visitCode: string;
  customerCode: string;
  customerName: string;
  checkinTime: Date;
  checkoutTime: Date;
  durationMinutes: number;
}

/**
 * Reconciles local customer_visits with the server's current state, specifically
 * for visits that were closed by the server's auto-checkout cron.
 *
 * Returns a list of closures the user hasn't been notified of yet. The caller
 * is responsible for showing an alert / toast for each and calling
 * {@link markAlertsShown} once the user dismisses them.
 */
export async function reconcileAutoCheckouts(): Promise<AutoClosureNotice[]> {
  let serverVisits: ServerVisit[] = [];
  try {
    const res = await api.get('/customer-visits/my-open-status', { timeout: 15_000 });
    serverVisits = res.data?.data ?? [];
  } catch (err: any) {
    console.warn('[auto-checkout-reconcile] fetch failed:', err?.message);
    return [];
  }
  if (serverVisits.length === 0) return [];

  const autoClosed = serverVisits.filter(v => v.autoClosed && v.checkoutTime);
  if (autoClosed.length === 0) return [];

  // Update any local rows whose server has a checkout the device is missing.
  const visitsCollection = database.get<CustomerVisit>('customer_visits');
  const notices: AutoClosureNotice[] = [];

  for (const sv of autoClosed) {
    try {
      const matches = await visitsCollection.query(Q.where('visit_code', sv.visitCode)).fetch();
      const local = matches[0];
      if (!local) continue; // visit was never stored locally — nothing to reconcile

      const serverCheckoutMs = sv.checkoutTime ? new Date(sv.checkoutTime).getTime() : null;
      if (local.checkoutTime && serverCheckoutMs && local.checkoutTime >= serverCheckoutMs) {
        continue; // local already reflects the (or a newer) checkout
      }

      await database.write(async () => {
        await local.update((rec) => {
          rec.checkoutTime = serverCheckoutMs;
          rec.status = 'completed';
          // Mark as already synced so the push sync doesn't try to re-push it
          rec.isSynced = true;
        });
      });

      const checkinMs = new Date(sv.checkinTime).getTime();
      const durationMinutes = serverCheckoutMs ? Math.round((serverCheckoutMs - checkinMs) / 60000) : 0;
      notices.push({
        visitCode: sv.visitCode,
        customerCode: sv.customerCode,
        customerName: sv.customerName ?? sv.customerCode,
        checkinTime: new Date(sv.checkinTime),
        checkoutTime: new Date(serverCheckoutMs!),
        durationMinutes,
      });
    } catch (err: any) {
      console.warn('[auto-checkout-reconcile] row update failed:', err?.message);
    }
  }

  // Filter out closures the user has already been notified about.
  const shown = await getShownSet();
  return notices.filter(n => !shown.has(n.visitCode));
}

export async function markAlertsShown(visitCodes: string[]): Promise<void> {
  const shown = await getShownSet();
  for (const c of visitCodes) shown.add(c);
  await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(shown)));
}

async function getShownSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
