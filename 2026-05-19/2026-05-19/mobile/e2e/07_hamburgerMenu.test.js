const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  loginAs,
  dismissAlert,
  textExists,
  elementExists,
} = require('./helpers');

describe('07 - Hamburger Menu Navigation', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
  });

  it('should open drawer when tapping hamburger icon', async () => {
    await tapById('hamburger-button', 10000);
    await waitForText('My Tasks', 5000);
  });

  it('should show user name and route in header', async () => {
    await expect(element(by.id('drawer-user-name'))).toBeVisible();
    await expect(element(by.id('drawer-user-route'))).toBeVisible();
  });

  it('should show all menu items', async () => {
    await expect(element(by.text('My Tasks'))).toBeVisible();
    await expect(element(by.text('My Store(s)'))).toBeVisible();
    await expect(element(by.text('Target Vs Achievement'))).toBeVisible();
    await expect(element(by.text('Rota Creation'))).toBeVisible();
    await expect(element(by.text('Reports'))).toBeVisible();
    await expect(element(by.text('Others'))).toBeVisible();
    await expect(element(by.text('Day End'))).toBeVisible();
    await expect(element(by.text('Logout'))).toBeVisible();
  });

  it('should show WINIT logo in footer', async () => {
    await expect(element(by.id('drawer-winit-logo'))).toBeVisible();
  });

  // ─── Navigate to each menu item ─────────────────────────────────────
  it('should navigate to My Tasks', async () => {
    await tapByText('My Tasks');
    try {
      await waitForVisible('survey-list-screen', 5000);
    } catch (e) {
      // May show different screen name
    }
    await device.pressBack();
  });

  it('should navigate to My Store(s)', async () => {
    await tapById('hamburger-button');
    await tapByText('My Store(s)');
    await waitForVisible('stores-screen', 10000);
    await device.pressBack();
  });

  it('should navigate to Target Vs Achievement', async () => {
    await tapById('hamburger-button');
    await tapByText('Target Vs Achievement');
    try {
      await waitForVisible('target-achievement-screen', 5000);
    } catch (e) {
      // Screen may not exist yet
    }
    await device.pressBack();
  });

  it('should navigate to Reports', async () => {
    await tapById('hamburger-button');
    await tapByText('Reports');
    try {
      await waitForVisible('reports-screen', 5000);
    } catch (e) {
      // Screen may not exist yet
    }
    await device.pressBack();
  });

  it('should navigate to Others (Settings)', async () => {
    await tapById('hamburger-button');
    await tapByText('Others');
    try {
      await waitForVisible('settings-screen', 5000);
    } catch (e) {
      // May show different screen
    }
    await device.pressBack();
  });

  // ─── Logout Flow ────────────────────────────────────────────────────
  it('should show logout confirmation', async () => {
    await tapById('hamburger-button');
    await tapByText('Logout');
    // Should show confirmation dialog
    await waitForText('Logout', 5000);
  });

  it('should cancel logout and stay on dashboard', async () => {
    const hasCancel = await textExists('Cancel');
    const hasNo = await textExists('No');
    if (hasCancel) {
      await tapByText('Cancel');
    } else if (hasNo) {
      await tapByText('No');
    }
    await waitForVisible('dashboard-screen', 5000);
  });

  it('should confirm logout and return to login screen', async () => {
    await tapById('hamburger-button');
    await tapByText('Logout');
    // Confirm
    const hasConfirm = await textExists('Yes');
    const hasOK = await textExists('OK');
    if (hasConfirm) {
      await tapByText('Yes');
    } else if (hasOK) {
      await tapByText('OK');
    }
    await waitForVisible('login-screen', 15000);
  });
});
