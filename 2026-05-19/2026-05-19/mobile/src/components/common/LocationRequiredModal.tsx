import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  AppState,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  isLocationEnabled,
  openLocationSettings,
  resetLocationAlertState,
} from '../../services/locationGuard';

interface LocationRequiredModalProps {
  isVisible: boolean;
  onLocationEnabled: () => void;
}

export default function LocationRequiredModal({
  isVisible,
  onLocationEnabled,
}: LocationRequiredModalProps) {
  const [checking, setChecking] = useState(false);

  // Check location when modal becomes visible
  useEffect(() => {
    if (isVisible) {
      checkLocationStatus();
    }
  }, [isVisible]);

  // Monitor app state - when user returns from settings, check location again
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isVisible) {
        // Small delay to allow location services to fully initialize
        setTimeout(() => {
          checkLocationStatus();
        }, 1000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isVisible]);

  const checkLocationStatus = useCallback(async () => {
    if (checking) return;
    setChecking(true);

    try {
      const enabled = await isLocationEnabled();
      if (enabled) {
        resetLocationAlertState();
        onLocationEnabled();
      }
    } catch (error) {
      console.log('[LocationRequiredModal] Check error:', error);
    } finally {
      setChecking(false);
    }
  }, [checking, onLocationEnabled]);

  const handleOpenSettings = () => {
    openLocationSettings();
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Icon name="location-off" size={48} color="#DC2626" />
          </View>

          <Text style={styles.title}>Location Required</Text>

          <Text style={styles.message}>
            Location services are turned off. Please turn on Location in device settings to continue.
          </Text>

          {checking && (
            <View style={styles.checkingContainer}>
              <ActivityIndicator size="small" color="#1a3a8f" />
              <Text style={styles.checkingText}>Checking location...</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleOpenSettings}
          >
            <Text style={styles.primaryButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  subMessage: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'left',
    marginBottom: 20,
    lineHeight: 20,
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  checkingText: {
    fontSize: 14,
    color: '#1a3a8f',
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '100%',
    marginBottom: 8,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#1a3a8f',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#EEF2FF',
  },
  secondaryButtonText: {
    color: '#1a3a8f',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
