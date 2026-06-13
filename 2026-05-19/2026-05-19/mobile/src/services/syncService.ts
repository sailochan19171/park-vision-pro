import { Q } from '@nozbe/watermelondb';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as generateUuidV4 } from 'uuid';
import api from '../api/client';
import database from '../db/database';
import { backupMasterData, checkAndRestoreMasterData } from './masterDataBackup';

// Helper to safely set raw fields and mark them as changed so they sync to local DB
function setRawField(rec: any, key: string, value: any) {
  rec._setRaw(key, value);
  rec._changedFields = rec._changedFields || {};
  rec._changedFields[key] = true;
}

// ===== PHOTO UPLOAD (file:// URI → server URL) =====

/**
 * Uploads a local photo file to the server and returns the server-relative URL.
 * If the path is already a server URL (starts with /public/), returns it as-is.
 * If upload fails, returns null (non-blocking — sync still proceeds without photo).
 */
export async function uploadPhoto(localUri: string, category: string): Promise<string | null> {
  if (!localUri) return null;
  // Already a server URL from a previous upload
  if (localUri.startsWith('/public/') || localUri.startsWith('http')) return localUri;

  try {
    const uri = Platform.OS === 'android' ? localUri : localUri.replace('file://', '');
    const filename = localUri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      name: filename,
      type: mimeType,
    } as any);

    const response = await api.post(`/uploads/photo?category=${category}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 60 s budget for photo uploads: field reps on 2G/3G regularly hit
      // the previous 30 s limit with full-res captures (3-8 MB), causing
      // the "OSOI_photos: 2 failed" Upload Partial alert even when the
      // device was nominally online.
      timeout: 60_000,
    });

    const serverUrl = response.data?.url;
    console.log(`[Sync] Photo uploaded: ${category} → ${serverUrl}`);
    return serverUrl || null;
  } catch (err: any) {
    console.warn(`[Sync] Photo upload failed (${category}):`, err?.message);
    return null;
  }
}

function isServerPhotoPath(value: string | null | undefined): boolean {
  return typeof value === 'string' && (value.startsWith('/public/') || value.startsWith('http'));
}

async function resolvePhotoField(
  rawValue: string | null | undefined,
  category: string,
  separator?: string,
): Promise<{ value?: string; hasPendingLocalImage: boolean }> {
  if (!rawValue) return { value: undefined, hasPendingLocalImage: false };

  if (!separator) {
    if (isServerPhotoPath(rawValue)) {
      return { value: rawValue, hasPendingLocalImage: false };
    }
    const uploaded = await uploadPhoto(rawValue, category);
    return {
      value: uploaded ?? undefined,
      hasPendingLocalImage: !uploaded,
    };
  }

  const parts = rawValue
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { value: undefined, hasPendingLocalImage: false };

  const resolvedParts: string[] = [];
  let hasPendingLocalImage = false;

  for (const part of parts) {
    if (isServerPhotoPath(part)) {
      resolvedParts.push(part);
      continue;
    }
    const uploaded = await uploadPhoto(part, category);
    if (uploaded) resolvedParts.push(uploaded);
    else hasPendingLocalImage = true;
  }

  return {
    value: resolvedParts.length > 0 ? resolvedParts.join(separator) : undefined,
    hasPendingLocalImage,
  };
}

// ===== RETRY LOGIC (Exponential Backoff) =====

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 2000,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRetryable =
        err?.message === 'Network Error' ||
        err?.code === 'ERR_NETWORK' ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.response?.status === 502 ||
        err?.response?.status === 503 ||
        err?.response?.status === 504 ||
        err?.response?.status === 408 ||
        !err?.response;

      if (!isRetryable || attempt === maxRetries) throw err;

      const jitter = (Math.random() * 0.6 - 0.3) * baseDelay;
      const delay = baseDelay * Math.pow(2, attempt) + jitter;
      console.log(`[Sync] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function syncPush(payload: any): Promise<any> {
  const response = await withRetry(
    () => api.post('/sync/push', payload, { timeout: 20_000 }),
    2,
    1000,
  );
  return response.data;
}

// ===== CHUNKED PUSH (split large arrays into smaller batches) =====

const PUSH_CHUNK_SIZE = 50; // max records per API call — larger chunks = fewer network calls

async function pushEntityInChunks<T>(
  entityName: string,
  records: T[],
  buildPayload: (chunk: T[]) => any,
  onChunkDone?: (done: number, total: number) => void,
): Promise<{ items: any[] }> {
  const allItems: any[] = [];

  for (let i = 0; i < records.length; i += PUSH_CHUNK_SIZE) {
    const chunk = records.slice(i, i + PUSH_CHUNK_SIZE);
    try {
      const data = await syncPush(buildPayload(chunk));
      const entityResult = data.results?.[entityName];
      if (entityResult?.items) {
        allItems.push(...entityResult.items);
      }
    } catch (err: any) {
      console.error(`[Sync] ${entityName} chunk ${i}-${i + chunk.length} failed:`, err?.message);
      // Mark these as failed but continue with next chunk
      for (const _ of chunk) {
        allItems.push({ status: 'failed', error: err?.message });
      }
    }
    onChunkDone?.(Math.min(i + PUSH_CHUNK_SIZE, records.length), records.length);
  }

  return { items: allItems };
}

// ===== PULL SYNC (Server → Mobile) =====

interface PullOptions {
  modules: string[];
  cursors?: Record<string, string | null>;
  limit?: number;
  userCode?: string;
  routeCode?: string;
  // Skip the force check-in/out flag refresh (a ~1000-customer fetch) at the
  // end of this pull. Used by multi-page drains so the heavy flag fetch runs
  // once after the whole drain, not on every page.
  skipForceFlags?: boolean;
}

interface PullResult {
  moduleName: string;
  created: number;
  updated: number;
  deleted: number;
  // Total rows actually written to local DB (created + updated upserts).
  // Use this for progress display instead of just `created`.
  totalSynced: number;
  cursor: string | null;
  hasMore: boolean;
}

async function getCursors(): Promise<Record<string, string | null>> {
  const metas: any[] = await database
    .get('sync_meta')
    .query()
    .fetch();
  const cursors: Record<string, string | null> = {};
  for (const m of metas) {
    cursors[m.moduleName] = m.lastCursor;
  }
  return cursors;
}

async function saveCursor(moduleName: string, cursor: string): Promise<void> {
  await database.write(async () => {
    const existing: any[] = await database
      .get('sync_meta')
      .query(Q.where('module_name', moduleName))
      .fetch();

    if (existing.length > 0) {
      await existing[0].update((rec: any) => {
        rec.lastCursor = cursor;
        rec.lastSyncedAt = Date.now();
      });
    } else {
      await database.get('sync_meta').create((rec: any) => {
        rec._raw.id = `sync_${moduleName}`;
        rec.moduleName = moduleName;
        rec.lastCursor = cursor;
        rec.lastSyncedAt = Date.now();
      });
    }
  });
}

/**
 * Hard-reset the saved cursor(s) for one or more sync modules so the
 * next pullSync pulls every active row from scratch (cursor → null →
 * backend serves `WHERE is_active = true` instead of the incremental
 * `updated_at > cursor` window). Used by Settings → Sync Data to make
 * the manual button a guaranteed full refresh — protects against a
 * stuck cursor, a missed trigger fire, or any other reason the
 * incremental delta on a tick missed a row.
 *
 * Notes:
 *  - Only the cursor row in `sync_meta` is destroyed; existing data
 *    rows in the prices/customers/etc. tables stay put and get
 *    upserted in place by the subsequent pull.
 *  - Cheap on the wire: backend paginates the full set (limit 1000)
 *    and stops as soon as a page comes back smaller than the limit.
 *  - Safe to call repeatedly; missing rows are a no-op.
 */
export async function resetCursors(moduleNames: string[]): Promise<void> {
  if (moduleNames.length === 0) return;
  await database.write(async () => {
    const existing: any[] = await database
      .get('sync_meta')
      .query(Q.where('module_name', Q.oneOf(moduleNames)))
      .fetch();
    for (const rec of existing) {
      await rec.destroyPermanently();
    }
  });
}

// Dedupe a batch by a key (last wins) so two source rows that map to the same
// WatermelonDB record id can't queue create+update in one database.batch(),
// which throws "Cannot update a record with pending changes" and aborts the
// whole batch. Migrated master data has duplicate rows in several tables, so
// every id-keyed upsert must guard against this.
function dedupeBy<T>(rows: T[], keyFn: (row: T) => unknown): T[] {
  const m = new Map<unknown, T>();
  for (const r of rows) m.set(keyFn(r), r);
  return [...m.values()];
}

async function upsertCustomers(rows: any[]): Promise<number> {
  let count = 0;
  const BATCH = 500;
  console.log(`[Sync] upsertCustomers starting with ${rows.length} rows`);
  
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    console.log(`[Sync] Processing batch ${Math.floor(start/BATCH) + 1}/${Math.ceil(rows.length/BATCH)} with ${batch.length} customers`);
    
    try {
      const validBatch = dedupeBy(batch.filter(c => c && c.code), c => c.code);
      const codes = validBatch.map(c => c.code);

      const existingRecords: any[] = await database
        .get('customers')
        .query(Q.where('code', Q.oneOf(codes)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.code, r]));
      
      const actions: any[] = [];
      const customersCollection = database.get('customers');
      // Collect force_checkin/force_checkout flag pairs to write in ONE
      // AsyncStorage.multiSet call at the end. The previous code issued
      // two AsyncStorage.setItem calls per customer (then Promise.all'd
      // them), but AsyncStorage's native bridge serialises writes per
      // key — for 2000 customers that's 4000 individual round-trips
      // (~10-20 s on a Galaxy M32). multiSet collapses all of them
      // into a single batched native call (~200-500 ms).
      const kvPairs: [string, string][] = [];

      for (const c of validBatch) {
        const existing = existingMap.get(c.code);
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            setRawField(rec, 'name', c.name || '');
            setRawField(rec, 'address', c.address ?? null);
            setRawField(rec, 'city_code', c.cityCode ?? null);
            setRawField(rec, 'region_code', c.regionCode ?? null);
            setRawField(rec, 'channel_code', c.channelCode ?? null);
            setRawField(rec, 'customer_group', c.customerGroup ?? null);
            setRawField(rec, 'price_list', c.priceList ?? null);
            setRawField(rec, 'latitude', c.latitude ?? null);
            setRawField(rec, 'longitude', c.longitude ?? null);
            setRawField(rec, 'is_active', c.isActive !== false && c.status !== 'blocked' && c.status !== 'deactivated');
            setRawField(rec, 'status', c.status ?? 'active');
            setRawField(rec, 'server_updated_at', Date.now());
          }));
        } else {
          actions.push(customersCollection.prepareCreate((rec: any) => {
            rec._raw.id = `cust_${c.code}`;
            rec._raw.server_id = c.id?.toString() ?? '';
            rec._raw.code = c.code;
            rec._raw.name = c.name || '';
            rec._raw.address = c.address ?? null;
            rec._raw.city_code = c.cityCode ?? null;
            rec._raw.region_code = c.regionCode ?? null;
            rec._raw.channel_code = c.channelCode ?? null;
            rec._raw.customer_group = c.customerGroup ?? null;
            rec._raw.price_list = c.priceList ?? null;
            rec._raw.latitude = c.latitude ?? null;
            rec._raw.longitude = c.longitude ?? null;
            rec._raw.is_active = c.isActive !== false && c.status !== 'blocked' && c.status !== 'deactivated';
            rec._raw.status = c.status ?? 'active';
            rec._raw.server_updated_at = Date.now();
          }));
        }

        kvPairs.push([`force_checkin_${c.code}`, String(c.forceCheckinEnabled ?? true)]);
        kvPairs.push([`force_checkout_${c.code}`, String(c.forceCheckoutEnabled ?? true)]);
        count++;
      }

      // DB writes and AsyncStorage writes are independent — run them
      // in parallel rather than sequentially so the AsyncStorage time
      // overlaps with the WatermelonDB transaction.
      await Promise.all([
        database.write(async () => { await database.batch(...actions); }),
        kvPairs.length > 0 ? AsyncStorage.multiSet(kvPairs) : Promise.resolve(),
      ]);
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error:', batchErr?.message || batchErr);
    }
  }
  console.log('[Sync] upsertCustomers total:', count);
  return count;
}

// Fetch force check-in/out flags for ALL customers and store in AsyncStorage
// This runs after every sync to ensure flags are always up-to-date
export async function syncForceFlags(): Promise<void> {
  try {
    const allCustomers: any[] = await database.get('customers').query().fetch();
    const codes = allCustomers.map((c: any) => c.code);
    // Fetch flags from server — wrapped in withRetry for flaky 2G networks.
    const { data } = await withRetry(() =>
      api.get('/customers', { params: { pageSize: 1000, fields: 'code,forceCheckinEnabled,forceCheckoutEnabled' } })
    );
    const customers = data?.data ?? data?.customers ?? (Array.isArray(data) ? data : []);
    // Batch all force-flag writes into a single AsyncStorage.multiSet
    // call. Previously each customer triggered two sequential
    // AsyncStorage.setItem calls (~10 s for 1000 customers on a slow
    // Android device); multiSet collapses them into one native batch.
    const kvPairs: [string, string][] = [];
    for (const c of customers) {
      const code = c.code ?? c.customerCode;
      if (!code) continue;
      kvPairs.push([`force_checkin_${code}`, String(c.forceCheckinEnabled ?? c.force_checkin_enabled ?? true)]);
      kvPairs.push([`force_checkout_${code}`, String(c.forceCheckoutEnabled ?? c.force_checkout_enabled ?? true)]);
    }
    if (kvPairs.length > 0) {
      await AsyncStorage.multiSet(kvPairs);
    }
    console.log(`[Sync] Force flags updated for ${customers.length} customers`);
  } catch (err: any) {
    console.warn('[Sync] Force flags sync failed:', err?.message);
  }
}

// Fetch customer targets and store in AsyncStorage for offline use
export async function syncCustomerTargets(): Promise<void> {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const { data } = await withRetry(() =>
      api.get('/customer-targets', { params: { month, year, pageSize: 1000 } })
    );
    const targets = data?.data ?? (Array.isArray(data) ? data : []);
    for (const t of targets) {
      const code = t.customerCode ?? t.customer_code;
      if (!code) continue;
      await AsyncStorage.setItem(`target_${code}_${month}_${year}`, JSON.stringify({
        targetAmount: t.targetAmount ?? t.target_amount ?? 0,
        targetQuantity: t.targetQuantity ?? t.target_quantity ?? 0,
        achievedAmount: t.achievedAmount ?? t.achieved_amount ?? 0,
      }));
    }
    console.log(`[Sync] Customer targets updated for ${targets.length} customers`);
  } catch (err: any) {
    console.warn('[Sync] Customer targets sync failed:', err?.message);
  }
}

async function upsertItems(rows: any[]): Promise<number> {
  let count = 0;
  const BATCH = 500;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      const validBatch = dedupeBy(batch.filter(i => i && i.code), i => i.code);
      const codes = validBatch.map(i => i.code);
      
      const existingRecords: any[] = await database
        .get('items')
        .query(Q.where('code', Q.oneOf(codes)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.code, r]));
      
      const actions: any[] = [];
      const itemsCollection = database.get('items');
      
      for (const item of validBatch) {
        const existing = existingMap.get(item.code);
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            setRawField(rec, 'name', item.name);
            setRawField(rec, 'brand', item.brand ?? null);
            setRawField(rec, 'category', item.category ?? null);
            setRawField(rec, 'division', item.division ?? null);
            setRawField(rec, 'base_uom', item.baseUom ?? 'EA');
            setRawField(rec, 'tax_key', item.taxKey ?? null);
            setRawField(rec, 'image_path', item.imagePath ?? null);
            setRawField(rec, 'is_active', item.isActive !== false && item.status !== 'deactivated');
            setRawField(rec, 'status', item.status ?? 'active');
            setRawField(rec, 'description', item.description ?? null);
            setRawField(rec, 'size', item.size ?? null);
            setRawField(rec, 'color', item.color ?? null);
            setRawField(rec, 'flavor', item.flavor ?? null);
            setRawField(rec, 'pack_type', item.packType ?? null);
            setRawField(rec, 'units_per_case', item.unitsPerCase ?? null);
            setRawField(rec, 'weight', item.weight ?? null);
            setRawField(rec, 'volume', item.volume ?? null);
            setRawField(rec, 'shelf_life_days', item.shelfLifeDays ?? null);
            setRawField(rec, 'storage_type', item.storageType ?? null);
            setRawField(rec, 'server_updated_at', Date.now());
          }));
        } else {
          actions.push(itemsCollection.prepareCreate((rec: any) => {
            rec._raw.id = `item_${item.code}`;
            rec._raw.server_id = item.id?.toString() ?? '';
            rec._raw.code = item.code;
            rec._raw.name = item.name;
            rec._raw.brand = item.brand ?? null;
            rec._raw.category = item.category ?? null;
            rec._raw.division = item.division ?? null;
            rec._raw.base_uom = item.baseUom ?? 'EA';
            rec._raw.tax_key = item.taxKey ?? null;
            rec._raw.image_path = item.imagePath ?? null;
            rec._raw.is_active = item.isActive !== false && item.status !== 'deactivated';
            rec._raw.status = item.status ?? 'active';
            rec._raw.description = item.description ?? null;
            rec._raw.size = item.size ?? null;
            rec._raw.color = item.color ?? null;
            rec._raw.flavor = item.flavor ?? null;
            rec._raw.pack_type = item.packType ?? null;
            rec._raw.units_per_case = item.unitsPerCase ?? null;
            rec._raw.weight = item.weight ?? null;
            rec._raw.volume = item.volume ?? null;
            rec._raw.shelf_life_days = item.shelfLifeDays ?? null;
            rec._raw.storage_type = item.storageType ?? null;
            rec._raw.server_updated_at = Date.now();
          }));
        }
        count++;
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertItems:', batchErr?.message || batchErr);
    }
  }
  console.log('[Sync] upsertItems total:', count);
  return count;
}

