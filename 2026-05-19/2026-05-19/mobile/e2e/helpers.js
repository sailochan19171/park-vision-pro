/**
 * Shared helpers for Detox E2E tests
 */

// Waits for an element to be visible with timeout
async function waitForVisible(testID, timeout = 10000) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

// Waits for text to be visible
async function waitForText(text, timeout = 10000) {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(timeout);
}

// Taps element by testID, waits for it first
async function tapById(testID, timeout = 5000) {
  await waitForVisible(testID, timeout);
  await element(by.id(testID)).tap();
}

// Taps element by text, waits for it first
async function tapByText(text, timeout = 5000) {
  await waitForText(text, timeout);
  await element(by.text(text)).tap();
}

// Types text into a field by testID
async function typeInField(testID, text) {
  await waitForVisible(testID);
  await element(by.id(testID)).clearText();
  await element(by.id(testID)).typeText(text);
}

// Dismisses keyboard
async function dismissKeyboard() {
  try {
    await device.pressBack();
  } catch (e) {
    // ignore
  }
}

// Login helper - reusable across tests
async function loginAs(username = '9000000001', password = 'farmley123') {
  await waitForVisible('login-username', 15000);
  await element(by.id('login-username')).clearText();
  await element(by.id('login-username')).typeText(username);
  await element(by.id('login-password')).clearText();
  await element(by.id('login-password')).typeText(password);
  await dismissKeyboard();
  await tapById('login-button');
  // Wait for sync to complete and dashboard to appear
  await waitForVisible('dashboard-screen', 60000);
}

// Navigate to stores list
async function goToStores() {
  await tapById('task-my-stores', 10000);
  await waitForVisible('stores-screen', 10000);
}

// Tap first store in list
async function tapFirstStore() {
  await waitForVisible('store-list', 10000);
  await element(by.id('store-card-0')).tap();
  await waitForVisible('customer-dashboard', 10000);
}

// Handle alert dialog - tap OK or specified button
async function dismissAlert(buttonText = 'OK') {
  try {
    await waitForText(buttonText, 3000);
    await tapByText(buttonText);
  } catch (e) {
    // Alert may not appear, that's fine
  }
}

// Check if element exists (doesn't throw)
async function elementExists(testID) {
  try {
    await expect(element(by.id(testID))).toExist();
    return true;
  } catch (e) {
    return false;
  }
}

// Check if text exists on screen
async function textExists(text) {
  try {
    await expect(element(by.text(text))).toExist();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  waitForVisible,
  waitForText,
  tapById,
  tapByText,
  typeInField,
  dismissKeyboard,
  loginAs,
  goToStores,
  tapFirstStore,
  dismissAlert,
  elementExists,
  textExists,
};
