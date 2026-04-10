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
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const eventSourceRef = useRef(null);
  const pushSubscriptionUserRef = useRef(null);

  function base64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  const syncPushSubscription = useCallback(async () => {
    if (typeof window === 'undefined' || !token || !user) return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (!('Notification' in window) || window.Notification.permission !== 'granted') return false;

    const response = await fetch(`${API_BASE}/api/notifications/push/public-key`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return false;

    const { publicKey } = await response.json();
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.register('/sw.js');
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(publicKey)
    });

    await fetch(`${API_BASE}/api/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    });

    pushSubscriptionUserRef.current = user.id;
    return true;
  }, [token, user]);

  const showBrowserNotification = useCallback((data) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;

    const title = data?.title || 'Bus Notification';
    const options = {
      body: data?.message || 'You have a new update.',
      tag: `bus-${data?.id || data?.type || Date.now()}`,
      renotify: true,
      icon: '/42-logo.png',
      badge: '/42-logo.png'
    };

    try {
      new Notification(title, options);
    } catch {
      // Ignore browser notification failures; in-app notifications still work.
    }
  }, []);

  const requestBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return 'unsupported';
    }

    const permission = await window.Notification.requestPermission();
    setBrowserNotificationPermission(permission);

    if (permission === 'granted') {
      try {
        await syncPushSubscription();
      } catch {
        // Push setup is optional; SSE and in-app notifications still work.
      }
    }

    return permission;
  }, [syncPushSubscription]);

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
      showBrowserNotification(data);
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
  }, [token, user, showBrowserNotification]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setBrowserNotificationPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    if (browserNotificationPermission !== 'granted') return;
    if (pushSubscriptionUserRef.current === user.id) return;

    syncPushSubscription().catch(() => {});
  }, [token, user, browserNotificationPermission, syncPushSubscription]);

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
      notifications,
      unreadCount,
      seatUpdates,
      tripUpdates,
      browserNotificationPermission,
      requestBrowserNotifications,
      markAsRead,
      markAllRead
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
