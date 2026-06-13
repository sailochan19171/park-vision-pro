/**
 * VALIDATION #1: Auth & Login Module
 * Validates: LoginScreen.tsx, SplashScreen.tsx, auth store
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const LOGIN = readFileSync(resolve(__dirname, '../../src/screens/LoginScreen.tsx'), 'utf-8');
const SPLASH = readFileSync(resolve(__dirname, '../../src/screens/SplashScreen.tsx'), 'utf-8');
const AUTH = readFileSync(resolve(__dirname, '../../src/store/auth.ts'), 'utf-8');

describe('VALIDATION #1: Auth & Login Module', () => {
  describe('LoginScreen — form fields with testIDs', () => {
    it('should have username input with testID "login-username"', () => {
      expect(LOGIN).toContain('testID="login-username"');
    });

    it('should have password input with testID "login-password"', () => {
      expect(LOGIN).toContain('testID="login-password"');
    });

    it('should have login button with testID "login-button"', () => {
      expect(LOGIN).toContain('testID="login-button"');
    });

    it('should have password toggle with testID "password-toggle"', () => {
      expect(LOGIN).toContain('testID="password-toggle"');
    });

    it('should have remember-me checkbox with testID', () => {
      expect(LOGIN).toContain('testID="remember-me-checkbox"');
    });
  });

  describe('LoginScreen — loading state', () => {
    it('should track loading state', () => {
      expect(LOGIN).toContain('const [loading, setLoading] = useState(false)');
    });

    it('should disable button when loading', () => {
      expect(LOGIN).toContain('disabled={loading}');
    });

    it('should show ActivityIndicator when loading', () => {
      expect(LOGIN).toContain('ActivityIndicator');
      // When loading, shows spinner instead of text
      const loadingBlock = LOGIN.match(/loading\s*\?\s*\(\s*<ActivityIndicator/);
      expect(loadingBlock).not.toBeNull();
    });
  });

  describe('LoginScreen — error handling', () => {
    it('should validate empty username+password', () => {
      expect(LOGIN).toContain('Please enter username and password');
    });

    it('should validate empty username', () => {
      expect(LOGIN).toContain('Please enter your username');
    });

    it('should validate empty password', () => {
      expect(LOGIN).toContain('Please enter your password');
    });

    it('should handle invalid credentials (401/403)', () => {
      expect(LOGIN).toContain('Invalid username or password');
    });

    it('should handle network errors', () => {
      expect(LOGIN).toContain('No internet connection');
    });

    it('should handle timeout errors', () => {
      expect(LOGIN).toContain('Connection timed out');
    });

    it('should handle 404 not found', () => {
      expect(LOGIN).toContain('User not found');
    });

    it('should handle 429 rate limiting', () => {
      expect(LOGIN).toContain('Too many login attempts');
    });

    it('should handle 500+ server errors', () => {
      expect(LOGIN).toContain('Server is temporarily unavailable');
    });

    it('should display error text in the UI', () => {
      expect(LOGIN).toContain('{error}');
    });

    it('should have shake animation on error', () => {
      expect(LOGIN).toContain('shake()');
    });
  });

  describe('Auth Store — JWT token storage', () => {
    it('should store accessToken in AsyncStorage', () => {
      expect(AUTH).toContain("AsyncStorage.setItem('accessToken', accessToken)");
    });

    it('should store refreshToken in AsyncStorage', () => {
      expect(AUTH).toContain("AsyncStorage.setItem('refreshToken', refreshToken)");
    });

    it('should store user JSON in AsyncStorage', () => {
      expect(AUTH).toContain("AsyncStorage.setItem('user', JSON.stringify(user))");
    });

    it('should have accessToken in state', () => {
      expect(AUTH).toContain('accessToken: string | null');
    });

    it('should have refreshToken in state', () => {
      expect(AUTH).toContain('refreshToken: string | null');
    });
  });

  describe('Auth Store — offline login capability', () => {
    it('should cache credentials for offline use', () => {
      expect(AUTH).toContain("AsyncStorage.setItem('offlineCredentials'");
    });

    it('should cache user for offline use', () => {
      expect(AUTH).toContain("AsyncStorage.setItem('offlineUser'");
    });

    it('should detect network errors and try offline login', () => {
      expect(AUTH).toContain('trying offline login');
    });

    it('should match cached credentials in offline mode', () => {
      expect(AUTH).toContain('c.u === username && c.p === password');
    });

    it('should set offlineMode flag when offline login succeeds', () => {
      expect(AUTH).toContain('offlineMode: true');
    });

    it('should have loadFromStorage to restore session', () => {
      expect(AUTH).toContain('loadFromStorage');
    });

    it('should have markSyncDone method', () => {
      expect(AUTH).toContain('markSyncDone');
    });
  });

  describe('Auth Store — logout', () => {
    it('should remove tokens on logout', () => {
      expect(AUTH).toContain("AsyncStorage.removeItem('accessToken')");
      expect(AUTH).toContain("AsyncStorage.removeItem('refreshToken')");
    });

    it('should reset state on logout', () => {
      expect(AUTH).toContain('isLoggedIn: false');
    });
  });

  describe('SplashScreen — animation and branding', () => {
    it('should render Farmley SFA title', () => {
      expect(SPLASH).toContain('Farmley SFA');
    });

    it('should render Sales Force Automation subtitle', () => {
      expect(SPLASH).toContain('Sales Force Automation');
    });

    it('should have logo animation (scale + opacity)', () => {
      expect(SPLASH).toContain('logoScale');
      expect(SPLASH).toContain('logoOpacity');
    });

    it('should use Animated.sequence for entrance', () => {
      expect(SPLASH).toContain('Animated.sequence');
    });

    it('should show version text', () => {
      expect(SPLASH).toContain('v2.0');
    });

    it('should render the logo image', () => {
      expect(SPLASH).toContain("require('../assets/farmley mobile app logo.jpg')");
    });
  });

  describe('LoginScreen — sync on login', () => {
    it('should import initialSync from syncService', () => {
      expect(LOGIN).toContain("import { initialSync");
    });

    it('should track syncing state', () => {
      expect(LOGIN).toContain("const [syncing, setSyncing] = useState(false)");
    });

    it('should show sync progress text', () => {
      expect(LOGIN).toContain('syncText');
    });

    it('should skip sync in offline mode', () => {
      expect(LOGIN).toContain('authState.offlineMode');
    });

    it('should reset database before sync in online mode', () => {
      expect(LOGIN).toContain('database.unsafeResetDatabase');
    });
  });
});
