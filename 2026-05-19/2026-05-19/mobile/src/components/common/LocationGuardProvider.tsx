import React, { useEffect, useState } from 'react';
import { startLocationMonitoring } from '../../services/locationGuard';
import LocationRequiredModal from './LocationRequiredModal';

interface Props {
  children: React.ReactNode;
}

// Global location gate. Renders children, and overlays a blocking modal
// whenever device location services are off. Combined with the
// startLocationMonitoring periodic + AppState checks, this means turning
// off location anywhere in the app produces the modal within ~10s, and
// turning it back on auto-dismisses without user action.
export default function LocationGuardProvider({ children }: Props) {
  const [locationOff, setLocationOff] = useState(false);

  useEffect(() => {
    const stop = startLocationMonitoring(() => setLocationOff(true));
    return stop;
  }, []);

  return (
    <>
      {children}
      <LocationRequiredModal
        isVisible={locationOff}
        onLocationEnabled={() => setLocationOff(false)}
      />
    </>
  );
}