async function upsertPrices(rows: any[]): Promise<number> {
  let count = 0;
  const BATCH = 500;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      const rawValid = batch.filter(p => p && p.itemCode && p.priceList);
      // Dedupe within the batch by (itemCode, priceList, regionCode) — last wins.
      // Two rows that collapse to the same record id (e.g. duplicate base rows)
      // would otherwise queue create+update on one record and throw
      // "Cannot update a record with pending changes", aborting the whole batch.
      const byKey = new Map<string, any>();
      for (const p of rawValid) {
        byKey.set(`${p.itemCode}_${p.priceList}_${p.regionCode ?? 'BASE'}`, p);
      }
      const validBatch = [...byKey.values()];

      const validIds = validBatch.map(p => `price_${p.itemCode}_${p.priceList}_${p.regionCode ?? 'BASE'}`);

      const existingRecords: any[] = await database
        .get('prices')
        .query(Q.where('id', Q.oneOf(validIds)))
        .fetch();

      const existingMap = new Map(existingRecords.map(r => [`${r._raw.item_code}_${r._raw.price_list}_${r._raw.region_code ?? 'BASE'}`, r]));

      const actions: any[] = [];
      const pricesCollection = database.get('prices');

      for (const p of validBatch) {
        const key = `${p.itemCode}_${p.priceList}_${p.regionCode ?? 'BASE'}`;
        const id = `price_${key}`;
        const existing = existingMap.get(key);

        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            setRawField(rec, 'region_code', p.regionCode ?? null);
            setRawField(rec, 'price', p.price);
            setRawField(rec, 'mrp', p.mrp ?? null);
            setRawField(rec, 'set_price', p.setPrice ?? null);
            setRawField(rec, 'currency_code', p.currencyCode ?? 'INR');
            setRawField(rec, 'is_active', p.isActive !== false && p.status !== 'deactivated');
            setRawField(rec, 'status', p.status ?? 'active');
            setRawField(rec, 'valid_from', p.validFrom ?? null);
            setRawField(rec, 'valid_to', p.validTo ?? null);
            setRawField(rec, 'min_quantity', p.minQuantity ?? null);
            setRawField(rec, 'max_quantity', p.maxQuantity ?? null);
            setRawField(rec, 'discount_percentage', p.discountPercentage ?? null);
            setRawField(rec, 'promotional_price', p.promotionalPrice ?? null);
            setRawField(rec, 'server_updated_at', Date.now());
          }));
        } else {
          actions.push(pricesCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec._raw.server_id = p.id ?? 0;
            rec._raw.item_code = p.itemCode;
            rec._raw.price_list = p.priceList;
            rec._raw.region_code = p.regionCode ?? null;
            rec._raw.price = p.price;
            rec._raw.mrp = p.mrp ?? null;
            rec._raw.set_price = p.setPrice ?? null;
            rec._raw.currency_code = p.currencyCode ?? 'INR';
            rec._raw.is_active = p.isActive !== false && p.status !== 'deactivated';
            rec._raw.status = p.status ?? 'active';
            rec._raw.valid_from = p.validFrom ?? null;
            rec._raw.valid_to = p.validTo ?? null;
            rec._raw.min_quantity = p.minQuantity ?? null;
            rec._raw.max_quantity = p.maxQuantity ?? null;
            rec._raw.discount_percentage = p.discountPercentage ?? null;
            rec._raw.promotional_price = p.promotionalPrice ?? null;
            rec._raw.server_updated_at = Date.now();
          }));
        }
        count++;
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertPrices:', batchErr?.message || batchErr);
    }
  }
  return count;
}

async function upsertJourneyPlanCustomers(rows: any[], routeCode: string): Promise<number> {
  let count = 0;

  // Process in small batches to avoid transaction size issues
  const BATCH = 200;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      await database.write(async () => {
        for (const jpc of batch) {
          const day = jpc.visitDay || '';
          const code = jpc.customerCode;
          if (!code) continue;
          const actualRoute = jpc.routeCode ?? routeCode;
          const id = `jpc_${jpc.id ?? code}_${day}_${actualRoute}`;

          try {
            const existing: any[] = await database
              .get('journey_plan_customers')
              .query(
                Q.where('customer_code', code),
                Q.where('route_code', actualRoute),
                Q.where('visit_day', day),
              )
              .fetch();

            if (existing.length > 0) {
              await existing[0].update((rec: any) => {
                rec.visitSequence = jpc.visitSequence ?? 0;
                rec.frequency = jpc.frequency ?? null;
              });
            } else {
              await database.get('journey_plan_customers').create((rec: any) => {
                rec._raw.id = id;
                rec.customerCode = code;
                rec.routeCode = actualRoute;
                rec.visitDay = day;
                rec.visitSequence = jpc.visitSequence ?? 0;
                rec.frequency = jpc.frequency ?? null;
              });
            }
            count++;
          } catch (innerErr: any) {
            console.warn('[Sync] JPC upsert skip:', code, day, innerErr?.message);
          }
        }
      });
    } catch (batchErr: any) {
      console.error('[Sync] JPC batch failed:', batchErr?.message);
    }
  }

  return count;
}

async function upsertCompetitorBrands(rows: any[]): Promise<number> {
  let count = 0;
  const BATCH = 500;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      // Dedupe by server id (last wins) so duplicate rows can't collapse onto
      // one record id (cb_<id>) and crash the batch — see dedupeBy().
      const validBatch = dedupeBy(batch.filter(cb => cb && cb.id), cb => cb.id);
      const serverIds = validBatch.map(cb => cb.id);

      const existingRecords: any[] = await database
        .get('competitor_brands')
        .query(Q.where('server_id', Q.oneOf(serverIds)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.server_id, r]));
      
      const actions: any[] = [];
      const cbCollection = database.get('competitor_brands');
      
      for (const cb of validBatch) {
        const id = `cb_${cb.id}`;
        const existing = existingMap.get(cb.id);
        
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            setRawField(rec, 'brand_name', cb.brandName);
            setRawField(rec, 'company', cb.company ?? null);
            setRawField(rec, 'category_code', cb.categoryCode ?? null);
            setRawField(rec, 'category_name', cb.categoryName ?? null);
            setRawField(rec, 'competitor_brand_code', cb.competitorBrandCode ?? null);
            setRawField(rec, 'competitor_brand_name', cb.competitorBrandName ?? null);
          }));
        } else {
          actions.push(cbCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec._raw.server_id = cb.id ?? 0;
            rec._raw.brand_code = cb.brandCode;
            rec._raw.brand_name = cb.brandName;
            rec._raw.company = cb.company ?? null;
            rec._raw.category_code = cb.categoryCode ?? null;
            rec._raw.category_name = cb.categoryName ?? null;
            rec._raw.competitor_brand_code = cb.competitorBrandCode ?? null;
            rec._raw.competitor_brand_name = cb.competitorBrandName ?? null;
          }));
        }
        count++;
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertCompetitorBrands:', batchErr?.message || batchErr);
    }
  }
  return count;
}

async function upsertPlanogramSetups(rows: any[]): Promise<number> {
  let count = 0;
  const BATCH = 500;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      const validBatch = dedupeBy(batch.filter(ps => ps && ps.id), ps => ps.id);
      const serverIds = validBatch.map(ps => ps.id);
      
      const existingRecords: any[] = await database
        .get('planogram_setups')
        .query(Q.where('server_id', Q.oneOf(serverIds)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.server_id, r]));
      
      const actions: any[] = [];
      const psCollection = database.get('planogram_setups');
      
      for (const ps of validBatch) {
        const id = `ps_${ps.id}`;
        const existing = existingMap.get(ps.id);
        
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            rec.selectionType = ps.selectionType;
            rec.selectionValue = ps.selectionValue;
            rec.categoryCode = ps.categoryCode;
            rec.categoryName = ps.categoryName ?? null;
            setRawField(rec, 'asset_type', ps.assetType ?? null);
            rec.shareOfShelfCm = ps.shareOfShelfCm ?? 0;
            rec.suggestedImage = ps.suggestedImage ?? null;
            rec.instructions = ps.instructions ?? null;
            rec.isActive = ps.isActive !== false;
            rec.serverUpdatedAt = ps.serverUpdatedAt ?? Date.now();
          }));
        } else {
          actions.push(psCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec.serverId = ps.id;
            rec.selectionType = ps.selectionType;
            rec.selectionValue = ps.selectionValue;
            rec.categoryCode = ps.categoryCode;
            rec.categoryName = ps.categoryName ?? null;
            rec._raw.asset_type = ps.assetType ?? null;
            rec.shareOfShelfCm = ps.shareOfShelfCm ?? 0;
            rec.suggestedImage = ps.suggestedImage ?? null;
            rec.instructions = ps.instructions ?? null;
            rec.isActive = ps.isActive !== false;
            rec.serverUpdatedAt = ps.serverUpdatedAt ?? Date.now();
          }));
        }
        count++;
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertPlanogramSetups:', batchErr?.message || batchErr);
    }
  }
  return count;
}

async function upsertInitiatives(records: any[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const BATCH = 500;
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH);
    try {
      const validBatch = dedupeBy(batch.filter(r => r && r.serverId), r => r.serverId);
      const serverIds = validBatch.map(r => r.serverId);

      const existingRecords: any[] = await database
        .get('initiatives')
        .query(Q.where('server_id', Q.oneOf(serverIds)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.server_id, r]));
      
      const actions: any[] = [];
      const initCollection = database.get('initiatives');
      
      for (const r of validBatch) {
        const id = `init_${r.serverId}`;
        const existing = existingMap.get(r.serverId);
        
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.initiativeType = r.initiativeType ?? 'general';
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.targetChannel = r.targetChannel ?? null;
            rec.isActive = r.isActive;
            rec.imagePath = r.imagePath ?? null;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          updated++;
        } else {
          actions.push(initCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec.serverId = r.serverId;
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.initiativeType = r.initiativeType ?? 'general';
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.targetChannel = r.targetChannel ?? null;
            rec.isActive = r.isActive;
            rec.imagePath = r.imagePath ?? null;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          created++;
        }
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertInitiatives:', batchErr?.message || batchErr);
    }
  }
  return { created, updated };
}

async function upsertSurveys(records: any[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const BATCH = 500;
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH);
    try {
      const validBatch = dedupeBy(batch.filter(r => r && r.serverId), r => r.serverId);
      const serverIds = validBatch.map(r => r.serverId);

      const existingRecords: any[] = await database
        .get('surveys')
        .query(Q.where('server_id', Q.oneOf(serverIds)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.server_id, r]));
      
      const actions: any[] = [];
      const surveysCollection = database.get('surveys');
      
      for (const r of validBatch) {
        const id = `survey_${r.serverId}`;
        const existing = existingMap.get(r.serverId);
        
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.targetChannel = r.targetChannel ?? null;
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.isActive = r.isActive;
            rec.questionsJson = r.questionsJson;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          updated++;
        } else {
          actions.push(surveysCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec.serverId = r.serverId;
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.targetChannel = r.targetChannel ?? null;
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.isActive = r.isActive;
            rec.questionsJson = r.questionsJson;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          created++;
        }
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertSurveys:', batchErr?.message || batchErr);
    }
  }
  return { created, updated };
}

