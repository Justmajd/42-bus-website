import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// Map of clientId -> { userId, res }
const clients = new Map();

export function addClient(userId, res) {
  const clientId = uuidv4();
  clients.set(clientId, { userId, res });
  console.log(`📡 SSE client connected: ${clientId} (user ${userId}). Total: ${clients.size}`);
  return clientId;
}

export function removeClient(clientId) {
  clients.delete(clientId);
  console.log(`📡 SSE client disconnected: ${clientId}. Total: ${clients.size}`);
}

// Broadcast to ALL connected clients
export function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of clients) {
    try {
      client.res.write(message);
    } catch (err) {
      // Client disconnected
    }
  }
}

// Send to specific user
export function notifyUser(userId, event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of clients) {
    if (client.userId === userId) {
      try {
        client.res.write(message);
      } catch (err) {
        // Client disconnected
      }
    }
  }
}

// Create persistent notification + push via SSE
export async function createNotification(userId, type, title, message) {
  const result = await db.execute(
    'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
    [userId, type, title, message]
  );

  const notif = {
    id: result.lastInsertRowid,
    user_id: userId,
    type,
    title,
    message,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  if (userId) {
    notifyUser(userId, 'notification', notif);
  } else {
    broadcast('notification', notif);
  }

  return notif;
}

// Broadcast notification to ALL users (saved with null user_id)
export async function broadcastNotification(type, title, message) {
  const result = await db.execute(
    'INSERT INTO notifications (user_id, type, title, message) VALUES (NULL, ?, ?, ?)',
    [type, title, message]
  );

  const notif = {
    id: result.lastInsertRowid,
    user_id: null,
    type,
    title,
    message,
    is_read: 0,
    created_at: new Date().toISOString()
  };

  broadcast('notification', notif);
  return notif;
}
