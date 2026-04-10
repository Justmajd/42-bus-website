import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit3,
  ImagePlus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Key,
  Lock,
  Unlock
} from 'lucide-react';
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

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export default function AdminUserManagement() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingUser, setEditingUser] = useState(null);
  const [editingPictureUser, setEditingPictureUser] = useState(null);
  const [resetPasswordId, setResetPasswordId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'student' });
  const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'student', password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [pictureDraft, setPictureDraft] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const usersRes = await fetch(`${API_BASE}/api/admin/users`, { headers });
      const usersPayload = await parseResponsePayload(usersRes);
      if (!usersRes.ok) {
        setError(formatApiError('/api/admin/users', usersRes, usersPayload));
        return;
      }
      setUsers(usersPayload || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAction = async (path, method, payload, successMsg) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
      });
      const data = await parseResponsePayload(res);
      if (!res.ok) throw new Error(formatApiError(path, res, data));

      setSuccess(successMsg);
      setTimeout(() => setSuccess(''), 4000);
      await loadUsers();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const handleBlockToggle = (selectedUser) => {
    const isCurrentlyBanned = !!selectedUser.banned_until;
    if (confirm(`Are you sure you want to ${isCurrentlyBanned ? 'UNBLOCK' : 'BLOCK'} ${selectedUser.name}?`)) {
      handleAction(
        `/api/admin/users/${selectedUser.id}/block`,
        'PATCH',
        { block: !isCurrentlyBanned },
        `User ${isCurrentlyBanned ? 'unblocked' : 'blocked'} successfully.`
      );
    }
  };

  const handleDelete = (selectedUser) => {
    if (confirm(`Delete ${selectedUser.name} (${selectedUser.email})? This will remove their bookings and notifications.`)) {
      handleAction(`/api/admin/users/${selectedUser.id}`, 'DELETE', null, 'User deleted successfully.');
    }
  };

  const submitUserEdit = async () => {
    if (!editingUser) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }

    const ok = await handleAction(
      `/api/admin/users/${editingUser.id}`,
      'PATCH',
      {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role
      },
      'User details updated.'
    );

    if (ok) {
      setEditingUser(null);
    }
  };

  const submitCreateUser = async () => {
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password) {
      setError('Name, email, and password are required.');
      return;
    }

    const ok = await handleAction(
      '/api/admin/users',
      'POST',
      {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        role: createForm.role,
        password: createForm.password
      },
      'User created successfully.'
    );

    if (ok) {
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', role: 'student', password: '' });
    }
  };

  const submitPasswordReset = async () => {
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const ok = await handleAction(
      `/api/admin/users/${resetPasswordId}/password`,
      'PATCH',
      { newPassword },
      'Password reset successfully.'
    );

    if (ok) {
      setResetPasswordId(null);
      setNewPassword('');
    }
  };

  const onPictureFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 500 * 1024) {
      setError('Image must be 500KB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPictureDraft(String(reader.result || ''));
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const submitPictureUpdate = async () => {
    if (!editingPictureUser) return;
    if (!pictureDraft) {
      setError('Please choose an image first.');
      return;
    }

    const ok = await handleAction(
      `/api/admin/users/${editingPictureUser.id}`,
      'PATCH',
      { profile_picture: pictureDraft },
      'Profile picture updated.'
    );

    if (ok) {
      setEditingPictureUser(null);
      setPictureDraft('');
    }
  };

  const filteredUsers = users.filter(item => {
    const matchesRole = roleFilter === 'all' || item.role === roleFilter;
    const q = search.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) || item.email.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  return (
    <div className="page-content container">
      {error && <div className="alert alert-error animate-in"><AlertCircle size={16} /> {error}</div>}
      {success && <div className="alert alert-success animate-in"><CheckCircle size={16} /> {success}</div>}

      <div className="admin-header mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={28} /> Student Management
        </h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="glass-panel">
        <div className="flex items-center justify-between mb-4 flex-wrap" style={{ gap: 16 }}>
          <h2 className="flex items-center gap-2"><Users size={20}/> Users</h2>
          <div className="form-group" style={{ margin: 0, width: '100%', maxWidth: '300px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or email..."
              style={{ paddingLeft: 40 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          {['all', 'admin', 'driver', 'student'].map(role => (
            <button
              key={role}
              type="button"
              className={`btn btn-sm ${roleFilter === role ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setRoleFilter(role)}
              style={{ textTransform: 'capitalize' }}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="student-list" style={{ maxHeight: '640px', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredUsers.map(item => (
            <div key={item.id} className="student-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.profile_picture ? (
                  <img src={item.profile_picture} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{getInitials(item.name)}</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: '220px' }}>
                <div className="student-row-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{item.name}</span>
                  <span className="badge badge-primary">{item.role}</span>
                  {item.banned_until && <span className="badge badge-danger">Banned</span>}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.email}</div>
              </div>

              <div className="flex items-center gap-2" style={{ width: '100%', justifyContent: 'flex-end', flex: '0 0 auto' }}>
                <button
                  title="Edit User"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingUser(item);
                    setEditForm({ name: item.name, email: item.email, role: item.role });
                  }}
                >
                  <Edit3 size={16} />
                </button>

                <button
                  title="Change Photo"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingPictureUser(item);
                    setPictureDraft(item.profile_picture || '');
                  }}
                >
                  <ImagePlus size={16} />
                </button>

                <button title="Reset Password" className="btn btn-ghost btn-sm" onClick={() => setResetPasswordId(item.id)}>
                  <Key size={16} />
                </button>

                <button
                  title={item.banned_until ? 'Unblock User' : 'Block User'}
                  className={`btn btn-sm ${item.banned_until ? 'btn-success' : 'btn-danger'}`}
                  onClick={() => handleBlockToggle(item)}
                >
                  {item.banned_until ? <Unlock size={14}/> : <Lock size={14}/>}<span style={{ marginLeft: 6 }}>{item.banned_until ? 'Unblock' : 'Block'}</span>
                </button>

                <button title="Delete User" className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                  <Trash2 size={14}/> <span style={{ marginLeft: 6 }}>Delete</span>
                </button>
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="text-center" style={{ padding: '20px', color: 'var(--text-muted)' }}>No users found.</div>
          )}
        </div>
      </div>

      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '460px' }}>
            <h3 className="mb-3">Edit User</h3>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={editForm.role} onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}>
                <option value="student">student</option>
                <option value="driver">driver</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={submitUserEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '460px' }}>
            <h3 className="mb-3">Add User</h3>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={createForm.email} onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={createForm.role} onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))}>
                <option value="student">student</option>
                <option value="driver">driver</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={createForm.password} onChange={e => setCreateForm(prev => ({ ...prev, password: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={submitCreateUser}>Create</button>
            </div>
          </div>
        </div>
      )}

      {editingPictureUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '460px' }}>
            <h3 className="mb-3">Update Profile Picture</h3>
            <div className="mb-3" style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pictureDraft ? (
                  <img src={pictureDraft} alt={editingPictureUser.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-secondary)' }}>{getInitials(editingPictureUser.name)}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Select Image (max 500KB)</label>
              <input type="file" accept="image/*" className="form-input" onChange={onPictureFileSelected} />
            </div>

            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => { setEditingPictureUser(null); setPictureDraft(''); }}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={submitPictureUpdate}>Save Photo</button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordId && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-in" style={{ width: '90%', maxWidth: '400px' }}>
            <h3 className="mb-3" style={{ color: 'var(--accent-red)' }}>Force Reset Password</h3>
            <div className="form-group">
              <input className="form-input" type="password" placeholder="New Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
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
