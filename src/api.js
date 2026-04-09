// API base URL - uses Vite proxy in dev, env variable in production
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  
  const token = localStorage.getItem('auth_token');
  const headers = {
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}

export function getSSEUrl(token) {
  return `${API_BASE}/api/notifications/stream?token=${token}`;
}

export { API_BASE };
