import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE, getSSEUrl } from '../api';

const NotificationContext = createContext(null);

function safeParseSSEData(rawData) {
  if (typeof rawData !== 'string') return null;
  const value = rawData.trim();
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function NotificationProvider({ children }) {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [seatUpdates, setSeatUpdates] = useState({});
  const [tripUpdates, setTripUpdates] = useState(null);
  const eventSourceRef = useRef(null);

  // Connect SSE
  useEffect(() => {
    if (!token || !user) return;

    const es = new EventSource(getSSEUrl(token));
    eventSourceRef.current = es;

    // Custom auth: we'll send token in URL param since SSE doesn't support headers
    // Actually, let's use a different approach - we'll poll for auth'd notifications
    // and use SSE for real-time updates
    
    es.onopen = () => {
      console.log('📡 SSE connected');
    };

    es.addEventListener('notification', (event) => {
      const data = safeParseSSEData(event.data);
      if (!data) return;
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    es.addEventListener('seat_update', (event) => {
      const data = safeParseSSEData(event.data);
      if (!data) return;
      setSeatUpdates(prev => ({ ...prev, [data.trip_id]: data }));
    });

    es.addEventListener('trip_update', (event) => {
      const data = safeParseSSEData(event.data);
      if (!data) return;
      setTripUpdates(data);
    });

    es.addEventListener('attendance_update', (event) => {
      const data = safeParseSSEData(event.data);
      if (!data) return;
      setTripUpdates(prev => ({ ...prev, ...data }));
    });

    es.onerror = () => {
      console.log('📡 SSE error, reconnecting...');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [token, user]);

  // Fetch initial notifications
  useEffect(() => {
    if (!token) return;
    
    fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      })
      .catch(() => {});
  }, [token]);

  const markAsRead = useCallback(async (id) => {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [token]);

  const markAllRead = useCallback(async () => {
    await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  }, [token]);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, seatUpdates, tripUpdates,
      markAsRead, markAllRead
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
