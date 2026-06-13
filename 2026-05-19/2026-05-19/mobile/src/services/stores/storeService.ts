import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '../../db/database';
import api from '../../api/client';

/**
 * Service for Store-related entities (Customers, Items, Prices, Merchandising).
 * Mirrors the 'stores' microservice on the backend.
 */
export const storeService = {
  async upsertCustomers(rows: any[]): Promise<number> {
    let count = 0;
    const BATCH = 200;
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      await database.write(async () => {
        for (const c of batch) {
          try {
            const existing: any[] = await database
              .get('customers')
              .query(Q.where('code', c.code))
              .fetch();

            if (existing.length > 0) {
              await existing[0].update((rec: any) => {
                rec._raw.name = c.name;
                rec._raw.address = c.address ?? null;
                rec._raw.city_code = c.cityCode ?? null;
                rec._raw.region_code = c.regionCode ?? null;
                rec._raw.channel_code = c.channelCode ?? null;
                rec._raw.customer_group = c.customerGroup ?? null;
                rec._raw.price_list = c.priceList ?? null;
                rec._raw.latitude = c.latitude ?? null;
                rec._raw.longitude = c.longitude ?? null;
                rec._raw.is_active = true;
                rec._raw.server_updated_at = Date.now();
              });
              await AsyncStorage.setItem(`force_checkin_${c.code}`, String(c.forceCheckinEnabled ?? true));
              await AsyncStorage.setItem(`force_checkout_${c.code}`, String(c.forceCheckoutEnabled ?? true));
            } else {
              await database.get('customers').create((rec: any) => {
                rec._raw.id = `cust_${c.code}`;
                rec._raw.server_id = c.id?.toString() ?? '';
                rec._raw.code = c.code;
                rec._raw.name = c.name;
                rec._raw.address = c.address ?? null;
                rec._raw.city_code = c.cityCode ?? null;
                rec._raw.region_code = c.regionCode ?? null;
                rec._raw.channel_code = c.channelCode ?? null;
                rec._raw.customer_group = c.customerGroup ?? null;
                rec._raw.price_list = c.priceList ?? null;
                rec._raw.latitude = c.latitude ?? null;
                rec._raw.longitude = c.longitude ?? null;
                rec._raw.is_active = true;
                rec._raw.server_updated_at = Date.now();
              });
              await AsyncStorage.setItem(`force_checkin_${c.code}`, String(c.forceCheckinEnabled ?? true));
              await AsyncStorage.setItem(`force_checkout_${c.code}`, String(c.forceCheckoutEnabled ?? true));
            }
            count++;
          } catch (e) {
            console.warn('[StoreService] upsertCustomer error:', c.code, e);
          }
        }
      });
    }
    return count;
  },

  async upsertItems(rows: any[]): Promise<number> {
    let count = 0;
    const BATCH = 200;
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      await database.write(async () => {
        for (const item of batch) {
          try {
            const existing: any[] = await database
              .get('items')
              .query(Q.where('code', item.code))
              .fetch();

            if (existing.length > 0) {
              await existing[0].update((rec: any) => {
                rec._raw.name = item.name;
                rec._raw.brand = item.brand ?? null;
                rec._raw.category = item.category ?? null;
                rec._raw.division = item.division ?? null;
                rec._raw.base_uom = item.baseUom ?? 'EA';
                rec._raw.tax_key = item.taxKey ?? null;
                rec._raw.image_path = item.imagePath ?? null;
                rec._raw.is_active = true;
                rec._raw.server_updated_at = Date.now();
              });
            } else {
              await database.get('items').create((rec: any) => {
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
                rec._raw.is_active = true;
                rec._raw.server_updated_at = Date.now();
              });
            }
            count++;
          } catch (e) {
            console.warn('[StoreService] upsertItem error:', item.code, e);
          }
        }
      });
    }
    return count;
  },

  async upsertPrices(rows: any[]): Promise<number> {
    let count = 0;
    await database.write(async () => {
      for (const p of rows) {
        // region_code is part of the identity so base + regional rows don't collide.
        const id = `price_${p.itemCode}_${p.priceList}_${p.regionCode ?? 'BASE'}`;
        const existing: any[] = await database
          .get('prices')
          .query(
            Q.where('item_code', p.itemCode),
            Q.where('price_list', p.priceList),
            Q.where('region_code', p.regionCode ?? null),
          )
          .fetch();

        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec._raw.region_code = p.regionCode ?? null;
            rec._raw.price = p.price;
            rec._raw.mrp = p.mrp ?? null;
            rec._raw.set_price = p.setPrice ?? null;
            rec._raw.currency_code = p.currencyCode ?? 'INR';
            rec._raw.is_active = p.isActive !== false;
          });
        } else {
          await database.get('prices').create((rec: any) => {
            rec._raw.id = id;
            rec._raw.server_id = p.id ?? 0;
            rec._raw.item_code = p.itemCode;
            rec._raw.price_list = p.priceList;
            rec._raw.region_code = p.regionCode ?? null;
            rec._raw.price = p.price;
            rec._raw.mrp = p.mrp ?? null;
            rec._raw.set_price = p.setPrice ?? null;
            rec._raw.currency_code = p.currencyCode ?? 'INR';
            rec._raw.is_active = p.isActive !== false;
          });
        }
        count++;
      }
    });
    return count;
  },

  async getItems(pageSize = 500) {
    return api.get('/items', { params: { pageSize } });
  },

  async getPrices(pageSize = 500) {
    return api.get('/prices', { params: { pageSize } });
  },

  async upsertJourneyPlanCustomers(rows: any[], routeCode: string): Promise<number> {
    let count = 0;
    const BATCH = 200;
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      await database.write(async () => {
        for (const jpc of batch) {
          const day = jpc.visitDay || '';
          const code = jpc.customerCode;
          if (!code) continue;
          const actualRoute = jpc.routeCode ?? routeCode;
          const id = `jpc_${jpc.id ?? code}_${day}_${actualRoute}`;
          try {
            const existing: any[] = await database.get('journey_plan_customers').query(
              Q.where('customer_code', code), Q.where('route_code', actualRoute), Q.where('visit_day', day)
            ).fetch();
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
            console.warn('[StoreService] JPC upsert skip:', code, day, innerErr?.message);
          }
        }
      });
    }
    return count;
  },

  async upsertCompetitorBrands(rows: any[]): Promise<number> {
    let count = 0;
    await database.write(async () => {
      for (const cb of rows) {
        const id = `cb_${cb.id}`;
        const existing: any[] = await database.get('competitor_brands').query(Q.where('server_id', cb.id)).fetch();
        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec._raw.brand_name = cb.brandName;
            rec._raw.company = cb.company ?? null;
            rec._raw.category_code = cb.categoryCode ?? null;
            rec._raw.category_name = cb.categoryName ?? null;
            rec._raw.competitor_brand_code = cb.competitorBrandCode ?? null;
            rec._raw.competitor_brand_name = cb.competitorBrandName ?? null;
          });
        } else {
          await database.get('competitor_brands').create((rec: any) => {
            rec._raw.id = id;
            rec._raw.server_id = cb.id ?? 0;
            rec._raw.brand_code = cb.brandCode;
            rec._raw.brand_name = cb.brandName;
            rec._raw.company = cb.company ?? null;
            rec._raw.category_code = cb.categoryCode ?? null;
            rec._raw.category_name = cb.categoryName ?? null;
            rec._raw.competitor_brand_code = cb.competitorBrandCode ?? null;
            rec._raw.competitor_brand_name = cb.competitorBrandName ?? null;
          });
        }
        count++;
      }
    });
    return count;
  },

  async upsertPlanogramSetups(rows: any[]): Promise<number> {
    let count = 0;
    await database.write(async () => {
      for (const ps of rows) {
        const id = `ps_${ps.id}`;
        const existing: any[] = await database.get('planogram_setups').query(Q.where('server_id', ps.id)).fetch();
        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec.selectionType = ps.selectionType;
            rec.selectionValue = ps.selectionValue;
            rec.categoryCode = ps.categoryCode;
            rec.categoryName = ps.categoryName ?? null;
            rec.shareOfShelfCm = ps.shareOfShelfCm ?? 0;
            rec.suggestedImage = ps.suggestedImage ?? null;
            rec.instructions = ps.instructions ?? null;
            rec.isActive = ps.isActive !== false;
            rec.serverUpdatedAt = ps.serverUpdatedAt ?? Date.now();
          });
        } else {
          await database.get('planogram_setups').create((rec: any) => {
            rec._raw.id = id;
            rec.serverId = ps.id;
            rec.selectionType = ps.selectionType;
            rec.selectionValue = ps.selectionValue;
            rec.categoryCode = ps.categoryCode;
            rec.categoryName = ps.categoryName ?? null;
            rec.shareOfShelfCm = ps.shareOfShelfCm ?? 0;
            rec.suggestedImage = ps.suggestedImage ?? null;
            rec.instructions = ps.instructions ?? null;
            rec.isActive = ps.isActive !== false;
            rec.serverUpdatedAt = ps.serverUpdatedAt ?? Date.now();
          });
        }
        count++;
      }
    });
    return count;
  },

  async upsertInitiatives(records: any[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    await database.write(async () => {
      for (const r of records) {
        const existing: any[] = await database.get('initiatives').query(Q.where('server_id', r.serverId)).fetch();
        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.initiativeType = r.initiativeType ?? 'general';
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.targetChannel = r.targetChannel ?? null;
            rec.isActive = r.isActive;
            rec.imagePath = r.imagePath ?? null;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          });
          updated++;
        } else {
          await database.get('initiatives').create((rec: any) => {
            rec._raw.id = `init_${r.serverId}`;
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
          });
          created++;
        }
      }
    });
    return { created, updated };
  },

  async upsertSurveys(records: any[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    await database.write(async () => {
      for (const r of records) {
        const existing: any[] = await database.get('surveys').query(Q.where('server_id', r.serverId)).fetch();
        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.targetChannel = r.targetChannel ?? null;
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.isActive = r.isActive;
            rec.questionsJson = r.questionsJson;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          });
          updated++;
        } else {
          await database.get('surveys').create((rec: any) => {
            rec._raw.id = `survey_${r.serverId}`;
            rec.serverId = r.serverId;
            rec.title = r.title;
            rec.description = r.description ?? null;
            rec.targetChannel = r.targetChannel ?? null;
            rec.startDate = r.startDate;
            rec.endDate = r.endDate;
            rec.isActive = r.isActive;
            rec.questionsJson = r.questionsJson;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          });
          created++;
        }
      }
    });
    return { created, updated };
  },

  async upsertPermanentDisplays(records: any[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    await database.write(async () => {
      for (const r of records) {
        const existing: any[] = await database.get('permanent_displays').query(Q.where('server_id', r.serverId)).fetch();
        if (existing.length > 0) {
          await existing[0].update((rec: any) => {
            rec.title = r.title;
            rec.displayType = r.displayType;
            rec.targetChannel = r.targetChannel ?? null;
            rec.isActive = r.isActive;
            rec.imagePath = r.imagePath ?? null;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          });
          updated++;
        } else {
          await database.get('permanent_displays').create((rec: any) => {
            rec._raw.id = `pd_${r.serverId}`;
            rec.serverId = r.serverId;
            rec.title = r.title;
            rec.displayType = r.displayType;
            rec.targetChannel = r.targetChannel ?? null;
            rec.isActive = r.isActive;
            rec.imagePath = r.imagePath ?? null;
            rec.serverUpdatedAt = new Date(r.serverUpdatedAt).getTime();
          });
          created++;
        }
      }
    });
    return { created, updated };
  },

  async syncForceFlags(): Promise<void> {
    try {
      const { data } = await api.get('/customers', { 
        params: { pageSize: 1000, fields: 'code,forceCheckinEnabled,forceCheckoutEnabled' } 
      });
      const customers = data?.data ?? data?.customers ?? (Array.isArray(data) ? data : []);
      for (const c of customers) {
        const code = c.code ?? c.customerCode;
        if (!code) continue;
        await AsyncStorage.setItem(`force_checkin_${code}`, String(c.forceCheckinEnabled ?? true));
        await AsyncStorage.setItem(`force_checkout_${code}`, String(c.forceCheckoutEnabled ?? true));
      }
    } catch (err: any) {
      console.warn('[StoreService] Force flags sync failed:', err?.message);
    }
  },

  async syncCustomerTargets(): Promise<void> {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const { data } = await api.get('/customer-targets', { params: { month, year, pageSize: 1000 } });
      const targets = data?.data ?? (Array.isArray(data) ? data : []);
      for (const t of targets) {
        const code = t.customerCode ?? t.customer_code;
        if (!code) continue;
        await AsyncStorage.setItem(`target_${code}_${month}_${year}`, JSON.stringify({
          targetAmount: t.targetAmount ?? 0,
          targetQuantity: t.targetQuantity ?? 0,
          achievedAmount: t.achievedAmount ?? 0,
        }));
      }
    } catch (err: any) {
      console.warn('[StoreService] Customer targets sync failed:', err?.message);
    }
  }
};
