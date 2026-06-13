/**
 * BUG FIX #4, #5, #6, #10: Back gesture / navigation fixes
 * Verifies: useFocusEffect scoping, home exits app, no false exit prompts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const JOURNEY = readFileSync(resolve(__dirname, '../../src/screens/JourneyPlanScreen.tsx'), 'utf-8');
const DASHBOARD = readFileSync(resolve(__dirname, '../../src/screens/DashboardScreen.tsx'), 'utf-8');
const CUST_DASH = readFileSync(resolve(__dirname, '../../src/screens/CustomerDashboardScreen.tsx'), 'utf-8');
const HEADER = readFileSync(resolve(__dirname, '../../src/components/common/StoreActivityHeader.tsx'), 'utf-8');

describe('BUG FIX #4: Back Gesture - JourneyPlanScreen (My Stores)', () => {
  describe('TC-4.1: Uses useFocusEffect instead of useEffect', () => {
    it('should use useFocusEffect for BackHandler', () => {
      const match = JOURNEY.match(/useFocusEffect\s*\(\s*\n?\s*useCallback\(\(\)\s*=>\s*\{[\s\S]*?BackHandler/);
      expect(match).not.toBeNull();
    });

    it('should NOT have useEffect-based BackHandler', () => {
      const badPattern = JOURNEY.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?BackHandler/);
      expect(badPattern).toBeNull();
    });
  });

  describe('TC-4.2: Navigates to MainTabs on back (no alert)', () => {
    it('should navigate to MainTabs in the handler', () => {
      const handler = JOURNEY.match(/useFocusEffect[\s\S]*?navigate\('MainTabs'\)/);
      expect(handler).not.toBeNull();
    });

    it('should NOT show an Alert dialog before navigating', () => {
      // The old code had Alert.alert('Exit', ...) — verify it is gone
      expect(JOURNEY).not.toContain("Alert.alert(\n        'Exit'");
    });
  });
});

describe('BUG FIX #4a: Back Gesture - CustomerDashboardScreen', () => {
  describe('TC-4a.1: Uses useFocusEffect for checkout handler', () => {
    it('should use useFocusEffect for BackHandler', () => {
      const match = CUST_DASH.match(/useFocusEffect\s*\(\s*\n?\s*useCallback\(\(\)\s*=>\s*\{[\s\S]*?BackHandler/);
      expect(match).not.toBeNull();
    });

    it('should call confirmCheckout on back press', () => {
      const handler = CUST_DASH.match(/useFocusEffect[\s\S]*?confirmCheckout\(\)/);
      expect(handler).not.toBeNull();
    });
  });
});

describe('BUG FIX #5: Home Page Back Exits App', () => {
  describe('TC-5.1: Dashboard uses BackHandler.exitApp', () => {
    it('should import BackHandler', () => {
      expect(DASHBOARD).toContain('BackHandler');
    });

    it('should call exitApp in a useFocusEffect-scoped handler', () => {
      const match = DASHBOARD.match(/useFocusEffect[\s\S]*?BackHandler\.exitApp\(\)/);
      expect(match).not.toBeNull();
    });

    it('should return true from the handler (prevent default)', () => {
      const match = DASHBOARD.match(/exitApp\(\)[\s\S]*?return true/);
      expect(match).not.toBeNull();
    });
  });
});

describe('BUG FIX #6: StoreActivityHeader - Conditional Exit Prompt', () => {
  describe('TC-6.1: hasUnsavedChanges prop controls prompt', () => {
    it('should accept hasUnsavedChanges prop in interface', () => {
      expect(HEADER).toContain('hasUnsavedChanges?: boolean');
    });

    it('should only register BackHandler when hasUnsavedChanges is true', () => {
      const guard = HEADER.match(/if\s*\(!hasUnsavedChanges\)\s*return/);
      expect(guard).not.toBeNull();
    });
  });

  describe('TC-6.2: Default behavior (no prop) - no prompt', () => {
    it('should early-return when hasUnsavedChanges is undefined/false', () => {
      // No BackHandler registered = default goBack works
      const guard = HEADER.match(/if\s*\(!hasUnsavedChanges\)\s*return/);
      expect(guard).not.toBeNull();
    });
  });

  describe('TC-6.3: Prompt shown when hasUnsavedChanges=true', () => {
    it('should show Alert with exit message', () => {
      expect(HEADER).toContain('Do you want to exit this current page?');
    });

    it('should call navigation.goBack() on Yes', () => {
      const yesGoBack = HEADER.match(/text:\s*'Yes'[\s\S]*?goBack\(\)/);
      expect(yesGoBack).not.toBeNull();
    });
  });
});
