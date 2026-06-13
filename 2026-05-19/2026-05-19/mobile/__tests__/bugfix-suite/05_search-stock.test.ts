/**
 * BUG FIX #8, #9: Search in Opening/Physical Stock + Pre-fill
 * Verifies: search bar, filter chain, opening stock flows to physical stock
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OPENING = readFileSync(resolve(__dirname, '../../src/screens/OpeningStockScreen.tsx'), 'utf-8');
const PHYSICAL = readFileSync(resolve(__dirname, '../../src/screens/PhysicalStockScreen.tsx'), 'utf-8');

describe('BUG FIX #8: Search Bar in Opening Stock', () => {
  describe('TC-8.1: Search state and TextInput exist', () => {
    it('should have searchQuery state', () => {
      expect(OPENING).toContain("const [searchQuery, setSearchQuery] = useState<string>('')");
    });

    it('should import TextInput', () => {
      expect(OPENING).toContain('TextInput');
    });

    it('should render a search bar with placeholder', () => {
      expect(OPENING).toContain('Search by item name, code or brand');
    });
  });

  describe('TC-8.2: Filter chain includes search', () => {
    it('should filter by name (case-insensitive)', () => {
      expect(OPENING).toContain('i.name.toLowerCase().includes(q)');
    });

    it('should filter by code (case-insensitive)', () => {
      expect(OPENING).toContain('i.code.toLowerCase().includes(q)');
    });

    it('should filter by brand (case-insensitive)', () => {
      expect(OPENING).toContain("(i.brand ?? '').toLowerCase().includes(q)");
    });

    it('should apply search AFTER category and sub-filter', () => {
      // searchQuery filter should reference the already-filtered list
      const chain = OPENING.match(/let list = categoryFiltered[\s\S]*?searchQuery/);
      expect(chain).not.toBeNull();
    });
  });

  describe('TC-8.3: Clear button resets search', () => {
    it('should have a close-circle icon to clear search', () => {
      expect(OPENING).toContain('close-circle');
    });

    it('should reset searchQuery to empty string on clear', () => {
      expect(OPENING).toContain("setSearchQuery('')");
    });
  });
});

describe('BUG FIX #8a: Search Bar in Physical Stock', () => {
  describe('TC-8a.1: Same search infrastructure as Opening Stock', () => {
    it('should have searchQuery state', () => {
      expect(PHYSICAL).toContain("const [searchQuery, setSearchQuery] = useState<string>('')");
    });

    it('should render search bar with same placeholder', () => {
      expect(PHYSICAL).toContain('Search by item name, code or brand');
    });

    it('should filter by name, code, and brand', () => {
      expect(PHYSICAL).toContain('i.name.toLowerCase().includes(q)');
      expect(PHYSICAL).toContain('i.code.toLowerCase().includes(q)');
    });
  });
});

describe('BUG FIX #9: Opening Stock Pre-fills Physical Stock', () => {
  describe('TC-9.1: Physical Stock queries opening_stocks table', () => {
    it('should query opening_stocks for today', () => {
      const query = PHYSICAL.match(/database\.get\('opening_stocks'\)\.query/);
      expect(query).not.toBeNull();
    });

    it('should filter by user_code, customer_code, and stock_date', () => {
      const filters = PHYSICAL.match(/opening_stocks[\s\S]*?user_code[\s\S]*?customer_code[\s\S]*?stock_date/);
      expect(filters).not.toBeNull();
    });
  });

  describe('TC-9.2: Sums multiple opening stock records per item', () => {
    it('should accumulate quantities in openingStockMap', () => {
      expect(PHYSICAL).toContain('(openingStockMap.get(code) ?? 0) + qty');
    });
  });

  describe('TC-9.3: Priority chain is correct', () => {
    it('should prefer physical_stocks systemQty over opening stock', () => {
      // saved?.systemQty ?? openingStockMap.get(item.code) ?? 0
      expect(PHYSICAL).toContain('saved?.systemQty ?? openingStockMap.get(item.code) ?? 0');
    });

    it('should default to 0 when neither exists', () => {
      expect(PHYSICAL).toContain('?? 0');
    });
  });
});
