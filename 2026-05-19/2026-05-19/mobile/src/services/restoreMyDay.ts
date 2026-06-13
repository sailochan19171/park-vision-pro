// restoreMyDay
// ---------------------------------------------------------------------------
// After a fresh install / clear-data, the user's day-of work (visits, orders,
// stocks, planograms, OSOI, PO captures, expiry, competitor obs) lives only
// on the server — the standard pull-sync carries master data, not the rep's
// own pushed records. This service calls GET /sync/restore-my-day and
// rehydrates the local WatermelonDB so the reports + screens come back to
// life on a clean install.
//
// Guard: skips when the local DB already has work data for the user, so it
// only fires on a genuinely empty install.

import { DeviceEventEmitter } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '../db/database';
import api from '../api/client';

// Event emitted once restoreMyDay has finished writing local rows so screens
// that already mounted (DashboardScreen, CustomerDashboardScreen) can refresh
// their queries instead of sitting on a stale empty result. Cold-launch order
// is: App.tsx kicks off restoreMyDay → DashboardScreen mounts immediately →
// CustomerDashboardScreen may mount via the active-visit resume → restore
// finally finishes seconds later. Without this event, those screens stay
// blank until the user back-navigates and remounts them.
export const RESTORE_MY_DAY_DONE_EVENT = 'restoreMyDayDone';

// Emitted by any activity screen (Planogram, OSOI, OpeningStock, etc.) right
// after a successful submit so the customer dashboard can immediately re-run
// its completion check and light up the green tick on the corresponding tile.
// Without this, the tile only refreshed on the next focus event — and on slow
// devices the back-navigation occasionally finished before WatermelonDB's
// write fully landed, so the focus-fired refresh queried an empty result.
export const ACTIVITY_SUBMITTED_EVENT = 'activitySubmitted';

// Emitted by EndOfDayScreen the moment its server EOT POST returns
// success — BEFORE navigation.goBack(). DashboardScreen listens and
// immediately sets dayStarted=false / dayEnded=false on its live state,
// so when the back-navigation surfaces the Dashboard it paints "Start
// Day" on the very first frame instead of holding the pre-EOD
// "Continue" state until the focus-fired loadDayStatus catches up
// 1-2 s later.
export const DAY_ENDED_LOCALLY_EVENT = 'dayEndedLocally';

function num(v: any): number { return v == null ? 0 : Number(v); }
function nullableNum(v: any): number | null { return v == null ? null : Number(v); }

