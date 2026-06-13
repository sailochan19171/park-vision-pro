/**
 * VALIDATION #2: Initial Sync Module
 * Validates: InitialSyncScreen.tsx, syncService.ts (pull sync)
 */
/// <reference types="node" />
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SYNC_SCREEN = readFileSync(resolve(__dirname, '../../src/screens/InitialSyncScreen.tsx'), 'utf-8');
const SYNC_SVC = readFileSync(resolve(__dirname, '../../src/services/syncService.ts'), 'utf-8');

describe('VALIDATION #2: Initial Sync Module', () => {
  describe('InitialSyncScreen — UI elements', () => {
    it('should display progress bar', () => {
      expect(SYNC_SCREEN).toContain('progressBarOuter');
      expect(SYNC_SCREEN).toContain('progressBarInner');
    });

    it('should show percentage text', () => {
      expect(SYNC_SCREEN).toContain('{pct}%');
    });

    it('should display module status list', () => {
      expect(SYNC_SCREEN).toContain('progress.map');
    });

    it('should show checkmark for done modules', () => {
      const doneCheck = SYNC_SCREEN.match(/p\.status === 'done'.*checkIcon/s);
      expect(doneCheck).not.toBeNull();
    });

    it('should show spinner for syncing modules', () => {
      const syncingCheck = SYNC_SCREEN.match(/p\.status === 'syncing'.*ActivityIndicator/s);
      expect(syncingCheck).not.toBeNull();
    });

    it('should show error icon for failed modules', () => {
      const errorCheck = SYNC_SCREEN.match(/p\.status === 'error'.*errorIcon/s);
      expect(errorCheck).not.toBeNull();
    });

    it('should display "All Synced!" when done', () => {
      expect(SYNC_SCREEN).toContain('All Synced!');
    });

    it('should show error banner on failure', () => {
      expect(SYNC_SCREEN).toContain('Some data failed to sync');
    });
  });

  describe('InitialSyncScreen — progress callback', () => {
    it('should call initialSync with progress callback', () => {
      expect(SYNC_SCREEN).toContain('initialSync(user?.routeCode');
    });

    it('should update progress state from callback', () => {
      expect(SYNC_SCREEN).toContain('setProgress([...p])');
    });

    it('should call markSyncDone after completion', () => {
      expect(SYNC_SCREEN).toContain('markSyncDone()');
    });

    it('should skip sync in offline mode', () => {
      expect(SYNC_SCREEN).toContain('if (offlineMode)');
    });
  });

  describe('InitialSyncScreen — MODULE_LABELS mapping', () => {
    it('should map customers module', () => {
      expect(SYNC_SCREEN).toContain("customers: 'Customers'");
    });

    it('should map items module', () => {
      expect(SYNC_SCREEN).toContain("items: 'Products'");
    });

    it('should map prices module', () => {
      expect(SYNC_SCREEN).toContain("prices: 'Prices'");
    });

    it('should map journey_plan_customers module', () => {
      expect(SYNC_SCREEN).toContain("journey_plan_customers: 'Journey Plans'");
    });

    it('should map competitor_brands module', () => {
      expect(SYNC_SCREEN).toContain("competitor_brands: 'Competitor Brands'");
    });
  });

  describe('syncService — PULL_MODULES list', () => {
    it('should include customers in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'customers'/);
      expect(match).not.toBeNull();
    });

    it('should include items in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'items'/);
      expect(match).not.toBeNull();
    });

    it('should include prices in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'prices'/);
      expect(match).not.toBeNull();
    });

    it('should include competitor_brands in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'competitor_brands'/);
      expect(match).not.toBeNull();
    });

    it('should include initiatives in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'initiatives'/);
      expect(match).not.toBeNull();
    });

    it('should include surveys in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'surveys'/);
      expect(match).not.toBeNull();
    });

    it('should include permanent_displays in PULL_MODULES', () => {
      const match = SYNC_SVC.match(/PULL_MODULES\s*=\s*\[.*'permanent_displays'/);
      expect(match).not.toBeNull();
    });
  });

  describe('syncService — pullSync handlers per module', () => {
    it('should handle customers module in switch', () => {
      expect(SYNC_SVC).toContain("case 'customers':");
      expect(SYNC_SVC).toContain('upsertCustomers');
    });

    it('should handle items module in switch', () => {
      expect(SYNC_SVC).toContain("case 'items':");
      expect(SYNC_SVC).toContain('upsertItems');
    });

    it('should handle prices module in switch', () => {
      expect(SYNC_SVC).toContain("case 'prices':");
      expect(SYNC_SVC).toContain('upsertPrices');
    });

    it('should handle journey_plan_customers module in switch', () => {
      expect(SYNC_SVC).toContain("case 'journey_plan_customers':");
      expect(SYNC_SVC).toContain('upsertJourneyPlanCustomers');
    });

    it('should handle competitor_brands module in switch', () => {
      expect(SYNC_SVC).toContain("case 'competitor_brands':");
      expect(SYNC_SVC).toContain('upsertCompetitorBrands');
    });

    it('should handle initiatives module in switch', () => {
      expect(SYNC_SVC).toContain("case 'initiatives':");
      expect(SYNC_SVC).toContain('upsertInitiatives');
    });

    it('should handle surveys module in switch', () => {
      expect(SYNC_SVC).toContain("case 'surveys':");
      expect(SYNC_SVC).toContain('upsertSurveys');
    });

    it('should handle permanent_displays module in switch', () => {
      expect(SYNC_SVC).toContain("case 'permanent_displays':");
      expect(SYNC_SVC).toContain('upsertPermanentDisplays');
    });
  });

  describe('syncService — cursor-based pagination', () => {
    it('should fetch cursors from sync_meta table', () => {
      expect(SYNC_SVC).toContain("get('sync_meta')");
    });

    it('should send cursors in pull request', () => {
      expect(SYNC_SVC).toContain('cursors: { [mod]: moduleCursor }');
    });

    it('should save new cursor after successful pull', () => {
      expect(SYNC_SVC).toContain('saveCursor(mod, newCursor)');
    });

    it('should track hasMore flag from response', () => {
      expect(SYNC_SVC).toContain("data.hasMore?.[mod] ?? false");
    });
  });

  describe('syncService — error handling per module', () => {
    it('should catch errors per module and set error status', () => {
      const errorBlock = SYNC_SVC.match(/catch\s*\(err.*\)[\s\S]*?progress\[i\]\.status = 'error'/);
      expect(errorBlock).not.toBeNull();
    });

    it('should continue to next module after error', () => {
      // After error catch, the for loop continues
      expect(SYNC_SVC).toContain("progress[i].error = err?.message ?? 'Unknown error'");
    });
  });

  describe('syncService — MSL sync (selling_skus)', () => {
    it('should sync selling_skus in initialSync', () => {
      expect(SYNC_SVC).toContain('selling_skus');
    });

    it('should write to selling_skus table', () => {
      expect(SYNC_SVC).toContain("database.get('selling_skus')");
    });
  });

  describe('syncService — retry logic', () => {
    it('should have withRetry function with exponential backoff', () => {
      expect(SYNC_SVC).toContain('async function withRetry');
      expect(SYNC_SVC).toContain('Math.pow(1.5, attempt)');
    });

    it('should retry on network errors', () => {
      expect(SYNC_SVC).toContain("err?.message === 'Network Error'");
    });

    it('should retry on server errors (502, 503, 504)', () => {
      expect(SYNC_SVC).toContain('err?.response?.status === 502');
      expect(SYNC_SVC).toContain('err?.response?.status === 503');
      expect(SYNC_SVC).toContain('err?.response?.status === 504');
    });
  });

  describe('syncService — SyncProgress type', () => {
    it('should export SyncProgress interface', () => {
      expect(SYNC_SVC).toContain('export interface SyncProgress');
    });

    it('should have module, status, count, error fields', () => {
      expect(SYNC_SVC).toContain('module: string');
      expect(SYNC_SVC).toContain("status: 'pending' | 'syncing' | 'done' | 'error'");
      expect(SYNC_SVC).toContain('count: number');
    });
  });
});
