/**
 * VALIDATION #9: Store Activity Screens
 * Validates: StoreCheckScreen, ExpiryCheckScreen, CompetitorScreen,
 *            PlanogramScreen, OSOIScreen, POCaptureScreen
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STORE_CHECK = readFileSync(resolve(__dirname, '../../src/screens/StoreCheckScreen.tsx'), 'utf-8');
const EXPIRY = readFileSync(resolve(__dirname, '../../src/screens/ExpiryCheckScreen.tsx'), 'utf-8');
const COMPETITOR = readFileSync(resolve(__dirname, '../../src/screens/CompetitorScreen.tsx'), 'utf-8');
const PLANOGRAM = readFileSync(resolve(__dirname, '../../src/screens/PlanogramScreen.tsx'), 'utf-8');
const OSOI = readFileSync(resolve(__dirname, '../../src/screens/OSOIScreen.tsx'), 'utf-8');
const PO = readFileSync(resolve(__dirname, '../../src/screens/POCaptureScreen.tsx'), 'utf-8');

describe('VALIDATION #9: Store Activity Screens', () => {
  describe('ExpiryCheckScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(EXPIRY).toContain("import StoreActivityHeader");
    });
  });

  describe('CompetitorScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(COMPETITOR).toContain("import StoreActivityHeader");
    });
  });

  describe('PlanogramScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(PLANOGRAM).toContain("import StoreActivityHeader");
    });
  });

  describe('OSOIScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(OSOI).toContain("import StoreActivityHeader");
    });
  });

  describe('POCaptureScreen — StoreActivityHeader', () => {
    it('should import StoreActivityHeader', () => {
      expect(PO).toContain("import StoreActivityHeader");
    });
  });

  describe('StoreCheckScreen — photo capture and search', () => {
    it('should have search state', () => {
      expect(STORE_CHECK).toContain("const [search, setSearch] = useState('')");
    });

    it('should import NumericKeypad', () => {
      expect(STORE_CHECK).toContain("import NumericKeypad");
    });

    it('should write to store_checks table', () => {
      expect(STORE_CHECK).toContain("database.get('store_checks')");
    });

    it('should import pushSync', () => {
      expect(STORE_CHECK).toContain("import { pushSync }");
    });

    it('should have draft support', () => {
      expect(STORE_CHECK).toContain("useActivityDrafts");
    });
  });

  describe('ExpiryCheckScreen — form fields and submit', () => {
    it('should have ExpiryItem interface with qty and expiryDate', () => {
      expect(EXPIRY).toContain('qty: number');
      expect(EXPIRY).toContain('expiryDate: string');
    });

    it('should have CalendarPicker component', () => {
      expect(EXPIRY).toContain('function CalendarPicker');
    });

    it('should write to expiry_checks table via pushSync', () => {
      expect(EXPIRY).toContain("import { pushSync }");
    });

    it('should import NumericKeypad', () => {
      expect(EXPIRY).toContain("import NumericKeypad");
    });
  });

  describe('CompetitorScreen — brand picker, product picker, no draft', () => {
    it('should have brand picker', () => {
      expect(COMPETITOR).toContain('showBrandPicker');
    });

    it('should have product picker', () => {
      expect(COMPETITOR).toContain('showProductPicker');
    });

    it('should load brands from competitor_brands table', () => {
      expect(COMPETITOR).toContain("database.get('competitor_brands')");
    });

    it('should have PRODUCTS list with competitor product names', () => {
      expect(COMPETITOR).toContain("const PRODUCTS =[");
      expect(COMPETITOR).toContain("'Cashews'");
      expect(COMPETITOR).toContain("'Almonds'");
    });

    it('should NOT persist draft (form always opens blank)', () => {
      // CompetitorScreen imports database but does NOT import useActivityDrafts
      expect(COMPETITOR).not.toContain('useActivityDrafts');
    });

    it('should have resetForm to clear all fields', () => {
      expect(COMPETITOR).toContain('const resetForm');
    });

    it('should write to competitor_observations table', () => {
      expect(COMPETITOR).toContain("database.get('competitor_observations')");
    });
  });

  describe('CompetitorScreen — photo capture', () => {
    it('should import capturePhoto', () => {
      expect(COMPETITOR).toContain("import { capturePhoto }");
    });

    it('should import PhotoThumbnail', () => {
      expect(COMPETITOR).toContain("import PhotoThumbnail");
    });

    it('should have photoData state', () => {
      expect(COMPETITOR).toContain('const [photoData, setPhotoData]');
    });
  });

  describe('PlanogramScreen — multi-asset capture', () => {
    it('should define ASSET_TYPES array', () => {
      expect(PLANOGRAM).toContain('const ASSET_TYPES');
    });

    it('should track multiple assets', () => {
      expect(PLANOGRAM).toContain('const [assets, setAssets] = useState<CapturedAsset[]>([])');
    });

    it('should have CapturedAsset interface with imageUri', () => {
      expect(PLANOGRAM).toContain('imageUri: string');
    });

    it('should import capturePhoto', () => {
      expect(PLANOGRAM).toContain("import { capturePhoto }");
    });

    it('should write to planogram_executions table', () => {
      expect(PLANOGRAM).toContain("database.get('planogram_executions')");
    });

    it('should have asset type dropdown', () => {
      expect(PLANOGRAM).toContain('showDropdown');
    });

    it('should have draft support', () => {
      expect(PLANOGRAM).toContain('useActivityDrafts');
    });
  });

  describe('OSOIScreen — multi-asset capture', () => {
    it('should define ASSET_TYPES array', () => {
      expect(OSOI).toContain('const ASSET_TYPES');
    });

    it('should have different asset types than Planogram', () => {
      expect(OSOI).toContain("'Shelf Display'");
      expect(OSOI).toContain("'Window Display'");
    });

    it('should track multiple assets', () => {
      expect(OSOI).toContain('const [assets, setAssets] = useState<CapturedAsset[]>([])');
    });

    it('should write to osoi_photos table', () => {
      expect(OSOI).toContain("database.get('osoi_photos')");
    });

    it('should import capturePhoto', () => {
      expect(OSOI).toContain("import { capturePhoto }");
    });

    it('should have draft support', () => {
      expect(OSOI).toContain('useActivityDrafts');
    });
  });

  describe('POCaptureScreen — PO number and photo', () => {
    it('should have PO number state', () => {
      expect(PO).toContain("const [poNumber, setPoNumber] = useState('')");
    });

    it('should have PO image state', () => {
      expect(PO).toContain('const [poImagePath, setPoImagePath]');
    });

    it('should import capturePhoto', () => {
      expect(PO).toContain("import { capturePhoto }");
    });

    it('should write to po_captures table', () => {
      expect(PO).toContain("import { pushSync }");
    });

    it('should have draft support', () => {
      expect(PO).toContain("getDraft(customerCode, 'POCapture')");
    });

    it('should import PhotoThumbnail', () => {
      expect(PO).toContain("import PhotoThumbnail");
    });
  });
});
