import { Capacitor } from '@capacitor/core';

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    // Keep only protocol + host to avoid accidental values like .../login
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

// API base URL resolution:
// - Web dev: empty string uses Vite '/api' proxy
// - Mobile/native: can use VITE_ANDROID_API_URL / VITE_IOS_API_URL / VITE_API_URL
function resolveApiBase() {
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const configured = normalizeOrigin(import.meta.env.VITE_ANDROID_API_URL || import.meta.env.VITE_API_URL);
    if (configured) return configured;

    // Android emulator uses 10.0.2.2 to reach host machine localhost.
    return 'http://10.0.2.2:3001';
  }

  if (platform === 'ios') {
    const configured = normalizeOrigin(import.meta.env.VITE_IOS_API_URL || import.meta.env.VITE_API_URL);
    if (configured) return configured;

    // iOS simulator can reach host machine via localhost.
    return 'http://localhost:3001';
  }

  const configured = normalizeOrigin(import.meta.env.VITE_API_URL);
  if (configured) return configured;

  if (platform !== 'web') {
    console.warn(
      '[api] Missing VITE_API_URL for native app. Relative /api requests will fail. ' +
      'Set VITE_API_URL to your backend origin (for example: https://api.example.com).'
    );
  }

  return '';
}

const API_BASE = resolveApiBase();

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
