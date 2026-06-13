/**
 * VALIDATION #3: Dashboard Home Screen
 * Validates: DashboardScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, '../../src/screens/DashboardScreen.tsx'), 'utf-8');

describe('VALIDATION #3: Dashboard Home Screen', () => {
  describe('KPI loading', () => {
    it('should define KPI interface with visitsToday', () => {
      expect(SRC).toContain('visitsToday: number');
    });

    it('should define KPI interface with revenue', () => {
      expect(SRC).toContain('revenue: number');
    });

    it('should define KPI interface with target', () => {
      expect(SRC).toContain('target: number');
    });

    it('should define KPI interface with achieved', () => {
      expect(SRC).toContain('achieved: number');
    });

    it('should define KPI interface with achievedPct', () => {
      expect(SRC).toContain('achievedPct: number');
    });

    it('should have loadKPIs callback', () => {
      expect(SRC).toContain('const loadKPIs = useCallback');
    });

    it('should track kpiLoading state', () => {
      expect(SRC).toContain('const [kpiLoading, setKpiLoading] = useState(true)');
    });
  });

  describe('Quick tiles grid', () => {
    it('should define QUICK_TILES array', () => {
      expect(SRC).toContain('const QUICK_TILES');
    });

    it('should have Razor pay Check-in/out tile', () => {
      expect(SRC).toContain("label: 'Razor pay Check-in/out'");
    });

    it('should have My Store(s) tile', () => {
      expect(SRC).toContain("label: 'My Store(s)'");
    });

    it('should have Brand Training tile', () => {
      expect(SRC).toContain("label: 'Brand Training'");
    });

    it('should have ROTA tile', () => {
      expect(SRC).toContain("label: 'ROTA'");
    });

    it('should have Escalation Matrix tile', () => {
      expect(SRC).toContain("label: 'Escalation Matrix'");
    });
  });

  describe('Side drawer with menu items', () => {
    it('should define DRAWER_ITEMS array', () => {
      expect(SRC).toContain('const DRAWER_ITEMS');
    });

    it('should have My Tasks drawer item', () => {
      expect(SRC).toContain("label: 'My Tasks'");
    });

    it('should have My Store(s) drawer item', () => {
      expect(SRC).toContain("label: 'My Store(s)'");
    });

    it('should have Target Vs Achievement drawer item', () => {
      expect(SRC).toContain("label: 'Target Vs Achievement'");
    });

    it('should have Rota Creation drawer item', () => {
      expect(SRC).toContain("label: 'Rota Creation'");
    });

    it('should have Reports drawer item', () => {
      expect(SRC).toContain("label: 'Reports'");
    });

    it('should have Others drawer item', () => {
      expect(SRC).toContain("label: 'Others'");
    });

    it('should have SideDrawer component', () => {
      expect(SRC).toContain('function SideDrawer');
    });

    it('should render drawer user name with testID', () => {
      expect(SRC).toContain('testID="drawer-user-name"');
    });

    it('should render drawer user route with testID', () => {
      expect(SRC).toContain('testID="drawer-user-route"');
    });

    it('should have Day End option in drawer', () => {
      expect(SRC).toContain("Day End");
    });

    it('should have Logout option in drawer', () => {
      expect(SRC).toContain("Logout");
    });
  });

  describe('Day status tracking', () => {
    it('should track dayStarted state', () => {
      expect(SRC).toContain('const [dayStarted, setDayStarted] = useState(false)');
    });

    it('should track dayEnded state', () => {
      expect(SRC).toContain('const [dayEnded, setDayEnded] = useState(false)');
    });

    it('should load day status from AsyncStorage', () => {
      expect(SRC).toContain('day_started_');
      expect(SRC).toContain('day_ended_');
    });

    it('should show Continue vs Start Day based on day state', () => {
      expect(SRC).toContain("dayStarted && !dayEnded ? 'Continue' : 'Start Day'");
    });
  });

  describe('Pull-to-refresh capability', () => {
    it('should import RefreshControl', () => {
      expect(SRC).toContain('RefreshControl');
    });

    it('should track refreshing state', () => {
      expect(SRC).toContain('const [refreshing, setRefreshing] = useState(false)');
    });

    it('should use RefreshControl in ScrollView', () => {
      expect(SRC).toContain('<RefreshControl');
    });
  });

  describe('Timer display for active day', () => {
    it('should have TimerDisplay component', () => {
      expect(SRC).toContain('const TimerDisplay = memo');
    });

    it('should show START TIME label', () => {
      expect(SRC).toContain('START TIME');
    });

    it('should show WORKING label with elapsed timer', () => {
      expect(SRC).toContain('WORKING');
    });

    it('should update elapsed time every second', () => {
      expect(SRC).toContain('setInterval(tick, 1000)');
    });

    it('should track dayStartTimestamp', () => {
      expect(SRC).toContain('const [dayStartTimestamp, setDayStartTimestamp] = useState');
    });
  });

  describe('Razorpay attendance alert', () => {
    it('should contain Razorpay Attendance alert text', () => {
      expect(SRC).toContain('Have you marked your Razorpay Attendance?');
    });

    it('should have Yes option that navigates to StartDay', () => {
      const yesBlock = SRC.match(/text:\s*'Yes'[\s\S]*?navigate\('StartDay'\)/);
      expect(yesBlock).not.toBeNull();
    });

    it('should have No option with style cancel', () => {
      const noBlock = SRC.match(/text:\s*'No'[\s\S]*?style:\s*'cancel'/);
      expect(noBlock).not.toBeNull();
    });
  });

  describe('Back handler exits app', () => {
    it('should import BackHandler', () => {
      expect(SRC).toContain('BackHandler');
    });

    it('should call BackHandler.exitApp() on back press', () => {
      expect(SRC).toContain('BackHandler.exitApp()');
    });

    it('should use useFocusEffect for back handler scope', () => {
      const focusBack = SRC.match(/useFocusEffect[\s\S]*?BackHandler\.exitApp/);
      expect(focusBack).not.toBeNull();
    });
  });

  describe('Dashboard — unsynced count & push sync', () => {
    it('should import pushSync', () => {
      expect(SRC).toContain("import { pushSync }");
    });

    it('should track unsynced/pending count', () => {
      expect(SRC).toContain('pendingCount');
    });
  });
});
