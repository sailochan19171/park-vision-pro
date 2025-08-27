import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { X, Cookie, Shield, Settings } from 'lucide-react';

const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const cookieConsent = localStorage.getItem('vayaccess_cookie_consent');
    if (!cookieConsent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('vayaccess_cookie_consent', 'accepted_all');
    localStorage.setItem('vayaccess_cookie_timestamp', new Date().toISOString());
    setIsVisible(false);
  };

  const handleAcceptNecessary = () => {
    localStorage.setItem('vayaccess_cookie_consent', 'necessary_only');
    localStorage.setItem('vayaccess_cookie_timestamp', new Date().toISOString());
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('vayaccess_cookie_consent', 'rejected');
    localStorage.setItem('vayaccess_cookie_timestamp', new Date().toISOString());
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50" />

      {/* Cookie Consent Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-tech-blue to-blue-400 rounded-xl flex items-center justify-center">
                  <Cookie className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Cookie Preferences</h3>
                  <p className="text-sm text-gray-600">VayAccess respects your privacy</p>
                </div>
              </div>
              <button
                onClick={handleReject}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close cookie banner"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed">
                We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.
                By clicking "Accept All", you consent to our use of cookies for analytics, marketing, and functionality.
              </p>

              {showDetails && (
                <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                  <h4 className="font-semibold text-gray-900 flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-tech-blue" />
                    Cookie Categories
                  </h4>

                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-medium text-gray-800">Necessary Cookies</h5>
                        <p className="text-sm text-gray-600">
                          Essential for basic website functionality
                        </p>
                      </div>
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
                        Always Active
                      </div>
                    </div>

                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-medium text-gray-800">Analytics Cookies</h5>
                        <p className="text-sm text-gray-600">
                          Help us understand how visitors interact with our website
                        </p>
                      </div>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                        Optional
                      </div>
                    </div>

                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-medium text-gray-800">Marketing Cookies</h5>
                        <p className="text-sm text-gray-600">
                          Used to deliver relevant advertisements and track ad performance
                        </p>
                      </div>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                        Optional
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      For more information about our cookie policy, please visit our{' '}
                      <a href="#" className="text-tech-blue hover:underline font-medium">
                        Privacy Policy
                      </a>{' '}
                      page.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button
                onClick={handleAcceptAll}
                className="bg-gradient-to-r from-tech-blue to-blue-400 hover:from-tech-blue/90 hover:to-blue-400/90 text-white px-6 py-3 font-semibold flex-1 sm:flex-none"
              >
                Accept All Cookies
              </Button>

              <Button
                onClick={handleAcceptNecessary}
                variant="outline"
                className="border-2 border-gray-300 hover:border-tech-blue hover:text-tech-blue px-6 py-3 font-semibold flex-1 sm:flex-none"
              >
                Necessary Only
              </Button>

              <Button
                onClick={() => setShowDetails(!showDetails)}
                variant="ghost"
                className="text-gray-600 hover:text-tech-blue px-6 py-3 font-semibold flex items-center justify-center flex-1 sm:flex-none"
              >
                <Settings className="h-4 w-4 mr-2" />
                {showDetails ? 'Hide Details' : 'Customize'}
              </Button>
            </div>

            {/* Branding */}
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">
                🔒 Your privacy is important to us at{' '}
                <span className="font-medium text-tech-blue">VayAccess</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CookieConsent;
