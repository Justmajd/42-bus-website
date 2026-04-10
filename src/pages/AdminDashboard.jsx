import { useState, useEffect, useCallback } from 'react';
import { 
  Users, BarChart, MapPin, Clock, Lock, Unlock, Edit3, Key, AlertCircle, CheckCircle, Search
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordId, setResetPasswordId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers }),
        fetch(`${API_BASE}/api/admin/users`, { headers })
      ]);

      if (statsRes.ok && usersRes.ok) {
        setStats(await statsRes.json());
        setStudents(await usersRes.json());
      } else {
        setError('Failed to load admin data.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async (endpoint, payload, successMsg) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${endpoint}`, {
        method: 'PATCH', headers, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSuccess(successMsg);
      setTimeout(() => setSuccess(''), 4000);
      loadData();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const handleBlockToggle = (student) => {
    const isCurrentlyBanned = !!student.banned_until;
    if (confirm(`Are you sure you want to ${isCurrentlyBanned ? 'UNBLOCK' : 'BLOCK'} ${student.name}?`)) {
      handleAction(`${student.id}/block`, { block: !isCurrentlyBanned }, `Student ${isCurrentlyBanned ? 'unblocked' : 'blocked'} successfully.`);
    }
  };

  const submitNameEdit = async () => {
    if (!newName) return;
    if (await handleAction(`${editingUser.id}`, { name: newName }, 'Name updated.')) {
      setEditingUser(null);
      setNewName('');
    }
  };

  const submitPasswordReset = async () => {
    if (newPassword.length < 6) return setError('Password must be at least 6 characters.');
    if (await handleAction(`${resetPasswordId}/password`, { newPassword }, 'Password reset successfully.')) {
      setResetPasswordId(null);
      setNewPassword('');
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="alert alert-success animate-in"><CheckCircle size={16} /> {success}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChart size={28} /> Admin Control Center
        </h1>
      </div>

      {/* Analytics Grid */}
      {stats && (
        <div className="stat-grid mb-4">
          <div className="stat-card" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
            <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{stats.totalRides}</div>
            <div className="stat-label">Total Rides Completed</div>
          </div>
          <div className="stat-card" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>{stats.totalStudents}</div>
            <div className="stat-label">Total Registered Students</div>
          </div>
        </div>
      )}

      {/* Analytics Details */}
      {stats && (
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
      )}

      {/* Students Control List */}
      <div className="glass-panel">
        <div className="flex items-center justify-between mb-4 flex-wrap" style={{ gap: 16 }}>
          <h2 className="flex items-center gap-2"><Users size={20}/> Student Management</h2>
          <div className="form-group" style={{ margin: 0, width: '100%', maxWidth: '300px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search by name or email..." 
              style={{ paddingLeft: 40 }}
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="student-list" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredStudents.map(student => (
            <div key={student.id} className="student-row flex-col sm-flex-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div className="student-row-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {student.name}
                  {student.banned_until && <span className="badge badge-danger">Banned</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{student.email}</div>
              </div>
              
              <div className="flex items-center gap-2" style={{ width: '100%', justifyContent: 'flex-end', flex: '0 0 auto' }}>
                <button title="Edit Name" className="btn btn-ghost btn-sm" onClick={() => { setEditingUser(student); setNewName(student.name); }}>
                  <Edit3 size={16} />
                </button>
                <button title="Reset Password" className="btn btn-ghost btn-sm" onClick={() => setResetPasswordId(student.id)}>
                  <Key size={16} />
                </button>
                <button 
                  title={student.banned_until ? "Unblock Student" : "Block Student"} 
                  className={`btn btn-sm ${student.banned_until ? 'btn-success' : 'btn-danger'}`} 
                  onClick={() => handleBlockToggle(student)}
                >
                  {student.banned_until ? <Unlock size={14}/> : <Lock size={14}/>}
                  <span style={{ marginLeft: 6 }}>{student.banned_until ? 'Unblock' : 'Block'}</span>
                </button>
              </div>
            </div>
          ))}
          {filteredStudents.length === 0 && <div className="text-center" style={{ padding: '20px', color: 'var(--text-muted)' }}>No students found.</div>}
        </div>
      </div>

      {/* Edit Name Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '400px' }}>
            <h3 className="mb-3">Edit Student Name</h3>
            <div className="form-group">
              <input type="text" className="form-input" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={submitNameEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordId && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '400px' }}>
            <h3 className="mb-3" style={{ color: 'var(--accent-red)' }}>Force Reset Password</h3>
            <p className="mb-3" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Enter a new password for this student. They will need to use it to log in.</p>
            <div className="form-group">
              <input type="text" className="form-input" placeholder="New Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setResetPasswordId(null)}>Cancel</button>
              <button className="btn" style={{ background: 'var(--accent-red)', color: 'white' }} onClick={submitPasswordReset}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
