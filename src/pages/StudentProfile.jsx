import { useState, useEffect, useCallback } from 'react';
import { User, Mail, AlertTriangle, Calendar, Shield, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';

export default function StudentProfile() {
  const { user, token, refreshUser } = useAuth();
  const [bookings, setBookings] = useState([]);
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
          <div className="profile-avatar" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={() => document.getElementById('pictureUpload').click()}>
            {user.profile_picture ? (
              <img src={user.profile_picture} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initials
            )}
            <input 
              type="file" 
              id="pictureUpload" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 500 * 1024) {
                  alert("Image is too large! Maximum allowed size is 500KB.");
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = async () => {
                  setLoading(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/auth/me/picture`, {
                      method: 'POST',
                      headers: { ...headers, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ profile_picture: reader.result })
                    });
                    if (!res.ok) alert((await res.json()).error);
                    else refreshUser();
                  } catch (err) {
                    alert('Failed to upload picture.');
                  } finally {
                    setLoading(false);
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
          </div>
          <div className="profile-info">
            <h2>{user.name}</h2>
            <div className="profile-email flex items-center gap-2">
              <Mail size={14} /> {user.email}
            </div>
            {!user.profile_picture && (
              <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', marginTop: '6px', fontWeight: 600 }}>
                ⚠️ Face picture required for booking
              </div>
            )}
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
