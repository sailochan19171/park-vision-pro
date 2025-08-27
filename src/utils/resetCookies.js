// Quick utility to reset cookie consent for testing
// Run this in browser console to see cookie banner again

function resetCookieConsent() {
  localStorage.removeItem('vayaccess_cookie_consent');
  localStorage.removeItem('vayaccess_cookie_timestamp');
  console.log('✅ Cookie consent reset! Reloading page...');
  window.location.reload();
}

// Make it available globally for easy testing
window.resetCookieConsent = resetCookieConsent;

console.log('🍪 Cookie reset utility loaded! Run resetCookieConsent() to test banner again.');