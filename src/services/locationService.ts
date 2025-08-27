// Browser's Geolocation API - completely free
export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(new Error(`Geolocation error: ${error.message} (code: ${error.code})`)),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });
};

// Helper function to convert degrees to radians
const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
  return d;
};

interface Location {
  lat: number;
  lon: number;
  [key: string]: string | number | boolean | undefined;   
}

export const findNearestLocations = (
  userLat: number, 
  userLon: number, 
  locations: Location[],  
  limit: number = 5
): Location[] => {
  return locations
    .map(location => ({
      ...location,
      distance: calculateDistance(userLat, userLon, location.lat, location.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
};
