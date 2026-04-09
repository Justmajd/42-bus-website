import { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight, ArrowLeft, Clock, MapPin, Users, Calendar,
  Trash2, AlertCircle, CheckCircle, Bus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import MapView from '../components/MapView';
import { API_BASE } from '../api';

export default function StudentDashboard() {
  const { token } = useAuth();
  const { seatUpdates, tripUpdates } = useNotifications();
  const [activeTab, setActiveTab] = useState('to_42');
  const [trips, setTrips] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [pickupPoints, setPickupPoints] = useState([]);
  const [selectedPickup, setSelectedPickup] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      const [tripsRes, bookingsRes, pointsRes] = await Promise.all([
        fetch(`${API_BASE}/api/trips?direction=${activeTab}${activeTab === 'to_42' ? `&date=${tomorrowStr}` : `&date=${todayStr}`}`, { headers }),
        fetch(`${API_BASE}/api/bookings`, { headers }),
        fetch(`${API_BASE}/api/trips/config/pickup-points`, { headers })
      ]);

      if (tripsRes.ok) setTrips(await tripsRes.json());
      if (bookingsRes.ok) setMyBookings(await bookingsRes.json());
      if (pointsRes.ok) setPickupPoints(await pointsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // React to real-time updates
  useEffect(() => {
    if (Object.keys(seatUpdates).length > 0 || tripUpdates) {
      fetchData();
    }
  }, [seatUpdates, tripUpdates]);

  const handleBook = async (tripId) => {
    const pickup = selectedPickup[tripId];
    if (!pickup) {
      setError('Please select a pickup point.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setActionLoading(tripId);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ trip_id: tripId, pickup_point_id: parseInt(pickup) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Ride booked successfully! 🎉');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (bookingId) => {
    if (!confirm('Cancel this booking?')) return;
    setActionLoading(bookingId);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Booking cancelled.');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    return <span className={`badge badge-${status}`}>{status}</span>;
  };

  const getSeatColor = (available, total) => {
    const pct = available / total;
    if (pct <= 0) return 'full';
    if (pct <= 0.3) return 'warning';
    return 'available';
  };

  // Check if user already booked a trip
  const isBooked = (tripId) => myBookings.some(b => b.trip_id === tripId && b.status !== 'cancelled');

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  return (
    <div className="page-content container">
      {error && (
        <div className="alert alert-error animate-in">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success animate-in">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      <h1 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Bus size={28} /> Book a Ride
      </h1>

      {/* Direction Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'to_42' ? 'active' : ''}`}
          onClick={() => setActiveTab('to_42')}
        >
          <MapPin size={16} /> Point → 42
        </button>
        <button
          className={`tab ${activeTab === 'from_42' ? 'active' : ''}`}
          onClick={() => setActiveTab('from_42')}
        >
          <ArrowLeft size={16} /> 42 → Point
        </button>
      </div>

      <div className="grid-2">
        {/* Available Trips */}
        <div>
          <div className="glass-panel mb-4">
            <h2>
              {activeTab === 'to_42' ? (
                <><ArrowRight size={20} /> Tomorrow's Trips</>
              ) : (
                <><ArrowLeft size={20} /> Available Trips</>
              )}
            </h2>

            {activeTab === 'to_42' && (
              <div className="alert alert-info mb-3" style={{ fontSize: '0.8rem' }}>
                Registration closes 2 hours before departure
              </div>
            )}

            <div className="trip-list stagger-children">
              {trips.length === 0 ? (
                <div className="empty-state">
                  <Bus size={48} />
                  <p>No trips available right now</p>
                </div>
              ) : (
                trips.map(trip => {
                  const available = trip.seats_available;
                  const seatColor = getSeatColor(available, trip.seats_total);
                  const alreadyBooked = isBooked(trip.id);
                  const fillPct = ((trip.seats_total - available) / trip.seats_total) * 100;

                  return (
                    <div key={trip.id} className="trip-card animate-in">
                      <div className="trip-card-header">
                        <div>
                          <div className="trip-direction">
                            {activeTab === 'to_42' ? 'Point → 42' : '42 → Point'}
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
                        {getStatusBadge(trip.status)}
                      </div>

                      {/* Seat Bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div className="seat-bar-container">
                          <div
                            className={`seat-bar-fill ${seatColor}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <div className="seat-info">
                          <span>
                            <span className={`seat-count ${seatColor}`}>{available}</span> seats left
                          </span>
                          <span>{trip.seats_total - available}/{trip.seats_total} booked</span>
                        </div>
                      </div>

                      {/* Pickup points with ETAs */}
                      {trip.pickup_stats && trip.pickup_stats.length > 0 && (
                        <div className="trip-meta">
                          {trip.pickup_stats.map(ps => (
                            <div key={ps.id} className="trip-meta-item">
                              <MapPin size={12} />
                              {ps.name} ({ps.student_count}) • {ps.eta_minutes}min
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Booking Form */}
                      {!alreadyBooked && available > 0 && trip.status !== 'started' && trip.status !== 'completed' && (
                        <div className="trip-booking-form">
                          <div className="form-group">
                            <label className="form-label">Pickup Point</label>
                            <select
                              className="form-select"
                              value={selectedPickup[trip.id] || ''}
                              onChange={e => setSelectedPickup(prev => ({ ...prev, [trip.id]: e.target.value }))}
                            >
                              <option value="">Select point</option>
                              {pickupPoints.map(p => (
                                <option key={p.id} value={p.id}>{p.name} (ETA: {p.eta_minutes}min)</option>
                              ))}
                            </select>
                          </div>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleBook(trip.id)}
                            disabled={actionLoading === trip.id}
                          >
                            {actionLoading === trip.id ? '...' : 'Book'}
                          </button>
                        </div>
                      )}

                      {alreadyBooked && (
                        <div className="alert alert-success mt-4" style={{ marginBottom: 0, fontSize: '0.8rem' }}>
                          <CheckCircle size={14} /> You have a booking for this trip
                        </div>
                      )}

                      {available <= 0 && !alreadyBooked && (
                        <div className="alert alert-warning mt-4" style={{ marginBottom: 0, fontSize: '0.8rem' }}>
                          <AlertCircle size={14} /> No seats available
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Map */}
          {trips.length > 0 && trips[0].pickup_stats && (
            <div className="glass-panel">
              <h2><MapPin size={20} /> Pickup Points</h2>
              <MapView pickupStats={trips[0].pickup_stats} />
            </div>
          )}
        </div>

        {/* My Bookings */}
        <div>
          <div className="glass-panel">
            <h2><Users size={20} /> My Bookings</h2>
            
            {myBookings.length === 0 ? (
              <div className="empty-state">
                <Calendar size={48} />
                <p>No bookings yet. Book a ride!</p>
              </div>
            ) : (
              <div className="trip-list stagger-children">
                {myBookings.filter(b => b.status !== 'cancelled').map(booking => (
                  <div key={booking.id} className="card animate-in">
                    <div className="card-header">
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 600, marginBottom: 4 }}>
                          {booking.direction === 'to_42' ? 'Point → 42' : '42 → Point'}
                        </div>
                        <div className="card-title flex items-center gap-2">
                          <Clock size={14} /> {booking.time_label}
                        </div>
                      </div>
                      {getStatusBadge(booking.trip_status)}
                    </div>

                    <div className="card-body">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={14} style={{ color: 'var(--text-muted)' }} />
                        {booking.pickup_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                        {booking.trip_date}
                      </div>
                    </div>

                    <div className="card-footer">
                      <div className="flex items-center gap-2" style={{ fontSize: '0.8rem' }}>
                        <span className={`status-dot ${booking.trip_status}`}></span>
                        {booking.status === 'attended' ? 'Attended ✅' : 
                         booking.trip_status === 'confirmed' ? 'Confirmed' : 
                         booking.trip_status === 'started' ? 'In Progress' : 'Pending'}
                      </div>
                      {booking.trip_status !== 'started' && booking.trip_status !== 'completed' && booking.status !== 'attended' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleCancel(booking.id)}
                          disabled={actionLoading === booking.id}
                        >
                          <Trash2 size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
