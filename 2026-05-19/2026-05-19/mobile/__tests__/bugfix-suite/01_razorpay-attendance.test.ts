/**
 * BUG FIX #1: Razorpay Attendance Alert before Start Day
 * Verifies: Alert shown with Yes/No before navigating to StartDay
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/screens/DashboardScreen.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('BUG FIX #1: Razorpay Attendance Alert', () => {
  describe('TC-1.1: Alert appears before Start Day navigation', () => {
    it('should contain Razorpay Attendance alert text', () => {
      expect(source).toContain('Have you marked your Razorpay Attendance?');
    });

    it('should have Yes option that navigates to StartDay', () => {
      expect(source).toContain("text: 'Yes'");
      // Yes handler navigates to StartDay
      const yesBlock = source.match(/text:\s*'Yes'[\s\S]*?navigate\('StartDay'\)/);
      expect(yesBlock).not.toBeNull();
    });

    it('should have No option that cancels (style: cancel)', () => {
      // No is first option with style: 'cancel'
      const noBlock = source.match(/text:\s*'No'[\s\S]*?style:\s*'cancel'/);
      expect(noBlock).not.toBeNull();
    });

    it('should have cancelable: true for dismiss on tap outside', () => {
      expect(source).toContain('cancelable: true');
    });
  });

  describe('TC-1.2: Alert only shown when day NOT started', () => {
    it('should skip alert and go to Stores when day is active (dayStarted && !dayEnded)', () => {
      // The first branch navigates to Stores directly
      const activeBlock = source.match(/if\s*\(dayStarted\s*&&\s*!dayEnded\)[\s\S]*?navigate\('Stores'\)/);
      expect(activeBlock).not.toBeNull();
    });

    it('should return early from the active-day branch (no alert)', () => {
      const returnAfterStores = source.match(/navigate\('Stores'\);\s*\n\s*return;/);
      expect(returnAfterStores).not.toBeNull();
    });

    it('should show Razorpay alert only in the else branch (day not started or ended)', () => {
      // Alert.alert for Razorpay is AFTER the return statement from the active-day branch
      const alertAfterReturn = source.match(/return;\s*\n\s*\}[\s\S]*?Razorpay Attendance/);
      expect(alertAfterReturn).not.toBeNull();
    });
  });

  describe('TC-1.3: Button text reflects day state', () => {
    it('should show "Continue" when day is active', () => {
      expect(source).toContain("dayStarted && !dayEnded ? 'Continue' : 'Start Day'");
    });

    it('should show "Start Day" when day not started', () => {
      expect(source).toContain("'Start Day'");
    });
  });
});
