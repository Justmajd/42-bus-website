import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAuth } from './AuthContext';
import { API_BASE, getSSEUrl } from '../api';

const NotificationContext = createContext(null);
const isNativePlatform = Capacitor.getPlatform() !== 'web';
const nativePushEnabled = String(import.meta.env.VITE_ENABLE_NATIVE_PUSH || '').toLowerCase() === 'true';

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
    if (isNativePlatform) return 'prompt';
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(true);
  const [hiddenNotificationIds, setHiddenNotificationIds] = useState([]);
  const eventSourceRef = useRef(null);
  const pushSubscriptionUserRef = useRef(null);
  const hiddenNotificationIdsRef = useRef([]);

  const upsertNotification = useCallback((incoming) => {
    if (!incoming) return;

    setNotifications((prev) => {
      const exists = prev.some((n) => String(n.id) === String(incoming.id));
      if (exists) return prev;
      setUnreadCount((count) => count + 1);
      return [incoming, ...prev];
    });
  }, []);

  const preferenceKey = user ? `browser_notifications_enabled_${user.id}` : 'browser_notifications_enabled';
  const hiddenKey = user ? `hidden_notifications_${user.id}` : 'hidden_notifications';

  const persistHiddenIds = useCallback((ids) => {
    setHiddenNotificationIds(ids);
    try {
      window.localStorage.setItem(hiddenKey, JSON.stringify(ids));
    } catch {
      // Ignore storage failures.
    }
  }, [hiddenKey]);

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
    if (isNativePlatform) return false;
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

  const registerNativePush = useCallback(async () => {
    if (!isNativePlatform || !token || !user) return false;
    if (!nativePushEnabled) return false;

    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== 'granted') {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive !== 'granted') {
        setBrowserNotificationPermission('denied');
        return false;
      }

      setBrowserNotificationPermission('granted');
      await PushNotifications.register();
      return true;
    } catch {
      return false;
    }
  }, [token, user]);

  const showBrowserNotification = useCallback(async (data) => {
    if (!browserNotificationsEnabled) return;

    if (isNativePlatform) {
      try {
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') return;

        const title = data?.title || 'Bus Notification';
        const body = data?.message || 'You have a new update.';
        const numericId = Number(data?.id);
        const id = Number.isFinite(numericId) && numericId > 0
          ? Math.floor(numericId % 2147483647)
          : Math.floor(Date.now() % 2147483647);

        await LocalNotifications.schedule({
          notifications: [{
            id,
            title,
            body,
            schedule: { at: new Date(Date.now() + 200) }
          }]
        });
      } catch {
        // Ignore native notification failures; in-app notifications still work.
      }
      return;
    }

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
  }, [browserNotificationsEnabled]);

  const disableBrowserNotifications = useCallback(async () => {
    if (typeof window === 'undefined') return false;

    setBrowserNotificationsEnabled(false);
    try {
      window.localStorage.setItem(preferenceKey, 'false');
    } catch {
      // Ignore storage failures.
    }

    if (isNativePlatform) {
      if (token) {
        try {
          await fetch(`${API_BASE}/api/notifications/mobile/register`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          });
        } catch {
          // Ignore native token remove failures.
        }
      }

      pushSubscriptionUserRef.current = null;
      return true;
    }

    if (!token || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushSubscriptionUserRef.current = null;
      return true;
    }

    try {
      // Remove all server-side subscriptions for this user.
      await fetch(`${API_BASE}/api/notifications/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      // Unsubscribe from all local service worker registrations.
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
    } catch {
      // Ignore unsubscribe failures; local preference still prevents popups.
    }

    pushSubscriptionUserRef.current = null;
    return true;
  }, [preferenceKey, token]);

  const requestBrowserNotifications = useCallback(async () => {
    if (isNativePlatform) {
      try {
        const permission = await LocalNotifications.requestPermissions();
        const normalized = permission.display || 'denied';
        const granted = normalized === 'granted';

        setBrowserNotificationPermission(normalized);
        setBrowserNotificationsEnabled(granted);

        try {
          window.localStorage.setItem(preferenceKey, granted ? 'true' : 'false');
        } catch {
          // Ignore storage failures.
        }

        if (granted) {
          await registerNativePush();
        }

        return normalized;
      } catch {
        setBrowserNotificationPermission('unsupported');
        return 'unsupported';
      }
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return 'unsupported';
    }

    const permission = await window.Notification.requestPermission();
    setBrowserNotificationPermission(permission);

    if (permission === 'granted') {
      setBrowserNotificationsEnabled(true);
      try {
        window.localStorage.setItem(preferenceKey, 'true');
      } catch {
        // Ignore storage failures.
      }
      try {
        await syncPushSubscription();
      } catch {
        // Push setup is optional; SSE and in-app notifications still work.
      }
    }

    return permission;
  }, [preferenceKey, syncPushSubscription, registerNativePush]);

  const enableBrowserNotifications = useCallback(async () => {
    if (isNativePlatform) {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        return requestBrowserNotifications();
      }

      setBrowserNotificationPermission('granted');
      setBrowserNotificationsEnabled(true);
      try {
        window.localStorage.setItem(preferenceKey, 'true');
      } catch {
        // Ignore storage failures.
      }

      await registerNativePush();
      return 'granted';
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return 'unsupported';
    }

    if (window.Notification.permission !== 'granted') {
      return requestBrowserNotifications();
    }

    setBrowserNotificationsEnabled(true);
    try {
      window.localStorage.setItem(preferenceKey, 'true');
    } catch {
      // Ignore storage failures.
    }

    try {
      await syncPushSubscription();
    } catch {
      // Ignore push setup failure; permission may still allow foreground notifications.
    }

    return 'granted';
  }, [preferenceKey, requestBrowserNotifications, syncPushSubscription, registerNativePush]);

  // Connect SSE
  useEffect(() => {
    if (!token || !user) return;

    const es = new EventSource(getSSEUrl(token));
    eventSourceRef.current = es;

    // Custom auth: we'll send token in URL param since SSE doesn't support headers
    // Actually, let's use a different approach - we'll poll for auth'd notifications
    // and use SSE for real-time updates
    
    es.onopen = () => {
      console.log('SSE connected');
    };

    es.addEventListener('notification', (event) => {
      const data = safeParseSSEData(event.data);
      if (!data) return;
      if (hiddenNotificationIdsRef.current.includes(data.id)) return;
      upsertNotification(data);
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
      setTripUpdates(data);
    });

    es.onerror = () => {
      console.log('SSE error, reconnecting...');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [token, user, showBrowserNotification, upsertNotification]);

  useEffect(() => {
    if (isNativePlatform) {
      LocalNotifications.checkPermissions()
        .then((result) => {
          setBrowserNotificationPermission(result.display || 'prompt');
        })
        .catch(() => {
          setBrowserNotificationPermission('unsupported');
        });
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setBrowserNotificationPermission(window.Notification.permission);
  }, []);

  // Register native push token + listeners (Android/iOS) for closed/background notifications.
  useEffect(() => {
    if (!isNativePlatform || !token || !user) return;
    if (!nativePushEnabled) return;

    let active = true;
    let registrationHandle;
    let registrationErrorHandle;
    let receivedHandle;

    const setup = async () => {
      registrationHandle = await PushNotifications.addListener('registration', async (tokenValue) => {
        if (!active) return;

        try {
          await fetch(`${API_BASE}/api/notifications/mobile/register`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              token: tokenValue.value,
              platform: Capacitor.getPlatform()
            })
          });
          pushSubscriptionUserRef.current = user.id;
        } catch {
          // Ignore token register failures; app still works with SSE.
        }
      });

      registrationErrorHandle = await PushNotifications.addListener('registrationError', (error) => {
        console.error('[PUSH REGISTRATION ERROR]', error);
      });

      receivedHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification?.data || {};
        const idRaw = data.id || Date.now();
        const incoming = {
          id: Number(idRaw) || Number(Date.now()),
          user_id: user.id,
          type: data.type || 'push',
          title: data.title || notification.title || 'Bus Notification',
          message: data.message || notification.body || 'You have a new update.',
          is_read: 0,
          created_at: new Date().toISOString()
        };

        upsertNotification(incoming);
        showBrowserNotification(incoming);
      });

      await registerNativePush();
    };

    setup();

    return () => {
      active = false;
      registrationHandle?.remove?.();
      registrationErrorHandle?.remove?.();
      receivedHandle?.remove?.();
    };
  }, [token, user, registerNativePush, showBrowserNotification, upsertNotification]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let enabled = browserNotificationPermission === 'granted';
    try {
      const stored = window.localStorage.getItem(preferenceKey);
      if (stored === 'true') enabled = true;
      if (stored === 'false') enabled = false;
    } catch {
      // Ignore storage access errors.
    }

    setBrowserNotificationsEnabled(enabled);
  }, [preferenceKey, browserNotificationPermission]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem(hiddenKey);
      if (!stored) {
        setHiddenNotificationIds([]);
        return;
      }

      const parsed = JSON.parse(stored);
      setHiddenNotificationIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHiddenNotificationIds([]);
    }
  }, [hiddenKey]);

  useEffect(() => {
    hiddenNotificationIdsRef.current = hiddenNotificationIds;
  }, [hiddenNotificationIds]);

  useEffect(() => {
    if (isNativePlatform) return;
    if (!token || !user) return;
    if (browserNotificationPermission !== 'granted') return;
    if (!browserNotificationsEnabled) return;
    if (pushSubscriptionUserRef.current === user.id) return;

    syncPushSubscription().catch(() => {});
  }, [token, user, browserNotificationPermission, browserNotificationsEnabled, syncPushSubscription]);

  // Fetch initial notifications
  useEffect(() => {
    if (!token) return;
    
    fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const filtered = data.filter(n => !hiddenNotificationIdsRef.current.includes(n.id));
        setNotifications(filtered);
        setUnreadCount(filtered.filter(n => !n.is_read).length);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const filtered = notifications.filter(n => !hiddenNotificationIds.includes(n.id));
    if (filtered.length !== notifications.length) {
      setNotifications(filtered);
      setUnreadCount(filtered.filter(n => !n.is_read).length);
    }
  }, [hiddenNotificationIds, notifications]);

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

  const clearReadNotifications = useCallback(async () => {
    await fetch(`${API_BASE}/api/notifications/read`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (readIds.length) {
      const merged = Array.from(new Set([...hiddenNotificationIds, ...readIds]));
      persistHiddenIds(merged);
    }

    setNotifications(prev => prev.filter(n => !n.is_read));
  }, [token, notifications, hiddenNotificationIds, persistHiddenIds]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      seatUpdates,
      tripUpdates,
      browserNotificationPermission,
      browserNotificationsEnabled,
      requestBrowserNotifications,
      enableBrowserNotifications,
      disableBrowserNotifications,
      markAsRead,
      markAllRead,
      clearReadNotifications
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
