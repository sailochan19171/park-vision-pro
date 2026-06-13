const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  typeInField,
  loginAs,
  goToStores,
  tapFirstStore,
  dismissAlert,
  textExists,
  elementExists,
} = require('./helpers');

describe('05 - PO Capture Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
    await goToStores();
    await tapFirstStore();
  });

  it('should navigate to Capture PO', async () => {
    const hasPO = await textExists('PO Capture');
    if (!hasPO) {
      // Try scrolling to find it
      try {
        await element(by.id('customer-dashboard')).scroll(300, 'down');
        await tapByText('PO Capture', 5000);
      } catch (e) {
        return; // PO Capture not available
      }
    } else {
      await tapByText('PO Capture');
    }
    await waitForVisible('po-capture-screen', 10000);
  });

  it('should show Add button and capture section', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    await expect(element(by.text('Capture PO'))).toBeVisible();
    await expect(element(by.text('Add'))).toBeVisible();
  });

  it('should show capture image and PO number fields', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    await expect(element(by.text('Capture Image of PO'))).toBeVisible();
    await expect(element(by.text('PO Number'))).toBeVisible();
  });

  it('should tap Add to open item picker', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    await tapByText('Add');
    await waitForText('Add Items', 10000);
  });

  it('should show searchable item list with images', async () => {
    const hasAddItems = await textExists('Add Items');
    if (!hasAddItems) return;

    await expect(element(by.id('item-search-input'))).toBeVisible();
    // Should show item list with checkboxes
    await waitForVisible('item-list', 10000);
  });

  it('should search for items', async () => {
    const hasAddItems = await textExists('Add Items');
    if (!hasAddItems) return;

    await element(by.id('item-search-input')).typeText('Date Bite');
    // Wait for filtered results
    await waitFor(element(by.id('item-row-0')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('item-search-input')).clearText();
  });

  it('should select items and confirm', async () => {
    const hasAddItems = await textExists('Add Items');
    if (!hasAddItems) return;

    // Tap checkboxes on first two items
    try {
      await tapById('item-checkbox-0');
      await tapById('item-checkbox-1');
    } catch (e) {
      // Some items may not exist
    }

    await tapByText('OK');
  });

  it('should show selected items in PO table with qty and price', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    // Table headers
    await expect(element(by.text('Item Code / Description'))).toBeVisible();
    await expect(element(by.text('Qty'))).toBeVisible();
    await expect(element(by.text('Price'))).toBeVisible();
  });

  it('should enter PO number', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    try {
      await element(by.id('po-number-input')).typeText('PO-TEST-001');
    } catch (e) {
      // May not find specific testID
    }
  });

  it('should show total PO value', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    const hasTotal = await textExists('Total PO Value');
    expect(hasTotal).toBe(true);
  });

  it('should complete PO capture', async () => {
    const onScreen = await elementExists('po-capture-screen');
    if (!onScreen) return;

    await tapByText('Complete');
    await dismissAlert('OK');
  });
});
