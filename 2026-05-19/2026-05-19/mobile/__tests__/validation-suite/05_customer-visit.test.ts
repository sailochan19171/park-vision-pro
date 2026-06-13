/**
 * VALIDATION #5: Customer Visit Screen
 * Validates: CustomerVisitScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = readFileSync(resolve(__dirname, '../../src/screens/CustomerVisitScreen.tsx'), 'utf-8');

describe('VALIDATION #5: Customer Visit Screen', () => {
  describe('Map component', () => {
    it('should import MapView', () => {
      expect(SRC).toContain("import MapView from 'react-native-maps'");
    });

    it('should have mapRef', () => {
      expect(SRC).toContain('const mapRef = useRef');
    });

    it('should define DEFAULT_REGION for Dubai', () => {
      expect(SRC).toContain('DEFAULT_REGION');
      expect(SRC).toContain('latitude: 25.2048');
    });

    it('should support map type toggle (standard/satellite)', () => {
      expect(SRC).toContain("const [mapType, setMapType] = useState");
    });
  });

  describe('Customer coordinates loading', () => {
    it('should fetch customer from database by code', () => {
      expect(SRC).toContain("database.get('customers').query(Q.where('code', customerCode))");
    });

    it('should parse latitude and longitude', () => {
      expect(SRC).toContain('parseFloat(c.latitude)');
      expect(SRC).toContain('parseFloat(c.longitude)');
    });

    it('should track customerCoords state', () => {
      expect(SRC).toContain('const [customerCoords, setCustomerCoords]');
    });
  });

  describe('Check-in flow', () => {
    it('should have handleCheckIn function', () => {
      expect(SRC).toContain('const handleCheckIn = async');
    });

    it('should get GPS location for check-in', () => {
      expect(SRC).toContain('getCurrentPosition');
    });

    it('should define CHECKIN_RADIUS_METERS', () => {
      expect(SRC).toContain('const CHECKIN_RADIUS_METERS = 1000');
    });

    it('should calculate distance for radius check', () => {
      expect(SRC).toContain('calculateDistance');
    });

    it('should handle force check-in with reason', () => {
      expect(SRC).toContain('forceCheckInData');
      expect(SRC).toContain('showReasonModal');
    });

    it('should support OTP check-in', () => {
      expect(SRC).toContain('showOtpModal');
      expect(SRC).toContain('otpChallenge');
      expect(SRC).toContain('otpInput');
    });
  });

  describe('Day-started guard before check-in', () => {
    it('should check day_started flag before check-in', () => {
      expect(SRC).toContain('day_started_');
    });

    it('should check attendance_records as fallback', () => {
      expect(SRC).toContain("'attendance_records'");
    });
  });

  describe('Photo capture on check-in', () => {
    it('should import capturePhoto', () => {
      expect(SRC).toContain("import { capturePhoto }");
    });

    it('should capture photo during check-in', () => {
      expect(SRC).toContain('capturePhoto(false');
    });

    it('should show photo preview', () => {
      expect(SRC).toContain('checkinPhotoPreview');
    });

    it('should alert if photo not captured', () => {
      expect(SRC).toContain('Please capture a photo to check in');
    });

    it('should import PhotoPreviewModal', () => {
      expect(SRC).toContain("import PhotoPreviewModal");
    });
  });

  describe('Navigate button on map', () => {
    it('should have handleNavigate function', () => {
      expect(SRC).toContain('const handleNavigate = useCallback');
    });

    it('should open maps app with coordinates', () => {
      expect(SRC).toContain('Linking.openURL(url)');
    });

    it('should use geo: scheme for Android', () => {
      expect(SRC).toContain('geo:0,0?q=');
    });

    it('should use maps: scheme for iOS', () => {
      expect(SRC).toContain('maps:0,0?q=');
    });
  });

  describe('Store info card', () => {
    it('should accept customerName in route params', () => {
      expect(SRC).toContain('customerName: string');
    });

    it('should accept customerCode in route params', () => {
      expect(SRC).toContain('customerCode: string');
    });

    it('should accept channelCode in route params', () => {
      expect(SRC).toContain("channelCode?: string");
    });

    it('should accept customerGroup in route params', () => {
      expect(SRC).toContain("customerGroup?: string");
    });

    it('should have StoreStats interface with todaysTarget', () => {
      expect(SRC).toContain('todaysTarget: number');
    });
  });

  describe('Address composed from multiple fields', () => {
    it('should compose address from address, cityCode, regionCode', () => {
      expect(SRC).toContain('[c.address, c.cityCode');
      expect(SRC).toContain("parts.join(', ')");
    });
  });

  describe('Visit state management', () => {
    it('should use visit store', () => {
      expect(SRC).toContain('useVisitStore');
    });

    it('should create customer_visits record in database', () => {
      expect(SRC).toContain("database.get('customer_visits').create");
    });

    it('should navigate to CustomerDashboard after check-in', () => {
      expect(SRC).toContain("navigation.replace('CustomerDashboard'");
    });
  });
});
