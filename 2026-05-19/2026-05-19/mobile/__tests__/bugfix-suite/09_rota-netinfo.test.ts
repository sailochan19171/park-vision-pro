/**
 * BUG FIX #14, #16: Rota Cancel + NetInfo defensive import
 * Verifies: Cancel navigates home with drawer, NetInfo stub fallback
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROTA = readFileSync(resolve(__dirname, '../../src/screens/RotaCreateScreen.tsx'), 'utf-8');
const DASHBOARD = readFileSync(resolve(__dirname, '../../src/screens/DashboardScreen.tsx'), 'utf-8');
const STARTDAY = readFileSync(resolve(__dirname, '../../src/screens/StartDayScreen.tsx'), 'utf-8');

describe('BUG FIX #14: Rota Cancel Opens Drawer with Highlight', () => {
  describe('TC-14.1: Cancel navigates to MainTabs with openDrawer param', () => {
    it('should navigate to MainTabs on Cancel', () => {
      expect(ROTA).toContain("navigation.navigate('MainTabs'");
    });

    it('should pass openDrawer param with RotaCreate value', () => {
      expect(ROTA).toContain("openDrawer: 'RotaCreate'");
    });
  });

  describe('TC-14.2: Dashboard reads openDrawer param and opens drawer', () => {
    it('should read route.params.openDrawer in useFocusEffect', () => {
      const match = DASHBOARD.match(/useFocusEffect[\s\S]*?route\.params\?\.openDrawer/);
      expect(match).not.toBeNull();
    });

    it('should set drawerOpen to true when param present', () => {
      expect(DASHBOARD).toContain('setDrawerOpen(true)');
    });

    it('should set drawerHighlight from the param', () => {
      expect(DASHBOARD).toContain('setDrawerHighlight(openDrawerParam)');
    });

    it('should clear the param after reading (prevent re-trigger)', () => {
      expect(DASHBOARD).toContain('setParams({ openDrawer: undefined })');
    });
  });

  describe('TC-14.3: Drawer renders highlight on correct menu item', () => {
    it('should compare highlight with item.screen', () => {
      expect(DASHBOARD).toContain('item.screen === highlight');
    });

    it('should apply highlight styling (gold background + left border)', () => {
      expect(DASHBOARD).toContain('#E5A100');
      expect(DASHBOARD).toContain('borderLeftColor');
    });
  });

  describe('TC-14.4: Closing drawer clears highlight', () => {
    it('should call setDrawerHighlight(null) on close', () => {
      expect(DASHBOARD).toContain('setDrawerHighlight(null)');
    });
  });
});

describe('BUG FIX #16: NetInfo module removed to eliminate startup crash', () => {
  describe('TC-16.1: No import of @react-native-community/netinfo', () => {
    it('should NOT use top-level import for NetInfo', () => {
      expect(STARTDAY).not.toContain("import NetInfo from '@react-native-community/netinfo'");
    });

    it('should NOT require @react-native-community/netinfo at all', () => {
      expect(STARTDAY).not.toContain("require('@react-native-community/netinfo')");
    });
  });

  describe('TC-16.2: Uses permanent inline stub', () => {
    it('should define a NetInfo stub with a fetch function', () => {
      expect(STARTDAY).toMatch(/const NetInfo[\s\S]*?fetch:\s*async/);
    });
  });

  describe('TC-16.3: Stub provides sensible defaults', () => {
    it('should have a stub with fetch returning type unknown', () => {
      expect(STARTDAY).toContain("type: 'unknown'");
    });

    it('should return isConnected: null (not false) to signal unknown', () => {
      expect(STARTDAY).toContain('isConnected: null');
    });
  });

  describe('TC-16.4: Rest of screen unaffected by stub', () => {
    it('should still have sync check via api.get', () => {
      expect(STARTDAY).toContain("/sync/status");
    });

    it('should still have battery check', () => {
      expect(STARTDAY).toContain('battery');
    });
  });
});
