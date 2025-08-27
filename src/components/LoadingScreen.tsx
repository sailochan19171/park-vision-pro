import React, { useEffect } from 'react';
import logo from '../assets/vay-logo.jpg';

const LoadingScreen = () => {
  useEffect(() => {
    // Add loading class to prevent scrolling
    document.body.classList.add('loading');
    document.documentElement.classList.add('loading');
    
    return () => {
      // Remove loading class to restore scrolling
      document.body.classList.remove('loading');
      document.documentElement.classList.remove('loading');
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-white z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        height: '100vh',
        width: '100vw',
        maxWidth: '100vw',
        maxHeight: '100vh',
        // Prevent any scroll bleed under the overlay
        overscrollBehavior: 'contain'
      }}
    >
      <div className="text-center max-w-full">
        {/* Logo with animation */}
        <div className="mb-8 relative">
          <div className="w-32 h-32 mx-auto mb-4 relative">
            <img
              src={logo}
              alt="VAY Logo"
              className="w-full h-full object-contain animate-pulse"
            />
            {/* Rotating ring around logo */}
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 border-r-blue-600 rounded-full animate-spin"></div>
          </div>
        </div>

        {/* Loading text */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">
            Loading Parking Solutions
          </h2>
          <div className="flex items-center justify-center space-x-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <p className="text-gray-600 text-sm">
            Smart Access for a Safer Future
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-8 w-64 max-w-full mx-auto px-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-gradient-to-r from-blue-600 to-green-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;