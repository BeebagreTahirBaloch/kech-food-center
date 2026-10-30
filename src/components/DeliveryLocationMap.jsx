import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const RESTAURANT_CENTER = [
  Number(import.meta.env.VITE_RESTAURANT_LAT) || 26.0023,
  Number(import.meta.env.VITE_RESTAURANT_LNG) || 63.043,
];

function PinPicker({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function RecenterMap({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 15), { duration: 0.5 });
  }, [location, map]);
  return null;
}

export default function DeliveryLocationMap({ location, onLocationChange }) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location is not available in this browser. You can drop a pin on the map instead.");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onLocationChange({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError("We couldn't get your location. Allow location access or drop a pin on the map.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="delivery-map-section">
      <div className="map-toolbar">
        <p>Tap the map to drop your delivery pin, or move the pin to the exact spot.</p>
        <button type="button" className="location-button" onClick={useCurrentLocation} disabled={locating}>
          <i className="ri-focus-3-line" /> {locating ? "Finding you…" : "Use my location"}
        </button>
      </div>
      <MapContainer center={location ? [location.lat, location.lng] : RESTAURANT_CENTER} zoom={13} scrollWheelZoom className="delivery-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PinPicker onPick={onLocationChange} />
        <RecenterMap location={location} />
        {location && (
          <Marker
            position={[location.lat, location.lng]}
            draggable
            eventHandlers={{ dragend: (event) => {
              const point = event.target.getLatLng();
              onLocationChange({ lat: point.lat, lng: point.lng });
            } }}
          >
            <Popup>Delivery location</Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="map-location-status" aria-live="polite">
        {location ? <span><i className="ri-map-pin-2-fill" /> Pin set: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span> : <span>Select your delivery point on the map.</span>}
      </div>
      {locationError && <p className="checkout-error" role="alert">{locationError}</p>}
    </div>
  );
}
