import { Platform, StyleSheet } from 'react-native';

export const GlassColors = {
  primary: '#1a56db',
  primaryDark: '#1e40af',
  primaryLight: '#EFF6FF',
  bgDeep: '#1240ab',
  bgDark: '#1a56db',
  bgMid: '#2563EB',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  danger: '#EF4444',
  warning: '#F97316',
  success: '#22C55E',
  white: '#FFFFFF',
};

export const Gradients = {
  background: ['#1a56db', '#2563EB', '#3b82f6'] as const,
  header: ['#1240ab', '#1a56db'] as const,
  card: ['#FFFFFF', '#F9FAFB'] as const,
};

export const GlassShadow = {
  small: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
  }),
  medium: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    android: { elevation: 4 },
  }),
  large: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
  }),
};

export const GlassStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },
  inputFocused: {
    borderColor: '#1a56db',
    backgroundColor: '#FFFFFF',
  },
});
