import { useEffect, useRef } from 'react';
import { API_BASE } from '../api';

const MIN_UPDATE_INTERVAL_MS = 15000;
const MIN_DISTANCE_METERS = 15;

function distanceInMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export default function useTripLocationTracking({ tripId, status, token }) {
  const lastSentAtRef = useRef(0);
  const lastPositionRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!tripId || status !== 'started' || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    let cancelled = false;

    const sendLocation = async (position) => {
      if (cancelled) return;

      const nextPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const now = Date.now();
      const elapsed = now - lastSentAtRef.current;
      const moved = distanceInMeters(lastPositionRef.current, nextPosition);

      if (elapsed < MIN_UPDATE_INTERVAL_MS && moved < MIN_DISTANCE_METERS) {
        return;
      }

      lastSentAtRef.current = now;
      lastPositionRef.current = nextPosition;

      try {
        await fetch(`${API_BASE}/api/driver/trips/${tripId}/location`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextPosition),
        });
      } catch (err) {
        console.error('Failed to update driver location', err);
      }
    };

    const handleError = (err) => {
      if (err?.code === 1) {
        console.warn('Location permission denied for driver tracking.');
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(sendLocation, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tripId, status, token]);
}