import { Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Hook: returns the bottom padding a sticky footer should use so it sits
 * above the OS gesture pill / iPhone home indicator.
 */
export function useBottomInset(base: number = 16): number {
  const insets = useSafeAreaInsets();
  const osFallback = Platform.OS === 'ios' ? 24 : 16;
  return Math.max(base, insets.bottom + 8, osFallback);
}

/**
 * Static constant for use in StyleSheet.create() where hooks can't run.
 * Uses a heuristic: if the screen has a soft nav bar (no hardware buttons),
 * add extra padding. This covers ~95% of gesture-nav Android devices.
 *
 * For screens that CAN use the hook, prefer useBottomInset() for accuracy.
 */
const { height: SCREEN_H } = Dimensions.get('screen');
const { height: WINDOW_H } = Dimensions.get('window');
const NAV_BAR_HEIGHT = SCREEN_H - WINDOW_H;
// If nav bar > 40px it's likely gesture nav (pill takes ~48px); 3-button
// nav is ~48px too but we add padding regardless — it doesn't hurt.
export const SAFE_BOTTOM_PADDING = Platform.OS === 'ios'
  ? 28
  : NAV_BAR_HEIGHT > 24 ? 24 : 16;
