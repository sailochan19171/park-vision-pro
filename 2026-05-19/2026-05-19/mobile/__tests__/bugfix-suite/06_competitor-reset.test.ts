/**
 * BUG FIX #10: Competitor Observation form reset + image fix
 * Verifies: No draft persistence, form always blank, image in submitted list
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, '../../src/screens/CompetitorScreen.tsx'), 'utf-8');

describe('BUG FIX #10: Competitor Observation Form Reset', () => {
  describe('TC-10.1: No draft persistence', () => {
    it('should NOT import useActivityDrafts', () => {
      expect(SRC).not.toContain("import useActivityDrafts from '../store/activityDrafts'");
    });

    it('should NOT call getDraft', () => {
      expect(SRC).not.toContain('getDraft(customerCode');
    });

    it('should NOT call saveDraft', () => {
      expect(SRC).not.toContain('saveDraft(customerCode');
    });
  });

  describe('TC-10.2: Capture button always opens blank form', () => {
    it('should call resetForm before showing form on Capture', () => {
      const captureHandler = SRC.match(/onPress=\{\(\)\s*=>\s*\{\s*resetForm\(\);\s*setShowForm\(true\)/);
      expect(captureHandler).not.toBeNull();
    });
  });

  describe('TC-10.3: resetForm clears all fields', () => {
    it('should reset brandName, productName, mrp, sellingPrice, uom, photoData', () => {
      expect(SRC).toContain("setBrandName(''); setProductName(''); setMrp(''); setSellingPrice(''); setUom(''); setPhotoData(null)");
    });
  });

  describe('TC-10.4: Submitted observation includes imagePath', () => {
    it('should include imagePath in the new observation object', () => {
      const obs = SRC.match(/setObservations\(prev\s*=>\s*\[\.\.\.prev,\s*\{[\s\S]*?imagePath:\s*photoData\?\.uri/);
      expect(obs).not.toBeNull();
    });
  });

  describe('TC-10.5: History loaded from database on mount', () => {
    it('should query competitor_observations for today', () => {
      expect(SRC).toContain("database.get('competitor_observations').query");
    });

    it('should filter by user_code and customer_code', () => {
      const filters = SRC.match(/competitor_observations[\s\S]*?user_code[\s\S]*?customer_code/);
      expect(filters).not.toBeNull();
    });
  });
});
