import webpush from 'web-push';
import db from '../db.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let configured = false;

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
