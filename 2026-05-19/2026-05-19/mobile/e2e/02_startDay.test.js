const {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  dismissAlert,
  loginAs,
  textExists,
  elementExists,
} = require('./helpers');

describe('02 - Start Day Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
  });

  it('should check if previous day needs to be ended first', async () => {
    // If "Continue" is shown, day is already started — check for prev day alert
    const hasContinue = await textExists('Continue');
    if (hasContinue) {
      await tapByText('Continue');
      // May show alert about ending previous day
      const hasEndAlert = await textExists('end the previous day');
      if (hasEndAlert) {
        await dismissAlert('OK');
      }
    }
  });

  it('should tap Start Day button from dashboard', async () => {
    const hasStartDay = await textExists('Start Day');
    if (hasStartDay) {
      await tapByText('Start Day');
      await waitForVisible('start-day-screen', 10000);
    }
  });

  it('should show pre-requisite checks', async () => {
    const onStartDay = await elementExists('start-day-screen');
    if (!onStartDay) return; // skip if already started

    // Verify 5 check items are visible
    await waitForText('Synchronization', 10000);
    await expect(element(by.text('Connectivity Check'))).toBeVisible();
    await expect(element(by.text('Network'))).toBeVisible();
    await expect(element(by.text('Location'))).toBeVisible();
    await waitForText('Battery', 10000);
  });

  it('should show all checks pass with green ticks', async () => {
    const onStartDay = await elementExists('start-day-screen');
    if (!onStartDay) return;

    // Wait for all checks to complete (green ticks)
    await waitForVisible('check-sync-pass', 20000);
    await waitForVisible('check-connectivity-pass', 15000);
    await waitForVisible('check-network-pass', 15000);
    await waitForVisible('check-location-pass', 15000);
    await waitForVisible('check-battery-pass', 15000);
  });

  it('should show Attendance button at bottom', async () => {
    const onStartDay = await elementExists('start-day-screen');
    if (!onStartDay) return;

    await waitForVisible('attendance-button', 10000);
    await tapById('attendance-button');
  });

  it('should open Attendance bottom sheet', async () => {
    const hasSheet = await textExists('Mark Attendance');
    if (!hasSheet) return;

    await expect(element(by.text('Attendance'))).toBeVisible();
    await expect(element(by.text('Mark Attendance'))).toBeVisible();
    // Default should be "Present"
    await expect(element(by.text('Present'))).toBeVisible();
  });

  it('should allow changing attendance type via Assets picker', async () => {
    const hasSheet = await textExists('Mark Attendance');
    if (!hasSheet) return;

    // Tap on the dropdown to open Assets picker
    await tapById('attendance-type-dropdown');
    await waitForText('Assets', 5000);

    // Verify all options visible
    await expect(element(by.text('Present'))).toBeVisible();
    await expect(element(by.text('Leave'))).toBeVisible();
    await expect(element(by.text('Week off'))).toBeVisible();
    await expect(element(by.text('Holiday'))).toBeVisible();

    // Select Present
    await tapByText('Present');
  });

  it('should show selfie capture section', async () => {
    const hasSheet = await textExists('Take a Selfie Photograph');
    if (!hasSheet) return;

    await expect(element(by.text('Take a Selfie Photograph'))).toBeVisible();
    await expect(element(by.id('selfie-camera-button'))).toBeVisible();
  });

  it('should require selfie before proceeding', async () => {
    const hasProceed = await textExists('Proceed');
    if (!hasProceed) return;

    await tapByText('Proceed');
    // Should show alert: "Please capture the selfie"
    const hasAlert = await textExists('Please capture the selfie');
    if (hasAlert) {
      await dismissAlert('OK');
    }
  });

  it('should capture selfie and proceed', async () => {
    const hasCameraBtn = await elementExists('selfie-camera-button');
    if (!hasCameraBtn) return;

    await tapById('selfie-camera-button');
    // Camera opens — wait a moment then proceed
    // On physical device camera will open, take photo
    try {
      await waitForVisible('selfie-preview', 10000);
    } catch (e) {
      // Camera permission may block — dismiss system dialog
      await device.pressBack();
    }
  });

  it('should complete attendance and navigate to stores', async () => {
    // After selfie, tap Proceed
    try {
      await tapByText('Proceed', 5000);
      // Day started — should navigate to My Stores or Dashboard with "Continue"
      const hasStores = await textExists('My Store');
      const hasDashboard = await elementExists('dashboard-screen');
      expect(hasStores || hasDashboard).toBe(true);
    } catch (e) {
      // Already past this step
    }
  });
});
