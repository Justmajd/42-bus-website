import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import markerRetina from 'leaflet/dist/images/marker-icon-2x.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function createNumberedIcon(count, color = '#3b82f6') {
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${color};
      color: white;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: 'Inter', sans-serif;
    ">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function createDriverIcon() {
  return createNumberedIcon('D', '#ef4444');
}

function getGoogleDirectionsUrl(lat, lng) {
  const destination = `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function MapAutoFit({ positions = [] }) {
  const map = useMap();

  useEffect(() => {
    if (!positions.length) return;

    const bounds = L.latLngBounds(positions.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 13,
      animate: true,
      duration: 0.5,
    });
  }, [map, positions]);

  return null;
}

export default function MapView({ pickupStats = [], driverLocation = null, height = 350 }) {
  const center = [32.504136859235835, 35.8708342993484]; // 42 campus area

  const mapPositions = useMemo(() => {
    const normalizedPoints = pickupStats
      .map((point) => [Number(point.lat), Number(point.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    const normalizedDriverLocation = driverLocation && Number.isFinite(Number(driverLocation.lat)) && Number.isFinite(Number(driverLocation.lng))
      ? [Number(driverLocation.lat), Number(driverLocation.lng)]
      : null;

    return [center, ...normalizedPoints, ...(normalizedDriverLocation ? [normalizedDriverLocation] : [])];
  }, [driverLocation, pickupStats]);

  if (pickupStats.length === 0 && !driverLocation) return null;

  return (
    <div className="map-container" style={{ height }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <MapAutoFit positions={mapPositions} />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        {/* 42 Campus marker */}
        <Marker position={center} icon={createNumberedIcon('42', '#8b5cf6')}>
          <Popup>
            <strong>42 Campus</strong>
            <br />
            <a
              href={getGoogleDirectionsUrl(center[0], center[1])}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Directions
            </a>
          </Popup>
        </Marker>

        {pickupStats.map(point => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={createNumberedIcon(
              point.student_count || 0,
              point.student_count > 0 ? '#3b82f6' : '#64748b'
            )}
          >
            <Popup>
              <strong>{point.name}</strong><br />
              Students: {point.student_count || 0}<br />
              ETA: {point.eta_minutes} min from 42
              <br />
              <a
                href={getGoogleDirectionsUrl(point.lat, point.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Directions
              </a>
            </Popup>
          </Marker>
        ))}

        {driverLocation && Number.isFinite(Number(driverLocation.lat)) && Number.isFinite(Number(driverLocation.lng)) && (
          <Marker
            position={[Number(driverLocation.lat), Number(driverLocation.lng)]}
            icon={createDriverIcon()}
          >
            <Popup>
              <strong>Driver is here</strong>
              <br />
              Live location update
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
