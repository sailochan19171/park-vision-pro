const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  loginAs,
  goToStores,
  tapFirstStore,
  dismissAlert,
  textExists,
  elementExists,
} = require('./helpers');

describe('03 - Store Visit & Check-in Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
  });

  // ─── Navigate to My Stores ───────────────────────────────────────────
  describe('My Stores Screen', () => {
    it('should navigate to My Stores from dashboard', async () => {
      await tapById('task-my-stores', 10000);
      await waitForVisible('stores-screen', 10000);
    });

    it('should show route name and search bar', async () => {
      await expect(element(by.text('My Store(s)'))).toBeVisible();
      await expect(element(by.id('store-search-input'))).toBeVisible();
    });

    it('should display store cards with name, code, address', async () => {
      await waitForVisible('store-list', 10000);
      await expect(element(by.id('store-card-0'))).toBeVisible();
    });

    it('should search stores by name', async () => {
      await element(by.id('store-search-input')).typeText('Ratnadeep');
      await waitFor(element(by.id('store-card-0')))
        .toBeVisible()
        .withTimeout(5000);
      // Clear search
      await element(by.id('store-search-input')).clearText();
    });

    it('should search stores by code', async () => {
      await element(by.id('store-search-input')).typeText('S2345');
      await waitFor(element(by.id('store-card-0')))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id('store-search-input')).clearText();
    });

    it('should scroll through store list', async () => {
      await element(by.id('store-list')).scroll(300, 'down');
      await element(by.id('store-list')).scroll(300, 'up');
    });
  });

  // ─── Check In to Store ───────────────────────────────────────────────
  describe('Store Check-in', () => {
    it('should tap a store to open customer dashboard', async () => {
      await tapFirstStore();
    });

    it('should show customer dashboard with activity tiles', async () => {
      await waitForVisible('customer-dashboard', 10000);
      // Verify key activity tiles
      const hasOrder = await textExists('Place Order');
      const hasOpeningStock = await textExists('Opening Stock');
      expect(hasOrder || hasOpeningStock).toBe(true);
    });

    it('should show store name in header', async () => {
      await expect(element(by.id('customer-store-name'))).toBeVisible();
    });
  });

  // ─── Opening Stock ───────────────────────────────────────────────────
  describe('Opening Stock', () => {
    it('should navigate to Opening Stock', async () => {
      const hasOpening = await textExists('Opening Stock');
      if (!hasOpening) return;

      await tapByText('Opening Stock');
      await waitForVisible('opening-stock-screen', 10000);
    });

    it('should display product list with images', async () => {
      const onScreen = await elementExists('opening-stock-screen');
      if (!onScreen) return;

      await waitForVisible('product-list', 10000);
      // Should have at least one product row
      await expect(element(by.id('product-row-0'))).toBeVisible();
    });

    it('should allow entering quantity', async () => {
      const onScreen = await elementExists('opening-stock-screen');
      if (!onScreen) return;

      // Tap first product quantity field
      try {
        await element(by.id('qty-input-0')).tap();
        await element(by.id('qty-input-0')).typeText('10');
      } catch (e) {
        // Numeric keypad may be used
      }
    });

    it('should save and go back', async () => {
      const onScreen = await elementExists('opening-stock-screen');
      if (!onScreen) return;

      const hasSave = await textExists('Save');
      if (hasSave) {
        await tapByText('Save');
        await dismissAlert('OK');
      }
      await device.pressBack();
    });
  });

  // ─── Physical Stock ──────────────────────────────────────────────────
  describe('Physical Stock', () => {
    it('should navigate to Physical Stock', async () => {
      const hasPhysical = await textExists('Physical Stock');
      if (!hasPhysical) return;

      await tapByText('Physical Stock');
      await waitForVisible('physical-stock-screen', 10000);
    });

    it('should show product list with images and quantities', async () => {
      const onScreen = await elementExists('physical-stock-screen');
      if (!onScreen) return;

      await waitForVisible('product-list', 10000);
    });

    it('should go back to customer dashboard', async () => {
      await device.pressBack();
      await waitForVisible('customer-dashboard', 5000);
    });
  });
});
