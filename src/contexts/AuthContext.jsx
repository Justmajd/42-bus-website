import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../api';

const AuthContext = createContext(null);

async function parseApiResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    return res.json();
  }

  const raw = await res.text();
  let details = raw.trim();
  if (details.startsWith('<')) {
    details = 'The server returned HTML instead of JSON. Check API URL/proxy configuration.';
  } else if (!details) {
    details = 'Empty response from server.';
  }

  throw new Error(details);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);

  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  }), [token]);

  // Fetch current user on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(async (res) => {
          const data = await parseApiResponse(res);
          if (!res.ok) {
            throw new Error(data?.error || 'Invalid token');
          }
          return data;
        })
        .then(userData => {
          setUser(userData);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('auth_token');
          setToken(null);
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(data?.error || 'Login failed');
    
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await parseApiResponse(res);
    if (!res.ok) throw new Error(data?.error || 'Registration failed');
    
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const userData = await parseApiResponse(res);
        setUser(userData);
      }
    } catch (err) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, getHeaders, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
