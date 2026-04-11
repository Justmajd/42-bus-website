import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowRight, ArrowLeft, Clock, MapPin, Users, Calendar,
  Trash2, AlertCircle, CheckCircle, Bus, Camera
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import MapView from '../components/MapView';
import QRScanner from '../components/QRScanner';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_BASE } from '../api';
import { formatTimeLabel, formatDateLabel } from '../utils/timeFormat.js';

export default function StudentDashboard() {
  const { token, user } = useAuth();
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
  const [showScanner, setShowScanner] = useState(false);
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState(null);
  const [visibleRegularTripsCount, setVisibleRegularTripsCount] = useState(4);

  const headers = useMemo(() => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const getDirectionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;

  const handleScan = async (qrToken) => {
    const res = await fetch(`${API_BASE}/api/bookings/attend`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ qr_token: qrToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setSuccess('Attendance confirmed successfully! ✅');
    setTimeout(() => setSuccess(''), 4000);
    fetchData();
    return data;
  };

  const fetchData = useCallback(async () => {
    try {
      const [tripsRes, bookingsRes, pointsRes] = await Promise.all([
        fetch(`${API_BASE}/api/trips?direction=${activeTab}`, { headers }),
        fetch(`${API_BASE}/api/bookings`, { headers }),
        fetch(`${API_BASE}/api/trips/config/pickup-points`, { headers })
      ]);

      if (tripsRes.ok) {
        const fetchedTrips = await tripsRes.json();
        const active = fetchedTrips.filter(t => ['pending', 'confirmed', 'started'].includes(t.status));
        const passed = fetchedTrips.filter(t => !['pending', 'confirmed', 'started'].includes(t.status));
        
        active.sort((a, b) => new Date(a.calculated_departure) - new Date(b.calculated_departure));
        passed.sort((a, b) => new Date(b.calculated_departure) - new Date(a.calculated_departure));
        
        setTrips([...active, ...passed]);
      }
      if (bookingsRes.ok) setMyBookings(await bookingsRes.json());
      if (pointsRes.ok) setPickupPoints(await pointsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, headers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setVisibleRegularTripsCount(4);
  }, [activeTab]);

  // React to real-time updates
  useEffect(() => {
    if (Object.keys(seatUpdates).length > 0 || tripUpdates) {
      fetchData();
    }
  }, [seatUpdates, tripUpdates]);

  const handleBook = async (tripId) => {
    if (!user?.profile_picture) {
      setError('You must upload a face picture in your Profile before booking.');
      setTimeout(() => setError(''), 4000);
      return;
    }

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
      if (!res.ok) {
        if (data.error === 'IMAGE_REQUIRED') {
          throw new Error('You must upload a face picture in your Profile before booking.');
        }
        throw new Error(data.error);
      }
      setSuccess(data.status === 'waitlisted'
        ? 'You were added to the waitlist. We will notify you if a seat opens.'
        : 'Ride booked successfully! 🎉');
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

  // One active booking per day check
  const activeBookingDates = myBookings
    .filter(b => ['booked', 'confirmed'].includes(b.status))
    .map(b => b.trip_date);

  // Check if user is currently on an active trip and needs to scan attendance
  const needsAttendance = myBookings.some(b => 
    b.trip_status === 'started' && 
    ['booked', 'confirmed'].includes(b.status)
  );

  const customTrips = trips.filter((trip) => !trip.time_slot_id);
  const regularTrips = trips.filter((trip) => !!trip.time_slot_id);
  const isActiveTrip = (trip) => ['pending', 'confirmed', 'started'].includes(trip.status);

  const regularActiveTrips = regularTrips.filter(isActiveTrip);
  const regularCompletedTrips = regularTrips.filter((trip) => !isActiveTrip(trip));
  const customActiveTrips = customTrips.filter(isActiveTrip);
  const customCompletedTrips = customTrips.filter((trip) => !isActiveTrip(trip));
  const completedTrips = [...regularCompletedTrips, ...customCompletedTrips];
  const visibleRegularTrips = regularActiveTrips.slice(0, visibleRegularTripsCount);

  const mapTripCandidates = [
    ...regularActiveTrips,
    ...customActiveTrips,
    ...regularCompletedTrips,
    ...customCompletedTrips
  ];

  const bookedTripIds = new Set(
    myBookings
      .filter((booking) => ['booked', 'confirmed', 'attended'].includes(booking.status))
      .map((booking) => Number(booking.trip_id))
  );

  const bookedMapTrips = mapTripCandidates.filter((trip) => bookedTripIds.has(Number(trip.id)));

  const mapTrip =
    bookedMapTrips.find((trip) => trip.status === 'started') ||
    bookedMapTrips[0] ||
    mapTripCandidates.find((trip) => trip.status === 'started') ||
    mapTripCandidates[0] ||
    null;

  const mapDriverLocation = mapTrip && bookedTripIds.has(Number(mapTrip.id)) && mapTrip.status === 'started' && Number.isFinite(Number(mapTrip.driver_lat)) && Number.isFinite(Number(mapTrip.driver_lng))
    ? { lat: Number(mapTrip.driver_lat), lng: Number(mapTrip.driver_lng) }
    : null;

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  return (
    <div className="page-content container">
      <ConfirmDialog
        open={confirmCancelBookingId !== null}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking?"
        confirmText="Yes, Cancel"
        danger
        onCancel={() => setConfirmCancelBookingId(null)}
        onConfirm={async () => {
          const bookingId = confirmCancelBookingId;
          setConfirmCancelBookingId(null);
          if (bookingId != null) await handleCancel(bookingId);
        }}
      />

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

      {/* Conditional QR Scanner for active trips */}
      {needsAttendance && (
        <div className="glass-panel mb-4 animate-in" style={{ border: '2px solid var(--accent-blue)', boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)' }}>
          <h2 className="flex items-center gap-2 mb-3" style={{ color: 'var(--accent-blue)' }}>
            <Camera size={20} /> Action Required: Scan Attendance
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Your trip has started! Please scan the driver's QR code to formally confirm your attendance.
          </p>

          {!showScanner ? (
            <button className="btn btn-primary btn-block" onClick={() => setShowScanner(true)}>
              <Camera size={18} /> Open QR Scanner
            </button>
          ) : (
            <QRScanner onScan={async (token) => {
              try {
                await handleScan(token);
                setShowScanner(false);
              } catch (err) {
                setError(err.message);
              }
            }} onClose={() => setShowScanner(false)} />
          )}
        </div>
      )}

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
          <MapPin size={16} /> 42 → Point
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
              {regularActiveTrips.length === 0 && customActiveTrips.length === 0 && completedTrips.length === 0 ? (
                <div className="empty-state">
                  <Bus size={48} />
                  <p>No trips available right now</p>
                </div>
              ) : (
                visibleRegularTrips.map(trip => {
                  const available = trip.seats_available;
                  const seatColor = getSeatColor(available, trip.seats_total);
                  const alreadyBooked = isBooked(trip.id);
                  const hasActiveBookingToday = activeBookingDates.includes(trip.date);
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
                            {formatTimeLabel(trip.time_label)}
                          </div>
                          <div className="trip-date">
                            <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                            {formatDateLabel(trip.date)}
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
                      {!alreadyBooked && trip.status !== 'started' && trip.status !== 'completed' && (
                        <div className="trip-booking-form">
                          {hasActiveBookingToday ? (
                            <div className="alert alert-warning" style={{ fontSize: '0.8rem', width: '100%', marginBottom: 0 }}>
                              <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                              One active booking allowed per day.
                            </div>
                          ) : (
                            <>
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
                                {actionLoading === trip.id ? '...' : available > 0 ? 'Book' : 'Join Waitlist'}
                              </button>
                              {available <= 0 && (
                                <div className="alert alert-info" style={{ fontSize: '0.8rem', width: '100%', marginTop: 8, marginBottom: 0 }}>
                                  This trip is full. Joining the waitlist will notify you if a seat opens.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {alreadyBooked && (
                        <div className="alert alert-success mt-4" style={{ marginBottom: 0, fontSize: '0.8rem' }}>
                          <CheckCircle size={14} /> You have a booking for this trip
                        </div>
                      )}

                    </div>
                  );
                })
              )}

              {regularActiveTrips.length > visibleRegularTripsCount && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setVisibleRegularTripsCount((prev) => prev + 4)}
                >
                  View More (4)
                </button>
              )}

              {customActiveTrips.length > 0 && (
                <>
                  <h3 className="mt-4" style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Custom Trips
                  </h3>
                  {customActiveTrips.map((trip) => {
                    const available = trip.seats_available;
                    const seatColor = getSeatColor(available, trip.seats_total);
                    const alreadyBooked = isBooked(trip.id);
                    const hasActiveBookingToday = activeBookingDates.includes(trip.date);
                    const fillPct = ((trip.seats_total - available) / trip.seats_total) * 100;

                    return (
                      <div key={`custom-${trip.id}`} className="trip-card animate-in">
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
                          </div>
                          {getStatusBadge(trip.status)}
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <div className="seat-bar-container">
                            <div className={`seat-bar-fill ${seatColor}`} style={{ width: `${fillPct}%` }} />
                          </div>
                          <div className="seat-info">
                            <span><span className={`seat-count ${seatColor}`}>{available}</span> seats left</span>
                            <span>{trip.seats_total - available}/{trip.seats_total} booked</span>
                          </div>
                        </div>

                        {Number.isFinite(Number(trip.custom_lat)) && Number.isFinite(Number(trip.custom_lng)) && (
                          <div className="trip-meta" style={{ marginBottom: 12 }}>
                            <a
                              href={getDirectionsUrl(trip.custom_lat, trip.custom_lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="trip-meta-item"
                              style={{ textDecoration: 'none' }}
                            >
                              <MapPin size={12} /> Open Custom Pin Location
                            </a>
                          </div>
                        )}

                        {!alreadyBooked && trip.status !== 'started' && trip.status !== 'completed' && (
                          <div className="trip-booking-form">
                            {hasActiveBookingToday ? (
                              <div className="alert alert-warning" style={{ fontSize: '0.8rem', width: '100%', marginBottom: 0 }}>
                                <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                One active booking allowed per day.
                              </div>
                            ) : (
                              <>
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
                                  {actionLoading === trip.id ? '...' : available > 0 ? 'Book' : 'Join Waitlist'}
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {alreadyBooked && (
                          <div className="alert alert-success mt-4" style={{ marginBottom: 0, fontSize: '0.8rem' }}>
                            <CheckCircle size={14} /> You have a booking for this trip
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {completedTrips.length > 0 && (
                <>
                  <h3 className="mt-4" style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Completed Trips
                  </h3>
                  {completedTrips.map((trip) => {
                    const available = trip.seats_available;
                    const seatColor = getSeatColor(available, trip.seats_total);
                    const alreadyBooked = isBooked(trip.id);
                    const fillPct = ((trip.seats_total - available) / trip.seats_total) * 100;

                    return (
                      <div key={`completed-${trip.id}`} className="trip-card animate-in">
                        <div className="trip-card-header">
                          <div>
                            <div className="trip-direction">
                              {trip.direction === 'to_42' ? 'Point → 42' : '42 → Point'}{!trip.time_slot_id ? ' • Custom' : ''}
                            </div>
                            {!trip.time_slot_id && trip.custom_name && (
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
                          </div>
                          {getStatusBadge(trip.status)}
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <div className="seat-bar-container">
                            <div className={`seat-bar-fill ${seatColor}`} style={{ width: `${fillPct}%` }} />
                          </div>
                          <div className="seat-info">
                            <span>
                              <span className={`seat-count ${seatColor}`}>{available}</span> seats left
                            </span>
                            <span>{trip.seats_total - available}/{trip.seats_total} booked</span>
                          </div>
                        </div>

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

                        {!trip.time_slot_id && Number.isFinite(Number(trip.custom_lat)) && Number.isFinite(Number(trip.custom_lng)) && (
                          <div className="trip-meta" style={{ marginTop: 8 }}>
                            <a
                              href={getDirectionsUrl(trip.custom_lat, trip.custom_lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="trip-meta-item"
                              style={{ textDecoration: 'none' }}
                            >
                              <MapPin size={12} /> Open Custom Pin Location
                            </a>
                          </div>
                        )}

                        {alreadyBooked && (
                          <div className="alert alert-success mt-4" style={{ marginBottom: 0, fontSize: '0.8rem' }}>
                            <CheckCircle size={14} /> You have a booking for this trip
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

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
                          <Clock size={14} /> {formatTimeLabel(booking.time_label)}
                        </div>
                      </div>
                        {getStatusBadge(booking.status === 'waitlisted' ? 'waitlisted' : booking.trip_status)}
                    </div>

                    <div className="card-body">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={14} style={{ color: 'var(--text-muted)' }} />
                        {booking.pickup_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                        {formatDateLabel(booking.trip_date)}
                      </div>
                    </div>

                    <div className="card-footer">
                      <div className="flex items-center gap-2" style={{ fontSize: '0.8rem' }}>
                        <span className={`status-dot ${booking.status === 'waitlisted' ? 'waitlisted' : booking.trip_status}`}></span>
                        {booking.status === 'waitlisted' ? 'Waitlisted' :
                         booking.status === 'attended' ? 'Attended ✅' : 
                         booking.trip_status === 'confirmed' ? 'Confirmed' : 
                         booking.trip_status === 'started' ? 'In Progress' : 'Pending'}
                      </div>
                      {booking.trip_status !== 'started' && booking.trip_status !== 'completed' && booking.status !== 'attended' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmCancelBookingId(booking.id)}
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

      {/* Map */}
      {mapTrip && (
        <div className="glass-panel mt-4">
          <h2><MapPin size={20} /> {mapDriverLocation ? 'Live Trip Tracking' : 'Pickup Points'}</h2>
          {mapTrip.status === 'started' && mapDriverLocation && (
            <div className="mb-3" style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem', fontWeight: 600 }}>
              Live driver location is being shared now.
            </div>
          )}
          <MapView pickupStats={mapTrip.pickup_stats || []} driverLocation={mapDriverLocation} />
        </div>
      )}
    </div>
  );
}
