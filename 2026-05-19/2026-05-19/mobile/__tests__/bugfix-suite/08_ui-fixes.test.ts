/**
 * BUG FIX #7, #12, #13, #15: UI/visual fixes
 * Verifies: Navigate button overlap, customer code in header, address display, app icon
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const VISIT = readFileSync(resolve(__dirname, '../../src/screens/CustomerVisitScreen.tsx'), 'utf-8');
const CUST_DASH = readFileSync(resolve(__dirname, '../../src/screens/CustomerDashboardScreen.tsx'), 'utf-8');

describe('BUG FIX #7: Navigate Button Overlap Fix', () => {
  describe('TC-7.1: navBtn positioned above card overlap', () => {
    it('should have bottom: 36 (not 10)', () => {
      // The style block has a comment mentioning "bottom: 10" (old value) —
      // match only the actual property (line starting with spaces + bottom:)
      const navIdx = VISIT.indexOf('navBtn: {');
      expect(navIdx).toBeGreaterThan(-1);
      const afterNav = VISIT.slice(navIdx, navIdx + 400);
      // Strip JS comments so we only match the actual CSS property
      const stripped = afterNav.replace(/\/\/[^\n]*/g, '');
      const bottomMatch = stripped.match(/bottom:\s*(\d+)/);
      expect(bottomMatch).not.toBeNull();
      expect(parseInt(bottomMatch![1])).toBeGreaterThanOrEqual(30);
    });

    it('should clear the -20px cardWrapper marginTop overlap', () => {
      const cardIdx = VISIT.indexOf('cardWrapper:');
      const afterCard = VISIT.slice(cardIdx, cardIdx + 200);
      const marginMatch = afterCard.match(/marginTop:\s*(-?\d+)/);
      expect(marginMatch).not.toBeNull();
      const overlap = Math.abs(parseInt(marginMatch![1]));

      const navIdx = VISIT.indexOf('navBtn: {');
      const afterNav = VISIT.slice(navIdx, navIdx + 400);
      const stripped = afterNav.replace(/\/\/[^\n]*/g, '');
      const bottomMatch = stripped.match(/bottom:\s*(\d+)/);
      expect(bottomMatch).not.toBeNull();
      const navBottom = parseInt(bottomMatch![1]);
      expect(navBottom).toBeGreaterThan(overlap);
    });
  });
});

describe('BUG FIX #12: Customer Code in Dashboard Header', () => {
  describe('TC-12.1: Customer code rendered in blue header card', () => {
    it('should render [{customerCode}] in the header', () => {
      expect(CUST_DASH).toContain('[{customerCode}]');
    });

    it('should have headerCode style defined', () => {
      expect(CUST_DASH).toContain('headerCode:');
    });

    it('should use amber/gold color for visibility on blue', () => {
      const style = CUST_DASH.match(/headerCode:\s*\{[\s\S]*?color:\s*'(#\w+)'/);
      expect(style).not.toBeNull();
      // #FFE9A8 is amber/gold
      expect(style![1]).toMatch(/#FF/i);
    });

    it('should guard against empty customerCode', () => {
      expect(CUST_DASH).toContain('!!customerCode');
    });
  });

  describe('TC-12.2: testID for customer code element', () => {
    it('should have testID on the customer code Text', () => {
      expect(CUST_DASH).toContain('customer-store-code');
    });
  });
});

describe('BUG FIX #13: Customer Address in CustomerVisitScreen', () => {
  describe('TC-13.1: Address composed from multiple fields', () => {
    it('should compose from address + city_code + region_code', () => {
      expect(VISIT).toContain('c.address');
      expect(VISIT).toContain('city_code');
      expect(VISIT).toContain('region_code');
    });

    it('should use filter(Boolean) to skip null/empty fields', () => {
      expect(VISIT).toContain('.filter(Boolean)');
    });

    it('should join with comma separator', () => {
      expect(VISIT).toContain(".join(', ')");
    });
  });

  describe('TC-13.2: Address rendered on store info card', () => {
    it('should render address text when available', () => {
      expect(VISIT).toContain('{address}');
    });

    it('should guard with !!address', () => {
      expect(VISIT).toContain('!!address');
    });

    it('should have storeAddress style', () => {
      expect(VISIT).toContain('storeAddress:');
    });

    it('should allow up to 3 lines', () => {
      expect(VISIT).toContain('numberOfLines={3}');
    });
  });

  describe('TC-13.3: Handles missing address gracefully', () => {
    it('should not setAddress when all parts are empty (filter returns empty array)', () => {
      // if (parts.length > 0) setAddress(...) — nothing set when all null
      expect(VISIT).toContain('if (parts.length > 0)');
    });
  });
});

describe('BUG FIX #15: App Icon Replaced', () => {
  const RES = resolve(__dirname, '../../android/app/src/main/res');
  const densities = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

  describe('TC-15.1: ic_launcher.png exists for all densities', () => {
    densities.forEach((d) => {
      it(`should have ic_launcher.png in ${d}`, () => {
        expect(existsSync(resolve(RES, d, 'ic_launcher.png'))).toBe(true);
      });
    });
  });

  describe('TC-15.2: ic_launcher_round.png exists for all densities', () => {
    densities.forEach((d) => {
      it(`should have ic_launcher_round.png in ${d}`, () => {
        expect(existsSync(resolve(RES, d, 'ic_launcher_round.png'))).toBe(true);
      });
    });
  });
});
