/**
 * BUG FIX #2: Block check-in without Start Day
 * Verifies: handleCheckIn checks day_started before allowing check-in
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC = resolve(__dirname, '../../src/screens/CustomerVisitScreen.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('BUG FIX #2: Check-in Guard Without Start Day', () => {
  describe('TC-2.1: Day-started check exists at top of handleCheckIn', () => {
    it('should check AsyncStorage for day_started flag', () => {
      expect(source).toContain('day_started_${todayStr}');
    });

    it('should query attendance_records as fallback', () => {
      const fallback = source.match(/attendance_records[\s\S]*?Q\.where\('user_code'/);
      expect(fallback).not.toBeNull();
    });

    it('should check attendance_date equals todayStr', () => {
      const dateCheck = source.match(/Q\.where\('attendance_date',\s*todayStr\)/);
      expect(dateCheck).not.toBeNull();
    });
  });

  describe('TC-2.2: Alert shown when day not started', () => {
    it('should show "Start Day Required" alert title', () => {
      expect(source).toContain('Start Day Required');
    });

    it('should show descriptive message', () => {
      expect(source).toContain('Please start your day before checking in to a store');
    });

    it('should have cancelable: false (force user to acknowledge)', () => {
      const cancelBlock = source.match(/Start Day Required[\s\S]*?cancelable:\s*false/);
      expect(cancelBlock).not.toBeNull();
    });

    it('should navigate to MainTabs on OK', () => {
      const navBlock = source.match(/Start Day Required[\s\S]*?navigate\('MainTabs'\)/);
      expect(navBlock).not.toBeNull();
    });

    it('should return early (not proceed with check-in)', () => {
      // After the dayHasStarted check, there should be a return
      const returnBlock = source.match(/if\s*\(!dayHasStarted\)[\s\S]*?return;/);
      expect(returnBlock).not.toBeNull();
    });
  });

  describe('TC-2.3: Back-fills AsyncStorage when DB record found', () => {
    it('should setItem day_started when attendance record exists', () => {
      const backfill = source.match(/dayHasStarted = count > 0[\s\S]*?setItem\(`day_started/);
      expect(backfill).not.toBeNull();
    });
  });

  describe('TC-2.4: Check-in proceeds when day IS started', () => {
    it('should call setCheckingIn(true) after the guard passes', () => {
      // setCheckingIn(true) appears after the day-start check block
      const order = source.indexOf('if (!dayHasStarted)');
      const checkingIn = source.indexOf('setCheckingIn(true)', order);
      expect(checkingIn).toBeGreaterThan(order);
    });
  });
});
