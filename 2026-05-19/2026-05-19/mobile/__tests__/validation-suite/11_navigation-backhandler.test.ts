/**
 * VALIDATION #11: Navigation & Back Handlers
 * Validates: AppNavigator.tsx, StoreActivityHeader.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const NAV = readFileSync(resolve(__dirname, '../../src/navigation/AppNavigator.tsx'), 'utf-8');
const HEADER = readFileSync(resolve(__dirname, '../../src/components/common/StoreActivityHeader.tsx'), 'utf-8');
const DASHBOARD = readFileSync(resolve(__dirname, '../../src/screens/DashboardScreen.tsx'), 'utf-8');
const JOURNEY = readFileSync(resolve(__dirname, '../../src/screens/JourneyPlanScreen.tsx'), 'utf-8');
const CUST_DASH = readFileSync(resolve(__dirname, '../../src/screens/CustomerDashboardScreen.tsx'), 'utf-8');

describe('VALIDATION #11: Navigation & Back Handlers', () => {
  describe('AppNavigator — all screens registered', () => {
    const requiredScreens = [
      'Login', 'InitialSync', 'MainTabs', 'Stores', 'Orders',
      'CustomerVisit', 'Order', 'OrderDetail', 'StoreCheck', 'Planogram',
      'Attendance', 'SkipReason', 'EndOfDay', 'Rota', 'RotaCreate',
      'ExpiryCheck', 'Competitor', 'OpeningStock', 'PhysicalStock',
      'OSOI', 'POCapture', 'MTDSummary', 'MyTeam', 'TeamMemberDetail',
      'LocationApproval', 'StartDay', 'CustomerDashboard',
      'InitiativeList', 'InitiativeDetail', 'InitiativeExecution',
      'BroadcastInitiative', 'TestCases', 'ProductSampling',
      'PermanentDisplay', 'PermanentDisplayCheck',
      'SurveyList', 'SurveyExecute', 'NearExpiryReport',
      'Notifications', 'Profile', 'ChangePassword',
      'SalesReport', 'TargetVsAchievement', 'Messages',
      'Endorsement', 'Leave', 'About', 'Prospect', 'EditCustomer',
      'BrandTraining', 'CustomerInteraction', 'ProductFeedback',
      'EscalationMatrix', 'MobileReports', 'Settings',
    ];

    for (const screen of requiredScreens) {
      it(`should register "${screen}" screen`, () => {
        expect(NAV).toContain(`name="${screen}"`);
      });
    }
  });

  describe('AppNavigator — auth flow', () => {
    it('should show Login when not logged in', () => {
      const loginBlock = NAV.match(/!isLoggedIn[\s\S]*?name="Login"/);
      expect(loginBlock).not.toBeNull();
    });

    it('should show InitialSync when logged in but needs sync', () => {
      const syncBlock = NAV.match(/needsSync[\s\S]*?name="InitialSync"/);
      expect(syncBlock).not.toBeNull();
    });

    it('should show MainTabs (Dashboard) when logged in and synced', () => {
      expect(NAV).toContain('name="MainTabs"');
    });

    it('should use createNativeStackNavigator', () => {
      expect(NAV).toContain('createNativeStackNavigator');
    });
  });

  describe('AppNavigator — gestureEnabled: false on Stores', () => {
    it('should disable gesture on Stores screen', () => {
      const storesBlock = NAV.match(/name="Stores"[\s\S]*?gestureEnabled:\s*false/);
      expect(storesBlock).not.toBeNull();
    });
  });

  describe('AppNavigator — header configuration', () => {
    it('should show Farmley logo in header', () => {
      expect(NAV).toContain("require('../assets/farmley_logo.png')");
    });

    it('should hide header on Login', () => {
      const loginHidden = NAV.match(/name="Login"[\s\S]*?headerShown:\s*false/);
      expect(loginHidden).not.toBeNull();
    });

    it('should hide header on InitialSync', () => {
      const syncHidden = NAV.match(/name="InitialSync"[\s\S]*?headerShown:\s*false/);
      expect(syncHidden).not.toBeNull();
    });

    it('should hide header on MainTabs (Dashboard)', () => {
      const dashHidden = NAV.match(/name="MainTabs"[\s\S]*?headerShown:\s*false/);
      expect(dashHidden).not.toBeNull();
    });
  });

  describe('useFocusEffect on back handlers', () => {
    it('Dashboard should use useFocusEffect for BackHandler.exitApp', () => {
      const match = DASHBOARD.match(/useFocusEffect[\s\S]*?BackHandler\.exitApp/);
      expect(match).not.toBeNull();
    });

    it('JourneyPlan should use useFocusEffect for back to MainTabs', () => {
      const match = JOURNEY.match(/useFocusEffect[\s\S]*?navigate\('MainTabs'\)/);
      expect(match).not.toBeNull();
    });

    it('CustomerDashboard should use useFocusEffect', () => {
      expect(CUST_DASH).toContain('useFocusEffect');
    });
  });

  describe('StoreActivityHeader — hasUnsavedChanges prop', () => {
    it('should accept hasUnsavedChanges in Props interface', () => {
      expect(HEADER).toContain('hasUnsavedChanges?: boolean');
    });

    it('should only show confirm dialog when hasUnsavedChanges is true', () => {
      expect(HEADER).toContain('if (!hasUnsavedChanges) return');
    });

    it('should show unsaved changes warning on back', () => {
      expect(HEADER).toContain('Your unsaved changes will be lost');
    });

    it('should use BackHandler.addEventListener for back interception', () => {
      expect(HEADER).toContain("BackHandler.addEventListener('hardwareBackPress'");
    });

    it('should clean up subscription on unmount', () => {
      expect(HEADER).toContain('sub.remove()');
    });
  });

  describe('StoreActivityHeader — logo and hamburger', () => {
    it('should render Farmley logo', () => {
      expect(HEADER).toContain("require('../../assets/farmley_logo.png')");
    });

    it('should have hamburger menu button', () => {
      expect(HEADER).toContain('onPress={openDrawer}');
      expect(HEADER).toContain('name="menu"');
    });

    it('should render side drawer on hamburger tap', () => {
      expect(HEADER).toContain('drawerVisible');
    });

    it('should have drawer with LinearGradient header', () => {
      expect(HEADER).toContain('LinearGradient');
    });
  });
});
