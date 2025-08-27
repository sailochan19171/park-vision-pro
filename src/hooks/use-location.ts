import { useState, useEffect } from 'react';
import { getCurrentPosition } from '../services/locationService';

export const useLocation = () => {
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
    error: null,
    loading: true
  });

  useEffect(() => {
    const getLocation = async () => {
      try {
        const position = await getCurrentPosition();
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          error: null,
          loading: false
        });
      } catch (error) {
        setLocation({
          latitude: null,
          longitude: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          loading: false
        });
      }
    };

    getLocation();
  }, []);

  return location;
};
