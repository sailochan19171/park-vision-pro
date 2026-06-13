import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '../../db/database';
import api from '../../api/client';
import { storeService } from '../stores/storeService';
import { orderService } from '../orders/orderService';
import { visitService } from '../visits/visitService';
import { uploadPhoto } from '../uploads/uploadService';

export interface SyncProgress {
  module: string;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  count: number;
}

export type ProgressCallback = (progress: SyncProgress[]) => void;

const PULL_MODULES = [
  'customers',
  'items',
  'prices',
  'routes',
  'journey_plan_customers',
  'user_customers',
  'rota_activities',
  'competitor_brands',
  'initiatives',
  'surveys',
  'permanent_displays',
];

/**
 * Orchestrator for the Sync process.
 * Coordinates between domain-specific services to perform a full pull/push sync.
 */
export const syncOrchestrator = {
  async initialSync(routeCode: string, onProgress?: ProgressCallback) {
    const progress: SyncProgress[] = PULL_MODULES.map(m => ({ module: m, status: 'pending', count: 0 }));
    
    for (let i = 0; i < PULL_MODULES.length; i++) {
      const mod = PULL_MODULES[i];
      progress[i].status = 'syncing';
      onProgress?.(progress);

      try {
        // Optimization: Get the last successful sync time for this specific module
        const lastSync = await AsyncStorage.getItem(`last_sync_${mod}`);
        
        const { data } = await api.post('/sync/pull', { 
          modules: [mod], 
          limit: 500, 
          routeCode,
          cursors: { [mod]: lastSync } // Only fetch what changed since the last login
        });
        
        // Backend returns data in 'changes' object and new cursors in 'cursors' object
        const moduleChanges = data.changes?.[mod];
        const newCursor = data.cursors?.[mod];
        
        if (moduleChanges && Array.isArray(moduleChanges.created) && moduleChanges.created.length > 0) {
          const rows = moduleChanges.created;
          let count = 0;
          switch (mod) {
            case 'customers': count = await storeService.upsertCustomers(rows); break;
            case 'items': count = await storeService.upsertItems(rows); break;
            case 'prices': count = await storeService.upsertPrices(rows); break;
            case 'journey_plan_customers': count = await storeService.upsertJourneyPlanCustomers(rows, routeCode); break;
            case 'competitor_brands': count = await storeService.upsertCompetitorBrands(rows); break;
            case 'planogram_setups': count = await storeService.upsertPlanogramSetups(rows); break;
            case 'initiatives': { const r = await storeService.upsertInitiatives(rows); count = r.created + r.updated; break; }
            case 'surveys': { const r = await storeService.upsertSurveys(rows); count = r.created + r.updated; break; }
            case 'permanent_displays': { const r = await storeService.upsertPermanentDisplays(rows); count = r.created + r.updated; break; }
          }
          progress[i].count = count;
        }

        // Store the new cursor for next login
        if (newCursor) {
          await AsyncStorage.setItem(`last_sync_${mod}`, String(newCursor));
        }
        
        progress[i].status = 'done';
      } catch (err) {
        console.warn(`[SyncOrchestrator] ${mod} pull failed:`, err);
        progress[i].status = 'failed';
      }
      onProgress?.(progress);
    }
  },

  async pushSync() {
    // 1. Get unsynced data from services
    const orders = await orderService.getUnsyncedOrders();
    const visits = await visitService.getUnsyncedVisits();
    
    // 2. Build batch payload
    const payload: any = { changes: {} };
    if (orders.length > 0) payload.changes.orders = { created: await orderService.buildPushPayload(orders) };
    // ... add visits, etc.

    // 3. Push to sync microservice
    if (Object.keys(payload.changes).length > 0) {
      const { data } = await api.post('/sync/push', payload);
      // 4. Handle results via domain services
      if (data.results?.orders) {
        await orderService.markAsSynced(data.results.orders.items.filter((i: any) => i.status === 'success').map((i: any) => i.appTrxId));
      }
    }
  }
};
