import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { LatLngExpression } from 'leaflet';

// Define types for the component props
interface MarkerData {
  position: LatLngExpression;
  title: string;
  description?: string;
}

interface LocationMapProps {
  center: LatLngExpression;
  zoom?: number;
  markers?: MarkerData[];
}

// Default center for the map (London coordinates)
const defaultCenter: LatLngExpression = [51.505, -0.09];

// Fix for default marker icons in Leaflet (remove the line that tries to delete _getIconUrl)
const LocationMap = ({ center = defaultCenter, zoom = 13, markers = [] }: LocationMapProps) => {
  useEffect(() => {
    // Custom icon setup is sufficient; no need to delete _getIconUrl anymore
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
  }, []);

  // Optional: Define a custom marker icon
  const customIcon = new L.Icon({
    iconUrl: 'https://example.com/custom-icon.png', // Use your custom icon URL
    iconSize: [32, 32],  // Adjust size based on your image
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  return (
    <MapContainer 
      center={center} 
      zoom={zoom} 
      style={{ height: '400px', width: '100%' }}
      className="rounded-lg shadow-md"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      
      {markers.map((marker, index) => (
        <Marker 
          key={index} 
          position={marker.position} 
          icon={customIcon} // Use custom icon if needed
        >
          <Popup>
            <div>
              <h3 className="font-bold">{marker.title}</h3>
              {marker.description && <p>{marker.description}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default LocationMap;
