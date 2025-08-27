import React, { useState, useEffect } from 'react';

const AnimatedBarrierDemo = () => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [carPosition, setCarPosition] = useState(0);
  const [barrierOpen, setBarrierOpen] = useState(false);
  const [scanningActive, setScanningActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setCarPosition(0);
      setBarrierOpen(false);
      setScanningActive(false);

      // Car moves towards barrier (smoother animation)
      setTimeout(() => setCarPosition(40), 800);
      
      // Start scanning
      setTimeout(() => setScanningActive(true), 1000);
      
      // Barrier opens when car approaches
      setTimeout(() => {
        setBarrierOpen(true);
        setScanningActive(false);
      }, 1600);
      
      // Car continues through
      setTimeout(() => setCarPosition(85), 2200);
      
      // Reset animation
      setTimeout(() => {
        setIsAnimating(false);
        setCarPosition(0);
        setBarrierOpen(false);
        setScanningActive(false);
      }, 4000);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="relative w-full h-40 bg-gradient-to-b from-slate-100 to-slate-200 rounded-2xl overflow-hidden border border-slate-300 shadow-lg">
        {/* Sky Background */}
        <div className="absolute top-0 w-full h-16 bg-gradient-to-b from-blue-100 to-blue-50"></div>
        
        {/* Buildings in background */}
        <div className="absolute top-4 left-4 w-8 h-12 bg-gray-400 opacity-30"></div>
        <div className="absolute top-6 left-14 w-6 h-10 bg-gray-500 opacity-30"></div>
        <div className="absolute top-4 right-6 w-10 h-12 bg-gray-400 opacity-30"></div>

        {/* Road */}
        <div className="absolute bottom-0 w-full h-12 bg-gradient-to-t from-gray-700 to-gray-600">
          {/* Center line */}
          <div className="absolute top-1/2 left-0 w-full h-1 transform -translate-y-1/2" 
               style={{ 
                 background: 'repeating-linear-gradient(to right, transparent 0px, transparent 15px, #fbbf24 15px, #fbbf24 25px)'
               }}>
          </div>
          {/* Road edges */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-white opacity-50"></div>
          <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-800"></div>
        </div>

        {/* Control booth */}
        <div className="absolute right-1/2 bottom-12 w-6 h-20 bg-gradient-to-t from-gray-600 to-gray-500 rounded-t-lg transform translate-x-1/2 shadow-lg">
          {/* Control panel */}
          <div className="absolute top-2 left-1/2 w-4 h-6 bg-gray-800 rounded transform -translate-x-1/2">
            <div className={`absolute top-1 left-1/2 w-2 h-2 rounded-full transform -translate-x-1/2 transition-all duration-300 ${
              scanningActive ? 'bg-yellow-400 animate-pulse' : barrierOpen ? 'bg-green-400' : 'bg-red-500'
            }`}></div>
            <div className="absolute bottom-1 left-1/2 w-3 h-1 bg-blue-400 rounded transform -translate-x-1/2 opacity-60"></div>
          </div>
          {/* Booth base */}
          <div className="absolute bottom-0 left-1/2 w-8 h-3 bg-gray-700 rounded transform -translate-x-1/2"></div>
        </div>

        {/* Barrier Arm */}
        <div 
          className={`absolute right-1/2 bottom-28 w-24 h-3 origin-left transition-all duration-1000 ease-in-out transform translate-x-1/2 rounded-full shadow-md ${
            barrierOpen ? '-rotate-90 opacity-70' : 'rotate-0'
          }`}
          style={{
            background: barrierOpen 
              ? 'linear-gradient(90deg, #dc2626 0%, #16a34a 100%)' 
              : 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
            boxShadow: barrierOpen ? '0 0 20px rgba(34, 197, 94, 0.3)' : '0 0 20px rgba(239, 68, 68, 0.2)'
          }}
        >
          {/* Reflective stripes */}
          <div className="absolute top-0 left-3 w-1.5 h-full bg-white opacity-90 rounded-full"></div>
          <div className="absolute top-0 left-7 w-1.5 h-full bg-white opacity-90 rounded-full"></div>
          <div className="absolute top-0 left-11 w-1.5 h-full bg-white opacity-90 rounded-full"></div>
          <div className="absolute top-0 left-15 w-1.5 h-full bg-white opacity-90 rounded-full"></div>
          <div className="absolute top-0 left-19 w-1.5 h-full bg-white opacity-90 rounded-full"></div>
        </div>

        {/* Car SVG */}
        <div 
          className={`absolute bottom-8 transition-all duration-1500 ease-in-out ${
            isAnimating ? 'filter drop-shadow-lg' : 'opacity-90'
          }`}
          style={{ 
            left: `${carPosition}%`, 
            transform: 'translateX(-50%)',
            filter: carPosition > 35 && carPosition < 50 && scanningActive ? 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.5))' : ''
          }}
        >
          <svg width="56" height="28" viewBox="0 0 56 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Car Body */}
            <path 
              d="M8 22h40c2.5 0 4.5-2 4.5-4.5V10c0-2.5-2-4.5-4.5-4.5H8c-2.5 0-4.5 2-4.5 4.5v7.5c0 2.5 2 4.5 4.5 4.5z" 
              fill="#1d4ed8"
              stroke="#1e40af"
              strokeWidth="1.5"
            />
            
            {/* Car Windows */}
            <path 
              d="M10 7.5h36c1.2 0 2.2 1 2.2 2.2v4.6c0 1.2-1 2.2-2.2 2.2H10c-1.2 0-2.2-1-2.2-2.2V9.7c0-1.2 1-2.2 2.2-2.2z" 
              fill="#93c5fd"
              opacity="0.9"
            />
            
            {/* Front Lights */}
            <circle cx="47" cy="12" r="2.5" fill="#fbbf24" opacity="0.95"/>
            <circle cx="47" cy="16" r="2.5" fill="#fbbf24" opacity="0.95"/>
            <circle cx="47" cy="12" r="1" fill="#fff8dc" opacity="0.8"/>
            <circle cx="47" cy="16" r="1" fill="#fff8dc" opacity="0.8"/>
            
            {/* Wheels */}
            <circle cx="14" cy="24" r="4" fill="#374151" stroke="#111827" strokeWidth="1.5"/>
            <circle cx="42" cy="24" r="4" fill="#374151" stroke="#111827" strokeWidth="1.5"/>
            <circle cx="14" cy="24" r="2" fill="#6b7280"/>
            <circle cx="42" cy="24" r="2" fill="#6b7280"/>
            <circle cx="14" cy="24" r="0.8" fill="#9ca3af"/>
            <circle cx="42" cy="24" r="0.8" fill="#9ca3af"/>
            
            {/* Car Details */}
            <rect x="12" y="9" width="32" height="1.2" fill="#1e40af" opacity="0.6"/>
            <rect x="12" y="15" width="32" height="1.2" fill="#1e40af" opacity="0.6"/>
            
            {/* License plate */}
            <rect x="19" y="19" width="18" height="4" fill="#ffffff" stroke="#e5e7eb" strokeWidth="0.5" rx="0.5"/>
            <text x="28" y="21.8" fill="#374151" fontSize="3" textAnchor="middle" fontFamily="monospace">ABC 123</text>
          </svg>
        </div>

        {/* Scanning beam effect */}
        {scanningActive && (
          <div className="absolute bottom-12 left-1/2 w-1 h-16 bg-gradient-to-t from-blue-500 to-transparent animate-pulse transform -translate-x-1/2 opacity-60"></div>
        )}

        {/* Status Display */}
        <div className="absolute top-3 left-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
          {!isAnimating ? 'Smart Access Control System' : 
           carPosition < 35 ? 'Vehicle Approaching...' :
           scanningActive ? 'Scanning Vehicle...' :
           barrierOpen ? 'Access Granted ✓' : 'Processing...'}
        </div>

        {/* System Status Indicators */}
        <div className="absolute top-3 right-4 flex space-x-2">
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            carPosition > 30 ? 'bg-green-400 shadow-green-400/50 shadow-md' : 'bg-gray-400'
          }`}></div>
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            scanningActive ? 'bg-yellow-400 animate-pulse shadow-yellow-400/50 shadow-md' : 
            barrierOpen ? 'bg-blue-400 shadow-blue-400/50 shadow-md' : 'bg-gray-400'
          }`}></div>
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            carPosition > 60 ? 'bg-purple-400 shadow-purple-400/50 shadow-md' : 'bg-gray-400'
          }`}></div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedBarrierDemo;