import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus, Users, Clock, Calendar, ArrowRight, ArrowLeft,
  CheckCircle, Play, Flag, Eye
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { API_BASE } from '../api';

export default function DriverDashboard() {
  const { token } = useAuth();
  const { tripUpdates } = useNotifications();
  const [trips, setTrips] = useState([]);
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchTrips = useCallback(async () => {
    try {
      let url = `${API_BASE}/api/driver/trips?`;
      if (filter !== 'all') url += `status=${filter}&`;
      if (dateFilter) url += `date=${dateFilter}&`;
      
      const res = await fetch(url, { headers });
      if (res.ok) {
        const fetchedTrips = await res.json();
        
        let active = [];
        let passed = [];

        if (filter === 'completed') {
          // Only show completed trips that actually had students booked
          passed = fetchedTrips.filter(t => t.status === 'completed' && (t.seats_booked || 0) > 0);
        } else {
          // If 'all' or any active status, hide completed trips from cluttering the view
          active = fetchedTrips.filter(t => t.status !== 'completed');
        }
        
        active.sort((a, b) => new Date(a.calculated_departure) - new Date(b.calculated_departure));
        passed.sort((a, b) => new Date(b.calculated_departure) - new Date(a.calculated_departure));
        
        setTrips([...active, ...passed]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, filter, dateFilter]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);
  useEffect(() => { if (tripUpdates) fetchTrips(); }, [tripUpdates]);

  const updateStatus = async (tripId, status) => {
    const confirmMsg = status === 'completed' 
      ? 'Complete this trip? Students who did not attend will receive a no-show warning.'
      : `Set trip status to "${status}"?`;
    if (!confirm(confirmMsg)) return;

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

  // Stats
  const pendingCount = trips.filter(t => t.status === 'pending').length;
  const confirmedCount = trips.filter(t => t.status === 'confirmed').length;
  const startedCount = trips.filter(t => t.status === 'started').length;
  const totalStudents = trips.reduce((sum, t) => sum + (t.seats_booked || 0), 0);

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  return (
    <div className="page-content container">
      <h1 className="mb-4 flex items-center gap-3">
        <Bus size={28} /> Driver Dashboard
      </h1>

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
                    {trip.time_label}
                  </div>
                  <div className="trip-date">
                    <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {trip.date}
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
                  <button className="btn btn-primary btn-sm" onClick={() => updateStatus(trip.id, 'confirmed')}>
                    <CheckCircle size={14} /> Confirm
                  </button>
                )}
                {trip.status === 'confirmed' && (
                  <button className="btn btn-success btn-sm" onClick={() => updateStatus(trip.id, 'started')}>
                    <Play size={14} /> Start Trip
                  </button>
                )}
                {trip.status === 'started' && (
                  <button className="btn btn-warning btn-sm" onClick={() => updateStatus(trip.id, 'completed')}>
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
