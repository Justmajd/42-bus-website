import { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertCircle, Send, CheckCircle2 } from 'lucide-react';
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

export default function AdminNotifications() {
  const { token } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [sendingCustomNotification, setSendingCustomNotification] = useState(false);
  const [sendingStudentNotification, setSendingStudentNotification] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentTitle, setStudentTitle] = useState('');
  const [studentMessage, setStudentMessage] = useState('');

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!token) return;

    let isMounted = true;

    const run = async () => {
      try {
        setLoadingStudents(true);

        const res = await fetch(`${API_BASE}/api/admin/users`, { headers });
        const payload = await parseResponsePayload(res);
        if (!isMounted) return;

        if (!res.ok) {
          setError(formatApiError('/api/admin/users', res, payload));
          return;
        }

        const studentUsers = (payload || []).filter((u) => u.role === 'student');
        setStudents(studentUsers);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoadingStudents(false);
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [token, headers]);

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

  const sendStudentNotification = useCallback(async () => {
    const title = studentTitle.trim();
    const message = studentMessage.trim();
    const studentId = Number(selectedStudentId);

    if (!Number.isFinite(studentId)) {
      setError('Please select a student.');
      setSuccess('');
      return;
    }

    if (!title || !message) {
      setError('Please provide both a title and a message for the student notification.');
      setSuccess('');
      return;
    }

    try {
      setSendingStudentNotification(true);
      setError('');
      setSuccess('');

      const res = await fetch(`${API_BASE}/api/admin/notifications/student`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ student_id: studentId, title, message })
      });

      const payload = await parseResponsePayload(res);
      if (!res.ok) {
        setError(formatApiError('/api/admin/notifications/student', res, payload));
        return;
      }

      setStudentTitle('');
      setStudentMessage('');
      setSuccess('Notification sent to selected student.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingStudentNotification(false);
    }
  }, [headers, selectedStudentId, studentTitle, studentMessage]);

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="alert alert-success animate-in"><CheckCircle2 size={16} /> {success}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Send size={28} /> Notification Creation
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
          <Send size={18} /> Send To Specific Student
        </h2>
        <div className="form-group">
          <label className="form-label">Student</label>
          <select
            className="form-select"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            disabled={loadingStudents}
          >
            <option value="">{loadingStudents ? 'Loading students...' : 'Select student'}</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} ({student.email})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Title</label>
          <input
            className="form-input"
            type="text"
            value={studentTitle}
            onChange={(e) => setStudentTitle(e.target.value)}
            maxLength={120}
            placeholder="Enter student notification title"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Message</label>
          <textarea
            className="form-input"
            value={studentMessage}
            onChange={(e) => setStudentMessage(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Write the message for the selected student"
            style={{ resize: 'vertical', minHeight: 110 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <small style={{ color: 'var(--text-secondary)' }}>
            {studentTitle.length}/120 title, {studentMessage.length}/500 message
          </small>
          <button
            className="btn btn-primary"
            onClick={sendStudentNotification}
            disabled={sendingStudentNotification || loadingStudents}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Send size={16} />
            {sendingStudentNotification ? 'Sending...' : 'Send To Student'}
          </button>
        </div>
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
    </div>
  );
}
