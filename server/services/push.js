import webpush from 'web-push';
import admin from 'firebase-admin';
import db from '../db.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let configured = false;
let firebaseInitialized = false;

function getFirebaseCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, '\n')
  };
}

function configureFirebaseAdmin() {
  if (firebaseInitialized) return true;

  const credentials = getFirebaseCredentials();
  if (!credentials) return false;

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials)
      });
    }

    firebaseInitialized = true;
    return true;
  } catch (error) {
    console.error('[FCM INIT ERROR]', error?.message || error);
    return false;
  }
}

function configureWebPush() {
  if (configured) return Boolean(vapidPublicKey && vapidPrivateKey);
  configured = true;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return false;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  return true;
}

function isEnabled() {
  return configureWebPush();
}

function isFirebaseEnabled() {
  return configureFirebaseAdmin();
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

export async function savePushSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription');
  }

  await db.execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth`,
    [userId, endpoint, p256dh, auth]
  );

  return { endpoint };
}

export async function removePushSubscription(userId, endpoint) {
  if (!endpoint) {
    await db.execute('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
    return;
  }

  await db.execute(
    `DELETE FROM push_subscriptions
     WHERE endpoint = ? AND user_id = ?`,
    [endpoint, userId]
  );
}

export async function saveMobilePushToken(userId, token, platform = 'unknown') {
  const cleanedToken = String(token || '').trim();
  if (!cleanedToken) {
    throw new Error('Invalid mobile push token');
  }

  await db.execute(
    `INSERT INTO mobile_push_tokens (user_id, token, platform)
     VALUES (?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       platform = excluded.platform,
       updated_at = datetime('now')`,
    [userId, cleanedToken, String(platform || 'unknown')]
  );

  return { token: cleanedToken };
}

export async function removeMobilePushToken(userId, token) {
  const cleanedToken = String(token || '').trim();

  if (!cleanedToken) {
    await db.execute('DELETE FROM mobile_push_tokens WHERE user_id = ?', [userId]);
    return;
  }

  await db.execute(
    'DELETE FROM mobile_push_tokens WHERE token = ? AND user_id = ?',
    [cleanedToken, userId]
  );
}

function buildPayload(notification) {
  return JSON.stringify({
    title: notification.title,
    message: notification.message,
    type: notification.type,
    id: notification.id,
    url: notification.url || '/'
  });
}

async function sendToSubscription(subscription, notification) {
  if (!isEnabled()) return false;

  try {
    await webpush.sendNotification(subscription, buildPayload(notification));
    return true;
  } catch (error) {
    if (error?.statusCode === 410 || error?.statusCode === 404) {
      await db.execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [subscription.endpoint]);
    }
    return false;
  }
}

async function sendToMobileTokens(tokens, notification) {
  if (!isFirebaseEnabled() || !tokens.length) return 0;

  const payload = {
    notification: {
      title: notification.title,
      body: notification.message
    },
    data: {
      id: String(notification.id || ''),
      type: String(notification.type || ''),
      title: String(notification.title || ''),
      message: String(notification.message || ''),
      url: String(notification.url || '/')
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        sound: 'default'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    },
    tokens
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(payload);

    // Remove invalid/expired tokens returned by FCM.
    const invalidTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[index]);
      }
    });

    if (invalidTokens.length) {
      for (const invalidToken of invalidTokens) {
        await db.execute('DELETE FROM mobile_push_tokens WHERE token = ?', [invalidToken]);
      }
    }

    return response.successCount || 0;
  } catch (error) {
    console.error('[FCM SEND ERROR]', error?.message || error);
    return 0;
  }
}

export async function sendPushToUser(userId, notification) {
  if (!userId || !isEnabled()) return 0;

  const subscriptions = await db.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );

  let sent = 0;
  for (const row of subscriptions.rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    };
    if (await sendToSubscription(subscription, notification)) {
      sent += 1;
    }
  }

  return sent;
}

export async function sendMobilePushToUser(userId, notification) {
  if (!userId) return 0;

  const tokensRes = await db.execute(
    'SELECT token FROM mobile_push_tokens WHERE user_id = ?',
    [userId]
  );

  const tokens = tokensRes.rows.map((row) => row.token).filter(Boolean);
  return sendToMobileTokens(tokens, notification);
}

export async function sendPushToAll(notification) {
  if (!isEnabled()) return 0;

  const subscriptions = await db.execute(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  );

  let sent = 0;
  for (const row of subscriptions.rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    };
    if (await sendToSubscription(subscription, notification)) {
      sent += 1;
    }
  }

  return sent;
}

export async function sendMobilePushToAll(notification) {
  const tokensRes = await db.execute('SELECT token FROM mobile_push_tokens');
  const tokens = tokensRes.rows.map((row) => row.token).filter(Boolean);
  return sendToMobileTokens(tokens, notification);
}
