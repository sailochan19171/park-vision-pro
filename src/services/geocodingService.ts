// src/services/geocodingService.ts

// Convert address to coordinates (forward geocoding)
export const addressToCoordinates = async (address: string) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'VayAccess Parking App (info@vayaccess.com)'
        }
      }
    );
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
    
    throw new Error('No results found');
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
};

// Convert coordinates to address (reverse geocoding)
export const coordinatesToAddress = async (lat: number, lon: number) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'VayAccess Parking App (info@vayaccess.com)'
        }
      }
    );
    
    const data = await response.json();
    
    if (data && data.display_name) {
      return {
        address: data.display_name,
        city: data.address.city || data.address.town || data.address.village,
        state: data.address.state,
        country: data.address.country
      };
    }
    
    throw new Error('No results found');
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    throw error;
  }
};
