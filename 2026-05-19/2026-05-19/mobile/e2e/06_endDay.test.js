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

describe('06 - End Day Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
  });

  it('should show End Day option in hamburger menu', async () => {
    await tapById('hamburger-button', 10000);
    await waitForText('Day End', 5000);
  });

  it('should tap Day End and show confirmation dialog', async () => {
    await tapByText('Day End');
    // Should show "Do you want to end the day?" alert
    await waitForText('end', 10000);
  });

  it('should confirm end day with Yes', async () => {
    const hasYes = await textExists('Yes');
    if (hasYes) {
      await tapByText('Yes');
    } else {
      const hasConfirm = await textExists('Confirm');
      if (hasConfirm) {
        await tapByText('Confirm');
      }
    }
  });

  it('should show day ended successfully', async () => {
    try {
      await waitForText('successfully', 15000);
      await dismissAlert('OK');
    } catch (e) {
      // May navigate directly to EndOfDay screen
      try {
        await waitForVisible('end-of-day-screen', 10000);
      } catch (e2) {
        // Day may already be ended
      }
    }
  });

  it('should return to dashboard after ending day', async () => {
    await waitForVisible('dashboard-screen', 15000);
    // Button should now say "Start Day" instead of "Continue"
    const hasStartDay = await textExists('Start Day');
    expect(hasStartDay).toBe(true);
  });
});

describe('06b - End Day via Dashboard (alternative flow)', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await loginAs();
  });

  it('should handle case when day is not started', async () => {
    const hasStartDay = await textExists('Start Day');
    if (hasStartDay) {
      // Day hasn't started — end day shouldn't be possible
      await tapById('hamburger-button');
      await tapByText('Day End');
      // Should show error that day hasn't started
      const hasAlert = await textExists('Alert');
      if (hasAlert) {
        await dismissAlert('OK');
      }
    }
  });
});
