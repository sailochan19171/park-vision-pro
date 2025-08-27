import React from 'react';
import { Button } from './ui/button';
import { Settings, Cookie, RefreshCw } from 'lucide-react';
import { useCookieConsent, cookieUtils } from '../hooks/use-cookie-consent';

interface CookieSettingsProps {
  onOpenConsent?: () => void;
}

const CookieSettings: React.FC<CookieSettingsProps> = ({ onOpenConsent }) => {
  const consentData = useCookieConsent();

  const handleResetConsent = () => {
    if (window.confirm('Are you sure you want to reset your cookie preferences? This will show the cookie banner again.')) {
      cookieUtils.resetConsent();
      window.location.reload(); // Reload to show cookie banner again
    }
  };

  const getStatusBadge = () => {
    switch (consentData.status) {
      case 'accepted_all':
        return (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
            ✅ All Cookies Accepted
          </span>
        );
      case 'necessary_only':
        return (
          <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            ⚠️ Necessary Only
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
            ❌ Cookies Rejected
          </span>
        );
      default:
        return (
          <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
            ❓ No Preference Set
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 bg-tech-blue/10 rounded-lg flex items-center justify-center">
          <Cookie className="h-5 w-5 text-tech-blue" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Cookie Preferences</h3>
          <p className="text-sm text-gray-600">Manage your cookie and privacy settings</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-900">Current Status:</p>
            <p className="text-sm text-gray-600">
              {consentData.timestamp 
                ? `Set on ${new Date(consentData.timestamp).toLocaleDateString()}`
                : 'Not set'
              }
            </p>
          </div>
          {getStatusBadge()}
        </div>

        {/* Cookie Types Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Necessary</h4>
            <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium inline-block">
              Always Active
            </div>
            <p className="text-xs text-gray-600 mt-2">Required for basic functionality</p>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Analytics</h4>
            <div className={`px-2 py-1 rounded text-xs font-medium inline-block ${
              consentData.canUseAnalytics 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {consentData.canUseAnalytics ? 'Enabled' : 'Disabled'}
            </div>
            <p className="text-xs text-gray-600 mt-2">Help us improve our website</p>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Marketing</h4>
            <div className={`px-2 py-1 rounded text-xs font-medium inline-block ${
              consentData.canUseMarketing 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {consentData.canUseMarketing ? 'Enabled' : 'Disabled'}
            </div>
            <p className="text-xs text-gray-600 mt-2">Personalized content and ads</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          <Button
            onClick={handleResetConsent}
            variant="outline"
            className="flex items-center justify-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reset Preferences</span>
          </Button>

          {onOpenConsent && (
            <Button
              onClick={onOpenConsent}
              className="bg-tech-blue hover:bg-tech-blue/90 flex items-center justify-center space-x-2"
            >
              <Settings className="h-4 w-4" />
              <span>Change Settings</span>
            </Button>
          )}
        </div>

        {/* Information */}
        <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
          <p className="font-medium text-blue-900 mb-1">ℹ️ About Cookies</p>
          <p>
            Cookies help us provide you with a better experience by remembering your preferences, 
            analyzing site usage, and delivering relevant content. You can change these settings 
            at any time, but some features may not work properly if cookies are disabled.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CookieSettings;