import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus, Users, Clock, Calendar, ArrowRight, ArrowLeft,
  CheckCircle, Play, Flag, Eye
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_BASE } from '../api';
import { formatTimeLabel, formatDateLabel } from '../utils/timeFormat.js';
import useTripLocationTracking from '../hooks/useTripLocationTracking';

export default function DriverDashboard() {
  const { token, user } = useAuth();
  const { tripUpdates } = useNotifications();
  const [trips, setTrips] = useState([]);
  const [customTrips, setCustomTrips] = useState([]);
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [createForm, setCreateForm] = useState({
    custom_name: '',
    direction: 'to_42',
    date: '',
    departure_time: '',
    custom_lat: 32.504136859235835,
    custom_lng: 35.8708342993484,
    seats_total: 15
  });
  const [creatingCustomTrip, setCreatingCustomTrip] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const isAdmin = user?.role === 'admin';

  const fetchTrips = useCallback(async () => {
    try {
      let url = `${API_BASE}/api/driver/trips?`;
      if (filter !== 'all') url += `status=${filter}&`;
      if (dateFilter) url += `date=${dateFilter}&`;
      
      const res = await fetch(url, { headers });
      if (res.ok) {
        const fetchedTrips = await res.json();
        const customOnly = fetchedTrips.filter((t) => !t.time_slot_id);
        const regularOnly = fetchedTrips.filter((t) => !!t.time_slot_id);
        
        let active = [];
        let passed = [];

        if (filter === 'completed') {
          // Only show completed trips that actually had students booked
          passed = regularOnly.filter(t => t.status === 'completed' && (t.seats_booked || 0) > 0);
        } else {
          // If 'all' or any active status, hide completed trips from cluttering the view
          active = regularOnly.filter(t => t.status !== 'completed');
        }
        
        active.sort((a, b) => new Date(a.calculated_departure) - new Date(b.calculated_departure));
        passed.sort((a, b) => new Date(b.calculated_departure) - new Date(a.calculated_departure));
        
        setTrips([...active, ...passed]);
        setCustomTrips(customOnly.sort((a, b) => new Date(a.calculated_departure) - new Date(b.calculated_departure)));
      }
    } catch (err) {
      setError(err.message || 'Failed to load trips.');
    } finally {
      setLoading(false);
    }
  }, [token, filter, dateFilter]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);
  useEffect(() => { if (tripUpdates) fetchTrips(); }, [tripUpdates]);

  const updateStatus = async (tripId, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/driver/trips/${tripId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      });
      if (res.ok) fetchTrips();
    } catch (err) {
      console.error(err);
    }
  };

  const createCustomTrip = async () => {
    if (!createForm.custom_name || !createForm.date || !createForm.departure_time) {
      setError('Please add trip name, date, and departure time for the custom trip.');
      return;
    }

    try {
      setCreatingCustomTrip(true);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/driver/trips/custom`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createForm),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to create custom trip.');
      }

      setSuccess('Custom trip created successfully.');
      setCreateForm((prev) => ({ ...prev, custom_name: '', departure_time: '' }));
      await fetchTrips();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingCustomTrip(false);
    }
  };

  // Stats
  const pendingCount = trips.filter(t => t.status === 'pending').length;
  const confirmedCount = trips.filter(t => t.status === 'confirmed').length;
  const startedCount = trips.filter(t => t.status === 'started').length;
  const totalStudents = trips.reduce((sum, t) => sum + (t.seats_booked || 0), 0);
  const startedTrip = trips.find((trip) => trip.status === 'started');

  useTripLocationTracking({
    tripId: startedTrip?.id,
    status: startedTrip?.status,
    token,
  });

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in">{error}</div>}
      {success && <div className="alert alert-success animate-in">{success}</div>}

      <ConfirmDialog
        open={!!pendingStatusChange}
        title="Change Trip Status"
        message={pendingStatusChange?.status === 'completed'
          ? 'Complete this trip? Students who did not attend will receive a no-show warning.'
          : `Set trip status to "${pendingStatusChange?.status}"?`}
        confirmText="Yes, Continue"
        danger={pendingStatusChange?.status === 'completed'}
        onCancel={() => setPendingStatusChange(null)}
        onConfirm={async () => {
          const pending = pendingStatusChange;
          setPendingStatusChange(null);
          if (pending) await updateStatus(pending.tripId, pending.status);
        }}
      />

      <h1 className="mb-4 flex items-center gap-3">
        <Bus size={28} /> Driver Dashboard
      </h1>

      {startedTrip && (
        <div className="alert alert-success animate-in mb-4" style={{ fontSize: '0.9rem' }}>
          Live driver location sharing is active for the started trip.
        </div>
      )}

      {isAdmin && (
        <div className="glass-panel mb-4">
          <h2 className="mb-3">Create Custom Trip (Staff)</h2>
          <div className="grid-3">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Trip Name</label>
              <input
                type="text"
                className="form-input"
                value={createForm.custom_name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, custom_name: e.target.value }))}
                placeholder="Custom shuttle name"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Direction</label>
              <select
                className="form-select"
                value={createForm.direction}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, direction: e.target.value }))}
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
                value={createForm.date}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Departure Time</label>
              <input
                type="time"
                className="form-input"
                value={createForm.departure_time}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, departure_time: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4">
            <button className="btn btn-primary" onClick={createCustomTrip} disabled={creatingCustomTrip}>
              {creatingCustomTrip ? 'Creating...' : 'Create Custom Trip'}
            </button>
          </div>
        </div>
      )}

      {isAdmin && customTrips.length > 0 && (
        <div className="glass-panel mb-4">
          <h2 className="mb-3">Custom Trips (Top Priority)</h2>
          <div className="trip-list">
            {customTrips.map((trip) => (
              <div key={trip.id} className="trip-card animate-in">
                <div className="trip-card-header">
                  <div>
                    <div className="trip-direction">
                      {trip.direction === 'to_42' ? 'Point → 42' : '42 → Point'} • Custom
                    </div>
                    {trip.custom_name && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                        {trip.custom_name}
                      </div>
                    )}
                    <div className="trip-time">
                      <Clock size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                      {formatTimeLabel(trip.time_label || trip.calculated_departure)}
                    </div>
                    <div className="trip-date">
                      <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {formatDateLabel(trip.date)}
                    </div>
                    {Number.isFinite(Number(trip.custom_lat)) && Number.isFinite(Number(trip.custom_lng)) && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${trip.custom_lat},${trip.custom_lng}`)}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: 'var(--accent-blue)', marginTop: 6, textDecoration: 'none' }}
                      >
                        <Clock size={12} /> Open Pin Location
                      </a>
                    )}
                  </div>
                  <span className={`badge badge-${trip.status}`}>{trip.status}</span>
                </div>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <Link to={`/driver/trips/${trip.id}`} className="btn btn-ghost btn-sm">
                    <Eye size={14} /> Details
                  </Link>
                  {trip.status === 'pending' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'confirmed' })}>
                      <CheckCircle size={14} /> Confirm
                    </button>
                  )}
                  {trip.status === 'confirmed' && (
                    <button className="btn btn-success btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'started' })}>
                      <Play size={14} /> Start Trip
                    </button>
                  )}
                  {trip.status === 'started' && (
                    <button className="btn btn-warning btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'completed' })}>
                      <Flag size={14} /> Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: 'var(--accent-amber)' }}>{pendingCount}</div>
          <div className="admin-stat-label">Pending</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: 'var(--accent-blue)' }}>{confirmedCount}</div>
          <div className="admin-stat-label">Confirmed</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: 'var(--accent-emerald)' }}>{startedCount}</div>
          <div className="admin-stat-label">Started</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: 'var(--accent-purple)' }}>{totalStudents}</div>
          <div className="admin-stat-label">Total Students</div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel mb-4">
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="tabs" style={{ marginBottom: 0, flex: 1, minWidth: 200, overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {['all', 'pending', 'confirmed', 'started', 'completed'].map(s => (
              <button
                key={s}
                className={`tab ${filter === s ? 'active' : ''}`}
                onClick={() => setFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: 180 }}
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Trip List */}
      <div className="trip-list stagger-children">
        {trips.length === 0 ? (
          <div className="glass-panel">
            <div className="empty-state">
              <Bus size={48} />
              <p>No trips match your filters</p>
            </div>
          </div>
        ) : (
          trips.map(trip => (
            <div key={trip.id} className="trip-card animate-in">
              <div className="trip-card-header">
                <div>
                  <div className="trip-direction" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {trip.direction === 'to_42' ? (
                        <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                          <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> PICKUP TO 42
                        </span>
                    ) : (
                        <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '4px 10px', backgroundColor: 'var(--accent-amber)', color: '#000' }}>
                          <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> DROP OFF FROM 42
                        </span>
                    )}
                  </div>
                  <div className="trip-time">
                    <Clock size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    {formatTimeLabel(trip.time_label)}
                  </div>
                  <div className="trip-date">
                    <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {formatDateLabel(trip.date)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge badge-${trip.status}`}>
                    <span className={`status-dot ${trip.status}`}></span>
                    {trip.status}
                  </span>
                </div>
              </div>

              {/* Seat info */}
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-2" style={{ fontSize: '0.9rem' }}>
                  <Users size={16} style={{ color: 'var(--accent-blue)' }} />
                  <strong>{trip.seats_booked || 0}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>/ {trip.seats_total} students</span>
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {trip.attended_count > 0 && (
                    <span className="badge badge-success">
                      <CheckCircle size={10} /> {trip.attended_count} attended
                    </span>
                  )}
                </div>
              </div>

              {/* Seat bar */}
              <div className="seat-bar-container" style={{ marginBottom: 16 }}>
                <div
                  className={`seat-bar-fill ${(trip.seats_booked / trip.seats_total) > 0.8 ? 'warning' : ''}`}
                  style={{ width: `${((trip.seats_booked || 0) / trip.seats_total) * 100}%` }}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <Link to={`/driver/trips/${trip.id}`} className="btn btn-ghost btn-sm">
                  <Eye size={14} /> Details
                </Link>
                
                {trip.status === 'pending' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'confirmed' })}>
                    <CheckCircle size={14} /> Confirm
                  </button>
                )}
                {trip.status === 'confirmed' && (
                  <button className="btn btn-success btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'started' })}>
                    <Play size={14} /> Start Trip
                  </button>
                )}
                {trip.status === 'started' && (
                  <button className="btn btn-warning btn-sm" onClick={() => setPendingStatusChange({ tripId: trip.id, status: 'completed' })}>
                    <Flag size={14} /> Complete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
