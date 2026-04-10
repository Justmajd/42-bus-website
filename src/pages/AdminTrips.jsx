import { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Bus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import markerRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';
import { formatDateLabel, formatTimeLabel } from '../utils/timeFormat';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const CAMPUS_CENTER = [32.504136859235835, 35.8708342993484];

async function parseResponsePayload(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  try {
    return await res.text();
  } catch {
    return null;
  }
}

function formatApiError(path, res, payload) {
  if (payload && typeof payload === 'object' && payload.error) {
    return `${path} failed (${res.status}): ${payload.error}`;
  }
  if (typeof payload === 'string' && payload.trim()) {
    return `${path} failed (${res.status}): ${payload.trim()}`;
  }
  return `${path} failed (${res.status} ${res.statusText}).`;
}

function toDepartureTime(value = '') {
  if (typeof value !== 'string') return '';
  const isoPart = value.includes('T') ? value.split('T')[1] : '';
  if (!isoPart) return '';
  return isoPart.slice(0, 5);
}

function CustomPinPicker({ value, onChange }) {
  function ClickHandler() {
    useMapEvents({
      click(event) {
        const { lat, lng } = event.latlng;
        onChange({ lat, lng });
      },
    });
    return null;
  }

  return (
    <div className="map-container" style={{ height: 260, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <MapContainer center={value ? [value.lat, value.lng] : CAMPUS_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <ClickHandler />
        {value && <Marker position={[value.lat, value.lng]} />}
      </MapContainer>
    </div>
  );
}

const defaultForm = {
  id: null,
  custom_name: '',
  direction: 'to_42',
  date: '',
  departure_time: '',
  custom_lat: CAMPUS_CENTER[0],
  custom_lng: CAMPUS_CENTER[1],
  seats_total: 15
};

export default function AdminTrips() {
  const { token } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resettingTripWindow, setResettingTripWindow] = useState(false);
  const [savingCustomTrip, setSavingCustomTrip] = useState(false);
  const [loadingCustomTrips, setLoadingCustomTrips] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const [customTrips, setCustomTrips] = useState([]);
  const [form, setForm] = useState(defaultForm);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const isEditing = form.id !== null && form.id !== undefined;

  const loadCustomTrips = useCallback(async () => {
    try {
      setLoadingCustomTrips(true);
      const res = await fetch(`${API_BASE}/api/driver/trips`, { headers });
      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/driver/trips', res, payload));
        return;
      }

      const customOnly = (payload || [])
        .filter((trip) => !trip.time_slot_id)
        .sort((a, b) => new Date(a.calculated_departure) - new Date(b.calculated_departure));
      setCustomTrips(customOnly);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCustomTrips(false);
    }
  }, [headers]);

  useEffect(() => {
    loadCustomTrips();
  }, [loadCustomTrips]);

  const resetTripWindow = useCallback(async () => {
    try {
      setResettingTripWindow(true);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/admin/trips/reset-window`, {
        method: 'POST',
        headers,
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/admin/trips/reset-window', res, payload));
        return;
      }

      setSuccess(`Trip window reset complete. Created ${payload?.created || 0}, skipped ${payload?.skippedLocked || 0}, shifted ${payload?.shiftedForward || 0} slot(s) forward.`);
      await loadCustomTrips();
    } catch (err) {
      setError(err.message);
    } finally {
      setResettingTripWindow(false);
    }
  }, [headers, loadCustomTrips]);

  const saveCustomTrip = useCallback(async () => {
    if (!form.custom_name || !form.date || !form.departure_time) {
      setError('Trip name, date, and departure time are required.');
      setSuccess('');
      return;
    }

    try {
      setSavingCustomTrip(true);
      setError('');
      setSuccess('');

      const path = isEditing ? `/api/driver/trips/custom/${form.id}` : '/api/driver/trips/custom';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: JSON.stringify({
          custom_name: form.custom_name,
          direction: form.direction,
          date: form.date,
          departure_time: form.departure_time,
          custom_lat: form.custom_lat,
          custom_lng: form.custom_lng,
          seats_total: Number(form.seats_total)
        }),
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError(path, res, payload));
        return;
      }

      setSuccess(isEditing ? 'Custom trip updated.' : 'Custom trip created successfully.');
      setForm(defaultForm);
      await loadCustomTrips();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCustomTrip(false);
    }
  }, [headers, form, isEditing, loadCustomTrips]);

  const editTrip = useCallback((trip) => {
    setForm({
      id: trip.id,
      custom_name: trip.custom_name || '',
      direction: trip.direction,
      date: trip.date || '',
      departure_time: toDepartureTime(trip.calculated_departure) || toDepartureTime(trip.time_label),
      custom_lat: Number(trip.custom_lat) || CAMPUS_CENTER[0],
      custom_lng: Number(trip.custom_lng) || CAMPUS_CENTER[1],
      seats_total: Number(trip.seats_total) || 15
    });
    setError('');
    setSuccess('Editing custom trip details.');
  }, []);

  const deleteTrip = useCallback(async (tripId) => {
    try {
      setDeletingTripId(tripId);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/driver/trips/custom/${tripId}`, {
        method: 'DELETE',
        headers
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/driver/trips/custom/:id', res, payload));
        return;
      }

      if (Number(form.id) === Number(tripId)) {
        setForm(defaultForm);
      }
      setSuccess('Custom trip deleted.');
      await loadCustomTrips();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingTripId(null);
    }
  }, [headers, form.id, loadCustomTrips]);

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="alert alert-success animate-in"><CheckCircle2 size={16} /> {success}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bus size={28} /> Trips Management
        </h1>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={loadCustomTrips} disabled={loadingCustomTrips}>
            <RefreshCw size={16} /> Refresh Custom Trips
          </button>
          <button
            className="btn btn-ghost"
            onClick={resetTripWindow}
            disabled={resettingTripWindow}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <RotateCcw size={16} />
            {resettingTripWindow ? 'Resetting...' : 'Reset Trips 9AM-12AM'}
          </button>
        </div>
      </div>

      <div className="glass-panel mb-4">
        <h2 className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bus size={18} /> {isEditing ? 'Edit Custom Trip' : 'Create Custom Trip'}
        </h2>
        <div className="form-group">
          <label className="form-label">Trip Name</label>
          <input
            type="text"
            className="form-input"
            value={form.custom_name}
            onChange={(e) => setForm((prev) => ({ ...prev, custom_name: e.target.value }))}
            maxLength={120}
            placeholder="Example: Extra Evening Campus Shuttle"
          />
        </div>

        <div className="grid-3">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Direction</label>
            <select
              className="form-select"
              value={form.direction}
              onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <option value="to_42">Point → 42</option>
              <option value="from_42">42 → Point</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Departure Time</label>
            <input
              type="time"
              className="form-input"
              value={form.departure_time}
              onChange={(e) => setForm((prev) => ({ ...prev, departure_time: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group mt-4" style={{ maxWidth: 260 }}>
          <label className="form-label">Seat Capacity (1-30)</label>
          <input
            type="number"
            min={1}
            max={30}
            className="form-input"
            value={form.seats_total}
            onChange={(e) => setForm((prev) => ({ ...prev, seats_total: e.target.value }))}
          />
        </div>

        <div className="mt-4">
          <label className="form-label">Custom Location Pin (Click On Map)</label>
          <CustomPinPicker
            value={{ lat: Number(form.custom_lat), lng: Number(form.custom_lng) }}
            onChange={({ lat, lng }) => setForm((prev) => ({ ...prev, custom_lat: lat, custom_lng: lng }))}
          />
          <small style={{ color: 'var(--text-secondary)' }}>
            Selected pin: {Number(form.custom_lat).toFixed(6)}, {Number(form.custom_lng).toFixed(6)}
          </small>
        </div>

        <div className="mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isEditing && (
            <button className="btn btn-ghost" onClick={() => setForm(defaultForm)}>
              Cancel Edit
            </button>
          )}
          <button className="btn btn-primary" onClick={saveCustomTrip} disabled={savingCustomTrip}>
            {savingCustomTrip ? 'Saving...' : isEditing ? 'Update Custom Trip' : 'Create Custom Trip'}
          </button>
        </div>
      </div>

      <div className="glass-panel mb-4">
        <h2 className="mb-3">Manage Existing Custom Trips</h2>
        {loadingCustomTrips ? (
          <div className="empty-state"><p>Loading custom trips...</p></div>
        ) : customTrips.length === 0 ? (
          <div className="empty-state"><p>No custom trips found.</p></div>
        ) : (
          <div className="trip-list">
            {customTrips.map((trip) => (
              <div key={trip.id} className="trip-card animate-in">
                <div className="trip-card-header">
                  <div>
                    <div className="trip-direction">
                      {trip.direction === 'to_42' ? 'Point → 42' : '42 → Point'} • Custom
                    </div>
                    {trip.custom_name && (
                      <div style={{ fontSize: '0.9rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                        {trip.custom_name}
                      </div>
                    )}
                    <div className="trip-time">{formatTimeLabel(trip.time_label || trip.calculated_departure)}</div>
                    <div className="trip-date">{formatDateLabel(trip.date)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Seats: {trip.seats_total} • Booked: {trip.seats_booked || 0}
                    </div>
                  </div>
                  <span className={`badge badge-${trip.status}`}>{trip.status}</span>
                </div>

                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => editTrip(trip)}>
                    <Pencil size={14} /> Edit Details
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteTrip(trip.id)}
                    disabled={deletingTripId === trip.id}
                  >
                    <Trash2 size={14} /> {deletingTripId === trip.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
