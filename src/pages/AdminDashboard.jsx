import { useState, useEffect, useCallback } from 'react';
import { BarChart, MapPin, Clock, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';
import { formatTimeLabel } from '../utils/timeFormat.js';

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
  const [success, setSuccess] = useState('');
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [sendingCustomNotification, setSendingCustomNotification] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

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

  const sendTestNotification = useCallback(async () => {
    try {
      setSendingTestNotification(true);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/admin/notifications/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Admin Test Notification',
          message: 'This is a test notification from the admin panel.'
        })
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/admin/notifications/test', res, payload));
        return;
      }

      setSuccess('Test notification sent to all users.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingTestNotification(false);
    }
  }, [headers]);

  const sendCustomNotification = useCallback(async () => {
    const title = customTitle.trim();
    const message = customMessage.trim();

    if (!title || !message) {
      setError('Please provide both a title and a message.');
      setSuccess('');
      return;
    }

    try {
      setSendingCustomNotification(true);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/admin/notifications/custom`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, message })
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/admin/notifications/custom', res, payload));
        return;
      }

      setCustomTitle('');
      setCustomMessage('');
      setSuccess('Custom notification sent to all users.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingCustomNotification(false);
    }
  }, [headers, customTitle, customMessage]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="alert alert-success animate-in"><CheckCircle2 size={16} /> {success}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChart size={28} /> Admin Analytics
        </h1>
        <button
          className="btn btn-primary"
          onClick={sendTestNotification}
          disabled={sendingTestNotification}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Send size={16} />
          {sendingTestNotification ? 'Sending...' : 'Send Test Notification'}
        </button>
      </div>

      <div className="glass-panel mb-4">
        <h2 className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Send size={18} /> Send Custom Notification
        </h2>
        <div className="form-group">
          <label className="form-label">Title</label>
          <input
            className="form-input"
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            maxLength={120}
            placeholder="Enter notification title"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Message</label>
          <textarea
            className="form-input"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Write the message that will be sent to all users"
            style={{ resize: 'vertical', minHeight: 110 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <small style={{ color: 'var(--text-secondary)' }}>
            {customTitle.length}/120 title, {customMessage.length}/500 message
          </small>
          <button
            className="btn btn-primary"
            onClick={sendCustomNotification}
            disabled={sendingCustomNotification}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Send size={16} />
            {sendingCustomNotification ? 'Sending...' : 'Send Custom Notification'}
          </button>
        </div>
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
                  <span>{formatTimeLabel(ts.label)}</span>
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
