/**
 * VALIDATION #6: Customer Dashboard Screen
 * Validates: CustomerDashboardScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, '../../src/screens/CustomerDashboardScreen.tsx'), 'utf-8');

describe('VALIDATION #6: Customer Dashboard Screen', () => {
  describe('Activity tiles grid', () => {
    it('should define ACTIVITIES array', () => {
      expect(SRC).toContain('const ACTIVITIES: ActivityItem[]');
    });

    it('should have Opening Stock activity', () => {
      expect(SRC).toContain("title: 'Opening Stock'");
    });

    it('should have Physical Stock activity', () => {
      expect(SRC).toContain("title: 'Physical Stock'");
    });

    it('should have OSOI Photo Capture activity', () => {
      expect(SRC).toContain("title: 'OSOI Photo Capture'");
    });

    it('should have Planogram activity', () => {
      expect(SRC).toContain("title: 'Planogram'");
    });

    it('should have Ageing/Near Expiry Data activity', () => {
      expect(SRC).toContain("title: 'Ageing/Near Expiry Data'");
    });

    it('should have Competitor Observation activity', () => {
      expect(SRC).toContain("title: 'Competitor Observation'");
    });

    it('should have Daily Sales Report activity', () => {
      expect(SRC).toContain("title: 'Daily Sales Report'");
    });

    it('should have PO Capture activity', () => {
      expect(SRC).toContain("title: 'PO Capture'");
    });

    it('should have MTD Sales Summary activity', () => {
      expect(SRC).toContain("title: 'MTD Sales Summary'");
    });
  });

  describe('Customer header', () => {
    it('should accept customerCode from route params', () => {
      expect(SRC).toContain('customerCode: string');
    });

    it('should accept customerName from route params', () => {
      expect(SRC).toContain('customerName: string');
    });

    it('should load address from database', () => {
      expect(SRC).toContain("const [address, setAddress] = useState('')");
    });

    it('should use StoreActivityHeader', () => {
      expect(SRC).toContain("import StoreActivityHeader from '../components/common/StoreActivityHeader'");
    });
  });

  describe('Checkout flow', () => {
    it('should track checkingOut state', () => {
      expect(SRC).toContain('const [checkingOut, setCheckingOut] = useState(false)');
    });

    it('should import getCurrentPosition for GPS on checkout', () => {
      expect(SRC).toContain("import { getCurrentPosition, calculateDistance }");
    });

    it('should import capturePhoto for checkout photo', () => {
      expect(SRC).toContain("import { capturePhoto }");
    });

    it('should have checkout photo preview state', () => {
      expect(SRC).toContain('checkoutPhotoPreview');
    });

    it('should support OTP for checkout', () => {
      expect(SRC).toContain('showOtpModal');
      expect(SRC).toContain('otpChallenge');
    });

    it('should import uploadPhoto for checkout image', () => {
      expect(SRC).toContain("import { pushSync, uploadPhoto }");
    });
  });

  describe('Back handler with useFocusEffect', () => {
    it('should import useFocusEffect', () => {
      expect(SRC).toContain('useFocusEffect');
    });

    it('should use useFocusEffect for checking completed activities', () => {
      const match = SRC.match(/useFocusEffect\(useCallback\(\(\) => \{ checkCompleted/);
      expect(match).not.toBeNull();
    });
  });

  describe('Activity completion tracking', () => {
    it('should track completedActivities as Set', () => {
      expect(SRC).toContain("const [completedActivities, setCompletedActivities] = useState<Set<string>>(new Set())");
    });

    it('should check OpeningStock completion', () => {
      expect(SRC).toContain("done.add('OpeningStock')");
    });

    it('should check PhysicalStock completion', () => {
      expect(SRC).toContain("done.add('PhysicalStock')");
    });

    it('should check OSOI completion', () => {
      expect(SRC).toContain("done.add('OSOI')");
    });

    it('should check Planogram completion', () => {
      expect(SRC).toContain("done.add('Planogram')");
    });

    it('should check ExpiryCheck completion', () => {
      expect(SRC).toContain("done.add('ExpiryCheck')");
    });

    it('should check Competitor completion', () => {
      expect(SRC).toContain("done.add('Competitor')");
    });

    it('should check POCapture completion', () => {
      expect(SRC).toContain("done.add('POCapture')");
    });
  });

  describe('Customer target display', () => {
    it('should track customer target state', () => {
      expect(SRC).toContain('const [customerTarget, setCustomerTarget]');
    });

    it('should read target from AsyncStorage', () => {
      expect(SRC).toContain('target_${customerCode}');
    });
  });

  describe('Haversine distance function', () => {
    it('should define getDistance function', () => {
      expect(SRC).toContain('function getDistance');
    });

    it('should use R=6371000 for Earth radius', () => {
      expect(SRC).toContain('const R = 6371000');
    });
  });

  describe('OTP challenge-response', () => {
    it('should define generateChallenge function', () => {
      expect(SRC).toContain('function generateChallenge');
    });

    it('should define verifyOtpResponse function', () => {
      expect(SRC).toContain('function verifyOtpResponse');
    });

    it('should have OTP_SECRET constant', () => {
      expect(SRC).toContain('const OTP_SECRET');
    });
  });
});
