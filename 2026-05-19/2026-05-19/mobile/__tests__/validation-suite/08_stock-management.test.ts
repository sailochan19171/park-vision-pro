/**
 * VALIDATION #8: Stock Management
 * Validates: OpeningStockScreen.tsx, PhysicalStockScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OPENING = readFileSync(resolve(__dirname, '../../src/screens/OpeningStockScreen.tsx'), 'utf-8');
const PHYSICAL = readFileSync(resolve(__dirname, '../../src/screens/PhysicalStockScreen.tsx'), 'utf-8');

describe('VALIDATION #8: Stock Management', () => {
  describe('OpeningStockScreen — item list with categories and sidebar', () => {
    it('should compute categories from items', () => {
      expect(OPENING).toContain("const categories = useMemo");
    });

    it('should have ALL as first category', () => {
      expect(OPENING).toContain("['ALL'");
    });

    it('should track selectedCategory state', () => {
      expect(OPENING).toContain("const [selectedCategory, setSelectedCategory] = useState<string>('ALL')");
    });

    it('should define SIDEBAR_WIDTH for category sidebar', () => {
      expect(OPENING).toContain('const SIDEBAR_WIDTH');
    });
  });

  describe('OpeningStockScreen — search bar', () => {
    it('should have searchQuery state', () => {
      expect(OPENING).toContain("const [searchQuery, setSearchQuery] = useState<string>('')");
    });

    it('should import TextInput for search', () => {
      expect(OPENING).toContain('TextInput');
    });
  });

  describe('OpeningStockScreen — NumericKeypad for quantity', () => {
    it('should import NumericKeypad component', () => {
      expect(OPENING).toContain("import NumericKeypad");
    });

    it('should track keypadVisible state', () => {
      expect(OPENING).toContain('const [keypadVisible, setKeypadVisible] = useState(false)');
    });

    it('should track keypadItem for current item', () => {
      expect(OPENING).toContain('const [keypadItem, setKeypadItem]');
    });
  });

  describe('OpeningStockScreen — MSL badge', () => {
    it('should track mslItemCodes as Set', () => {
      expect(OPENING).toContain('const [mslItemCodes, setMslItemCodes] = useState<Set<string>>');
    });

    it('should query selling_skus table for MSL', () => {
      expect(OPENING).toContain("database.get('selling_skus')");
    });

    it('should have isMsl on StockItem', () => {
      expect(OPENING).toContain('isMsl: boolean');
    });

    it('should have MSL sub-filter', () => {
      expect(OPENING).toContain("'MSL'");
    });
  });

  describe('OpeningStockScreen — submit saves to DB', () => {
    it('should write to opening_stocks table', () => {
      expect(OPENING).toContain("database.get('opening_stocks')");
    });

    it('should import pushSync', () => {
      expect(OPENING).toContain("import { pushSync }");
    });

    it('should track saving state', () => {
      expect(OPENING).toContain('const [saving, setSaving] = useState(false)');
    });
  });

  describe('OpeningStockScreen — draft auto-save/restore', () => {
    it('should import useActivityDrafts', () => {
      expect(OPENING).toContain("import useActivityDrafts");
    });

    it('should call saveDraft on quantity changes', () => {
      expect(OPENING).toContain("saveDraft(customerCode, 'OpeningStock'");
    });

    it('should restore draft on load', () => {
      expect(OPENING).toContain("getDraft(customerCode, 'OpeningStock')");
    });

    it('should have clearDraft available', () => {
      expect(OPENING).toContain('clearDraft');
    });
  });

  describe('OpeningStockScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(OPENING).toContain("import StoreActivityHeader");
    });
  });

  describe('PhysicalStockScreen — pre-fills from opening stock', () => {
    it('should query opening_stocks for pre-fill', () => {
      expect(PHYSICAL).toContain("database.get('opening_stocks').query");
    });

    it('should build openingStockMap from opening records', () => {
      expect(PHYSICAL).toContain('const openingStockMap = new Map');
    });

    it('should use opening stock as default systemQty/stockQty', () => {
      expect(PHYSICAL).toContain("openingStockMap.get(item.code) ?? 0");
    });
  });

  describe('PhysicalStockScreen — photo capture', () => {
    it('should import capturePhoto', () => {
      expect(PHYSICAL).toContain("import { capturePhoto }");
    });

    it('should track photoUri state', () => {
      expect(PHYSICAL).toContain('const [photoUri, setPhotoUri]');
    });

    it('should have photo preview modal', () => {
      expect(PHYSICAL).toContain('showPhotoPreview');
    });
  });

  describe('PhysicalStockScreen — submit and draft', () => {
    it('should write to physical_stocks table', () => {
      expect(PHYSICAL).toContain("database.get('physical_stocks')");
    });

    it('should have draft save/restore for PhysicalStock', () => {
      expect(PHYSICAL).toContain("saveDraft(customerCode, 'PhysicalStock'");
      expect(PHYSICAL).toContain("getDraft(customerCode, 'PhysicalStock')");
    });

    it('should restore photo from draft', () => {
      expect(PHYSICAL).toContain('draft._photo');
    });
  });

  describe('PhysicalStockScreen — NumericKeypad', () => {
    it('should import NumericKeypad', () => {
      expect(PHYSICAL).toContain("import NumericKeypad");
    });

    it('should have keypadTarget with field type (stock/physical)', () => {
      expect(PHYSICAL).toContain("field: 'stock' | 'physical'");
    });
  });

  describe('PhysicalStockScreen — search bar', () => {
    it('should have searchQuery state', () => {
      expect(PHYSICAL).toContain("const [searchQuery, setSearchQuery] = useState<string>('')");
    });
  });

  describe('PhysicalStockScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(PHYSICAL).toContain("import StoreActivityHeader");
    });
  });
});
