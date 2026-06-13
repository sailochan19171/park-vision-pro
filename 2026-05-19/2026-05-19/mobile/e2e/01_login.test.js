const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  typeInField,
  dismissKeyboard,
  dismissAlert,
  textExists,
} = require('./helpers');

describe('01 - Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('should show login screen on fresh launch', async () => {
    await waitForVisible('login-screen', 15000);
    await expect(element(by.id('login-username'))).toBeVisible();
    await expect(element(by.id('login-password'))).toBeVisible();
    await expect(element(by.id('login-button'))).toBeVisible();
  });

  it('should show error on empty credentials', async () => {
    await tapById('login-button');
    // Should show validation error
    await waitForText('Alert !', 5000);
    await dismissAlert('OK');
  });

  it('should show error on wrong credentials', async () => {
    await typeInField('login-username', 'wronguser');
    await typeInField('login-password', 'wrongpass');
    await dismissKeyboard();
    await tapById('login-button');
    await waitForText('Alert !', 10000);
    await dismissAlert('OK');
  });

  it('should login with valid credentials', async () => {
    await element(by.id('login-username')).clearText();
    await element(by.id('login-username')).typeText('9000000001');
    await element(by.id('login-password')).clearText();
    await element(by.id('login-password')).typeText('farmley123');
    await dismissKeyboard();
    await tapById('login-button');
  });

  it('should show sync progress after login', async () => {
    // Wait for sync screen or direct dashboard
    try {
      await waitForText('Syncing', 10000);
      // Wait for sync to complete
      await waitForVisible('dashboard-screen', 90000);
    } catch (e) {
      // Might skip sync if data already cached
      await waitForVisible('dashboard-screen', 30000);
    }
  });

  it('should show dashboard with store counts and tasks', async () => {
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
    await expect(element(by.id('total-assigned-stores'))).toBeVisible();
    await expect(element(by.id('total-covered-stores'))).toBeVisible();
    await expect(element(by.text('Tasks'))).toBeVisible();
  });

  it('should show Continue or Start Day button', async () => {
    const hasContinue = await textExists('Continue');
    const hasStartDay = await textExists('Start Day');
    expect(hasContinue || hasStartDay).toBe(true);
  });
});