export async function restoreMyDay(userCode: string, date?: string): Promise<void> {
  if (!userCode) return;
  const todayStr = date ?? new Date().toISOString().split('T')[0];

  // Skip if local already has any work data — restore is for fresh installs.
  try {
    const [a, v, o] = await Promise.all([
      database.get('attendance_records').query(Q.where('user_code', userCode), Q.where('attendance_date', todayStr)).fetchCount(),
      database.get('customer_visits').query(Q.where('user_code', userCode)).fetchCount(),
      database.get('orders').query(Q.where('user_code', userCode)).fetchCount(),
    ]);
    if (a > 0 || v > 0 || o > 0) {
      console.log('[RestoreMyDay] local already has work data — skipping');
      return;
    }
  } catch { /* try restore anyway */ }

  // Skip when the day is already ended (manual EOD or auto-EOT). Once the
  // rep has closed the day the work is "done" — opening the app on a fresh
  // install should land them on Start Day, not show yesterday-style data
  // for a closed day. Mid-day reinstall (no EOT yet) still rehydrates.
  // Lifted out of the try-block scope so the AsyncStorage flag write at the
  // end can reuse it without a second /my-day-status round trip.
  let dayStatus: any = null;
  try {
    const res = await api.get('/attendance/my-day-status', {
      params: { date: todayStr }, timeout: 8000,
    });
    dayStatus = res.data;
    if (dayStatus?.dayEnded === true) {
      console.log('[RestoreMyDay] day is already ended — skipping restore');
      return;
    }
  } catch { /* if status check fails, fall through and try the restore */ }

  // Anchor the restore window to the rep's OPEN day, not just today. A working
  // day can straddle the 00:00-UTC / 05:30-IST rollover, and an open day the
  // rep never EOT'd can be several calendar days old. Restoring only `todayStr`
  // lost every operation done on the open day's earlier UTC date(s) — the
  // customer tiles (OSOI / Planogram / stocks / orders / …) came back BLANK
  // after a reinstall for any customer visited before the rollover. Pull the
  // whole [openDayDate … today] span. Always include at least yesterday → today
  // so the pure UTC-midnight-boundary case is covered even when openDayDate is
  // null (e.g. the status call failed). `openDayDate` comes from the
  // /my-day-status response already fetched above.
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const openDayDate: string | null = dayStatus?.openDayDate ?? null;
  let fromStr = yesterdayStr;
  if (openDayDate && openDayDate < fromStr) fromStr = openDayDate;
  if (fromStr > todayStr) fromStr = todayStr; // never invert the range

  let data: any;
  try {
    const res = await api.get('/sync/restore-my-day', { params: { from: fromStr, to: todayStr }, timeout: 30_000 });
    data = res.data;
  } catch (e: any) {
    console.warn('[RestoreMyDay] fetch failed:', e?.message);
    return;
  }
  if (!data) return;

  console.log('[RestoreMyDay] hydrating local DB', {
    attendance: data.attendance?.length ?? 0,
    visits: data.customer_visits?.length ?? 0,
    orders: data.orders?.length ?? 0,
    orderLines: data.order_lines?.length ?? 0,
    openingStockItems: data.opening_stock_items?.length ?? 0,
    physicalStockItems: data.physical_stock_items?.length ?? 0,
    planograms: data.planogram_executions?.length ?? 0,
    osoi: data.osoi_photos?.length ?? 0,
    poCaptures: data.po_captures?.length ?? 0,
    poItems: data.po_capture_items?.length ?? 0,
    expiry: data.expiry_checks?.length ?? 0,
    competitor: data.competitor_observations?.length ?? 0,
    productSamplings: data.product_samplings?.length ?? 0,
    initiativeExecutions: data.initiative_executions?.length ?? 0,
  });

  try {
    await database.write(async () => {
      const actions: any[] = [];

      // ---- attendance_records ------------------------------------------------
      for (const r of data.attendance ?? []) {
        actions.push(database.get('attendance_records').prepareCreate((rec: any) => {
          rec._raw.id = r.id?.toString() ?? `att_${r.userCode}_${r.attendanceDate}`;
          rec._raw.user_code = r.userCode;
          rec._raw.attendance_date = r.attendanceDate;
          rec._raw.is_present = !!r.isPresent;
          rec._raw.attendance_type = r.attendanceType ?? null;
          rec._raw.selfie_path = r.selfiePath ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.is_synced = true;
        }));
      }

      // ---- customer_visits ---------------------------------------------------
      for (const r of data.customer_visits ?? []) {
        actions.push(database.get('customer_visits').prepareCreate((rec: any) => {
          rec._raw.id = r.visitCode ?? r.id?.toString() ?? `cv_${r.id}`;
          rec._raw.visit_code = r.visitCode ?? '';
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.customer_name = r.customerName ?? null;
          rec._raw.checkin_time = r.checkinTime ? new Date(r.checkinTime).getTime() : 0;
          rec._raw.checkout_time = r.checkoutTime ? new Date(r.checkoutTime).getTime() : null;
          rec._raw.checkin_lat = nullableNum(r.checkinLat);
          rec._raw.checkin_lng = nullableNum(r.checkinLng);
          rec._raw.checkin_image = r.checkinImage ?? null;
          rec._raw.checkout_lat = nullableNum(r.checkoutLat);
          rec._raw.checkout_lng = nullableNum(r.checkoutLng);
          rec._raw.checkout_image = r.checkoutImage ?? null;
          rec._raw.status = r.status ?? 'completed';
          rec._raw.checkout_type = r.checkoutType ?? null;
          rec._raw.is_synced = true;
        }));
      }

      // ---- orders (+ remember id mapping for order_lines) --------------------
      const orderIdMap = new Map<number, string>();
      for (const r of data.orders ?? []) {
        const localId: string = r.appTrxId ?? `ord_${r.id}`;
        orderIdMap.set(r.id, localId);
        actions.push(database.get('orders').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = r.appTrxId ?? localId;
          rec._raw.server_trx_code = r.serverTrxCode ?? null;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.customer_name = r.customerName ?? null;
          rec._raw.trx_date = r.trxDate ? new Date(r.trxDate).getTime() : 0;
          rec._raw.total_amount = num(r.totalAmount);
          rec._raw.lines_count = num(r.linesCount);
          rec._raw.status = r.status ?? 1;
          rec._raw.route_code = r.routeCode ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.image_path = r.imagePath ?? null;
          rec._raw.is_synced = true;
        }));
      }

      // ---- order_lines (use order id mapping) -------------------------------
      for (const r of data.order_lines ?? []) {
        const orderLocalId = orderIdMap.get(r.orderId);
        if (!orderLocalId) continue;
        actions.push(database.get('order_lines').prepareCreate((rec: any) => {
          rec._raw.id = `ol_${r.id}`;
          rec._raw.order_id = orderLocalId;
          rec._raw.line_no = num(r.lineNo);
          rec._raw.item_code = r.itemCode;
          rec._raw.item_name = r.itemName ?? null;
          rec._raw.quantity = num(r.quantity);
          rec._raw.price_used = num(r.priceUsed);
          rec._raw.tax_pct = num(r.taxPct);
          rec._raw.uom = r.uom ?? 'EA';
        }));
      }

      // ---- opening_stocks (server: header + items → mobile: flat per item) --
      const osHeaders = new Map<number, any>((data.opening_stocks ?? []).map((h: any) => [h.id, h]));
      for (const item of data.opening_stock_items ?? []) {
        const header = osHeaders.get(item.openingStockId);
        if (!header) continue;
        actions.push(database.get('opening_stocks').prepareCreate((rec: any) => {
          rec._raw.id = `os_${item.id}`;
          rec._raw.app_trx_id = `os_${item.id}`;
          rec._raw.user_code = header.userCode;
          rec._raw.customer_code = header.customerCode;
          rec._raw.visit_code = header.visitCode ?? null;
          rec._raw.item_code = item.itemCode;
          rec._raw.item_name = item.itemName ?? null;
          rec._raw.category = item.category ?? null;
          rec._raw.brand = item.brand ?? null;
          rec._raw.quantity = num(item.quantity);
          rec._raw.uom = item.uom ?? 'EA';
          rec._raw.stock_date = header.stockDate;
          rec._raw.is_synced = true;
        }));
      }

      // ---- physical_stocks (same join pattern) ------------------------------
      const psHeaders = new Map<number, any>((data.physical_stocks ?? []).map((h: any) => [h.id, h]));
      for (const item of data.physical_stock_items ?? []) {
        const header = psHeaders.get(item.physicalStockId);
        if (!header) continue;
        actions.push(database.get('physical_stocks').prepareCreate((rec: any) => {
          rec._raw.id = `ps_${item.id}`;
          rec._raw.app_trx_id = `ps_${item.id}`;
          rec._raw.user_code = header.userCode;
          rec._raw.customer_code = header.customerCode;
          rec._raw.visit_code = header.visitCode ?? null;
          rec._raw.item_code = item.itemCode;
          rec._raw.item_name = item.itemName ?? null;
          rec._raw.category = item.category ?? null;
          rec._raw.brand = item.brand ?? null;
          rec._raw.system_qty = num(item.systemQty);
          rec._raw.physical_qty = num(item.physicalQty);
          rec._raw.uom = item.uom ?? 'EA';
          rec._raw.stock_date = header.stockDate;
          // The captured photo + geo live on the physical_stocks HEADER, so
          // carry them onto every flattened item row — without this the
          // reinstalled device lost the physical-stock image entirely.
          rec._raw.image_path = header.imagePath ?? null;
          rec._raw.captured_on = header.capturedOn ? new Date(header.capturedOn).getTime() : null;
          rec._raw.geo_lat = nullableNum(header.geoLat);
          rec._raw.geo_lng = nullableNum(header.geoLng);
          rec._raw.is_synced = true;
        }));
      }

      // ---- planogram_executions ---------------------------------------------
      for (const r of data.planogram_executions ?? []) {
        const localId: string = r.appTrxId ?? `plan_${r.id}`;
        actions.push(database.get('planogram_executions').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.category_code = r.categoryCode ?? null;
          rec._raw.performed_on = r.performedOn ? new Date(r.performedOn).getTime() : 0;
          rec._raw.is_followed = !!r.isFollowed;
          rec._raw.pre_image = r.preImage ?? null;
          rec._raw.post_image = r.postImage ?? null;
          rec._raw.notes = r.notes ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.approval_status = r.approvalStatus ?? null;
          rec._raw.is_synced = true;
        }));
      }

      // ---- osoi_photos -------------------------------------------------------
      for (const r of data.osoi_photos ?? []) {
        const localId: string = r.appTrxId ?? `osoi_${r.id}`;
        actions.push(database.get('osoi_photos').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.asset_type = r.assetType;
          rec._raw.image_path = r.imagePath;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.captured_on = r.capturedOn ? new Date(r.capturedOn).getTime() : 0;
          rec._raw.approval_status = r.approvalStatus ?? null;
          rec._raw.is_synced = true;
        }));
      }

      // ---- po_captures (+ items via id mapping) -----------------------------
      const poIdMap = new Map<number, string>();
      for (const r of data.po_captures ?? []) {
        const localId: string = r.appTrxId ?? `po_${r.id}`;
        poIdMap.set(r.id, localId);
        actions.push(database.get('po_captures').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.po_number = r.poNumber;
          rec._raw.image_path = r.imagePath ?? null;
          rec._raw.total_amount = num(r.totalAmount);
          rec._raw.captured_on = r.capturedOn ? new Date(r.capturedOn).getTime() : 0;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.is_synced = true;
        }));
      }
      for (const item of data.po_capture_items ?? []) {
        const poLocalId = poIdMap.get(item.poCaptureId);
        if (!poLocalId) continue;
        actions.push(database.get('po_capture_items').prepareCreate((rec: any) => {
          rec._raw.id = `poi_${item.id}`;
          rec._raw.po_capture_id = poLocalId;
          rec._raw.item_code = item.itemCode;
          rec._raw.item_name = item.itemName ?? null;
          rec._raw.quantity = num(item.quantity);
          rec._raw.price = num(item.price);
          rec._raw.uom = item.uom ?? 'EA';
        }));
      }

      // ---- expiry_checks ----------------------------------------------------
      for (const r of data.expiry_checks ?? []) {
        const localId: string = r.appTrxId ?? `exp_${r.id}`;
        actions.push(database.get('expiry_checks').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.item_code = r.itemCode;
          rec._raw.item_name = r.itemName ?? null;
          rec._raw.category = r.category ?? null;
          rec._raw.quantity = num(r.quantity);
          rec._raw.uom = r.uom ?? 'EA';
          rec._raw.expiry_date = r.expiryDate ?? null;
          rec._raw.visited_date = r.visitedDate ?? null;
          rec._raw.image_path = r.imagePath ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.is_synced = true;
        }));
      }

      // ---- competitor_observations ------------------------------------------
      for (const r of data.competitor_observations ?? []) {
        const localId: string = r.appTrxId ?? `comp_${r.id}`;
        actions.push(database.get('competitor_observations').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.brand_name = r.brandName;
          rec._raw.product_name = r.productName ?? null;
          rec._raw.category = r.category ?? null;
          rec._raw.price = nullableNum(r.price);
          rec._raw.selling_price = nullableNum(r.sellingPrice);
          rec._raw.uom = r.uom ?? null;
          rec._raw.image_path = r.imagePath ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.observed_on = r.observedOn ? new Date(r.observedOn).getTime() : 0;
          rec._raw.notes = r.notes ?? null;
          rec._raw.is_synced = true;
        }));
      }

      // ---- product_samplings -------------------------------------------------
      for (const r of data.product_samplings ?? []) {
        const localId: string = r.appTrxId ?? `psamp_${r.id}`;
        actions.push(database.get('product_samplings').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.item_code = r.itemCode;
          rec._raw.item_name = r.itemName ?? null;
          rec._raw.quantity_sampled = num(r.quantitySampled);
          rec._raw.uom = r.uom ?? 'EA';
          rec._raw.consumer_feedback = r.consumerFeedback ?? null;
          rec._raw.selling_price = nullableNum(r.sellingPrice);
          rec._raw.units_sold = nullableNum(r.unitsSold);
          rec._raw.customers_approached = nullableNum(r.customersApproached);
          rec._raw.sampled_on = r.sampledOn ? new Date(r.sampledOn).getTime() : 0;
          rec._raw.photo_path = r.photoPath ?? null;
          rec._raw.geo_lat = nullableNum(r.geoLat);
          rec._raw.geo_lng = nullableNum(r.geoLng);
          rec._raw.is_synced = true;
        }));
      }

      // ---- initiative_executions (Broadcast Initiative) ----------------------
      for (const r of data.initiative_executions ?? []) {
        const localId: string = r.appTrxId ?? `ie_${r.id}`;
        actions.push(database.get('initiative_executions').prepareCreate((rec: any) => {
          rec._raw.id = localId;
          rec._raw.app_trx_id = localId;
          // Backend initiativeId is an integer; the mobile column is a string.
          rec._raw.initiative_id = r.initiativeId != null ? String(r.initiativeId) : '';
          rec._raw.user_code = r.userCode;
          rec._raw.customer_code = r.customerCode;
          rec._raw.visit_code = r.visitCode ?? null;
          rec._raw.executed_on = r.executedOn ? new Date(r.executedOn).getTime() : 0;
          rec._raw.notes = r.notes ?? null;
          rec._raw.photo_path = r.photoPath ?? null;
          rec._raw.status = r.status ?? 'completed';
          rec._raw.is_synced = true;
        }));
      }

      if (actions.length > 0) {
        await database.batch(...actions);
      }
    });

    // Seed AsyncStorage day_started flag from the dayStatus we already
    // fetched at the top of this function. Mirrors prefetchDayStatus's
    // write so the Dashboard's FAST PATH (which needs BOTH the
    // attendance row AND day_started_<today>='true' to render "Continue")
    // gets a consistent state right after reinstall + login, even if
    // prefetchDayStatus's parallel 5 s timeout lost the race. Without
    // this the rep saw "Start Day" for 1-2 s after install while
    // loadDayStatus's server reconcile caught up.
    try {
      // Mirror prefetchDayStatus EXACTLY: a day is only "in progress" when it
      // is NOT already ended. Without the dayEnded guard this seeded
      // day_started='true' for a rep whose day was already ended (today's EOT
      // exists) on a fresh install / re-login — the Dashboard fast-path then
      // painted "Continue" for a frame until the server reconcile (todayHasEot)
      // cleared it back to "Start Day": a Continue→Start Day flicker.
      const dayInProgress =
        dayStatus?.dayEnded !== true &&
        (dayStatus?.dayStarted === true || !!dayStatus?.openDayDate);
      if (dayInProgress) {
        await AsyncStorage.setItem(`day_started_${todayStr}`, 'true');
        const startTimeIso = (dayStatus?.dayStarted === true ? dayStatus.startTime : dayStatus.openDayStartTime) ?? null;
        if (startTimeIso) {
          await AsyncStorage.setItem(`day_start_timestamp_${todayStr}`, String(startTimeIso));
        }
      }
    } catch { /* best-effort — loadDayStatus will reconcile on first focus */ }

    console.log('[RestoreMyDay] hydrated successfully');
    DeviceEventEmitter.emit(RESTORE_MY_DAY_DONE_EVENT);
  } catch (e: any) {
    console.warn('[RestoreMyDay] write failed:', e?.message);
    // Still emit so listeners don't wait forever — they'll just find an
    // empty DB and render the no-data state. Better than a permanent spinner.
    DeviceEventEmitter.emit(RESTORE_MY_DAY_DONE_EVENT);
  }
}
