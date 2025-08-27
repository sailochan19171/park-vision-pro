// // src/components/NearbyParkingLocations.tsx
// import { useState, useEffect } from 'react';
// import { useLocation } from '../hooks/use-location';
// import LocationMap from './LocationMap';
// import { findNearestLocations } from '../services/locationService';
// import { coordinatesToAddress } from '../services/geocodingService';
// import { Button } from './ui/button';
// import { MapPin, Navigation } from 'lucide-react';
// import { LatLngExpression } from 'leaflet';

// // Example parking locations data (in a real app, this would come from a database)
// const PARKING_LOCATIONS = [
//   { id: 1, name: 'City Center Parking', lat: 17.385044, lon: 78.486671, spaces: 45, rate: '₹40/hr' },
//   { id: 2, name: 'Mall Parking Complex', lat: 17.375044, lon: 78.476671, spaces: 120, rate: '₹30/hr' },
//   { id: 3, name: 'Airport Parking', lat: 17.395044, lon: 78.496671, spaces: 200, rate: '₹50/hr' },
//   { id: 4, name: 'Stadium Parking', lat: 17.365044, lon: 78.466671, spaces: 150, rate: '₹35/hr' },
//   { id: 5, name: 'Hospital Parking', lat: 17.355044, lon: 78.456671, spaces: 80, rate: '₹25/hr' },
// ];

// const NearbyParkingLocations = () => {
//   const { latitude, longitude, error, loading } = useLocation();
//   const [nearbyLocations, setNearbyLocations] = useState<any[]>([]);
//   const [userAddress, setUserAddress] = useState('');

//   useEffect(() => {
//     if (latitude && longitude) {
//       // Find nearby parking locations
//       const nearest = findNearestLocations(latitude, longitude, PARKING_LOCATIONS, 3);
//       setNearbyLocations(nearest);

//       // Get user's address from coordinates
//       const getAddress = async () => {
//         try {
//           const addressInfo = await coordinatesToAddress(latitude, longitude);
//           setUserAddress(addressInfo.address);
//         } catch (err) {
//           console.error('Error getting address:', err);
//         }
//       };

//       getAddress();
//     }
//   }, [latitude, longitude]);

//   if (loading) return <div className="p-4">Loading your location...</div>;
//   if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
//   if (!latitude || !longitude) return <div className="p-4">Unable to determine your location</div>;

//   const mapMarkers = nearbyLocations.map((loc) => ({
//     position: [loc.lat, loc.lon] as LatLngExpression,  // Cast to LatLngExpression
//     title: loc.name,
//     description: `Available spaces: ${loc.spaces} • ${loc.distance.toFixed(2)} km away • ${loc.rate}`,
//   }));

//   return (
//     <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm">
//       <div>
//         <h2 className="text-2xl font-bold text-tech-gray">Nearby Parking Locations</h2>
//         {userAddress && (
//           <div className="flex items-center text-gray-500 mt-1">
//             <MapPin className="h-4 w-4 mr-1" />
//             <p className="text-sm">Your location: {userAddress}</p>
//           </div>
//         )}
//       </div>

//       <LocationMap 
//         center={[latitude, longitude] as LatLngExpression}  // Cast to LatLngExpression
//         markers={[
//           { position: [latitude, longitude] as LatLngExpression, title: 'Your Location' },
//           ...mapMarkers
//         ]}
//       />

//       <div className="space-y-4 mt-4">
//         {nearbyLocations.map((loc) => (
//           <div key={loc.id} className="p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
//             <div className="flex justify-between items-start">
//               <div>
//                 <h3 className="font-bold text-lg text-tech-gray">{loc.name}</h3>
//                 <p className="text-gray-600">Distance: {loc.distance.toFixed(2)} km</p>
//                 <div className="flex items-center mt-1">
//                   <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
//                     {loc.spaces} spaces available
//                   </span>
//                   <span className="ml-2 text-sm text-gray-600">{loc.rate}</span>
//                 </div>
//               </div>
//               <div className="flex space-x-2">
//                 <Button 
//                   size="sm" 
//                   variant="outline" 
//                   onClick={() => window.open(`https://www.openstreetmap.org/directions?from=${latitude},${longitude}&to=${loc.lat},${loc.lon}`, '_blank')}
//                 >
//                   <Navigation className="h-4 w-4 mr-1" />
//                   Navigate
//                 </Button>
//                 <Button size="sm" className="bg-gradient-to-r from-tech-blue to-blue-400 hover:opacity-90">
//                   Book Now
//                 </Button>
//               </div>
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };

// export default NearbyParkingLocations;
