import { useState, useEffect } from 'react';

export type CookieConsentStatus = 'accepted_all' | 'necessary_only' | 'rejected' | null;

export interface CookieConsentData {
  status: CookieConsentStatus;
  timestamp: string | null;
  hasConsented: boolean;
  canUseAnalytics: boolean;
  canUseMarketing: boolean;
}

export const useCookieConsent = (): CookieConsentData => {
  const [consentData, setConsentData] = useState<CookieConsentData>({
    status: null,
    timestamp: null,
    hasConsented: false,
    canUseAnalytics: false,
    canUseMarketing: false,
  });

  useEffect(() => {
    const checkCookieConsent = () => {
      const consent = localStorage.getItem('vayaccess_cookie_consent') as CookieConsentStatus;
      const timestamp = localStorage.getItem('vayaccess_cookie_timestamp');

      const newConsentData: CookieConsentData = {
        status: consent,
        timestamp,
        hasConsented: consent !== null,
        canUseAnalytics: consent === 'accepted_all',
        canUseMarketing: consent === 'accepted_all',
      };

      setConsentData(newConsentData);
    };

    checkCookieConsent();

    // Listen for storage changes (in case user changes consent in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'vayaccess_cookie_consent' || e.key === 'vayaccess_cookie_timestamp') {
        checkCookieConsent();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return consentData;
};

// Utility functions for cookie management
export const cookieUtils = {
  // Reset cookie consent (useful for testing or user preference changes)
  resetConsent: () => {
    localStorage.removeItem('vayaccess_cookie_consent');
    localStorage.removeItem('vayaccess_cookie_timestamp');
  },

  // Check if specific cookie type is allowed
  canUseAnalytics: (): boolean => {
    const consent = localStorage.getItem('vayaccess_cookie_consent');
    return consent === 'accepted_all';
  },

  canUseMarketing: (): boolean => {
    const consent = localStorage.getItem('vayaccess_cookie_consent');
    return consent === 'accepted_all';
  },

  // Get consent timestamp
  getConsentTimestamp: (): Date | null => {
    const timestamp = localStorage.getItem('vayaccess_cookie_timestamp');
    return timestamp ? new Date(timestamp) : null;
  },

  // Check if consent is older than specified days
  isConsentExpired: (maxAgeDays: number = 365): boolean => {
    const timestamp = cookieUtils.getConsentTimestamp();
    if (!timestamp) return true;

    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
    return Date.now() - timestamp.getTime() > maxAge;

    // const minAge=minAgeDays *20 * 30 * 30 * 1000;
  },
};

export default useCookieConsent;