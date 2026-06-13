/**
 * VALIDATION #15: Reports, Settings, Profile
 * Validates: MobileReportsScreen.tsx, SettingsScreen.tsx, ProfileScreen.tsx
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPORTS = readFileSync(resolve(__dirname, '../../src/screens/MobileReportsScreen.tsx'), 'utf-8');
const SETTINGS = readFileSync(resolve(__dirname, '../../src/screens/SettingsScreen.tsx'), 'utf-8');
const PROFILE = readFileSync(resolve(__dirname, '../../src/screens/ProfileScreen.tsx'), 'utf-8');

describe('VALIDATION #15: Reports, Settings, Profile', () => {
  describe('MobileReportsScreen — report types listed', () => {
    it('should define REPORT_TILES array', () => {
      expect(REPORTS).toContain('const REPORT_TILES');
    });

    it('should have Daily Stock & Sale Report', () => {
      expect(REPORTS).toContain('Daily Stock');
      expect(REPORTS).toContain('Sale Report');
    });

    it('should have Store User Visit Report', () => {
      expect(REPORTS).toContain('Store User');
      expect(REPORTS).toContain('Visit Report');
    });

    it('should have User Journey Attendance', () => {
      expect(REPORTS).toContain('User Journey');
      expect(REPORTS).toContain('Attendance');
    });

    it('should have User Wise Attendance', () => {
      expect(REPORTS).toContain('User Wise');
    });

    it('should have Task Done Status Report', () => {
      expect(REPORTS).toContain('Task Done');
      expect(REPORTS).toContain('Status Report');
    });

    it('should navigate to report screen on tile tap', () => {
      expect(REPORTS).toContain('navigation.navigate(tile.screen)');
    });

    it('should show Mobile Reports banner', () => {
      expect(REPORTS).toContain('Mobile Reports');
    });
  });

  describe('SettingsScreen — sync controls', () => {
    it('should import pullSync and pushSync', () => {
      expect(SETTINGS).toContain("import { pushSync, pullSync }");
    });

    it('should have handleSyncData function', () => {
      expect(SETTINGS).toContain('const handleSyncData = async');
    });

    it('should have handleUploadData function', () => {
      expect(SETTINGS).toContain('const handleUploadData = async');
    });

    it('should track syncing state', () => {
      expect(SETTINGS).toContain('const [syncing, setSyncing] = useState(false)');
    });

    it('should track uploading state', () => {
      expect(SETTINGS).toContain('const [uploading, setUploading] = useState(false)');
    });

    it('should show last sync time', () => {
      expect(SETTINGS).toContain('last_sync_time');
    });
  });

  describe('SettingsScreen — camera toggle', () => {
    it('should have custom camera toggle', () => {
      expect(SETTINGS).toContain('CUSTOM_CAMERA_KEY');
    });

    it('should track customCamera state', () => {
      expect(SETTINGS).toContain('const [customCamera, setCustomCamera] = useState(false)');
    });

    it('should load camera setting from AsyncStorage', () => {
      expect(SETTINGS).toContain("AsyncStorage.getItem(CUSTOM_CAMERA_KEY)");
    });
  });

  describe('SettingsScreen — data management', () => {
    it('should have developer mode toggle', () => {
      expect(SETTINGS).toContain('DEV_MODE_KEY');
    });

    it('should track devMode state', () => {
      expect(SETTINGS).toContain('const [devMode, setDevMode] = useState(false)');
    });

    it('should call pullSync with all module names on sync', () => {
      expect(SETTINGS).toContain("modules: ['customers', 'items', 'prices'");
    });

    it('should show Success alert after sync', () => {
      expect(SETTINGS).toContain("Alert.alert('Success'");
    });

    it('should import database for data management', () => {
      expect(SETTINGS).toContain("import database from '../db/database'");
    });
  });

  describe('ProfileScreen — user info display', () => {
    it('should display user name', () => {
      expect(PROFILE).toContain("user?.name ?? 'User'");
    });

    it('should display user code', () => {
      expect(PROFILE).toContain("user?.code ?? ''");
    });

    it('should show avatar with initial letter', () => {
      expect(PROFILE).toContain("const initial = user?.name?.charAt(0)?.toUpperCase()");
    });

    it('should fetch extended profile from API', () => {
      expect(PROFILE).toContain("api.get('/users/profile')");
    });

    it('should show Account Details section', () => {
      expect(PROFILE).toContain('Account Details');
    });

    it('should have InfoRow component for displaying fields', () => {
      expect(PROFILE).toContain('function InfoRow');
    });

    it('should track loadingProfile state', () => {
      expect(PROFILE).toContain('const [loadingProfile, setLoadingProfile] = useState(true)');
    });
  });

  describe('ProfileScreen — change password link', () => {
    it('should navigate to ChangePassword screen', () => {
      expect(PROFILE).toContain("navigation.navigate('ChangePassword')");
    });

    it('should show Change Password text', () => {
      expect(PROFILE).toContain('Change Password');
    });
  });

  describe('SettingsScreen — navigation', () => {
    it('should import useNavigation', () => {
      expect(SETTINGS).toContain("import { useNavigation }");
    });

    it('should have logout function', () => {
      expect(SETTINGS).toContain('const logout = useAuthStore');
    });
  });
});
