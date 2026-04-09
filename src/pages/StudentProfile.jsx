import { useState, useEffect, useCallback } from 'react';
import { User, Mail, AlertTriangle, Calendar, Camera, Shield, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import QRScanner from '../components/QRScanner';
import { API_BASE } from '../api';

export default function StudentProfile() {
  const { user, token, refreshUser } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);

  const headers = { 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    fetchBookings();
    refreshUser();
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, { headers });
      if (res.ok) setBookings(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (qrToken) => {
    const res = await fetch(`${API_BASE}/api/bookings/attend`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_token: qrToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    fetchBookings();
    return data;
  };

  if (!user) return null;

  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const totalRides = bookings.filter(b => b.status === 'attended').length;
  const activeBookings = bookings.filter(b => ['booked', 'confirmed'].includes(b.status)).length;
  const isBanned = user.banned_until && new Date(user.banned_until) > new Date();

  return (
    <div className="page-content container" style={{ maxWidth: 600 }}>
      {/* Profile Header */}
      <div className="glass-panel mb-4 animate-in">
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-info">
            <h2>{user.name}</h2>
            <div className="profile-email flex items-center gap-2">
              <Mail size={14} /> {user.email}
            </div>
          </div>
        </div>

        {isBanned && (
          <div className="alert alert-error">
            <Shield size={16} />
            <div>
              <strong>Account Suspended</strong>
              <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                You are banned from booking until {new Date(user.banned_until).toLocaleDateString()}.
                Reason: repeated no-shows.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{totalRides}</div>
            <div className="stat-label">Total Rides</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{activeBookings}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className={`stat-card ${user.warnings >= 3 ? 'danger' : user.warnings > 0 ? 'warning' : ''}`}>
            <div className="stat-value">{user.warnings || 0}/3</div>
            <div className="stat-label">Warnings</div>
          </div>
        </div>
      </div>

      {/* QR Scanner */}
      <div className="glass-panel mb-4 animate-in">
        <h2 className="flex items-center gap-2 mb-3">
          <Camera size={20} /> Attendance
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
          Scan the driver's QR code when your trip starts to confirm your attendance.
        </p>

        {!showScanner ? (
          <button className="btn btn-primary btn-block" onClick={() => setShowScanner(true)}>
            <Camera size={18} /> Open QR Scanner
          </button>
        ) : (
          <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        )}
      </div>

      {/* Booking History */}
      <div className="glass-panel animate-in">
        <h2 className="flex items-center gap-2">
          <Calendar size={20} /> Booking History
        </h2>

        {loading ? (
          <div className="loading-spinner"><div className="spinner"></div></div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">
            <Calendar size={40} />
            <p>No booking history</p>
          </div>
        ) : (
          <div className="student-list">
            {bookings.map(b => (
              <div key={b.id} className="student-row">
                <div className="flex items-center gap-2" style={{ flex: 1 }}>
                  <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                  <span className="student-row-name">{b.time_label}</span>
                </div>
                <span className="student-row-pickup">{b.trip_date}</span>
                <span className={`badge badge-${b.status === 'attended' ? 'success' : b.status === 'no_show' ? 'danger' : b.status === 'cancelled' ? 'completed' : 'pending'}`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
