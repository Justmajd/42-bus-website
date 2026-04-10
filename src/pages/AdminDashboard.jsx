import { useState, useEffect, useCallback } from 'react';
import { BarChart, MapPin, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';

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

export default function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const statsRes = await fetch(`${API_BASE}/api/admin/stats`, { headers });
      const payload = await parseResponsePayload(statsRes);

      if (!statsRes.ok) {
        setError(formatApiError('/api/admin/stats', statsRes, payload));
        return;
      }

      setStats(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChart size={28} /> Admin Analytics
        </h1>
      </div>

      {stats && (
        <>
          <div className="stat-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="stat-card" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{stats.startedTrips}</div>
              <div className="stat-label">Trips Started</div>
            </div>
            <div className="stat-card" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>{stats.completedTrips}</div>
              <div className="stat-label">Trips Completed</div>
            </div>
            <div className="stat-card" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>{stats.pendingTrips}</div>
              <div className="stat-label">Pending Trips</div>
            </div>
            <div className="stat-card" style={{ background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>{stats.confirmedTrips}</div>
              <div className="stat-label">Confirmed Trips</div>
            </div>
            <div className="stat-card" style={{ background: 'rgba(14, 165, 233, 0.1)', borderColor: 'rgba(14, 165, 233, 0.2)' }}>
              <div className="stat-value" style={{ color: '#38bdf8' }}>{stats.activeBookings}</div>
              <div className="stat-label">Active Bookings</div>
            </div>
            <div className="stat-card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{stats.bannedStudents}</div>
              <div className="stat-label">Banned Students</div>
            </div>
          </div>

          <div className="mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div className="glass-panel">
              <h2 className="flex items-center gap-2 mb-3"><Clock size={18}/> Popular Timings</h2>
              {stats.popularTimeSlots.map((ts, i) => (
                <div key={i} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>{ts.label}</span>
                  <span className="badge badge-primary">{ts.trip_count} trips</span>
                </div>
              ))}
            </div>
            <div className="glass-panel">
              <h2 className="flex items-center gap-2 mb-3"><MapPin size={18}/> Popular Pickups</h2>
              {stats.popularPickups.map((pp, i) => (
                <div key={i} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>{pp.name}</span>
                  <span className="badge badge-completed">{pp.request_count} reqs</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
