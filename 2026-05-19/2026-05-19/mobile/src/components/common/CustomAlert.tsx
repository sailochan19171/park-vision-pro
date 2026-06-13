import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Alert as RNAlert,
} from 'react-native';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
}

// Global ref so the monkey-patched Alert.alert can trigger state changes
let globalShowAlert: ((title: string, message: string, buttons?: AlertButton[]) => void) | null = null;

// Store the original Alert.alert
const originalAlert = RNAlert.alert.bind(RNAlert);

export function CustomAlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showAlert = useCallback((title: string, message: string, buttons?: AlertButton[]) => {
    setAlert({
      visible: true,
      title,
      message,
      buttons: buttons ?? [{ text: 'OK' }],
    });
  }, []);

  // Register global ref and monkey-patch Alert.alert
  useEffect(() => {
    globalShowAlert = showAlert;
    RNAlert.alert = (title: string, message?: string, buttons?: any[]) => {
      if (globalShowAlert) {
        globalShowAlert(title, message ?? '', buttons);
      } else {
        originalAlert(title, message, buttons);
      }
    };
    return () => {
      globalShowAlert = null;
      RNAlert.alert = originalAlert;
    };
  }, [showAlert]);

  const handlePress = (btn: AlertButton) => {
    setAlert(prev => ({ ...prev, visible: false }));
    setTimeout(() => btn.onPress?.(), 200);
  };

  const handleDismiss = () => {
    // Find cancel button or just close
    const cancelBtn = alert.buttons.find(b => b.style === 'cancel');
    if (cancelBtn) {
      handlePress(cancelBtn);
    } else {
      setAlert(prev => ({ ...prev, visible: false }));
    }
  };

  const buttonCount = alert.buttons.length;

  return (
    <>
      {children}
      <Modal visible={alert.visible} transparent animationType="fade" onRequestClose={handleDismiss}>
        <View style={st.overlay}>
          <View style={st.box}>
            <Text style={st.title}>{alert.title}</Text>
            {alert.message ? <Text style={st.message}>{alert.message}</Text> : null}

            {buttonCount >= 2 ? (
              <View style={st.btnRow}>
                {alert.buttons.map((btn, i) => {
                  const isCancel = btn.style === 'cancel';
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[st.btn, isCancel ? st.btnCancel : st.btnPrimary]}
                      onPress={() => handlePress(btn)}
                      activeOpacity={0.8}
                    >
                      <Text style={isCancel ? st.btnTextCancel : st.btnTextPrimary}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity
                style={st.btnFull}
                onPress={() => handlePress(alert.buttons[0] ?? { text: 'OK' })}
                activeOpacity={0.8}
              >
                <Text style={st.btnTextPrimary}>{alert.buttons[0]?.text ?? 'OK'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 36,
  },
  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    padding: 24,
    paddingBottom: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  btnFull: {
    width: '100%',
    backgroundColor: '#1a3a8f',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#1a3a8f',
  },
  btnCancel: {
    backgroundColor: '#E5E7EB',
  },
  btnTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnTextCancel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
});
