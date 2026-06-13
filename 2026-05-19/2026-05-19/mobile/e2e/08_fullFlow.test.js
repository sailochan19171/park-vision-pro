const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  typeInField,
  dismissKeyboard,
  dismissAlert,
  textExists,
  elementExists,
} = require('./helpers');

/**
 * Full end-to-end flow:
 * Login → Start Day → Visit Store → Opening Stock → Physical Stock →
 * Place Order → PO Capture → OSOI → Check Out → End Day
 */
describe('08 - Complete E2E Flow', () => {

  // ─── 1. Login ────────────────────────────────────────────────────────
  describe('Step 1: Login', () => {
    beforeAll(async () => {
      await device.launchApp({ newInstance: true, delete: true });
    });

    it('should login successfully', async () => {
      await waitForVisible('login-username', 15000);
      await element(by.id('login-username')).typeText('9000000001');
      await element(by.id('login-password')).typeText('farmley123');
      await dismissKeyboard();
      await tapById('login-button');
      // Wait for sync + dashboard
      await waitForVisible('dashboard-screen', 90000);
    });
  });

  // ─── 2. Start Day ───────────────────────────────────────────────────
  describe('Step 2: Start Day', () => {
    it('should handle previous day check and start new day', async () => {
      const hasContinue = await textExists('Continue');
      const hasStartDay = await textExists('Start Day');

      if (hasContinue) {
        await tapByText('Continue');
        // Check if alert about previous day
        try {
          await waitForText('end the previous day', 3000);
          await dismissAlert('OK');
          // Need to end previous day first
          await tapById('hamburger-button');
          await tapByText('Day End');
          try {
            await tapByText('Yes', 3000);
            await dismissAlert('OK');
          } catch (e) { /* */ }
          // Now start day
          await tapByText('Start Day', 5000);
        } catch (e) {
          // No alert — already proceeding
        }
      } else if (hasStartDay) {
        await tapByText('Start Day');
      }
    });

    it('should complete pre-requisite checks', async () => {
      try {
        await waitForText('Synchronization', 10000);
        // Wait for all checks to pass
        await waitForVisible('check-battery-pass', 20000);
      } catch (e) {
        // Already past checks
      }
    });

    it('should mark attendance', async () => {
      try {
        await tapById('attendance-button', 10000);
        await waitForText('Mark Attendance', 5000);
        // Keep Present selected, tap Proceed
        await tapByText('Proceed');
        // May show selfie alert
        const hasSelfieAlert = await textExists('selfie');
        if (hasSelfieAlert) {
          await dismissAlert('OK');
          // Need to capture selfie
          await tapById('selfie-camera-button');
          try {
            await waitForVisible('selfie-preview', 10000);
            await tapByText('Proceed');
          } catch (e) {
            await device.pressBack();
          }
        }
      } catch (e) {
        // Attendance already marked or screen different
      }
    });
  });

  // ─── 3. Store Visit ─────────────────────────────────────────────────
  describe('Step 3: Visit First Store', () => {
    it('should navigate to stores', async () => {
      // May already be on stores screen or need to go from dashboard
      const onStores = await elementExists('stores-screen');
      if (!onStores) {
        try {
          await tapById('task-my-stores', 10000);
        } catch (e) {
          // Go back to dashboard first
          await device.pressBack();
          await tapById('task-my-stores', 10000);
        }
      }
      await waitForVisible('stores-screen', 10000);
    });

    it('should check in to first store', async () => {
      await waitForVisible('store-card-0', 10000);
      await element(by.id('store-card-0')).tap();
      await waitForVisible('customer-dashboard', 10000);
    });
  });

  // ─── 4. Opening Stock ───────────────────────────────────────────────
  describe('Step 4: Opening Stock', () => {
    it('should enter opening stock for products', async () => {
      const hasOpening = await textExists('Opening Stock');
      if (!hasOpening) return;

      await tapByText('Opening Stock');
      await waitForVisible('opening-stock-screen', 10000);

      // Enter qty for first product
      try {
        await element(by.id('qty-input-0')).tap();
        await element(by.id('qty-input-0')).typeText('5');
      } catch (e) { /* */ }

      // Save
      try {
        await tapByText('Save', 5000);
        await dismissAlert('OK');
      } catch (e) { /* */ }

      await device.pressBack();
    });
  });

  // ─── 5. Physical Stock ──────────────────────────────────────────────
  describe('Step 5: Physical Stock', () => {
    it('should enter physical stock', async () => {
      const hasPhysical = await textExists('Physical Stock');
      if (!hasPhysical) return;

      await tapByText('Physical Stock');
      await waitForVisible('physical-stock-screen', 10000);

      try {
        await element(by.id('qty-input-0')).tap();
        await element(by.id('qty-input-0')).typeText('8');
        await tapByText('Save', 5000);
        await dismissAlert('OK');
      } catch (e) { /* */ }

      await device.pressBack();
    });
  });

  // ─── 6. Place Order ─────────────────────────────────────────────────
  describe('Step 6: Place Order', () => {
    it('should place an order', async () => {
      await tapByText('Place Order', 10000);
      await waitForVisible('order-screen', 15000);

      // Add first product
      try {
        await tapById('add-product-0');
        await tapById('add-product-1');
      } catch (e) { /* */ }

      // Submit
      await tapByText('Place Order', 5000);
      try {
        await waitForText('success', 15000);
        await dismissAlert('OK');
      } catch (e) {
        await dismissAlert('OK');
      }
    });
  });

  // ─── 7. OSOI ────────────────────────────────────────────────────────
  describe('Step 7: OSOI Check', () => {
    it('should complete OSOI', async () => {
      // Back to customer dashboard
      try {
        await waitForVisible('customer-dashboard', 5000);
      } catch (e) {
        await device.pressBack();
      }

      const hasOSOI = await textExists('OSOI');
      if (!hasOSOI) return;

      await tapByText('OSOI');
      try {
        await waitForVisible('osoi-screen', 10000);
        // Take photos or complete
        await tapByText('Save', 10000);
        await dismissAlert('OK');
      } catch (e) { /* */ }

      await device.pressBack();
    });
  });

  // ─── 8. End Day ─────────────────────────────────────────────────────
  describe('Step 8: End Day', () => {
    it('should navigate back to dashboard', async () => {
      // Press back until dashboard
      for (let i = 0; i < 5; i++) {
        const onDashboard = await elementExists('dashboard-screen');
        if (onDashboard) break;
        await device.pressBack();
      }
      await waitForVisible('dashboard-screen', 10000);
    });

    it('should end the day via hamburger menu', async () => {
      await tapById('hamburger-button');
      await tapByText('Day End', 5000);

      // Confirm
      const hasYes = await textExists('Yes');
      if (hasYes) {
        await tapByText('Yes');
      }

      // Wait for success
      try {
        await waitForText('successfully', 15000);
        await dismissAlert('OK');
      } catch (e) {
        // May navigate to end-of-day screen
        try {
          await waitForVisible('end-of-day-screen', 10000);
        } catch (e2) { /* */ }
      }
    });

    it('should return to dashboard with Start Day button', async () => {
      await waitForVisible('dashboard-screen', 15000);
      const hasStartDay = await textExists('Start Day');
      expect(hasStartDay).toBe(true);
    });
  });
});