async function upsertPermanentDisplays(records: any[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  const BATCH = 500;
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH);
    try {
      const validBatch = dedupeBy(batch.filter(r => r && r.serverId), r => r.serverId);
      const serverIds = validBatch.map(r => r.serverId);

      const existingRecords: any[] = await database
        .get('permanent_displays')
        .query(Q.where('server_id', Q.oneOf(serverIds)))
        .fetch();
        
      const existingMap = new Map(existingRecords.map(r => [r._raw.server_id, r]));
      
      const actions: any[] = [];
      const pdCollection = database.get('permanent_displays');
      
      for (const r of validBatch) {
        const id = `pd_${r.serverId}`;
        const existing = existingMap.get(r.serverId);
        
        if (existing) {
          actions.push(existing.prepareUpdate((rec: any) => {
            rec.customerCode = r.customerCode;
            rec.displayType = r.displayType;
            rec.locationDescription = r.locationDescription ?? null;
            rec.standardImagePath = r.standardImagePath ?? null;
            rec.isActive = r.isActive;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          updated++;
        } else {
          actions.push(pdCollection.prepareCreate((rec: any) => {
            rec._raw.id = id;
            rec.serverId = r.serverId;
            rec.customerCode = r.customerCode;
            rec.displayType = r.displayType;
            rec.locationDescription = r.locationDescription ?? null;
            rec.standardImagePath = r.standardImagePath ?? null;
            rec.isActive = r.isActive;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          }));
          created++;
        }
      }
      
      await database.write(async () => {
        await database.batch(...actions);
      });
      
    } catch (batchErr: any) {
      console.error('[Sync] Batch write error in upsertPermanentDisplays:', batchErr?.message || batchErr);
    }
  }
  return { created, updated };
}

async function upsertAppSettings(records: any[]): Promise<number> {
  let count = 0;
  const deduped = dedupeBy(records.filter(r => r && r.key), r => r.key);
  await database.write(async () => {
    for (const r of deduped) {
      const existing: any[] = await database
        .get('app_settings')
        .query(Q.where('key', r.key))
        .fetch();
      if (existing.length > 0) {
        await existing[0].update((rec: any) => {
          rec.value = r.value;
        });
      } else {
        await database.get('app_settings').create((rec: any) => {
          rec._raw.id = `setting_${r.key}`;
          rec.serverId = r.serverId ?? r.server_id ?? '';
          rec.key = r.key;
          rec.value = r.value;
        });
      }
      count++;
    }
  });
  return count;
}

export interface SyncProgress {
  module: string;
  status: 'pending' | 'syncing' | 'done' | 'error';
  count: number;
  error?: string;
}

export type ProgressCallback = (progress: SyncProgress[]) => void;

export async function pullSync(
  options: PullOptions,
  onProgress?: ProgressCallback,
): Promise<PullResult[]> {
  const { modules, limit = 500, routeCode, skipForceFlags = false } = options;
  const cursors = options.cursors ?? await getCursors();

  const progress: SyncProgress[] = modules.map((m) => ({
    module: m,
    status: 'pending' as const,
    count: 0,
  }));

  const results: PullResult[] = new Array(modules.length);

  // Run every module pull IN PARALLEL. Previously this loop awaited each
  // module's network round-trip before starting the next — with 10 modules
  // and a slow mobile connection that added up to 30-60 s wall-clock for
  // the Settings → Sync button. The modules write to independent tables
  // and have independent cursors, so concurrent execution is safe.
  await Promise.allSettled(modules.map(async (mod, i) => {
    progress[i].status = 'syncing';
    onProgress?.(progress);

    try {
      const moduleCursor = cursors[mod] ?? null;
      // 2 retries (not the default 5) + 20 s per-call timeout keeps
      // the manual Sync button from blocking for over a minute per
      // slow module on flaky networks. Worst case per module is now
      // ~3 attempts × 20 s = 60 s upper bound, but typical case is
      // a few seconds. The user can just tap Sync again — losing a
      // module to one bad tick is way better than the spinner being
      // stuck for several minutes.
      const response = await withRetry(
        () => api.post('/sync/pull', {
          modules: [mod],
          cursors: { [mod]: moduleCursor },
          limit,
        }, { timeout: 20_000 }),
        2,
        1000,
      );
      const data = response.data;

      const changes = data.changes?.[mod];
      const created = changes?.created ?? [];
      const updated = changes?.updated ?? [];
      const allRows = [...created, ...updated];
      const newCursor = data.cursors?.[mod] ?? null;
      const hasMore = data.hasMore?.[mod] ?? false;

      let count = 0;
      switch (mod) {
        case 'customers':
          count = await upsertCustomers(allRows);
          break;
        case 'items':
          count = await upsertItems(allRows);
          break;
        case 'prices':
          count = await upsertPrices(allRows);
          break;
        case 'journey_plan_customers':
          count = await upsertJourneyPlanCustomers(allRows, routeCode ?? '');
          break;
        case 'competitor_brands':
          count = await upsertCompetitorBrands(allRows);
          break;
        case 'initiatives':
          await upsertInitiatives(allRows);
          count = allRows.length;
          break;
        case 'surveys':
          await upsertSurveys(allRows);
          count = allRows.length;
          break;
        case 'permanent_displays':
          await upsertPermanentDisplays(allRows);
          count = allRows.length;
          break;
        case 'planogram_setups':
          count = await upsertPlanogramSetups(allRows);
          break;
        case 'app_settings':
          count = await upsertAppSettings(allRows);
          break;
        default:
          count = allRows.length;
      }

      if (newCursor) {
        await saveCursor(mod, newCursor);
      }

      progress[i].status = 'done';
      progress[i].count = count;
      onProgress?.(progress);

      results[i] = {
        moduleName: mod,
        created: created.length,
        updated: updated.length,
        deleted: (changes?.deleted ?? []).length,
        totalSynced: count,
        cursor: newCursor,
        hasMore,
      };
    } catch (err: any) {
      progress[i].status = 'error';
      progress[i].error = err?.message ?? 'Unknown error';
      onProgress?.(progress);

      results[i] = {
        moduleName: mod,
        created: 0,
        updated: 0,
        deleted: 0,
        totalSynced: 0,
        cursor: null,
        hasMore: false,
      };
    }
  }));

  // Refresh force check-in/out flags after pull — unless the caller is
  // draining multiple pages and will run it once at the end (skipForceFlags).
  if (!skipForceFlags) {
    await syncForceFlags();
  }

  return results;
}

// ===== PUSH SYNC (Mobile → Server) =====

export interface PushResult {
  entity: string;
  success: number;
  failed: number;
  reasons?: string[];
}

export type SyncProgressCallback = (info: {
  entity: string;
  entityIndex: number;
  totalEntities: number;
  overallPct: number;
}) => void;

export async function pushSync(onProgress?: SyncProgressCallback): Promise<PushResult[]> {
  const results: PushResult[] = [];

  // Fast path: if no table has any unsynced rows we skip the per-table scan
  // loop below entirely. With the is_synced indexes this is a single SQLite
  // COUNT(*) per table and short-circuits as soon as one is non-zero —
  // dramatically cheaper than the previous unconditional 18-table scan.
  const PUSHABLE_TABLES = [
    'orders', 'attendance_records', 'customer_visits', 'store_checks',
    'planogram_executions', 'expiry_checks', 'competitor_observations',
    'opening_stocks', 'physical_stocks', 'osoi_photos', 'product_samplings',
    'po_captures', 'initiative_executions', 'permanent_display_checks',
    'survey_responses', 'prospects', 'collections', 'price_checks',
    'rota_drafts',
  ];
  let anyPending = false;
  for (const t of PUSHABLE_TABLES) {
    try {
      const c = await database.get(t).query(Q.where('is_synced', false)).fetchCount();
      if (c > 0) { anyPending = true; break; }
    } catch { /* table may not exist in this schema */ }
  }
  if (!anyPending) {
    return results;
  }

  // Count all entities to push for progress tracking
  const entityNames = [
    'orders', 'attendance', 'customer_visits', 'store_checks',
    'planograms', 'expiry_checks', 'competitors', 'opening_stocks',
    'physical_stocks', 'osoi_photos', 'product_samplings', 'po_captures',
    'initiative_executions', 'permanent_display_checks', 'survey_responses',
    'prospects', 'collections', 'price_checks', 'rota_drafts',
  ];
  let entityIdx = 0;
  const reportProgress = (entityName: string) => {
    entityIdx++;
    onProgress?.({
      entity: entityName,
      entityIndex: entityIdx,
      totalEntities: entityNames.length,
      overallPct: Math.round((entityIdx / entityNames.length) * 100),
    });
  };

  // Push unsynced orders
  const unsyncedOrders: any[] = await database
    .get('orders')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedOrders.length > 0) {
    const orderPayloads = [];
    for (const order of unsyncedOrders) {
      const lines: any[] = await database
        .get('order_lines')
        .query(Q.where('order_id', order.id))
        .fetch();

      orderPayloads.push({
        appTrxId: order.appTrxId,
        customerCode: order.customerCode,
        trxDate: new Date(order.trxDate).toISOString(),
        routeCode: order.routeCode ?? undefined,
        geoLat: order.geoLat ?? undefined,
        geoLng: order.geoLng ?? undefined,
        lines: lines.map((l: any) => ({
          itemCode: l.itemCode,
          quantity: l.quantity,
          uom: l.uom,
          priceUsed: l.priceUsed,
          taxPct: l.taxPct ?? 0,
        })),
      });
    }

    try {
      const data = await syncPush({
        changes: { orders: { created: orderPayloads } },
      });

      const orderResults = data.results?.orders;
      let success = 0;
      const reasons: string[] = [];

      if (orderResults?.items) {
        for (const item of orderResults.items) {
          if (item.status === 'failed') {
            console.error(`[Sync] Order failed on server: appTrxId=${item.appTrxId} error=${item.error}`);
            reasons.push(`orders: ${item.error ?? 'unknown server error'}`);
          }
        }

        await database.write(async () => {
          for (const item of orderResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const order = unsyncedOrders.find((o: any) => o.appTrxId === item.appTrxId);
              if (order) {
                await order.update((rec: any) => {
                  rec.isSynced = true;
                  rec.serverTrxCode = item.serverTrxCode ?? item.serverId ?? null;
                });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'orders', success, failed: unsyncedOrders.length - success, reasons });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? 'request failed';
      const status = err?.response?.status ?? '?';
      console.error('[Sync] Orders push request failed:', status, JSON.stringify(err?.response?.data ?? err?.message));
      results.push({ entity: 'orders', success: 0, failed: unsyncedOrders.length, reasons: [`orders (HTTP ${status}): ${msg}`] });
    }
  }
  reportProgress('orders');

  // Push unsynced attendance
  const unsyncedAttendance: any[] = await database
    .get('attendance_records')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedAttendance.length > 0) {
    // Map local row.id -> appTrxId actually sent. Most rows use their own id
    // (always a UUID for records created post-uuid-fix), but a legacy record
    // with a non-UUID WatermelonDB id gets a generated UUID here so the
    // server's `z.string().uuid()` validator doesn't reject it.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const idToAppTrxId = new Map<string, string>();

    // Upload selfie photos before pushing (with timeout so slow uploads don't block sync)
    const payloads = await Promise.all(unsyncedAttendance.map(async (a: any) => {
      let selfie: { value?: string; hasPendingLocalImage: boolean } = isServerPhotoPath(a.selfiePath)
        ? { value: a.selfiePath ?? undefined, hasPendingLocalImage: false }
        : { value: undefined, hasPendingLocalImage: false };
      if (a.selfiePath && !isServerPhotoPath(a.selfiePath)) {
        try {
          selfie = await Promise.race([
            resolvePhotoField(a.selfiePath, 'attendance'),
            new Promise<{ value?: string; hasPendingLocalImage: boolean }>((_, reject) => setTimeout(() => reject(new Error('upload timeout')), 10000)),
          ]);
        } catch { /* upload failed/timeout — send record without photo, will retry next sync */ }
      }
      // Get actual start time from AsyncStorage
      let startTime: string | undefined;
      try {
        const ts = await AsyncStorage.getItem(`day_start_timestamp_${a.attendanceDate}`);
        if (ts) startTime = ts;
      } catch (e) { console.warn("[App]", e); }

      // Drop a local file:// path the server can't resolve — sending a
      // 200+ char file URI both wastes bytes and trips the Zod 500-char
      // ceiling on selfie_path. We'll retry the photo upload next cycle.
      const safeSelfie = selfie.value
        ?? (typeof a.selfiePath === 'string' && (a.selfiePath.startsWith('/public/') || a.selfiePath.startsWith('http'))
              ? a.selfiePath
              : undefined);

      if (safeSelfie && safeSelfie !== a.selfiePath) {
        try {
          await database.write(async () => {
            await a.update((rec: any) => { rec.selfiePath = safeSelfie ?? null; });
          });
        } catch (e) { console.warn('[Sync] attendance selfie local update failed:', e); }
      }
      if (a.selfiePath && !isServerPhotoPath(a.selfiePath) && !selfie.value) {
        selfie = { value: undefined, hasPendingLocalImage: true };
      }

      // Coerce non-UUID local ids to a real UUID for the wire payload.
      const appTrxId = UUID_RE.test(String(a.id)) ? a.id : generateUuidV4();
      idToAppTrxId.set(a.id, appTrxId);

      return {
        appTrxId,
        isPresent: a.isPresent,
        attendanceType: a._raw?.attendance_type ?? (a.isPresent ? 'Present' : 'Absent'),
        selfiePath: safeSelfie,
        attendanceDate: a.attendanceDate,
        startTime: startTime ?? new Date().toISOString(),
        geoLat: a.geoLat ?? undefined,
        geoLng: a.geoLng ?? undefined,
      };
    }));
    const pendingImageLocalIds = new Set(
      unsyncedAttendance
        .filter((a: any, index: number) => {
          const localSelfie = a.selfiePath;
          if (!localSelfie || isServerPhotoPath(localSelfie)) return false;
          return !payloads[index]?.selfiePath;
        })
        .map((a: any) => a.id),
    );

    try {
      const data = await syncPush({
        changes: { attendance: { created: payloads } },
      });

      const attResults = data.results?.attendance;
      let success = 0;
      const reasons: string[] = [];

      if (attResults?.items) {
        for (const item of attResults.items) {
          if (item.status === 'failed') {
            console.error(`[Sync] Attendance failed on server: appTrxId=${item.appTrxId} error=${item.error}`);
            reasons.push(`attendance: ${item.error ?? 'unknown server error'}`);
          }
        }

        // Reverse map: server returns the wire appTrxId, which may differ
        // from the local row.id when we coerced a non-UUID id above.
        const appTrxIdToLocalId = new Map<string, string>();
        idToAppTrxId.forEach((appTrxId, localId) => appTrxIdToLocalId.set(appTrxId, localId));

        await database.write(async () => {
          for (const item of attResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const localId = appTrxIdToLocalId.get(item.appTrxId) ?? item.appTrxId;
              const att = unsyncedAttendance.find((a: any) => a.id === localId);
              if (att && !pendingImageLocalIds.has(localId)) {
                await att.update((rec: any) => { rec.isSynced = true; });
                success++;
              } else {
                console.warn(`[Sync] Attendance ack ignored: no local row for appTrxId=${item.appTrxId} (resolved local=${localId})`);
              }
            }
          }
        });
      }

      results.push({ entity: 'attendance', success, failed: unsyncedAttendance.length - success, reasons });
    } catch (err: any) {
      const status = err?.response?.status ?? '?';
      const body = err?.response?.data;
      // Zod returns issues[]; surface the first one or the raw error message.
      const issueMsg = Array.isArray(body?.issues) && body.issues.length > 0
        ? `${body.issues[0].path?.join('.') ?? 'field'}: ${body.issues[0].message}`
        : (body?.message ?? body?.error ?? err?.message ?? 'request failed');
      console.error('[Sync] Attendance push request failed:', status, JSON.stringify(body ?? err?.message));
      // Also log the first payload so we can see what was sent.
      try { console.error('[Sync] Attendance payload[0]:', JSON.stringify(payloads[0])); } catch (e) { console.warn("[App]", e); }
      results.push({ entity: 'attendance', success: 0, failed: unsyncedAttendance.length, reasons: [`attendance (HTTP ${status}): ${issueMsg}`] });
    }
  }
  reportProgress('attendance');

  // Push unsynced customer visits
  const unsyncedVisits: any[] = await database
    .get('customer_visits')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedVisits.length > 0) {
    // Upload checkin/checkout photos before pushing
    const payloadEntries = await Promise.all(unsyncedVisits.map(async (v: any) => {
      const ciImg = v.checkinImage ?? v._raw?.checkin_image ?? null;
      const coImg = v.checkoutImage ?? v._raw?.checkout_image ?? null;
      const checkinPhoto = await resolvePhotoField(ciImg, 'checkin');
      const checkoutPhoto = await resolvePhotoField(coImg, 'checkout');
      // Update local record with server URLs so we don't re-upload next cycle
      if (checkinPhoto.value && checkinPhoto.value !== ciImg) {
        try { await database.write(async () => { await v.update((rec: any) => { rec._raw.checkin_image = checkinPhoto.value; }); }); } catch (e) { console.warn("[App]", e); }
      }
      if (checkoutPhoto.value && checkoutPhoto.value !== coImg) {
        try { await database.write(async () => { await v.update((rec: any) => { rec._raw.checkout_image = checkoutPhoto.value; }); }); } catch (e) { console.warn("[App]", e); }
      }
      return {
        sourceId: v.id,
        hasPendingLocalImage: checkinPhoto.hasPendingLocalImage || checkoutPhoto.hasPendingLocalImage,
        payload: {
          appTrxId: v.id,
          visitCode: v.visitCode,
          customerCode: v.customerCode,
          customerName: v.customerName ?? undefined,
          checkinTime: new Date(v.checkinTime).toISOString(),
          checkoutTime: v.checkoutTime ? new Date(v.checkoutTime).toISOString() : undefined,
          checkinLat: v.checkinLat ?? undefined,
          checkinLng: v.checkinLng ?? undefined,
          checkinImage: checkinPhoto.value,
          checkoutLat: v.checkoutLat ?? undefined,
          checkoutLng: v.checkoutLng ?? undefined,
          checkoutImage: checkoutPhoto.value,
          durationMins: v.durationMins ?? undefined,
          checkinType: v._raw?.checkin_type ?? 'normal',
          checkoutType: v._raw?.checkout_type ?? 'normal',
          status: v.status,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { customer_visits: { created: payloads } },
      });

      const visitResults = data.results?.customer_visits;
      let success = 0;

      if (visitResults?.items) {
        await database.write(async () => {
          for (const item of visitResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const visit = unsyncedVisits.find((v: any) => v.id === item.appTrxId);
              if (visit && !pendingImageIds.has(item.appTrxId)) {
                await visit.update((rec: any) => { rec.isSynced = true; });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'customer_visits', success, failed: unsyncedVisits.length - success });
    } catch {
      results.push({ entity: 'customer_visits', success: 0, failed: unsyncedVisits.length });
    }
  }
  reportProgress('customer_visits');

  // Push unsynced store checks
  const unsyncedChecks: any[] = await database
    .get('store_checks')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedChecks.length > 0) {
    const payloads = [];
    for (const sc of unsyncedChecks) {
      const items: any[] = await database
        .get('store_check_items')
        .query(Q.where('store_check_id', sc.id))
        .fetch();

      payloads.push({
        appTrxId: sc.appId,
        customerCode: sc.customerCode,
        customerName: sc.customerName ?? undefined,
        visitCode: sc.visitCode ?? undefined,
        checkDate: new Date(sc.checkDate).toISOString(),
        items: items.map((i: any) => ({
          itemCode: i.itemCode,
          itemName: i.itemName,
          categoryName: i.categoryName ?? undefined,
          brandName: i.brandName ?? undefined,
          shelfQuantity: i.shelfQuantity,
          storeQuantity: i.storeQuantity,
          isMsl: i.isAvailable,
          reason: i.reason ?? undefined,
        })),
      });
    }

    try {
      const data = await syncPush({
        changes: { store_checks: { created: payloads } },
      });

      const scResults = data.results?.store_checks;
      let success = 0;

      if (scResults?.items) {
        await database.write(async () => {
          for (const item of scResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const sc = unsyncedChecks.find((s: any) => s.appId === item.appTrxId);
              if (sc) {
                await sc.update((rec: any) => { rec.isSynced = true; });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'store_checks', success, failed: unsyncedChecks.length - success });
    } catch {
      results.push({ entity: 'store_checks', success: 0, failed: unsyncedChecks.length });
    }
  }
  reportProgress('store_checks');

  // Push unsynced planograms
  const unsyncedPlanos: any[] = await database
    .get('planogram_executions')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedPlanos.length > 0) {
    // Upload planogram images before pushing. Mirror the customer_visits
    // pattern: after a successful upload, write the server URL back to
    // the local record so the photo survives an app cache wipe. Without
    // this, the local file:// URI stayed on the record and once Android
    // cleared the camera cache the photo "disappeared" from the
    // Planogram screen even though the upload had succeeded.
    const payloadEntries = await Promise.all(unsyncedPlanos.map(async (p: any) => {
      const localPre = p.preImage ?? null;
      const localPost = p.postImage ?? null;
      const prePhoto = await resolvePhotoField(localPre, 'general');
      const postPhoto = await resolvePhotoField(localPost, 'general');
      if (prePhoto.value && prePhoto.value !== localPre) {
        try {
          await database.write(async () => {
            await p.update((rec: any) => { rec._raw.pre_image = prePhoto.value; });
          });
        } catch (e) { console.warn('[Sync] planogram preImage local update failed:', e); }
      }
      if (postPhoto.value && postPhoto.value !== localPost) {
        try {
          await database.write(async () => {
            await p.update((rec: any) => { rec._raw.post_image = postPhoto.value; });
          });
        } catch (e) { console.warn('[Sync] planogram postImage local update failed:', e); }
      }
      return {
        sourceId: p.appTrxId,
        hasPendingLocalImage: prePhoto.hasPendingLocalImage || postPhoto.hasPendingLocalImage,
        payload: {
          appTrxId: p.appTrxId,
          customerCode: p.customerCode,
          visitCode: p.visitCode ?? undefined,
          categoryCode: p.categoryCode ?? undefined,
          performedOn: new Date(p.performedOn).toISOString(),
          isFollowed: p.isFollowed,
          preImage: prePhoto.value,
          postImage: postPhoto.value,
          geoLat: p.geoLat ?? undefined,
          geoLng: p.geoLng ?? undefined,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { planogram_executions: { created: payloads } },
      });

      const planoResults = data.results?.planogram_executions;
      let success = 0;

      if (planoResults?.items) {
        await database.write(async () => {
          for (const item of planoResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const p = unsyncedPlanos.find((pl: any) => pl.appTrxId === item.appTrxId);
              if (p && !pendingImageIds.has(item.appTrxId)) {
                await p.update((rec: any) => { rec.isSynced = true; });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'planograms', success, failed: unsyncedPlanos.length - success });
    } catch {
      results.push({ entity: 'planograms', success: 0, failed: unsyncedPlanos.length });
    }
  }

  // Push unsynced opening stocks
  const unsyncedOpening: any[] = await database
    .get('opening_stocks')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedOpening.length > 0) {
    const payloads = unsyncedOpening.map((s: any) => ({
      appTrxId: s.id,
      customerCode: s.customerCode,
      visitCode: s.visitCode ?? undefined,
      stockDate: s.stockDate,
      itemCode: s.itemCode,
      itemName: s.itemName ?? undefined,
      category: s.category ?? undefined,
      brand: s.brand ?? undefined,
      quantity: s.quantity ?? 0,
      uom: s.uom ?? 'EA',
    }));

    try {
      const data = await syncPush({
        changes: { opening_stocks: { created: payloads } },
      });

      const osResults = data.results?.opening_stocks;
      let success = 0;

      if (osResults?.items) {
        await database.write(async () => {
          for (const item of osResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const s = unsyncedOpening.find((o: any) => o.id === item.appTrxId);
              if (s) {
                await s.update((rec: any) => { rec.isSynced = true; });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'opening_stocks', success, failed: unsyncedOpening.length - success });
    } catch {
      results.push({ entity: 'opening_stocks', success: 0, failed: unsyncedOpening.length });
    }
  }
  reportProgress('opening_stocks');

  // Push unsynced physical stocks
  const unsyncedPhysical: any[] = await database
    .get('physical_stocks')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedPhysical.length > 0) {
    // Upload any LOCAL photo URIs to the server before pushing the row, so
    // the row's image_path lands as a server URL (mirrors OSOI / PO /
    // store-check). uploadPhoto() returns the path as-is if it's already a
    // server URL (/public/... or http...), so already-uploaded photos
    // (success at save time) skip a second upload here.
    const payloadEntries = await Promise.all(unsyncedPhysical.map(async (s: any) => {
      const localImg = s.imagePath ?? s._raw?.image_path ?? null;
      const serverImg = localImg ? await uploadPhoto(localImg, 'physical-stock') : null;
      const existingServerPath = typeof localImg === 'string' && localImg.startsWith('/') ? localImg : undefined;
      const finalImagePath = serverImg ?? existingServerPath ?? undefined;
      const hasPendingLocalImage =
        typeof localImg === 'string' &&
        !localImg.startsWith('/public/') &&
        !localImg.startsWith('http') &&
        !finalImagePath;
      return {
        sourceId: s.id,
        hasPendingLocalImage,
        payload: {
          appTrxId: s.id,
          customerCode: s.customerCode,
          visitCode: s.visitCode ?? undefined,
          stockDate: s.stockDate,
          itemCode: s.itemCode,
          itemName: s.itemName ?? undefined,
          category: s.category ?? undefined,
          brand: s.brand ?? undefined,
          systemQty: s.systemQty ?? 0,
          physicalQty: s.physicalQty ?? 0,
          uom: s.uom ?? 'EA',
          imagePath: finalImagePath,
          capturedOn: s.capturedOn ? new Date(s.capturedOn).toISOString() : undefined,
          geoLat: s.geoLat ?? s._raw?.geo_lat ?? undefined,
          geoLng: s.geoLng ?? s._raw?.geo_lng ?? undefined,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { physical_stocks: { created: payloads } },
      });

      const psResults = data.results?.physical_stocks;
      let success = 0;

      if (psResults?.items) {
        await database.write(async () => {
          for (const item of psResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const s = unsyncedPhysical.find((p: any) => p.id === item.appTrxId);
              if (s && !pendingImageIds.has(item.appTrxId)) {
                await s.update((rec: any) => { rec.isSynced = true; });
                success++;
              }
            }
          }
        });
      }

      results.push({ entity: 'physical_stocks', success, failed: unsyncedPhysical.length - success });
    } catch {
      results.push({ entity: 'physical_stocks', success: 0, failed: unsyncedPhysical.length });
    }
  }
  reportProgress('physical_stocks');

  // Push unsynced OSOI photos
  const unsyncedOsoi: any[] = await database
    .get('osoi_photos')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedOsoi.length > 0) {
    // Upload images before pushing
    const payloadEntries = await Promise.all(unsyncedOsoi.map(async (o: any) => {
      const image = await resolvePhotoField(o.imagePath, 'osoi');
      return {
        sourceId: o.appTrxId ?? o.id,
        hasPendingLocalImage: image.hasPendingLocalImage,
        payload: {
          appTrxId: o.appTrxId ?? o.id,
          customerCode: o.customerCode,
          visitCode: o.visitCode ?? undefined,
          assetType: o.assetType ?? 'General',
          imagePath: image.value,
          geoLat: o.geoLat ?? undefined,
          geoLng: o.geoLng ?? undefined,
          capturedOn: o.capturedOn ? new Date(o.capturedOn).toISOString() : new Date().toISOString(),
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { osoi_photos: { created: payloads } },
      });

      const osoiResults = data.results?.osoi_photos;
      let success = 0;
      let serverFailed = 0;

      if (osoiResults?.items) {
        await database.write(async () => {
          for (const item of osoiResults.items) {
            const accepted = item.status === 'created' || item.status === 'updated' || item.status === 'duplicate';
            if (accepted) {
              // Server has the row. If the local image hasn't been uploaded
              // yet we keep is_synced = false so the NEXT push cycle resends
              // with the server URL — but we still COUNT it as success here.
              // Previously, image-pending rows were counted as "failed" even
              // though the OSOI record was already in the backend report,
              // which is what reps were seeing as a false "2 failed" alert.
              const o = unsyncedOsoi.find((x: any) => (x.appTrxId ?? x.id) === item.appTrxId);
              if (o && !pendingImageIds.has(item.appTrxId)) {
                await o.update((rec: any) => { rec.isSynced = true; });
              }
              success++;
            } else {
              serverFailed++;
            }
          }
        });
      }
      // Any items the server didn't acknowledge at all also count as failed.
      const ackedIds = new Set((osoiResults?.items ?? []).map((it: any) => it.appTrxId));
      const missing = unsyncedOsoi.filter((o: any) => !ackedIds.has(o.appTrxId ?? o.id)).length;
      results.push({ entity: 'osoi_photos', success, failed: serverFailed + missing });
    } catch {
      results.push({ entity: 'osoi_photos', success: 0, failed: unsyncedOsoi.length });
    }
  }
  reportProgress('osoi_photos');

  // Push unsynced PO captures — sent through the ORDERS channel with
  // trxType=6 + imagePath, so they land in the orders + order_lines tables
  // that the PO Capture report reads from. Mobile still keeps a local copy
  // in po_captures (used by the customer-dashboard "PO submitted ✓" check),
  // we just route the payload differently on the wire.
  const unsyncedPo: any[] = await database
    .get('po_captures')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedPo.length > 0) {
    const poPayloadEntries = await Promise.all(unsyncedPo.map(async (p: any) => {
      const image = await resolvePhotoField(p.imagePath, 'general');
      const lineItems: any[] = await database
        .get('po_capture_items')
        .query(Q.where('po_capture_id', p.id))
        .fetch();
      const capturedOn = p.capturedOn ? new Date(p.capturedOn).toISOString() : new Date().toISOString();
      // Filter out zero-qty lines before sending. The backend's Zod schema
      // requires quantity > 0 (z.number().positive()), so any zero-qty
      // line item causes the entire PO push to fail with a 400 error. This
      // produces the "po_captures: N failed" Upload Partial alert that has
      // been reported on several devices. Records submitted before the
      // mobile-side qty > 0 validation was added can be stuck in the local
      // DB forever — filtering here unsticks them on the next sync.
      const validLines = lineItems
        .map((li: any) => ({
          itemCode: li.itemCode ?? li._raw?.item_code,
          quantity: Number(li.quantity ?? li._raw?.quantity ?? 0),
          uom: li.uom ?? li._raw?.uom ?? 'EA',
          priceUsed: Number(li.price ?? li._raw?.price ?? 0),
        }))
        .filter(li => li.quantity > 0);
      return {
        sourceId: p.appTrxId ?? p._raw?.app_trx_id ?? p.id,
        hasPendingLocalImage: image.hasPendingLocalImage,
        // noValidLines flags records that are all-zero-qty so we can
        // mark them synced locally without sending (invalid data that
        // would always be rejected; sending is pointless).
        noValidLines: validLines.length === 0,
        payload: {
          appTrxId: p.appTrxId ?? p._raw?.app_trx_id ?? p.id,
          customerCode: p.customerCode ?? p._raw?.customer_code,
          visitCode: p.visitCode ?? p._raw?.visit_code ?? undefined,
          trxDate: capturedOn,
          trxType: 6,
          poNumber: p.poNumber ?? p._raw?.po_number ?? undefined,
          imagePath: image.value,
          geoLat: p.geoLat ?? p._raw?.geo_lat ?? undefined,
          geoLng: p.geoLng ?? p._raw?.geo_lng ?? undefined,
          lines: validLines,
        },
      };
    }));
    // Silently retire all-zero-qty PO captures — they can never pass
    // backend validation and would loop forever in the "failed" bucket.
    const noLineEntries = poPayloadEntries.filter(e => e.noValidLines);
    if (noLineEntries.length > 0) {
      await database.write(async () => {
        for (const e of noLineEntries) {
          const recs: any[] = await database.get('po_captures').query(
            Q.where('app_trx_id', e.sourceId),
          ).fetch();
          for (const rec of recs) {
            await rec.update((r: any) => { r.isSynced = true; });
          }
        }
      });
    }

    const validEntries = poPayloadEntries.filter(e => !e.noValidLines);
    const poPayloads = validEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      validEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    if (poPayloads.length === 0) {
      results.push({ entity: 'po_captures', success: noLineEntries.length, failed: 0 });
    } else
    try {
      const data = await syncPush({
        changes: { orders: { created: poPayloads } },
      });
      const orderResults = data.results?.orders;
      let success = 0;
      if (orderResults?.items) {
        const poAppTrxIds = new Set(poPayloads.map(p => p.appTrxId));
        await database.write(async () => {
          for (const item of orderResults.items) {
            if (!poAppTrxIds.has(item.appTrxId)) continue; // ignore non-PO orders
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const p = unsyncedPo.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (p && !pendingImageIds.has(item.appTrxId)) { await p.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'po_captures', success: success + noLineEntries.length, failed: validEntries.length - success });
    } catch {
      results.push({ entity: 'po_captures', success: noLineEntries.length, failed: validEntries.length });
    }
  }
  reportProgress('po_captures');

  // Push unsynced competitor observations
  const unsyncedComp: any[] = await database
    .get('competitor_observations')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedComp.length > 0) {
    const payloadEntries = await Promise.all(unsyncedComp.map(async (c: any) => {
      const image = await resolvePhotoField(c.imagePath, 'store-check');
      return {
        sourceId: c.appTrxId ?? c._raw?.app_trx_id ?? c.id,
        hasPendingLocalImage: image.hasPendingLocalImage,
        payload: {
          appTrxId: c.appTrxId ?? c._raw?.app_trx_id ?? c.id,
          customerCode: c.customerCode ?? c._raw?.customer_code,
          visitCode: c.visitCode ?? c._raw?.visit_code ?? undefined,
          brandName: c.brandName ?? c._raw?.brand_name,
          productName: c.productName ?? c._raw?.product_name ?? undefined,
          category: c.category ?? c._raw?.category ?? undefined,
          price: c.price ?? c._raw?.price ?? undefined,
          sellingPrice: c.sellingPrice ?? c._raw?.selling_price ?? undefined,
          uom: c.uom ?? c._raw?.uom ?? undefined,
          imagePath: image.value,
          notes: c.notes ?? c._raw?.notes ?? undefined,
          observedOn: c.observedOn ? new Date(c.observedOn).toISOString() : new Date().toISOString(),
          geoLat: c.geoLat ?? c._raw?.geo_lat ?? undefined,
          geoLng: c.geoLng ?? c._raw?.geo_lng ?? undefined,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { competitor_observations: { created: payloads } },
      });
      const compResults = data.results?.competitor_observations;
      let success = 0;
      if (compResults?.items) {
        await database.write(async () => {
          for (const item of compResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const c = unsyncedComp.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (c && !pendingImageIds.has(item.appTrxId)) { await c.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'competitor_observations', success, failed: unsyncedComp.length - success });
    } catch {
      results.push({ entity: 'competitor_observations', success: 0, failed: unsyncedComp.length });
    }
  }
  reportProgress('competitor_observations');

  // Push unsynced product samplings
  const unsyncedSampling: any[] = await database
    .get('product_samplings')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedSampling.length > 0) {
    const payloadEntries = await Promise.all(unsyncedSampling.map(async (s: any) => {
      const photo = await resolvePhotoField(s.photoPath, 'general', '|');
      return {
        sourceId: s.appTrxId ?? s._raw?.app_trx_id ?? s.id,
        hasPendingLocalImage: photo.hasPendingLocalImage,
        payload: {
          appTrxId: s.appTrxId ?? s._raw?.app_trx_id ?? s.id,
          customerCode: s.customerCode ?? s._raw?.customer_code,
          visitCode: s.visitCode ?? s._raw?.visit_code ?? undefined,
          itemCode: s.itemCode ?? s._raw?.item_code,
          itemName: s.itemName ?? s._raw?.item_name ?? undefined,
          quantitySampled: s.quantitySampled ?? s._raw?.quantity_sampled ?? 1,
          uom: s.uom ?? s._raw?.uom ?? 'EA',
          consumerFeedback: s.consumerFeedback ?? s._raw?.consumer_feedback ?? undefined,
          sellingPrice: s.sellingPrice ?? s._raw?.selling_price ?? undefined,
          unitsSold: s.unitsSold ?? s._raw?.units_sold ?? undefined,
          customersApproached: s.customersApproached ?? s._raw?.customers_approached ?? undefined,
          sampledOn: s.sampledOn ? new Date(s.sampledOn).toISOString() : new Date().toISOString(),
          photoPath: photo.value,
          geoLat: s.geoLat ?? s._raw?.geo_lat ?? undefined,
          geoLng: s.geoLng ?? s._raw?.geo_lng ?? undefined,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { product_samplings: { created: payloads } },
      });
      const sampResults = data.results?.product_samplings;
      let success = 0;
      if (sampResults?.items) {
        await database.write(async () => {
          for (const item of sampResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const s = unsyncedSampling.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (s && !pendingImageIds.has(item.appTrxId)) { await s.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'product_samplings', success, failed: unsyncedSampling.length - success });
    } catch {
      results.push({ entity: 'product_samplings', success: 0, failed: unsyncedSampling.length });
    }
  }
  reportProgress('product_samplings');

  // Push unsynced initiative executions
  const unsyncedInit: any[] = await database
    .get('initiative_executions')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedInit.length > 0) {
    const payloadEntries = await Promise.all(unsyncedInit.map(async (ie: any) => {
      const photo = await resolvePhotoField(ie.photoPath, 'general');
      return {
        sourceId: ie.appTrxId ?? ie._raw?.app_trx_id ?? ie.id,
        hasPendingLocalImage: photo.hasPendingLocalImage,
        payload: {
          appTrxId: ie.appTrxId ?? ie._raw?.app_trx_id ?? ie.id,
          initiativeId: ie.initiativeId ?? ie._raw?.initiative_id,
          customerCode: ie.customerCode ?? ie._raw?.customer_code,
          visitCode: ie.visitCode ?? ie._raw?.visit_code ?? undefined,
          executedOn: ie.executedOn ? new Date(ie.executedOn).toISOString() : new Date().toISOString(),
          notes: ie.notes ?? ie._raw?.notes ?? undefined,
          photoPath: photo.value,
          status: ie.status ?? ie._raw?.status ?? 'completed',
          geoLat: ie.geoLat ?? ie._raw?.geo_lat ?? undefined,
          geoLng: ie.geoLng ?? ie._raw?.geo_lng ?? undefined,
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );

    try {
      const data = await syncPush({
        changes: { initiative_executions: { created: payloads } },
      });
      const initResults = data.results?.initiative_executions;
      let success = 0;
      if (initResults?.items) {
        await database.write(async () => {
          for (const item of initResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const ie = unsyncedInit.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (ie && !pendingImageIds.has(item.appTrxId)) { await ie.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'initiative_executions', success, failed: unsyncedInit.length - success });
    } catch {
      results.push({ entity: 'initiative_executions', success: 0, failed: unsyncedInit.length });
    }
  }
  reportProgress('initiative_executions');

  // Push unsynced expiry checks
  const unsyncedExpiry: any[] = await database
    .get('expiry_checks')
    .query(Q.where('is_synced', false))
    .fetch();

  if (unsyncedExpiry.length > 0) {
    const expiryPayloads = unsyncedExpiry.map((e: any) => ({
      appTrxId: e.appTrxId ?? e._raw?.app_trx_id ?? e.id,
      customerCode: e.customerCode ?? e._raw?.customer_code,
      visitCode: e.visitCode ?? e._raw?.visit_code ?? undefined,
      itemCode: e.itemCode ?? e._raw?.item_code,
      quantity: e.quantity ?? e._raw?.quantity ?? 0,
      uom: e.uom ?? e._raw?.uom ?? 'EA',
      expiryDate: e.expiryDate ?? e._raw?.expiry_date,
      visitedDate: e.visitedDate ?? e._raw?.visited_date,
      status: e.status ?? e._raw?.status ?? 'checked',
    }));

    try {
      const data = await syncPush({
        changes: { expiry_checks: { created: expiryPayloads } },
      });
      const expiryResults = data.results?.expiry_checks;
      let success = 0;
      if (expiryResults?.items) {
        await database.write(async () => {
          for (const item of expiryResults.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const e = unsyncedExpiry.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (e) { await e.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'expiry_checks', success, failed: unsyncedExpiry.length - success });
    } catch {
      results.push({ entity: 'expiry_checks', success: 0, failed: unsyncedExpiry.length });
    }
  }
  reportProgress('expiry_checks');

  // Push unsynced permanent display checks. The backend accepts these via
  // changes.permanent_display_checks (see pushPermanentDisplayChecks). They
  // were previously listed as a pushable table but had no client-side push
  // handler, so the rows sat is_synced=false on the device forever and were
  // lost on logout.
  const unsyncedPdc: any[] = await database
    .get('permanent_display_checks')
    .query(Q.where('is_synced', false))
    .fetch();
  if (unsyncedPdc.length > 0) {
    // Upload any LOCAL photo URIs at push time (mirrors OSOI / PO /
    // store-check / physical-stock). uploadPhoto() is a no-op for paths
    // already on the server, so an already-uploaded photo is not re-uploaded.
    const payloadEntries = await Promise.all(unsyncedPdc.map(async (r: any) => {
      const photo = await resolvePhotoField(r.photoPath ?? r._raw?.photo_path ?? null, 'general');
      return {
        sourceId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
        hasPendingLocalImage: photo.hasPendingLocalImage,
        payload: {
          appTrxId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
          displayId: String(r.displayId ?? r._raw?.display_id ?? ''),
          customerCode: r.customerCode ?? r._raw?.customer_code,
          visitCode: r.visitCode ?? r._raw?.visit_code ?? undefined,
          isCompliant: !!(r.isCompliant ?? r._raw?.is_compliant),
          issueDescription: r.issueDescription ?? r._raw?.issue_description ?? undefined,
          photoPath: photo.value,
          checkedOn: new Date(r.checkedOn ?? r._raw?.checked_on ?? Date.now()).toISOString(),
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );
    try {
      const data = await syncPush({ changes: { permanent_display_checks: { created: payloads } } });
      const res = data.results?.permanent_display_checks;
      let success = 0;
      if (res?.items) {
        await database.write(async () => {
          for (const item of res.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const r = unsyncedPdc.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (r && !pendingImageIds.has(item.appTrxId)) { await r.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'permanent_display_checks', success, failed: unsyncedPdc.length - success });
    } catch (err: any) {
      console.error('[Sync] permanent_display_checks push failed:', err?.response?.data ?? err?.message);
      results.push({ entity: 'permanent_display_checks', success: 0, failed: unsyncedPdc.length });
    }
  }
  reportProgress('permanent_display_checks');

  // Push unsynced survey responses.
  const unsyncedSurvey: any[] = await database
    .get('survey_responses')
    .query(Q.where('is_synced', false))
    .fetch();
  if (unsyncedSurvey.length > 0) {
    const payloads = unsyncedSurvey.map((r: any) => ({
      appTrxId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
      surveyId: String(r.surveyId ?? r._raw?.survey_id ?? ''),
      customerCode: r.customerCode ?? r._raw?.customer_code,
      visitCode: r.visitCode ?? r._raw?.visit_code ?? undefined,
      answersJson: r.answersJson ?? r._raw?.answers_json ?? '{}',
      completedOn: new Date(r.completedOn ?? r._raw?.completed_on ?? Date.now()).toISOString(),
    }));
    try {
      const data = await syncPush({ changes: { survey_responses: { created: payloads } } });
      const res = data.results?.survey_responses;
      let success = 0;
      if (res?.items) {
        await database.write(async () => {
          for (const item of res.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const r = unsyncedSurvey.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (r) { await r.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'survey_responses', success, failed: unsyncedSurvey.length - success });
    } catch (err: any) {
      console.error('[Sync] survey_responses push failed:', err?.response?.data ?? err?.message);
      results.push({ entity: 'survey_responses', success: 0, failed: unsyncedSurvey.length });
    }
  }
  reportProgress('survey_responses');

  // Push unsynced prospects.
  const unsyncedProspects: any[] = await database
    .get('prospects')
    .query(Q.where('is_synced', false))
    .fetch();
  if (unsyncedProspects.length > 0) {
    const payloadEntries = await Promise.all(unsyncedProspects.map(async (r: any) => {
      const photo = await resolvePhotoField(r.photoPath ?? r._raw?.photo_path ?? null, 'general');
      return {
        sourceId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
        hasPendingLocalImage: photo.hasPendingLocalImage,
        payload: {
          appTrxId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
          prospectName: r.prospectName ?? r._raw?.prospect_name ?? '',
          contactName: r.contactName ?? r._raw?.contact_name ?? undefined,
          phone: r.phone ?? r._raw?.phone ?? undefined,
          address: r.address ?? r._raw?.address ?? undefined,
          city: r.city ?? r._raw?.city ?? undefined,
          channelType: r.channelType ?? r._raw?.channel_type ?? undefined,
          geoLat: r.geoLat ?? r._raw?.geo_lat ?? undefined,
          geoLng: r.geoLng ?? r._raw?.geo_lng ?? undefined,
          photoPath: photo.value,
          status: r.status ?? r._raw?.status ?? 'new',
          notes: r.notes ?? r._raw?.notes ?? undefined,
          createdOn: new Date(r.createdOn ?? r._raw?.created_on ?? Date.now()).toISOString(),
        },
      };
    }));
    const payloads = payloadEntries.map((entry) => entry.payload);
    const pendingImageIds = new Set(
      payloadEntries.filter((entry) => entry.hasPendingLocalImage).map((entry) => entry.sourceId),
    );
    try {
      const data = await syncPush({ changes: { prospects: { created: payloads } } });
      const res = data.results?.prospects;
      let success = 0;
      if (res?.items) {
        await database.write(async () => {
          for (const item of res.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const r = unsyncedProspects.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (r && !pendingImageIds.has(item.appTrxId)) { await r.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'prospects', success, failed: unsyncedProspects.length - success });
    } catch (err: any) {
      console.error('[Sync] prospects push failed:', err?.response?.data ?? err?.message);
      results.push({ entity: 'prospects', success: 0, failed: unsyncedProspects.length });
    }
  }
  reportProgress('prospects');

  // Push unsynced collections.
  const unsyncedCollections: any[] = await database
    .get('collections')
    .query(Q.where('is_synced', false))
    .fetch();
  if (unsyncedCollections.length > 0) {
    const payloads = unsyncedCollections.map((r: any) => ({
      appTrxId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
      customerCode: r.customerCode ?? r._raw?.customer_code,
      amount: Number(r.amount ?? r._raw?.amount ?? 0),
      paymentMode: r.paymentMode ?? r._raw?.payment_mode ?? 'cash',
      referenceNumber: r.referenceNumber ?? r._raw?.reference_number ?? undefined,
      collectionDate: r.collectionDate ?? r._raw?.collection_date ?? new Date().toISOString().slice(0, 10),
      notes: r.notes ?? r._raw?.notes ?? undefined,
    }));
    try {
      const data = await syncPush({ changes: { collections: { created: payloads } } });
      const res = data.results?.collections;
      let success = 0;
      if (res?.items) {
        await database.write(async () => {
          for (const item of res.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const r = unsyncedCollections.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (r) { await r.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'collections', success, failed: unsyncedCollections.length - success });
    } catch (err: any) {
      console.error('[Sync] collections push failed:', err?.response?.data ?? err?.message);
      results.push({ entity: 'collections', success: 0, failed: unsyncedCollections.length });
    }
  }
  reportProgress('collections');

  // Push unsynced price checks.
  const unsyncedPriceChecks: any[] = await database
    .get('price_checks')
    .query(Q.where('is_synced', false))
    .fetch();
  if (unsyncedPriceChecks.length > 0) {
    const payloads = unsyncedPriceChecks.map((r: any) => ({
      appTrxId: r.appTrxId ?? r._raw?.app_trx_id ?? r.id,
      customerCode: r.customerCode ?? r._raw?.customer_code,
      itemCode: r.itemCode ?? r._raw?.item_code,
      expectedPrice: r.expectedPrice ?? r._raw?.expected_price ?? undefined,
      actualPrice: r.actualPrice ?? r._raw?.actual_price ?? undefined,
      isCompliant: !!(r.isCompliant ?? r._raw?.is_compliant),
      checkDate: r.checkDate ?? r._raw?.check_date ?? new Date().toISOString().slice(0, 10),
    }));
    try {
      const data = await syncPush({ changes: { price_checks: { created: payloads } } });
      const res = data.results?.price_checks;
      let success = 0;
      if (res?.items) {
        await database.write(async () => {
          for (const item of res.items) {
            if (item.status === 'created' || item.status === 'updated' || item.status === 'duplicate') {
              const r = unsyncedPriceChecks.find((x: any) => (x.appTrxId ?? x._raw?.app_trx_id ?? x.id) === item.appTrxId);
              if (r) { await r.update((rec: any) => { rec.isSynced = true; }); success++; }
            }
          }
        });
      }
      results.push({ entity: 'price_checks', success, failed: unsyncedPriceChecks.length - success });
    } catch (err: any) {
      console.error('[Sync] price_checks push failed:', err?.response?.data ?? err?.message);
      results.push({ entity: 'price_checks', success: 0, failed: unsyncedPriceChecks.length });
    }
  }
  reportProgress('price_checks');

  // ── Rota drafts (offline-created schedules) ──
  try {
    const rotaResult = await pushRotaDrafts();
    results.push(rotaResult);
  } catch {
    // pushRotaDrafts swallows errors internally; ignore.
  }
  reportProgress('rota_drafts');

  const totalSuccess = results.reduce((s, r) => s + r.success, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  console.log(`[Sync] Push complete: ${totalSuccess} success, ${totalFailed} failed`);
  return results;
}

// ===== ROTA DRAFTS PUSH =====
// Uploads offline-created rota schedules. Used both by pushSync (periodic) and
// directly by RotaCreateScreen so the user gets immediate feedback when online.
// When userCodeFilter is set, only drafts belonging to that user are pushed —
// RotaCreateScreen uses this to avoid surfacing rejection alerts from stale
// drafts left behind by other accounts on the same device.
export async function pushRotaDrafts(userCodeFilter?: string): Promise<PushResult> {
  const queryConds = [Q.where('is_synced', false)];
  if (userCodeFilter) queryConds.push(Q.where('user_code', userCodeFilter));
  const unsynced: any[] = await database
    .get('rota_drafts')
    .query(...queryConds)
    .fetch();

  if (unsynced.length === 0) {
    return { entity: 'rota_drafts', success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  const failedReasons: string[] = [];
  for (const draft of unsynced) {
    const body: Record<string, any> = {
      userCode: draft.userCode,
      activityName: draft.activityName,
      rotaDate: draft.rotaDate,
    };
    if (draft.startTime) body.startTime = draft.startTime;
    if (draft.endTime) body.endTime = draft.endTime;

    try {
      await api.post('/rota', body);
      await database.write(async () => {
        await draft.update((rec: any) => { rec.isSynced = true; });
      });
      success++;
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      const status = err?.response?.status;
      // DUPLICATE = server already has this exact rota (likely a retry that
      // succeeded earlier but the response was lost). Safe to mark as synced.
      if (serverErr === 'DUPLICATE') {
        await database.write(async () => {
          await draft.update((rec: any) => { rec.isSynced = true; });
        });
        success++;
      } else if (serverErr === 'ROTA_WEEK_EXISTS' || status === 409) {
        // Business rule: only one rota per Mon–Sun week per user. Surface to
        // the user so they know why their submission didn't land, and mark
        // the draft synced so we don't keep retrying a rejection that will
        // never change on its own.
        const msg = err?.response?.data?.message ?? 'A rota already exists for this week. Only one rota per week per user is allowed.';
        console.warn('[pushRotaDrafts] ROTA_WEEK_EXISTS:', msg);
        await database.write(async () => {
          await draft.update((rec: any) => { rec.isSynced = true; });
        });
        failed++;
        failedReasons.push(msg);
      } else {
        failed++;
      }
    }
  }
  return { entity: 'rota_drafts', success, failed, reasons: failedReasons.length > 0 ? failedReasons : undefined };
}

// ===== INITIAL SYNC (First login — download everything) =====

// Farmley does not use the Journey Plan concept — keep the table/model in the
// schema but skip it during pull sync so it never appears on the login sync
// progress screen.
const PULL_MODULES = ['customers', 'items', 'prices', 'competitor_brands', 'initiatives', 'surveys', 'permanent_displays', 'planogram_setups', 'app_settings'];

// ===== MSL (Selling SKUs) SYNC =====

export async function syncSellingSkus(): Promise<number> {
  try {
    let allRows: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data } = await withRetry(() =>
        api.get('/selling-skus', { params: { page, pageSize: 500 } }),
      );
      const rows = data.data ?? [];
      if (!Array.isArray(rows) || rows.length === 0) break;
      
      allRows = allRows.concat(rows);
      
      // Pagination logic
      const totalPages = data.pagination?.totalPages ?? 1;
      if (page >= totalPages) {
        hasMore = false;
      } else {
        page++;
      }
    }

    if (allRows.length === 0) return 0;

    await database.write(async () => {
      // Clear existing
      const existing = await database.get('selling_skus').query().fetch();
      for (const r of existing) {
        await r.destroyPermanently();
      }

      // Insert fresh
      for (const row of allRows) {
        await database.get('selling_skus').create((rec: any) => {
          rec._raw.id = `msl_${row.id}`;
          rec.itemCode = row.itemCode;
          rec.groupType = row.groupType ?? null;
          rec.groupCode = row.groupCode ?? '';
          rec.isCoreSku = row.isCoreSku ?? false;
          rec.minQty = row.minQty ?? null;
          rec.maxQty = row.maxQty ?? null;
        });
      }
    });

    return allRows.length;
  } catch (err: any) {
    console.error('[Sync] MSL sync failed:', err?.message ?? err);
    return 0;
  }
}

// One-shot master-data snapshot fetch. Replaces N paginated /pull
// round-trips with a single gzipped /sync/snapshot call on first
// install. Returns true on success, false on any error (caller falls
// back to paginated). Decodes the response and bulk-inserts each
// module into its WatermelonDB table.
export async function pullMasterSnapshot(): Promise<boolean> {
  try {
    const { data } = await withRetry(() => api.get('/sync/snapshot'));
    const modules = data?.modules;
    if (!modules || typeof modules !== 'object') return false;

    const m = modules as Record<string, any[]>;
    // Run all upserts in parallel — independent WatermelonDB tables.
    await Promise.all([
      Array.isArray(m.customers)         ? upsertCustomers(m.customers)                 : Promise.resolve(0),
      Array.isArray(m.items)             ? upsertItems(m.items)                         : Promise.resolve(0),
      Array.isArray(m.prices)            ? upsertPrices(m.prices)                       : Promise.resolve(0),
      Array.isArray(m.competitor_brands) ? upsertCompetitorBrands(m.competitor_brands)  : Promise.resolve(0),
      Array.isArray(m.initiatives)       ? upsertInitiatives(m.initiatives)             : Promise.resolve(0),
      Array.isArray(m.surveys)           ? upsertSurveys(m.surveys)                     : Promise.resolve(0),
      Array.isArray(m.permanent_displays) ? upsertPermanentDisplays(m.permanent_displays) : Promise.resolve(0),
      Array.isArray(m.planogram_setups)  ? upsertPlanogramSetups(m.planogram_setups)    : Promise.resolve(0),
      // app_settings is the last master module the paginated path
      // would otherwise need a separate round-trip for — handle it
      // here too so the snapshot path is complete and we can skip
      // the per-module loop entirely on success.
      Array.isArray(m.app_settings)      ? upsertAppSettings(m.app_settings)            : Promise.resolve(0),
    ]);
    console.log(
      `[Snapshot] applied: customers=${m.customers?.length ?? 0} items=${m.items?.length ?? 0} prices=${m.prices?.length ?? 0}`,
    );
    return true;
  } catch (err) {
    console.warn('[Snapshot] failed:', err);
    return false;
  }
}

export async function initialSync(
  routeCode: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  console.log('[InitialSync] Starting initial sync with routeCode:', routeCode);

  // First check if we need to restore master data from backup (after clear data)
  try {
    const restored = await checkAndRestoreMasterData();
    if (restored) {
      console.log('[InitialSync] Master data restored from backup');
    }
  } catch (err) {
    console.error('[InitialSync] Restore check failed:', err);
    // Continue with sync even if restore fails
  }

  // Fast-path: ALWAYS try the one-shot /sync/snapshot call before
  // falling back to N paginated /pull round-trips. Previously this
  // was gated on the local DB being empty (fresh install only), but
  // that meant every user-switch login took the slow paginated path
  // even though the snapshot endpoint returns the new user's full
  // scope in one gzipped response. Now: snapshot first, paginated
  // fallback only on snapshot failure (older backend, server 500,
  // network error). The reconcileCustomerScope step inside
  // finishInitialSync below cleans up any prior user's out-of-scope
  // customers, so upserting on top of an existing DB is safe.
  let snapshotSucceeded = false;
  try {
    onProgress?.([{ module: 'customers', status: 'syncing', count: 0 }]);
    console.log('[InitialSync] using one-shot /sync/snapshot (fresh install or user switch)');
    snapshotSucceeded = await pullMasterSnapshot();
    if (snapshotSucceeded) {
      console.log('[InitialSync] Snapshot pull completed — skipping per-module loop');
    }
  } catch (snapErr) {
    console.warn('[InitialSync] Snapshot path failed, falling back to paginated:', snapErr);
  }

  const allProgress: SyncProgress[] = PULL_MODULES.map((m) => ({
    module: m,
    status: snapshotSucceeded ? ('done' as const) : ('syncing' as const),
    count: 0,
  }));
  onProgress?.(allProgress);
  if (snapshotSucceeded) {
    // Skip the per-module paginated loop entirely.
    return await finishInitialSync(routeCode, onProgress);
  }

  // Pull all master modules in PARALLEL. They write to independent
  // WatermelonDB tables with no cross-FK ordering between them, so
  // running concurrently is safe and cuts wall time from sum-of-modules
  // to max-of-modules. On slow networks the previous sequential loop
  // could take minutes per device — Samsung M32 2:20s, Oppo A55 4:40s.
  // Per-page size bumped to 1000 to halve the number of HTTP
  // round-trips. Per-module count updates only on completion (intra-
  // module page-by-page count updates were causing flicker and stale
  // numbers on the loader screen).
  await Promise.all(
    PULL_MODULES.map(async (mod, i) => {
      try {
        let moduleCursor: string | null = await getCursors().then(c => c[mod] ?? null);
        let hasMore = true;
        let totalCount = 0;
        while (hasMore) {
          try {
            const results = await pullSync({
              modules: [mod],
              cursors: { [mod]: moduleCursor },
              limit: 1000,
              routeCode,
            });
            const r = results[0];
            if (r?.cursor) moduleCursor = r.cursor;
            totalCount += r?.totalSynced ?? r?.created ?? 0;
            hasMore = r?.hasMore ?? false;
          } catch (pullErr: any) {
            console.error(`[InitialSync] Pull error for module ${mod}:`, pullErr);
            break;
          }
        }
        allProgress[i].status = 'done';
        allProgress[i].count = totalCount;
        onProgress?.([...allProgress]);
        console.log(`[InitialSync] Completed module: ${mod}, count: ${totalCount}`);
      } catch (moduleErr: any) {
        console.error(`[InitialSync] Module ${mod} failed:`, moduleErr);
        allProgress[i].status = 'done';
        allProgress[i].count = 0;
        onProgress?.([...allProgress]);
      }
    }),
  );

  await finishInitialSync(routeCode, onProgress);
}

// Everything that runs AFTER the master modules are loaded — MSL,
// reconcile, transaction restore, mark complete, backup. Split out so
// both the paginated and the one-shot snapshot paths can call it.
async function finishInitialSync(
  _routeCode: string,
  _onProgress?: ProgressCallback,
): Promise<void> {
  // Also sync MSL (selling_skus)
  const mslCount = await syncSellingSkus();
  console.log(`[Sync] MSL selling_skus synced: ${mslCount} items`);

  // Reconcile customer scope — first-login cleanup in case the local DB
  // was restored from a backup with stale customers, etc.
  try {
    await reconcileCustomerScope();
  } catch (err) {
    console.warn('[InitialSync] reconcileCustomerScope failed:', err);
  }

  // Transaction-history restore is only needed when the local DB is
  // effectively empty (fresh install or post-Clear-Storage). When the
  // user just logged out and back in on the same device, their visits /
  // orders / stocks / etc. are already in the local DB — re-pulling all
  // historical rows would be slow and pointless.
  // Heuristic: if there are any local customer_visits, treat the device
  // as already-restored and skip the all-time pulls. Today's visits are
  // still re-pulled to refresh status flags.
  let needsTransactionRestore = false;
  try {
    const visitCount = await database.get('customer_visits').query().fetchCount();
    needsTransactionRestore = visitCount === 0;
  } catch {
    needsTransactionRestore = false;
  }

  if (needsTransactionRestore) {
    console.log('[InitialSync] Local DB empty — running all-time transaction restore (parallel)');
    // Run all restore pulls in parallel. They write to independent
    // WatermelonDB tables, so there's no cross-entity FK ordering needed.
    // Network round-trips for each entity now overlap instead of serialize
    // — wall-clock time = max(per-entity) rather than sum.
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.warn(`[InitialSync] ${label} failed:`, err); }
    };
    await Promise.all([
      (async () => {
        try { await pullAllMyVisits(); }
        catch (err) {
          console.warn('[InitialSync] pullAllMyVisits failed, fallback to pullTodaysVisits:', err);
          try { await pullTodaysVisits(); } catch (e2) { console.warn('[InitialSync] fallback also failed:', e2); }
        }
      })(),
      safe('pullAllMyOrders', pullAllMyOrders),
      safe('pullAllMyOpeningStocks', pullAllMyOpeningStocks),
      safe('pullAllMyPhysicalStocks', pullAllMyPhysicalStocks),
      safe('pullAllMyAttendance', pullAllMyAttendance),
      safe('pullAllMyStoreChecks', pullAllMyStoreChecks),
      safe('pullAllMyExpiryChecks', pullAllMyExpiryChecks),
      safe('pullAllMyCompetitorObs', pullAllMyCompetitorObs),
      safe('pullAllMyOsoi', pullAllMyOsoi),
      safe('pullAllMyProductSamplings', pullAllMyProductSamplings),
      safe('pullAllMyPOCaptures', pullAllMyPOCaptures),
      safe('pullAllMyPlanogramExecutions', pullAllMyPlanogramExecutions),
      safe('pullAllMyInitiativeExecutions', pullAllMyInitiativeExecutions),
      safe('pullAllMyStoreCheckItems', pullAllMyStoreCheckItems),
      safe('pullAllMyRota', pullAllMyRota),
      safe('pullAllMyCollections', pullAllMyCollections),
      safe('pullAllMyPermanentDisplayChecks', pullAllMyPermanentDisplayChecks),
      safe('pullAllMyPriceChecks', pullAllMyPriceChecks),
      safe('pullAllMyProspects', pullAllMyProspects),
      safe('pullAllMyVanStockRecords', pullAllMyVanStockRecords),
    ]);
  } else {
    // Just refresh today's status, which is cheap.
    console.log('[InitialSync] Local DB already populated — skipping all-time restore, only refreshing today');
    try { await pullTodaysVisits(); } catch (err) { console.warn('[InitialSync] pullTodaysVisits failed:', err); }
  }

  // OSOI + Planogram approval pulls run on every initialSync (not just the
  // initial restore) so admin approve/reject actions on the web portal
  // surface on the device. The pull functions are idempotent — existing
  // rows are only touched when approval columns actually changed.
  try { await pullAllMyOsoi(); } catch (err) { console.warn('[InitialSync] pullAllMyOsoi (approval refresh) failed:', err); }
  try { await pullAllMyPlanogramExecutions(); } catch (err) { console.warn('[InitialSync] pullAllMyPlanogramExecutions (approval refresh) failed:', err); }

  // Mark sync as fully completed — only NOW does needsInitialSync() return
  // false. If the app was killed before reaching this line, the next launch
  // will correctly re-enter the sync screen and pick up where it left off.
  await markInitialSyncCompleted();
  console.log('[InitialSync] completed — flag set');

  // Backup master data to external storage to survive app data clearing
  try {
    await backupMasterData();
    console.log('[InitialSync] Master data backed up successfully');
  } catch (err) {
    console.log('[InitialSync] Backup failed (non-critical):', err);
  }
}

// ===== PULL TODAY'S VISITS =====
// Fetches the logged-in user's visits for today from the server and upserts
// them into the local customer_visits table. This preserves Visited / Pending
// badge state and Dashboard "Covered Stores" count across re-login, logout,
// and app reinstalls for 24 hours.
export async function pullTodaysVisits(): Promise<number> {
  const { data } = await api.get('/customer-visits/my-today');
  const rows = data?.data ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let count = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await database.write(async () => {
      for (const v of batch) {
        try {
          // Check if already exists (avoid duplicates)
          const existing = await database.get('customer_visits')
            .query(Q.where('visit_code', v.visitCode))
            .fetchCount();
          if (existing > 0) { count++; continue; }

          await database.get('customer_visits').create((rec: any) => {
            rec._raw.id = v.visitCode ?? v.id;
            rec._raw.visit_code = v.visitCode ?? v.id;
            rec._raw.user_code = v.userCode;
            rec._raw.customer_code = v.customerCode;
            rec._raw.customer_name = v.customerName ?? '';
            rec._raw.checkin_time = new Date(v.checkinTime).getTime();
            rec._raw.checkout_time = v.checkoutTime ? new Date(v.checkoutTime).getTime() : null;
            rec._raw.checkin_lat = v.checkinLat ?? null;
            rec._raw.checkin_lng = v.checkinLng ?? null;
            rec._raw.checkin_image = v.checkinImage ?? null;
            rec._raw.checkout_lat = v.checkoutLat ?? null;
            rec._raw.checkout_lng = v.checkoutLng ?? null;
            rec._raw.checkout_image = v.checkoutImage ?? null;
            rec._raw.checkin_type = v.checkinType ?? null;
            rec._raw.checkout_type = v.checkoutType ?? null;
            rec._raw.status = v.status ?? 'completed';
            rec._raw.is_synced = true; // came from server
          });
          count++;
        } catch (e) {
          console.warn('[PullVisits] upsert error:', e);
        }
      }
    });
  }
  console.log(`[PullVisits] restored ${count} visits from server`);
  return count;
}

// Fetches the logged-in user's ENTIRE visit history (all dates) from the
// server in pages. Used on initial sync / after Clear Data so the user's
// historical check-ins / check-outs come back, not just today's.
export async function pullAllMyVisits(): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  const PAGE_SIZE = 500;
  for (let safety = 0; safety < 200; safety++) {
    const params: Record<string, string> = { pageSize: String(PAGE_SIZE) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get('/customer-visits/my-all', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;

    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await database.write(async () => {
        for (const v of batch) {
          try {
            const visitCode = v.visitCode ?? v.id;
            const existing = await database.get('customer_visits')
              .query(Q.where('visit_code', visitCode))
              .fetchCount();
            if (existing > 0) { total++; continue; }
            await database.get('customer_visits').create((rec: any) => {
              rec._raw.id = visitCode;
              rec._raw.visit_code = visitCode;
              rec._raw.user_code = v.userCode;
              rec._raw.customer_code = v.customerCode;
              rec._raw.customer_name = v.customerName ?? '';
              rec._raw.checkin_time = new Date(v.checkinTime).getTime();
              rec._raw.checkout_time = v.checkoutTime ? new Date(v.checkoutTime).getTime() : null;
              rec._raw.checkin_lat = v.checkinLat ?? null;
              rec._raw.checkin_lng = v.checkinLng ?? null;
              rec._raw.checkin_image = v.checkinImage ?? null;
              rec._raw.checkout_lat = v.checkoutLat ?? null;
              rec._raw.checkout_lng = v.checkoutLng ?? null;
              rec._raw.checkout_image = v.checkoutImage ?? null;
              rec._raw.checkin_type = v.checkinType ?? null;
              rec._raw.checkout_type = v.checkoutType ?? null;
              rec._raw.status = v.status ?? 'completed';
              rec._raw.is_synced = true;
            });
            total++;
          } catch (e) {
            console.warn('[PullAllVisits] upsert error:', e);
          }
        }
      });
    }

    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  console.log(`[PullAllVisits] restored ${total} visits from server`);
  return total;
}

// Fetch full order history (headers + lines) for the logged-in user.
// Used after Clear Data / fresh login so the user's order history is
// restored from the server.
export async function pullAllMyOrders(): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  const PAGE_SIZE = 200;
  for (let safety = 0; safety < 500; safety++) {
    const params: Record<string, string> = { pageSize: String(PAGE_SIZE) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get('/orders/my-all', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;

    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await database.write(async () => {
        for (const o of batch) {
          try {
            const appTrxId = o.appTrxId ?? o.trxCode ?? o.id;
            if (!appTrxId) continue;
            const existing = await database.get('orders')
              .query(Q.where('app_trx_id', appTrxId))
              .fetchCount();
            if (existing > 0) { total++; continue; }
            const localId = appTrxId.toString();
            await database.get('orders').create((rec: any) => {
              rec._raw.id = localId;
              rec._raw.app_trx_id = appTrxId;
              rec._raw.server_trx_code = o.trxCode ?? null;
              rec._raw.user_code = o.userCode;
              rec._raw.customer_code = o.customerCode;
              rec._raw.customer_name = o.customerName ?? null;
              rec._raw.trx_date = new Date(o.trxDate).getTime();
              rec._raw.total_amount = Number(o.totalAmount ?? 0);
              rec._raw.lines_count = Number(o.linesCount ?? (o.lines?.length ?? 0));
              rec._raw.status = Number(o.status ?? 100);
              rec._raw.route_code = o.routeCode ?? null;
              rec._raw.geo_lat = o.geoLat != null ? Number(o.geoLat) : null;
              rec._raw.geo_lng = o.geoLng != null ? Number(o.geoLng) : null;
              rec._raw.is_synced = true;
            });
            for (const l of (o.lines ?? [])) {
              try {
                await database.get('order_lines').create((rec: any) => {
                  rec._raw.id = `${localId}_${l.lineNo ?? l.id}`;
                  rec._raw.order_id = localId;
                  rec._raw.line_no = Number(l.lineNo ?? 1);
                  rec._raw.item_code = l.itemCode;
                  rec._raw.item_name = l.itemName ?? null;
                  rec._raw.quantity = Number(l.quantity ?? 0);
                  rec._raw.price_used = Number(l.priceUsed ?? 0);
                  rec._raw.tax_pct = Number(l.taxPct ?? 0);
                  rec._raw.uom = l.uom ?? 'EA';
                });
              } catch (e) {
                console.warn('[PullAllOrders] line upsert error:', e);
              }
            }
            total++;
          } catch (e) {
            console.warn('[PullAllOrders] order upsert error:', e);
          }
        }
      });
    }

    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  console.log(`[PullAllOrders] restored ${total} orders from server`);
  return total;
}

// Pull all opening-stock entries for the user from the server. Server stores
// header + items separately; mobile schema is flat (one row per item), so we
// expand each server row into N mobile rows.
export async function pullAllMyOpeningStocks(): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  const PAGE_SIZE = 200;
  for (let safety = 0; safety < 500; safety++) {
    const params: Record<string, string> = { pageSize: String(PAGE_SIZE) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get('/stocks/opening/my-all', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;

    await database.write(async () => {
      for (const header of rows) {
        const items = Array.isArray(header.items) ? header.items : [];
        for (const it of items) {
          try {
            const appTrxId = `${header.appTrxId ?? header.id}_${it.itemCode}`;
            const existing = await database.get('opening_stocks')
              .query(Q.where('app_trx_id', appTrxId))
              .fetchCount();
            if (existing > 0) { total++; continue; }
            await database.get('opening_stocks').create((rec: any) => {
              rec._raw.id = appTrxId;
              rec._raw.app_trx_id = appTrxId;
              rec._raw.user_code = header.userCode;
              rec._raw.customer_code = header.customerCode;
              rec._raw.visit_code = header.visitCode ?? null;
              rec._raw.item_code = it.itemCode;
              rec._raw.item_name = it.itemName ?? null;
              rec._raw.category = it.category ?? null;
              rec._raw.brand = it.brand ?? null;
              rec._raw.quantity = Number(it.quantity ?? 0);
              rec._raw.uom = it.uom ?? 'EA';
              rec._raw.stock_date = header.stockDate ?? '';
              rec._raw.is_synced = true;
            });
            total++;
          } catch (e) {
            console.warn('[PullAllOpeningStocks] upsert error:', e);
          }
        }
      }
    });

    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  console.log(`[PullAllOpeningStocks] restored ${total} opening-stock rows`);
  return total;
}

// Pull all physical-stock entries for the user. Same flattening as opening.
export async function pullAllMyPhysicalStocks(): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  const PAGE_SIZE = 200;
  for (let safety = 0; safety < 500; safety++) {
    const params: Record<string, string> = { pageSize: String(PAGE_SIZE) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get('/stocks/physical/my-all', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;

    await database.write(async () => {
      for (const header of rows) {
        const items = Array.isArray(header.items) ? header.items : [];
        for (const it of items) {
          try {
            const appTrxId = `${header.appTrxId ?? header.id}_${it.itemCode}`;
            const existing = await database.get('physical_stocks')
              .query(Q.where('app_trx_id', appTrxId))
              .fetchCount();
            if (existing > 0) { total++; continue; }
            await database.get('physical_stocks').create((rec: any) => {
              rec._raw.id = appTrxId;
              rec._raw.app_trx_id = appTrxId;
              rec._raw.user_code = header.userCode;
              rec._raw.customer_code = header.customerCode;
              rec._raw.visit_code = header.visitCode ?? null;
              rec._raw.item_code = it.itemCode;
              rec._raw.item_name = it.itemName ?? null;
              rec._raw.category = it.category ?? null;
              rec._raw.brand = it.brand ?? null;
              rec._raw.system_qty = Number(it.systemQty ?? 0);
              rec._raw.physical_qty = Number(it.physicalQty ?? 0);
              rec._raw.uom = it.uom ?? 'EA';
              rec._raw.stock_date = header.stockDate ?? '';
              rec._raw.image_path = header.imagePath ?? null;
              rec._raw.captured_on = header.capturedOn ? new Date(header.capturedOn).getTime() : null;
              rec._raw.geo_lat = header.geoLat != null ? Number(header.geoLat) : null;
              rec._raw.geo_lng = header.geoLng != null ? Number(header.geoLng) : null;
              rec._raw.is_synced = true;
            });
            total++;
          } catch (e) {
            console.warn('[PullAllPhysicalStocks] upsert error:', e);
          }
        }
      }
    });

    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  console.log(`[PullAllPhysicalStocks] restored ${total} physical-stock rows`);
  return total;
}

// Shared paginator for the simple flat /restore/* endpoints. Calls `upsert`
// for each row inside a single database.write per page.
async function paginateAndUpsert(
  path: string,
  upsert: (row: any) => Promise<void>,
  pageSize = 500,
): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  for (let safety = 0; safety < 500; safety++) {
    const params: Record<string, string> = { pageSize: String(pageSize) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get(path, { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    await database.write(async () => {
      for (const r of rows) {
        try { await upsert(r); total++; } catch (e) { console.warn(`[Restore ${path}] upsert err:`, e); }
      }
    });
    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  return total;
}

// Pull all attendance records for the user.
export async function pullAllMyAttendance(): Promise<number> {
  const t = await paginateAndUpsert('/restore/attendance/my-all', async (a) => {
    const id = `att_${a.id}`;
    const existing = await database.get('attendance_records').query(Q.where('id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('attendance_records').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.user_code = a.userCode;
      rec._raw.is_present = !!a.isPresent;
      rec._raw.attendance_type = a.attendanceType ?? null;
      rec._raw.selfie_path = a.selfiePath ?? null;
      rec._raw.attendance_date = a.attendanceDate ?? '';
      rec._raw.geo_lat = a.geoLat != null ? Number(a.geoLat) : null;
      rec._raw.geo_lng = a.geoLng != null ? Number(a.geoLng) : null;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllAttendance] restored ${t} attendance rows`);
  return t;
}

// Pull all store-check headers for the user. (Item lines for each store
// check are not pulled back yet — header-only restore covers the badge
// counts users see in reports.)
export async function pullAllMyStoreChecks(): Promise<number> {
  const t = await paginateAndUpsert('/restore/store-checks/my-all', async (s) => {
    const appId = s.appId ?? `sc_${s.id}`;
    const existing = await database.get('store_checks').query(Q.where('app_id', appId)).fetchCount();
    if (existing > 0) return;
    await database.get('store_checks').create((rec: any) => {
      rec._raw.id = appId;
      rec._raw.app_id = appId;
      rec._raw.user_code = s.userCode;
      rec._raw.customer_code = s.customerCode;
      rec._raw.customer_name = s.customerName ?? null;
      rec._raw.visit_code = s.visitCode ?? null;
      rec._raw.check_date = new Date(s.checkDate).getTime();
      rec._raw.total_count = Number(s.totalCount ?? 0);
      rec._raw.food_count = Number(s.foodCount ?? 0);
      rec._raw.non_food_count = Number(s.nonFoodCount ?? 0);
      rec._raw.status = Number(s.status ?? 0);
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllStoreChecks] restored ${t} store-check rows`);
  return t;
}

// Pull all expiry checks for the user.
export async function pullAllMyExpiryChecks(): Promise<number> {
  const t = await paginateAndUpsert('/restore/expiry-checks/my-all', async (e) => {
    const id = `exp_${e.id}`;
    const existing = await database.get('expiry_checks').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('expiry_checks').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = e.userCode;
      rec._raw.customer_code = e.customerCode;
      rec._raw.visit_code = null;
      rec._raw.item_code = e.itemCode;
      rec._raw.item_name = null;
      rec._raw.category = e.category ?? null;
      rec._raw.quantity = Number(e.quantity ?? 0);
      rec._raw.uom = e.uom ?? 'EA';
      rec._raw.expiry_date = e.expiryDate ?? '';
      rec._raw.visited_date = e.visitedDate ?? '';
      rec._raw.status = e.status ?? '';
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllExpiryChecks] restored ${t} expiry rows`);
  return t;
}

// Pull all competitor observations for the user.
export async function pullAllMyCompetitorObs(): Promise<number> {
  const t = await paginateAndUpsert('/restore/competitor-observations/my-all', async (c) => {
    const id = c.appTrxId ?? `cob_${c.id}`;
    const existing = await database.get('competitor_observations').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('competitor_observations').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = c.userCode;
      rec._raw.customer_code = c.customerCode;
      rec._raw.visit_code = c.visitCode ?? null;
      rec._raw.brand_name = c.brandName ?? '';
      rec._raw.product_name = c.productName ?? null;
      rec._raw.category = c.category ?? null;
      rec._raw.price = c.price != null ? Number(c.price) : null;
      rec._raw.selling_price = c.sellingPrice != null ? Number(c.sellingPrice) : null;
      rec._raw.uom = c.uom ?? null;
      rec._raw.image_path = c.imagePath ?? null;
      rec._raw.notes = c.notes ?? null;
      rec._raw.observed_on = c.observedOn ? new Date(c.observedOn).getTime() : Date.now();
      rec._raw.geo_lat = c.geoLat != null ? Number(c.geoLat) : null;
      rec._raw.geo_lng = c.geoLng != null ? Number(c.geoLng) : null;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllCompetitorObs] restored ${t} competitor-observation rows`);
  return t;
}

// Pull all OSOI photo records for the user.
// Existing rows are updated for the approval columns so the badge on the
// mobile reflects an admin's recent approve/reject action from the web
// portal — the rest of the fields are left untouched to avoid clobbering
// any local edits.
export async function pullAllMyOsoi(): Promise<number> {
  const t = await paginateAndUpsert('/restore/osoi/my-all', async (o) => {
    const id = o.appTrxId ?? `osoi_${o.id}`;
    // OSOI backend columns are reviewed_by / reviewed_at (not approved_*).
    // Map either shape so a future column rename doesn't silently drop data.
    const approvalStatus = o.approvalStatus ?? null;
    const approvedBy = o.approvedBy ?? o.reviewedBy ?? null;
    const reviewedAt = o.approvedOn ?? o.reviewedAt ?? null;
    const approvedOn = reviewedAt ? new Date(reviewedAt).getTime() : null;
    const existing = await database.get('osoi_photos').query(Q.where('app_trx_id', id)).fetch();
    if (existing.length > 0) {
      const rec: any = existing[0];
      if (
        rec.approvalStatus !== approvalStatus ||
        rec.approvedBy !== approvedBy ||
        rec.approvedOn !== approvedOn
      ) {
        await rec.update((r: any) => {
          r.approvalStatus = approvalStatus;
          r.approvedBy = approvedBy;
          r.approvedOn = approvedOn;
        });
      }
      return;
    }
    await database.get('osoi_photos').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = o.userCode;
      rec._raw.customer_code = o.customerCode;
      rec._raw.visit_code = o.visitCode ?? null;
      rec._raw.asset_type = o.assetType ?? '';
      rec._raw.image_path = o.imagePath ?? '';
      rec._raw.geo_lat = o.geoLat != null ? Number(o.geoLat) : null;
      rec._raw.geo_lng = o.geoLng != null ? Number(o.geoLng) : null;
      rec._raw.captured_on = o.capturedOn ? new Date(o.capturedOn).getTime() : Date.now();
      rec._raw.approval_status = approvalStatus;
      rec._raw.approved_by = approvedBy;
      rec._raw.approved_on = approvedOn;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllOsoi] restored ${t} osoi-photo rows`);
  return t;
}

// Count rows across every transaction table that haven't been pushed
// to the server yet. Used by the Dashboard banner to warn users when
// they have offline-captured data so they know to connect to the
// internet before clearing app data.
export async function recomputePendingCount(): Promise<number> {
  const tables = [
    'orders', 'customer_visits', 'attendance_records', 'opening_stocks',
    'physical_stocks', 'store_checks', 'expiry_checks', 'competitor_observations',
    'osoi_photos', 'po_captures', 'product_samplings', 'planogram_executions',
    'initiative_executions',
  ];
  let total = 0;
  for (const t of tables) {
    try {
      const n = await database.get(t).query(Q.where('is_synced', false)).fetchCount();
      total += n;
    } catch { /* table may not exist on older builds */ }
  }
  try {
    const useSyncStore = require('../store/sync').default;
    useSyncStore.getState().setPendingCount(total);
  } catch { /* ignore */ }
  return total;
}

// Per-table breakdown of unsynced rows. Useful for diagnostics when the
// banner says "1 item not yet synced" but the user can't tell which one.
export async function getUnsyncedByEntity(): Promise<Array<{ table: string; count: number }>> {
  const tables = [
    'orders', 'customer_visits', 'attendance_records', 'opening_stocks',
    'physical_stocks', 'store_checks', 'expiry_checks', 'competitor_observations',
    'osoi_photos', 'po_captures', 'product_samplings', 'planogram_executions',
    'initiative_executions', 'permanent_display_checks', 'survey_responses',
    'prospects', 'collections', 'price_checks', 'rota_drafts',
  ];
  const out: Array<{ table: string; count: number }> = [];
  for (const t of tables) {
    try {
      const n = await database.get(t).query(Q.where('is_synced', false)).fetchCount();
      if (n > 0) out.push({ table: t, count: n });
    } catch { /* table may not exist on older builds */ }
  }
  return out;
}

// Pull rota activities (General Shift / Morning Shift / Holiday / Leave /
// Week Off entries) for the user. Stored locally in rota_drafts so the
// Rota screen + related reports show the user's history.
export async function pullAllMyRota(): Promise<number> {
  const t = await paginateAndUpsert('/restore/rota/my-all', async (r) => {
    const id = `rota_${r.id}`;
    const existing = await database.get('rota_drafts').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('rota_drafts').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = r.userCode;
      rec._raw.activity_name = r.activityName ?? '';
      rec._raw.rota_date = r.rotaDate ?? '';
      rec._raw.start_time = r.startTime ?? null;
      rec._raw.end_time = r.endTime ?? null;
      rec._raw.created_by = r.createdBy ?? r.userCode;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllRota] restored ${t} rota activities`);
  return t;
}

// Pull all PO captures (header + items) for the user.
export async function pullAllMyPOCaptures(): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  const PAGE_SIZE = 200;
  for (let safety = 0; safety < 500; safety++) {
    const params: Record<string, string> = { pageSize: String(PAGE_SIZE) };
    if (cursor) params.afterId = cursor;
    const { data } = await api.get('/restore/po-captures/my-all', { params });
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    await database.write(async () => {
      for (const h of rows) {
        try {
          const id = h.appTrxId ?? `po_${h.id}`;
          const existing = await database.get('po_captures').query(Q.where('app_trx_id', id)).fetchCount();
          if (existing > 0) { total++; continue; }
          await database.get('po_captures').create((rec: any) => {
            rec._raw.id = id;
            rec._raw.app_trx_id = id;
            rec._raw.user_code = h.userCode;
            rec._raw.customer_code = h.customerCode;
            rec._raw.visit_code = h.visitCode ?? null;
            rec._raw.po_number = h.poNumber ?? '';
            rec._raw.image_path = h.imagePath ?? null;
            rec._raw.total_amount = Number(h.totalAmount ?? 0);
            rec._raw.captured_on = h.capturedOn ? new Date(h.capturedOn).getTime() : Date.now();
            rec._raw.geo_lat = h.geoLat != null ? Number(h.geoLat) : null;
            rec._raw.geo_lng = h.geoLng != null ? Number(h.geoLng) : null;
            rec._raw.status = Number(h.status ?? 0);
            rec._raw.is_synced = true;
          });
          for (const it of (h.items ?? [])) {
            try {
              await database.get('po_capture_items').create((rec: any) => {
                rec._raw.id = `${id}_${it.itemCode}_${it.id}`;
                rec._raw.po_capture_id = id;
                rec._raw.item_code = it.itemCode;
                rec._raw.item_name = it.itemName ?? null;
                rec._raw.quantity = Number(it.quantity ?? 0);
                rec._raw.price = Number(it.price ?? 0);
                rec._raw.uom = it.uom ?? 'EA';
              });
            } catch (e) { console.warn('[PullAllPO] item create failed:', e); }
          }
          total++;
        } catch (e) { console.warn('[PullAllPOCaptures] upsert err:', e); }
      }
    });
    if (!data?.hasMore) break;
    cursor = data?.nextCursor ?? null;
    if (!cursor) break;
  }
  console.log(`[PullAllPOCaptures] restored ${total} po-captures`);
  return total;
}

// Pull all planogram executions for the user.
// Existing rows get their approval columns refreshed so the mobile badge
// updates after an admin approves / rejects from the web portal.
export async function pullAllMyPlanogramExecutions(): Promise<number> {
  const t = await paginateAndUpsert('/restore/planogram-executions/my-all', async (p) => {
    const id = p.appTrxId ?? `pe_${p.id}`;
    const approvalStatus = p.approvalStatus ?? null;
    const approvedBy = p.approvedBy ?? null;
    const approvedOn = p.approvedOn ? new Date(p.approvedOn).getTime() : null;
    const existing = await database.get('planogram_executions').query(Q.where('app_trx_id', id)).fetch();
    if (existing.length > 0) {
      const rec: any = existing[0];
      if (
        rec.approvalStatus !== approvalStatus ||
        rec.approvedBy !== approvedBy ||
        rec.approvedOn !== approvedOn
      ) {
        await rec.update((r: any) => {
          r.approvalStatus = approvalStatus;
          r.approvedBy = approvedBy;
          r.approvedOn = approvedOn;
        });
      }
      return;
    }
    await database.get('planogram_executions').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = p.userCode;
      rec._raw.customer_code = p.customerCode;
      rec._raw.visit_code = p.visitCode ?? null;
      rec._raw.category_code = p.categoryCode ?? null;
      rec._raw.performed_on = p.performedOn ? new Date(p.performedOn).getTime() : Date.now();
      rec._raw.is_followed = !!p.isFollowed;
      rec._raw.pre_image = p.preImage ?? null;
      rec._raw.post_image = p.postImage ?? null;
      rec._raw.notes = null;
      rec._raw.approval_status = approvalStatus;
      rec._raw.approved_by = approvedBy;
      rec._raw.approved_on = approvedOn;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllPlanogramExecs] restored ${t} rows`);
  return t;
}

// Lightweight approval-only sync. Used by backgroundSync on a tighter interval
// (~10 s) than the periodic incrementalSync so admin approve / reject / skip
// actions on the web portal land on the mobile badge within seconds. Payload
// is just appTrxId + approval columns for non-pending OSOI / Planogram rows.
export async function syncApprovalUpdates(): Promise<void> {
  try {
    const { data } = await api.get('/restore/approval-updates/my-recent');
    const osoiUpdates: any[] = Array.isArray(data?.osoi) ? data.osoi : [];
    const planoUpdates: any[] = Array.isArray(data?.planogram) ? data.planogram : [];
    if (osoiUpdates.length === 0 && planoUpdates.length === 0) return;

    if (osoiUpdates.length > 0) {
      const appIds = osoiUpdates.map((o: any) => o.appTrxId).filter(Boolean);
      const locals: any[] = appIds.length > 0
        ? await database.get('osoi_photos').query(Q.where('app_trx_id', Q.oneOf(appIds))).fetch()
        : [];
      const byApp = new Map<string, any>();
      for (const r of locals) byApp.set(r.appTrxId, r);
      await database.write(async () => {
        for (const o of osoiUpdates) {
          const rec = byApp.get(o.appTrxId);
          if (!rec) continue;
          const newStatus = o.approvalStatus ?? null;
          const newBy = o.reviewedBy ?? null;
          const newOn = o.reviewedAt ? new Date(o.reviewedAt).getTime() : null;
          if (
            rec.approvalStatus !== newStatus ||
            rec.approvedBy !== newBy ||
            rec.approvedOn !== newOn
          ) {
            await rec.update((r: any) => {
              r.approvalStatus = newStatus;
              r.approvedBy = newBy;
              r.approvedOn = newOn;
            });
          }
        }
      });
    }

    if (planoUpdates.length > 0) {
      const appIds = planoUpdates.map((p: any) => p.appTrxId).filter(Boolean);
      const locals: any[] = appIds.length > 0
        ? await database.get('planogram_executions').query(Q.where('app_trx_id', Q.oneOf(appIds))).fetch()
        : [];
      const byApp = new Map<string, any>();
      for (const r of locals) byApp.set(r.appTrxId, r);
      await database.write(async () => {
        for (const p of planoUpdates) {
          const rec = byApp.get(p.appTrxId);
          if (!rec) continue;
          const newStatus = p.approvalStatus ?? null;
          const newBy = p.approvedBy ?? null;
          const newOn = p.approvedOn ? new Date(p.approvedOn).getTime() : null;
          if (
            rec.approvalStatus !== newStatus ||
            rec.approvedBy !== newBy ||
            rec.approvedOn !== newOn
          ) {
            await rec.update((r: any) => {
              r.approvalStatus = newStatus;
              r.approvedBy = newBy;
              r.approvedOn = newOn;
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Sync] syncApprovalUpdates failed:', err);
  }
}

// Pull all initiative executions for the user.
export async function pullAllMyInitiativeExecutions(): Promise<number> {
  const t = await paginateAndUpsert('/restore/initiative-executions/my-all', async (e) => {
    const id = e.appTrxId ?? `ie_${e.id}`;
    const existing = await database.get('initiative_executions').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('initiative_executions').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.initiative_id = String(e.initiativeId ?? '');
      rec._raw.user_code = e.userCode;
      rec._raw.customer_code = e.customerCode;
      rec._raw.visit_code = e.visitCode ?? null;
      rec._raw.executed_on = e.executedOn ? new Date(e.executedOn).getTime() : Date.now();
      rec._raw.notes = e.notes ?? null;
      rec._raw.photo_path = e.photoPath ?? null;
      rec._raw.status = e.status ?? 'completed';
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllInitiativeExecs] restored ${t} rows`);
  return t;
}

// Pull all store-check item lines (the per-product detail rows inside
// each store check). Parent store_checks headers are restored by
// pullAllMyStoreChecks above; this fills in the items table so the
// drill-down shows the captured per-product quantities.
export async function pullAllMyStoreCheckItems(): Promise<number> {
  const t = await paginateAndUpsert('/restore/store-check-items/my-all', async (it) => {
    const id = `sci_${it.id}`;
    const existing = await database.get('store_check_items').query(Q.where('id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('store_check_items').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.store_check_id = it.parentAppId ?? String(it.storeCheckId ?? '');
      rec._raw.item_code = it.itemCode;
      rec._raw.item_name = it.itemName ?? '';
      rec._raw.category_name = it.categoryName ?? null;
      rec._raw.brand_name = it.brandName ?? null;
      rec._raw.shelf_quantity = Number(it.shelfQuantity ?? 0);
      rec._raw.store_quantity = Number(it.storeQuantity ?? 0);
      rec._raw.is_available = Number(it.storeQuantity ?? 0) > 0 || Number(it.shelfQuantity ?? 0) > 0;
      rec._raw.reason = it.reason ?? null;
    });
  });
  console.log(`[PullAllStoreCheckItems] restored ${t} rows`);
  return t;
}

// Pull all product-sampling records for the user.
export async function pullAllMyProductSamplings(): Promise<number> {
  const t = await paginateAndUpsert('/restore/product-samplings/my-all', async (p) => {
    const id = p.appTrxId ?? `ps_${p.id}`;
    const existing = await database.get('product_samplings').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('product_samplings').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = p.userCode;
      rec._raw.customer_code = p.customerCode;
      rec._raw.visit_code = p.visitCode ?? null;
      rec._raw.item_code = p.itemCode;
      rec._raw.item_name = p.itemName ?? null;
      rec._raw.quantity_sampled = Number(p.quantitySampled ?? 0);
      rec._raw.uom = p.uom ?? 'Pieces';
      rec._raw.consumer_feedback = p.consumerFeedback ?? null;
      rec._raw.selling_price = p.sellingPrice != null ? Number(p.sellingPrice) : null;
      rec._raw.units_sold = p.unitsSold != null ? Number(p.unitsSold) : null;
      rec._raw.customers_approached = p.customersApproached != null ? Number(p.customersApproached) : null;
      rec._raw.sampled_on = p.sampledOn ? new Date(p.sampledOn).getTime() : Date.now();
      rec._raw.photo_path = p.photoPath ?? null;
      rec._raw.geo_lat = p.geoLat != null ? Number(p.geoLat) : null;
      rec._raw.geo_lng = p.geoLng != null ? Number(p.geoLng) : null;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllProductSamplings] restored ${t} product-sampling rows`);
  return t;
}

export async function pullAllMyCollections(): Promise<number> {
  const t = await paginateAndUpsert('/restore/collections/my-all', async (c) => {
    const id = c.appTrxId ?? `col_${c.id}`;
    const existing = await database.get('collections').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('collections').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = c.userCode;
      rec._raw.customer_code = c.customerCode;
      rec._raw.amount = Number(c.amount ?? 0);
      rec._raw.payment_mode = c.paymentMode ?? '';
      rec._raw.reference_number = c.referenceNumber ?? null;
      rec._raw.collection_date = c.collectionDate ?? '';
      rec._raw.notes = c.notes ?? null;
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllCollections] restored ${t} collection rows`);
  return t;
}

export async function pullAllMyPermanentDisplayChecks(): Promise<number> {
  const t = await paginateAndUpsert('/restore/permanent-display-checks/my-all', async (p) => {
    const id = p.appTrxId ?? `pdc_${p.id}`;
    const existing = await database.get('permanent_display_checks').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('permanent_display_checks').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.display_id = p.displayId != null ? String(p.displayId) : '';
      rec._raw.user_code = p.userCode;
      rec._raw.customer_code = p.customerCode;
      rec._raw.visit_code = p.visitCode ?? null;
      rec._raw.is_compliant = !!p.isCompliant;
      rec._raw.issue_description = p.issueDescription ?? null;
      rec._raw.photo_path = p.photoPath ?? null;
      rec._raw.checked_on = p.checkedOn ? new Date(p.checkedOn).getTime() : Date.now();
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllPermanentDisplayChecks] restored ${t} permanent-display-check rows`);
  return t;
}

export async function pullAllMyPriceChecks(): Promise<number> {
  const t = await paginateAndUpsert('/restore/price-checks/my-all', async (p) => {
    const id = p.appTrxId ?? `pc_${p.id}`;
    const existing = await database.get('price_checks').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('price_checks').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = p.userCode;
      rec._raw.customer_code = p.customerCode;
      rec._raw.item_code = p.itemCode;
      rec._raw.expected_price = p.expectedPrice != null ? Number(p.expectedPrice) : 0;
      rec._raw.actual_price = p.actualPrice != null ? Number(p.actualPrice) : 0;
      rec._raw.is_compliant = p.isCompliant !== false;
      rec._raw.check_date = p.checkDate ?? '';
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllPriceChecks] restored ${t} price-check rows`);
  return t;
}

export async function pullAllMyProspects(): Promise<number> {
  const t = await paginateAndUpsert('/restore/prospects/my-all', async (p) => {
    const id = p.appTrxId ?? `prs_${p.id}`;
    const existing = await database.get('prospects').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('prospects').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.server_id = p.id != null ? String(p.id) : null;
      rec._raw.user_code = p.userCode;
      rec._raw.prospect_name = p.prospectName ?? '';
      rec._raw.contact_name = p.contactName ?? null;
      rec._raw.phone = p.phone ?? null;
      rec._raw.address = p.address ?? null;
      rec._raw.city = p.city ?? null;
      rec._raw.channel_type = p.channelType ?? null;
      rec._raw.geo_lat = p.geoLat != null ? Number(p.geoLat) : null;
      rec._raw.geo_lng = p.geoLng != null ? Number(p.geoLng) : null;
      rec._raw.photo_path = p.photoPath ?? null;
      rec._raw.status = p.status ?? 'new';
      rec._raw.notes = p.notes ?? null;
      rec._raw.created_on = p.createdOn ? new Date(p.createdOn).getTime() : Date.now();
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllProspects] restored ${t} prospect rows`);
  return t;
}

export async function pullAllMyVanStockRecords(): Promise<number> {
  const t = await paginateAndUpsert('/restore/van-stock-records/my-all', async (v) => {
    const id = v.appTrxId ?? `vs_${v.id}`;
    const existing = await database.get('van_stock_records').query(Q.where('app_trx_id', id)).fetchCount();
    if (existing > 0) return;
    await database.get('van_stock_records').create((rec: any) => {
      rec._raw.id = id;
      rec._raw.app_trx_id = id;
      rec._raw.user_code = v.userCode;
      rec._raw.item_code = v.itemCode;
      rec._raw.loaded_qty = Number(v.loadedQty ?? 0);
      rec._raw.sold_qty = Number(v.soldQty ?? 0);
      rec._raw.balance_qty = Number(v.balanceQty ?? 0);
      rec._raw.stock_date = v.stockDate ?? '';
      rec._raw.is_synced = true;
    });
  });
  console.log(`[PullAllVanStockRecords] restored ${t} van-stock rows`);
  return t;
}

// ===== INCREMENTAL SYNC =====

// Belt-and-suspenders periodic full refresh for every master module.
// Background incrementalSync is cursor-based (updated_at > saved
// cursor) and relies on each table's updated_at being bumped on
// every write. Only `prices` has an explicit Postgres trigger; other
// master tables depend on the application code to set updated_at
// correctly. Raw-SQL backfills, restored backups, missed triggers,
// or any other delta-missed-the-row condition would leave mobile
// permanently stale. Every FULL_REFRESH_INTERVAL_MS we destroy the
// saved cursor for each module so the next pull asks the backend
// for the full active set — guaranteed catch-up for backend
// INSERT/UPDATE/DELETE on prices, customers, items, journey plans,
// surveys, initiatives, planogram_setups, etc.
//
// Modules are staggered by FULL_REFRESH_STAGGER_MS so they don't all
// reset on the same tick (which would briefly spike bandwidth +
// latency). With a 5-min interval and 30-s stagger, one module
// re-pulls roughly every 30 s on average.
const FULL_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min per module
const FULL_REFRESH_STAGGER_MS = 30 * 1000;       // 30 s between modules
const lastFullRefreshAt: Record<string, number> = {};

export async function incrementalSync(
  routeCode: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const now = Date.now();

  // Seed the per-module "last refreshed" timestamps on the very first
  // call so each module's initial full-refresh deadline is staggered.
  // Without seeding, every module's deadline is `0 + interval` and
  // they'd all fire on the same tick.
  if (Object.keys(lastFullRefreshAt).length === 0) {
    PULL_MODULES.forEach((mod, idx) => {
      lastFullRefreshAt[mod] = now - FULL_REFRESH_INTERVAL_MS + idx * FULL_REFRESH_STAGGER_MS;
    });
  }

  // Decide which modules are due for a full refresh this tick.
  const modulesToFullRefresh = PULL_MODULES.filter(
    (mod) => now - (lastFullRefreshAt[mod] ?? 0) >= FULL_REFRESH_INTERVAL_MS,
  );

  if (modulesToFullRefresh.length > 0) {
    try {
      await resetCursors(modulesToFullRefresh);
      modulesToFullRefresh.forEach((mod) => { lastFullRefreshAt[mod] = now; });
      console.log(`[Sync] periodic full refresh: cursors reset for ${modulesToFullRefresh.join(', ')}`);
    } catch (err) {
      console.warn('[Sync] resetCursors(periodic) failed:', err);
    }
  }

  // Pull new data — wrapped in try/catch so failures don't prevent reconcile
  try {
    await pullSync(
      {
        modules: PULL_MODULES,
        limit: 500,
        routeCode,
      },
      onProgress,
    );
    // If any module just got a full reset and the first page reported
    // more pages, drain them so the cursor catches up in this tick.
    // Cap at 10 extra calls per module to defend against a pathological
    // hasMore loop.
    if (modulesToFullRefresh.length > 0) {
      for (let i = 0; i < 10; i++) {
        const drain = await pullSync({ modules: modulesToFullRefresh, limit: 500, routeCode, skipForceFlags: true });
        if (!drain.some((r) => r.hasMore)) break;
      }
    }
  } catch (err) {
    console.warn('[Sync] pullSync failed (continuing with reconcile):', err);
  }

  // Pull today's visits so badges + covered stores stay fresh
  try { await pullTodaysVisits(); } catch { /* non-blocking */ }

  // Refresh MSL (selling_skus) so chain-SKU edits made on the web portal
  // propagate to mobile on every periodic sync, not just at first login.
  try { await syncSellingSkus(); } catch (err) {
    console.warn('[Sync] syncSellingSkus failed:', err);
  }

  // Refresh OSOI + Planogram approval columns on every periodic sync so
  // admin approve / reject / skip actions on the web portal flow into the
  // mobile badge while the user is still logged in. The pull functions
  // only touch existing rows when an approval column actually changed, so
  // the cost is dominated by network round-trips, not local writes.
  try { await pullAllMyOsoi(); } catch (err) {
    console.warn('[Sync] pullAllMyOsoi (approval refresh) failed:', err);
  }
  try { await pullAllMyPlanogramExecutions(); } catch (err) {
    console.warn('[Sync] pullAllMyPlanogramExecutions (approval refresh) failed:', err);
  }

  // Reconcile customer scope — remove any local customer whose assignment
  // was revoked on the server (or whose source row was deleted).
  try {
    await reconcileCustomerScope();
    console.log('[Sync] reconcileCustomerScope completed');
  } catch (err) {
    console.warn('[Sync] reconcileCustomerScope failed:', err);
  }

  // Push local changes
  try { await pushSync(); } catch (err) {
    console.warn('[Sync] pushSync failed:', err);
  }

  // Backup master data to external storage (only if enough time has passed since last backup)
  try {
    const metadata = await import('./masterDataBackup').then(m => m.getBackupMetadata());
    const now = Date.now();
    // Only backup if last backup was more than 1 hour ago
    if (!metadata || (now - metadata.lastBackupAt > 60 * 60 * 1000)) {
      await backupMasterData();
      console.log('[IncrementalSync] Master data backed up');
    }
  } catch (err) {
    // Backup failure is non-critical
    console.log('[IncrementalSync] Backup skipped:', err);
  }
}

// ===== SCOPE RECONCILE =====
// Fetches the authoritative list of customer codes for the current user and
// deletes any local customers not in it. Fixes the case where an admin
// removes a customer or un-assigns one from a user — the regular pull sync
// doesn't signal a "delete" for these, so without this the removed customer
// would linger on the device forever.
export async function reconcileCustomerScope(): Promise<void> {
  const { data } = await api.get('/user-customers/my-codes');
  const allowed: string[] = Array.isArray(data?.codes) ? data.codes : [];
  if (!Array.isArray(allowed)) return;
  const allowedSet = new Set(allowed);

  const locals: any[] = await database.get('customers').query().fetch();
  console.log(`[Sync] reconcile: ${locals.length} local, ${allowed.length} allowed`);
  const toDelete = locals.filter((c: any) => {
    const code = c.code ?? c._raw?.code;
    return code && !allowedSet.has(code);
  });

  // Fetch any customer records that are in `allowed` but missing from
  // the local customers table. Without this step, a newly-assigned
  // customer whose customers.updated_at predates the user's sync cursor
  // never reaches the device — the cursor-based /sync/pull filters it
  // out. The reconcile JPC step (further down) then creates a JPC row
  // pointing at a customer code that doesn't exist locally, so the
  // store stays hidden from My Stores. /user-customers/my-codes is the
  // authoritative source of truth — anything in that list must be on
  // the device with full customer details.
  try {
    const localCodes = new Set(locals.map((c: any) => c.code ?? c._raw?.code).filter(Boolean));
    const missingFromCustomers = allowed.filter((code) => !localCodes.has(code));
    if (missingFromCustomers.length > 0) {
      console.log(`[Sync] reconcile: fetching ${missingFromCustomers.length} missing customer records`);
      // /customers supports filter by codes (comma list). If the backend
      // doesn't support that param it returns all and we filter locally.
      const { data: custData } = await api.get('/customers', {
        params: { codes: missingFromCustomers.join(','), pageSize: 5000 },
      });
      const rows = Array.isArray(custData?.data) ? custData.data : (Array.isArray(custData) ? custData : []);
      const wanted = new Set(missingFromCustomers);
      const filtered = rows.filter((r: any) => r?.code && wanted.has(r.code));
      if (filtered.length > 0) {
        const n = await upsertCustomers(filtered);
        console.log(`[Sync] reconcile: upserted ${n} previously-missing customers`);
        // Refresh locals snapshot so the deletion logic below sees the
        // newly-inserted rows as in-scope.
        const refreshed: any[] = await database.get('customers').query().fetch();
        locals.length = 0;
        locals.push(...refreshed);
      }
    }
  } catch (e) {
    console.warn('[Sync] reconcile: fetch-missing-customers failed:', e);
  }

  // Also reconcile journey_plan_customers — remove JPC entries whose
  // customer code is no longer in the allowed set, AND create entries for
  // newly-assigned customers that have no JPC row yet. Without the create
  // step, My Stores stays stale until pull-to-refresh because background
  // sync doesn't refresh JPC.
  try {
    let currentUserCode = '';
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) currentUserCode = JSON.parse(userJson).code ?? '';
    } catch { /* fall through */ }

    const allJpc: any[] = await database.get('journey_plan_customers').query().fetch();
    const jpcToDelete = allJpc.filter((j: any) => {
      const code = j.customerCode ?? j._raw?.customer_code;
      return code && !allowedSet.has(code);
    });
    if (jpcToDelete.length > 0) {
      console.log(`[Sync] reconcile: removing ${jpcToDelete.length} journey_plan_customers no longer in scope`);
      await database.write(async () => {
        for (const j of jpcToDelete) {
          try { await j.destroyPermanently(); } catch {}
        }
      });
    }

    if (currentUserCode) {
      const myJpc = allJpc.filter((j: any) => (j.routeCode ?? j._raw?.route_code) === currentUserCode);
      const myJpcCodes = new Set(myJpc.map((j: any) => j.customerCode ?? j._raw?.customer_code).filter(Boolean));
      // Remove already-deleted ones from the set
      for (const j of jpcToDelete) {
        const code = j.customerCode ?? j._raw?.customer_code;
        if (code) myJpcCodes.delete(code);
      }
      const missingCodes = allowed.filter((code) => !myJpcCodes.has(code));
      if (missingCodes.length > 0) {
        console.log(`[Sync] reconcile: creating ${missingCodes.length} journey_plan_customers for new assignments`);
        const startSeq = myJpc.length - jpcToDelete.filter((j: any) => (j.routeCode ?? j._raw?.route_code) === currentUserCode).length + 1;
        await database.write(async () => {
          let seq = startSeq;
          for (const code of missingCodes) {
            try {
              await database.get('journey_plan_customers').create((rec: any) => {
                rec._raw.id = `jpc_${code}_${currentUserCode}`;
                rec._raw.customer_code = code;
                rec._raw.route_code = currentUserCode;
                rec._raw.visit_day = 'Daily';
                rec._raw.visit_sequence = seq++;
                rec._raw.frequency = 'Daily';
              });
            } catch (e) {
              console.warn('[Sync] reconcile JPC create failed for', code, e);
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn('[Sync] reconcile JPC sync failed:', e);
  }

  if (toDelete.length === 0) return;
  console.log(`[Sync] reconcile: removing ${toDelete.length} customer(s) no longer in scope`);

  // AUTO-CHECK-OUT any open visit the rep still has on a now-unassigned customer.
  // When an admin un-assigns a customer from a user on the web portal mid-visit,
  // the rep must be checked out automatically so they can't keep submitting data
  // against a store that's no longer theirs.
  try {
    const codesToDelete = new Set(toDelete.map((c: any) => c.code ?? c._raw?.code).filter(Boolean));
    const openVisits: any[] = await database.get('customer_visits')
      .query(Q.where('status', 'checked_in'))
      .fetch();
    const stale = openVisits.filter((v: any) => codesToDelete.has(v.customerCode ?? v._raw?.customer_code));
    if (stale.length > 0) {
      const now = Date.now();
      await database.write(async () => {
        for (const v of stale) {
          await v.update((rec: any) => {
            rec._raw.checkout_time = now;
            rec._raw.status = 'completed';
            rec._raw.checkout_type = 'auto';
            const checkin = rec._raw.checkin_time || now;
            rec._raw.duration_mins = Math.round((now - checkin) / 60000);
            rec._raw.is_synced = false;
          });
        }
      });
      for (const v of stale) {
        const vc = v.visitCode ?? v._raw?.visit_code;
        if (vc) {
          api.put(`/customer-visits/${encodeURIComponent(vc)}/checkout`, {
            checkoutTime: new Date(now).toISOString(),
            checkoutType: 'auto',
            status: 'completed',
          }).catch(() => { /* background flush retries */ });
        }
      }
      pushSync().catch(() => {});
      console.log(`[Sync] reconcile: auto-checked-out ${stale.length} visit(s) on un-assigned customers`);
    }
  } catch (e) {
    console.warn('[Sync] reconcile: auto-checkout of unassigned customers failed:', e);
  }

  // Delete in batches, inside database.write, and also purge force-flag
  // AsyncStorage keys so nothing points at the removed customer.
  const BATCH = 200;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    await database.write(async () => {
      for (const c of batch) {
        try {
          await c.destroyPermanently();
        } catch (e) {
          console.warn('[Sync] reconcile destroy failed for', c._raw?.code, e);
        }
      }
    });
    for (const c of batch) {
      const code = c._raw?.code;
      if (code) {
        AsyncStorage.removeItem(`force_checkin_${code}`).catch(() => {});
        AsyncStorage.removeItem(`force_checkout_${code}`).catch(() => {});
      }
    }
  }
}

// ===== HELPER: Check if initial sync needed =====

const INITIAL_SYNC_USER_KEY = 'initialSyncCompletedUser';

export async function needsInitialSync(): Promise<boolean> {
  // Only trust the explicit flag set at the END of initialSync (after every
  // module has completed). Checking item count alone was unreliable — items
  // sync early (~14%), so killing the app mid-sync and reopening would skip
  // the remaining modules (customers, prices, etc.).
  const done = await AsyncStorage.getItem('initialSyncCompleted');
  if (done !== 'true') return true;

  let userCode = '';
  try {
    const userJson = await AsyncStorage.getItem('user');
    if (userJson) userCode = JSON.parse(userJson).code ?? '';
  } catch {
    return true;
  }
  if (!userCode) return true;

  const doneUser = await AsyncStorage.getItem(INITIAL_SYNC_USER_KEY);
  // Older builds only had initialSyncCompleted=true with no per-user stamp. Require one
  // more full sync so we never skip master data for a new user on a reused device.
  if (!doneUser) return true;
  if (doneUser !== userCode) return true;
  return false;
}

// Called at the end of initialSync to stamp that sync finished fully.
export async function markInitialSyncCompleted(): Promise<void> {
  await AsyncStorage.setItem('initialSyncCompleted', 'true');
  let userCode = '';
  try {
    const userJson = await AsyncStorage.getItem('user');
    if (userJson) userCode = JSON.parse(userJson).code ?? '';
  } catch {
    /* ignore */
  }
  if (userCode) await AsyncStorage.setItem(INITIAL_SYNC_USER_KEY, userCode);
}
