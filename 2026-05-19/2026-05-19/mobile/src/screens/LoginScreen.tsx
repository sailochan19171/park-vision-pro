import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import useAuthStore from '../store/auth';
// database import removed — sync no longer touches sync_meta from here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
// initialSync is invoked inside auth.login() now — no longer used here.
// Release Date used to come from a build-time constant (BUILD_DATE), but an
// installed APK then kept showing the day it was built — reps complained that
// the date was "yesterday". Compute it at render time so it always shows the
// current day regardless of when the build was produced.
const formatTodayDate = (): string => {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  return `${DAYS[d.getDay()]}, ${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
import { isLocationEnabled } from '../services/locationGuard';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncText, setSyncText] = useState('Syncing Data...0%');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const login = useAuthStore((s) => s.login);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef<TextInput>(null);

  // Load saved credentials on mount if user previously checked "Remember me"
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('rememberMe_credentials');
        if (raw) {
          const { u, p } = JSON.parse(raw);
          if (u) setUsername(u);
          if (p) setPassword(p);
          setRememberMe(true);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (loading) return;
    console.log('[Login] ===== LOGIN BUTTON PRESSED =====');
    console.log('[Login] Username:', username);
    console.log('[Login] Password length:', password.trim().length);
    console.log('[Login] Remember me:', rememberMe);
    
    const trimUser = username.trim();
    const trimPass = password.trim();

    // Validate empty fields
    if (!trimUser && !trimPass) {
      setError('Please enter mobile number and password');
      shake();
      return;
    }
    if (!trimUser) {
      setError('Please enter your mobile number');
      shake();
      return;
    }
    // Mobile number must be exactly 10 digits.
    const digitsOnly = trimUser.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      shake();
      return;
    }
    if (!trimPass) {
      setError('Please enter your password');
      shake();
      return;
    }

    console.log('[Login] Validation passed, proceeding with login');

    // Block login when device location is off — LocationGuardProvider
    // shows the modal globally. No popup Alert here, that was double-UX.
    setLoading(true);
    try {
      const locationEnabled = await isLocationEnabled();
      if (!locationEnabled) {
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error('[Login] Location check error:', err);
      // Continue with login even if location check fails
    }

    setError('');
    try {
      console.log('[Login] Starting authentication...');
      // Authenticate first
      let loginOk = false;
      try {
        console.log('[Login] Calling login function...');
        // Show "Initializing..." overlay while auth + setup runs. The
        // store's login() handles the auth request; we also pass an
        // onProgress callback so any inline sync messages it emits
        // surface on the LoginScreen overlay too.
        setSyncing(true);
        setSyncText('Initializing...');
        await login(trimUser, trimPass, (msg: string) => setSyncText(msg));
        console.log('[Login] Login function completed successfully');
        loginOk = true;

        // Log successful login
        try { const { logLogin } = require('../services/activityLogger'); logLogin('success', undefined, trimUser); } catch {}

        // Persist or clear "Remember me" credentials based on the checkbox.
        if (rememberMe) {
          await AsyncStorage.setItem('rememberMe_credentials', JSON.stringify({ u: trimUser, p: trimPass }));
          console.log('[Login] Remember me credentials saved');
        } else {
          await AsyncStorage.removeItem('rememberMe_credentials');
          console.log('[Login] Remember me credentials cleared');
        }
      } catch (loginErr: any) {
        console.error('[Login] Login error:', loginErr);
        console.error('[Login] Login error stack:', loginErr?.stack);
        console.error('[Login] Login error type:', typeof loginErr);
        
        if (useAuthStore.getState().isLoggedIn && useAuthStore.getState().offlineMode) {
          console.log('[Login] Offline mode detected, marking login as OK');
          loginOk = true;
          try { const { logLogin } = require('../services/activityLogger'); logLogin('success', undefined, trimUser); } catch {}
        } else {
          console.log('[Login] Online mode, login failed');
          try { const { logLogin } = require('../services/activityLogger'); logLogin('failed', loginErr?.message, trimUser); } catch {}
          throw loginErr;
        }
      }
      
      console.log('[Login] Authentication result:', loginOk);
      if (!loginOk) {
        console.log('[Login] Returning early due to authentication failure');
        return;
      }

      // Sync now runs INSIDE auth.login() before isLoggedIn flips, so
      // the overlay we showed above stayed visible the entire time the
      // login() await ran. Just clear the overlay here.
      setSyncing(false);
      console.log('[Login] Login process completed');
    } catch (err: any) {
      console.error('[Login] MAIN ERROR BLOCK - CATCHING ERROR:', err);
      console.error('[Login] Error type:', typeof err);
      console.error('[Login] Error name:', err?.name);
      console.error('[Login] Error message:', err?.message);
      console.error('[Login] Error stack:', err?.stack);
      console.error('[Login] Error response:', err?.response);
      console.error('[Login] Error code:', err?.code);
      console.error('[Login] Full error object:', JSON.stringify(err, null, 2));
      
      setSyncing(false);

      const errMsg = err?.message ?? '';
      const statusCode = err?.response?.status;
      const serverMsg = err?.response?.data?.message;

      console.log('[Login] Processing error - status:', statusCode, 'message:', errMsg, 'code:', err?.code);

      let msg: string;
      if (statusCode === 401 || statusCode === 403 || errMsg.includes('Invalid') || errMsg.includes('invalid')) {
        msg = 'Invalid mobile number or password. Please check your credentials and try again.';
      } else if (errMsg === 'Network Error' || err?.code === 'ERR_NETWORK') {
        msg = 'No internet connection. Please check your network and try again.';
      } else if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
        msg = 'Connection timed out. Please check your network and try again.';
      } else if (errMsg.includes('No network') || errMsg.includes('No internet')) {
        msg = 'No internet connection. Please check your network and try again.';
      } else if (errMsg.includes('credentials') || errMsg.includes('offline')) {
        msg = errMsg;
      } else if (statusCode === 404) {
        msg = 'User not found. Please verify your mobile number.';
      } else if (statusCode === 429) {
        msg = 'Too many login attempts. Please wait a moment and try again.';
      } else if (statusCode && statusCode >= 500) {
        msg = 'Server is temporarily unavailable. Please try again later.';
      } else if (serverMsg) {
        msg = serverMsg;
      } else {
        msg = errMsg || 'Login failed. Please try again.';
      }

      console.log('[Login] Final error message:', msg);
      setError(msg);
      shake();
    } finally {
      console.log('[Login] Finally block - setting loading to false');
      setLoading(false);
    }
  };

  return (
    <View style={st.container} testID="login-screen">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Blue top line */}
      <View style={st.topLine} />

      <KeyboardAvoidingView
        style={st.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo section */}
          <View style={st.logoSection}>
            <Image
              source={require('../assets/farmley_logo.png')}
              style={st.logo}
              resizeMode="contain"
            />
            <Text style={st.brandBold}>Sales Force</Text>
            <Text style={st.brandLight}>Automation</Text>
          </View>

          {/* Login card */}
          <Animated.View
            style={[st.formCard, { transform: [{ translateX: shakeAnim }] }]}
          >
            <Text style={st.loginTitle}>Login</Text>

            {error ? (
              <View style={st.errorContainer}>
                <Text style={st.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Mobile Number - outlined */}
            <View style={st.outlinedInput}>
              <View style={st.outlinedLabelBg}>
                <Text style={st.outlinedLabel}>Mobile Number</Text>
              </View>
              <View style={st.outlinedRow}>
                <MCIcon name="phone-outline" size={22} color="#6B7280" style={st.inputIcon} />
                <TextInput
                  testID="login-username"
                  style={st.outlinedTextInput}
                  placeholder="Enter mobile number"
                  placeholderTextColor="#9CA3AF"
                  value={username}
                  onChangeText={(t) => setUsername(t.replace(/\D/g, '').slice(0, 10))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={10}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
            </View>

            {/* Password - outlined */}
            <View style={st.outlinedInput}>
              <View style={st.outlinedLabelBg}>
                <Text style={st.outlinedLabel}>Password</Text>
              </View>
              <View style={st.outlinedRow}>
                <MCIcon name="lock-outline" size={22} color="#6B7280" style={st.inputIcon} />
                <TextInput
                  testID="login-password"
                  ref={passwordRef}
                  style={st.outlinedTextInput}
                  placeholder="Enter password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="go"
                  onSubmitEditing={() => { if (!loading) handleLogin(); }}
                />
                <TouchableOpacity testID="password-toggle" onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <MCIcon name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Inline sync row removed — replaced by full-screen overlay
                rendered below at the root level. */}

            {/* Remember me */}
            <TouchableOpacity
              testID="remember-me-checkbox"
              style={st.checkboxRow}
              onPress={() => setRememberMe(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[st.checkbox, rememberMe && st.checkboxChecked]}>
                {rememberMe && <MCIcon name="check" size={14} color="#fff" />}
              </View>
              <Text style={st.checkboxLabel}>Remember me</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              testID="login-button"
              style={[st.loginButton, loading && st.loginButtonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={st.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-screen sync overlay — dims the form behind it and shows a
          centered spinner + status text matching the legacy SFA app UX.
          Stays on the LoginScreen the entire time sync runs, so the
          user never transitions to a separate sync screen. */}
      {syncing && (
        <View style={st.syncOverlay} pointerEvents="auto">
          <View style={st.syncCenter}>
            <ActivityIndicator size="large" color="#4A7BF7" />
            <Text style={st.syncOverlayText}>{syncText}</Text>
          </View>
        </View>
      )}

      {/* Bottom: Powered By + Winit Logo + Version bar */}
      <View style={st.bottomSection}>
        <Text style={st.poweredBy}>Powered By</Text>
        <Image
          source={require('../assets/winit-logo.png')}
          style={st.winitLogo}
          resizeMode="contain"
        />
      </View>
      <View style={st.versionBar}>
        <Text style={st.versionText}>
          Version:  V2.2  |  Release Date:  {formatTodayDate()}  |  Build: PROD
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topLine: {
    height: 4,
    backgroundColor: '#1a3a8f',
  },
  formWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 28,
  },
  logo: {
    width: 220,
    height: 80,
    marginBottom: 6,
  },
  brandBold: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a3a8f',
    letterSpacing: 0.5,
  },
  brandLight: {
    fontSize: 30,
    fontWeight: '300',
    color: '#111827',
    marginTop: -2,
  },

  // Form card
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },

  // Error
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },

  // Outlined inputs (Material style with label on border)
  outlinedInput: {
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    position: 'relative',
  },
  outlinedLabelBg: {
    position: 'absolute',
    top: -9,
    left: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
  },
  outlinedLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  outlinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    marginRight: 10,
  },
  outlinedTextInput: {
    flex: 1,
    height: 36,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    borderColor: '#22C55E',
    backgroundColor: '#22C55E',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },

  // Sync progress (legacy inline row — kept for type compat, not used)
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  syncText: {
    fontSize: 14,
    color: '#4A7BF7',
    fontWeight: '500',
  },

  // Full-screen sync overlay — dimmed background + centered loader.
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  syncCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  syncOverlayText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // Login button
  loginButton: {
    height: 52,
    backgroundColor: '#1a3a8f',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Bottom — lifted up from the gesture bar so the Powered By logo +
  // version row are clearly visible above the system navigation area
  // (especially on Oppo/MIUI devices with tall gesture pills).
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 4,
    marginBottom: 4,
  },
  poweredBy: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  winitLogo: {
    width: 160,
    height: 45,
  },
  versionBar: {
    backgroundColor: '#1a3a8f',
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 24 : 18,
  },
  versionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
});
