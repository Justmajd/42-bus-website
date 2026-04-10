import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Clock, Calendar, Users, MapPin, QrCode,
  CheckCircle, Play, Flag, User, AlertTriangle, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import MapView from '../components/MapView';
import { API_BASE } from '../api';
import { formatTimeLabel } from '../utils/timeFormat.js';

export default function DriverTripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { tripUpdates } = useNotifications();
  const [trip, setTrip] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchTrip = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/driver/trips/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTrip(data);
        // Fetch QR if started
        if (data.status === 'started') {
          fetchQR();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQR = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/qr/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setQrData(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchTrip(); }, [id]);
  useEffect(() => { if (tripUpdates) fetchTrip(); }, [tripUpdates]);

  const updateStatus = async (status) => {
    const confirmMsg = status === 'completed'
      ? 'Complete this trip? Students who did not attend will receive a no-show warning.'
      : `Set trip status to "${status}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_BASE}/api/driver/trips/${id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchTrip();
        if (status === 'started') fetchQR();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner"></div></div>;
  }

  if (!trip) {
    return (
      <div className="page-content container">
        <p>Trip not found.</p>
      </div>
    );
  }

  const attendedCount = trip.bookings?.filter(b => b.status === 'attended').length || 0;

  return (
    <div className="page-content container">
      <button className="back-button" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Trip Header */}
      <div className="glass-panel mb-4 animate-in">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {trip.direction === 'to_42' ? (
                  <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                    <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> PICKUP TO 42
                  </span>
              ) : (
                  <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '4px 10px', backgroundColor: 'var(--accent-amber)', color: '#000' }}>
                    <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> DROP OFF FROM 42
                  </span>
              )}
            </div>
            <h1 className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <Clock size={24} /> {formatTimeLabel(trip.time_label)}
            </h1>
            <div className="flex items-center gap-2 text-muted">
              <Calendar size={14} /> {trip.date}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge badge-${trip.status}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
              <span className={`status-dot ${trip.status}`}></span>
              {trip.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="admin-stats" style={{ marginTop: 20, marginBottom: 0 }}>
          <div className="admin-stat-card">
            <div className="admin-stat-value" style={{ color: 'var(--accent-blue)' }}>{trip.seats_booked || 0}</div>
            <div className="admin-stat-label">Booked</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value" style={{ color: 'var(--accent-emerald)' }}>{attendedCount}</div>
            <div className="admin-stat-label">Attended</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{trip.seats_available}</div>
            <div className="admin-stat-label">Available</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{trip.seats_total}</div>
            <div className="admin-stat-label">Capacity</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          {trip.status === 'pending' && (
            <button className="btn btn-primary" onClick={() => updateStatus('confirmed')}>
              <CheckCircle size={16} /> Confirm Trip
            </button>
          )}
          {trip.status === 'confirmed' && (
            <button className="btn btn-success" onClick={() => updateStatus('started')}>
              <Play size={16} /> Start Trip
            </button>
          )}
          {trip.status === 'started' && (
            <button className="btn btn-warning" onClick={() => updateStatus('completed')}>
              <Flag size={16} /> Complete Trip
            </button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div>
          {/* QR Code */}
          {trip.status === 'started' && (
            <div className="glass-panel mb-4 animate-in">
              <h2 className="flex items-center gap-2">
                <QrCode size={20} /> Attendance QR Code
              </h2>
              {qrData ? (
                <div className="qr-container">
                  <img src={qrData.qr_data_url} alt="Trip QR Code" className="qr-image" />
                  <p className="qr-label">
                    Students scan this code to confirm attendance
                  </p>
                </div>
              ) : (
                <div className="loading-spinner"><div className="spinner"></div></div>
              )}
            </div>
          )}

          {/* Pickup Points */}
          <div className="glass-panel mb-4 animate-in">
            <h2 className="flex items-center gap-2">
              <MapPin size={20} /> Pickup Points
            </h2>
            <div className="pickup-grid">
              {trip.pickup_stats?.map(point => (
                <div key={point.id} className="pickup-card">
                  <div className="pickup-name">{point.name}</div>
                  <div className="pickup-count">{point.student_count}</div>
                  <div className="pickup-label">Students</div>
                  <div className="pickup-eta">
                    <Clock size={12} /> {point.eta_minutes} min
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Map */}
          {trip.pickup_stats && (
            <div className="glass-panel animate-in">
              <h2 className="flex items-center gap-2">
                <MapPin size={20} /> Map
              </h2>
              <MapView pickupStats={trip.pickup_stats} height={400} />
            </div>
          )}
        </div>

        {/* Student List */}
        <div>
          <div className="glass-panel animate-in">
            <h2 className="flex items-center gap-2">
              <Users size={20} /> Students ({trip.bookings?.length || 0})
            </h2>

            {!trip.bookings || trip.bookings.length === 0 ? (
              <div className="empty-state">
                <Users size={40} />
                <p>No students booked</p>
              </div>
            ) : (
              <div className="student-list">
                {trip.bookings.map(booking => (
                  <div key={booking.id} className="student-row">
                    <div className="flex items-center gap-2" style={{ flex: 1 }}>
                      <div 
                        onClick={() => { if (booking.student_picture) setViewingPhoto(booking.student_picture); }}
                        style={{
                        width: 34, height: 34, borderRadius: '50%',
                        overflow: 'hidden', cursor: booking.student_picture ? 'pointer' : 'default',
                        background: booking.status === 'attended'
                          ? 'linear-gradient(135deg, var(--accent-emerald), #059669)'
                          : 'var(--bg-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 700, color: booking.status === 'attended' ? 'white' : 'var(--text-muted)', flexShrink: 0,
                        border: booking.status === 'attended' ? '2px solid var(--accent-emerald)' : '1px solid var(--border-color)'
                      }}>
                        {booking.student_picture ? (
                          <img src={booking.student_picture} alt="Face" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: booking.status === 'attended' ? 0.7 : 1 }} />
                        ) : (
                          booking.status === 'attended' ? <CheckCircle size={14} color="white" /> : <User size={14} />
                        )}
                      </div>
                      <div>
                        <div className="student-row-name">{booking.student_name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{booking.student_email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="student-row-pickup">{booking.pickup_name}</span>
                      <span className={`badge badge-${booking.status === 'attended' ? 'success' : booking.status === 'no_show' ? 'danger' : 'pending'}`}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      {viewingPhoto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }} onClick={() => setViewingPhoto(null)}>
          <div style={{ position: 'relative', maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingPhoto(null)} style={{
              position: 'absolute', top: '-40px', right: 0,
              background: 'none', border: 'none', color: 'white', cursor: 'pointer',
              padding: '8px'
            }}>
              <X size={32} />
            </button>
            <img src={viewingPhoto} alt="Student Face" style={{ width: '100%', borderRadius: '12px', objectFit: 'contain', maxHeight: '70vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}
