/**
 * VALIDATION #4: My Stores / Journey Plan Screen
 * Validates: JourneyPlanScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, '../../src/screens/JourneyPlanScreen.tsx'), 'utf-8');

describe('VALIDATION #4: My Stores (Journey Plan)', () => {
  describe('Store list rendering', () => {
    it('should use FlatList for store rendering', () => {
      expect(SRC).toContain('FlatList');
    });

    it('should track stores state', () => {
      expect(SRC).toContain('const [stores, setStores] = useState');
    });

    it('should have loading state', () => {
      expect(SRC).toContain('const [loading, setLoading] = useState(true)');
    });
  });

  describe('Store card data', () => {
    it('should have customerCode in StoreItem interface', () => {
      expect(SRC).toContain('customerCode: string');
    });

    it('should have name in StoreItem interface', () => {
      expect(SRC).toContain('name: string');
    });

    it('should have address in StoreItem interface', () => {
      expect(SRC).toContain('address: string | null');
    });

    it('should have channel in StoreItem interface', () => {
      expect(SRC).toContain('channel: string');
    });

    it('should have visited tracking', () => {
      expect(SRC).toContain('visited: boolean');
    });
  });

  describe('Search functionality', () => {
    it('should have search text state', () => {
      expect(SRC).toContain("const [searchText, setSearchText] = useState('')");
    });

    it('should import TextInput for search', () => {
      expect(SRC).toContain('TextInput');
    });
  });

  describe('Navigation to CustomerVisit on tap', () => {
    it('should navigate to CustomerVisit screen', () => {
      const navMatch = SRC.match(/navigate\('CustomerVisit'/);
      expect(navMatch).not.toBeNull();
    });
  });

  describe('Drawer menu accessible', () => {
    it('should have DRAWER_ITEMS defined', () => {
      expect(SRC).toContain('const DRAWER_ITEMS');
    });

    it('should have openDrawer function', () => {
      expect(SRC).toContain('const openDrawer');
    });

    it('should have closeDrawer function', () => {
      expect(SRC).toContain('const closeDrawer');
    });

    it('should track drawerVisible state', () => {
      expect(SRC).toContain('const [drawerVisible, setDrawerVisible] = useState(false)');
    });
  });

  describe('Back navigation with useFocusEffect', () => {
    it('should import useFocusEffect', () => {
      expect(SRC).toContain('useFocusEffect');
    });

    it('should use useFocusEffect with BackHandler', () => {
      const block = SRC.match(/useFocusEffect[\s\S]*?BackHandler\.addEventListener/);
      expect(block).not.toBeNull();
    });

    it('should navigate to MainTabs on back press', () => {
      const backNav = SRC.match(/onBack[\s\S]*?navigate\('MainTabs'\)/);
      expect(backNav).not.toBeNull();
    });

    it('should remove subscription on cleanup', () => {
      expect(SRC).toContain('sub.remove()');
    });
  });

  describe('Filter tabs', () => {
    it('should have FilterTab type with all/pending/visited', () => {
      expect(SRC).toContain("type FilterTab = 'all' | 'pending' | 'visited'");
    });

    it('should track active tab', () => {
      expect(SRC).toContain("const [activeTab, setActiveTab] = useState");
    });
  });

  describe('Refresh capability', () => {
    it('should have RefreshControl', () => {
      expect(SRC).toContain('RefreshControl');
    });

    it('should track refreshing state', () => {
      expect(SRC).toContain('const [refreshing, setRefreshing] = useState(false)');
    });
  });

  describe('Geo-edit capability', () => {
    it('should track geo edit state', () => {
      expect(SRC).toContain('const [geoEditStore, setGeoEditStore]');
    });
  });

  describe('Unplanned visit modal', () => {
    it('should have unplanned modal state', () => {
      expect(SRC).toContain('const [showUnplannedModal, setShowUnplannedModal] = useState(false)');
    });
  });
});
