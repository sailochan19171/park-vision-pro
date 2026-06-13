/**
 * BUG FIX #3: Journey Plan hidden from sync
 * Verifies: journey_plan_customers removed from PULL_MODULES
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SYNC_SRC = resolve(__dirname, '../../src/services/syncService.ts');
const SYNC_SCREEN = resolve(__dirname, '../../src/screens/InitialSyncScreen.tsx');
const syncSource = readFileSync(SYNC_SRC, 'utf-8');
const screenSource = readFileSync(SYNC_SCREEN, 'utf-8');

describe('BUG FIX #3: Journey Plan Hidden From Sync', () => {
  describe('TC-3.1: PULL_MODULES does NOT include journey_plan_customers', () => {
    it('should define PULL_MODULES without journey_plan_customers', () => {
      const pullModules = syncSource.match(/const PULL_MODULES\s*=\s*\[([^\]]+)\]/);
      expect(pullModules).not.toBeNull();
      expect(pullModules![1]).not.toContain('journey_plan_customers');
    });

    it('should still include other required modules', () => {
      const pullModules = syncSource.match(/const PULL_MODULES\s*=\s*\[([^\]]+)\]/);
      const modules = pullModules![1];
      expect(modules).toContain('customers');
      expect(modules).toContain('items');
      expect(modules).toContain('prices');
      expect(modules).toContain('competitor_brands');
      expect(modules).toContain('initiatives');
      expect(modules).toContain('surveys');
      expect(modules).toContain('permanent_displays');
    });
  });

  describe('TC-3.2: InitialSyncScreen MODULE_LABELS still has mapping (harmless)', () => {
    it('should have Journey Plans label defined (dead reference, not a bug)', () => {
      // This is just a label map — since the module never syncs, it never renders
      expect(screenSource).toContain('journey_plan_customers');
    });
  });

  describe('TC-3.3: DB schema preserved', () => {
    it('should NOT remove journey_plan_customers from db/schema.ts', () => {
      const schema = readFileSync(resolve(__dirname, '../../src/db/schema.ts'), 'utf-8');
      expect(schema).toContain('journey_plan_customers');
    });
  });
});
