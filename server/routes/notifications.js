import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { addClient, removeClient } from '../services/notifier.js';
import { getVapidPublicKey, removePushSubscription, savePushSubscription } from '../services/push.js';

const router = Router();

// SSE stream — token via query param since EventSource can't set headers
router.get('/stream', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
  req.user = user;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial heartbeat
  res.write('data: {"type":"connected"}\n\n');

  const clientId = addClient(req.user.id, res);

  // Keep alive every 30s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });
});

router.get('/push/public-key', authenticateToken, (req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Push notifications are not configured.' });
  }

  res.json({ publicKey });
});

router.post('/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const result = await savePushSubscription(req.user.id, req.body?.subscription);
    res.status(201).json({ message: 'Push subscription saved.', ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Invalid subscription.' });
  }
});

router.delete('/push/subscribe', authenticateToken, async (req, res) => {
  try {
    await removePushSubscription(req.user.id, req.body?.endpoint);
    res.json({ message: 'Push subscription removed.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to remove subscription.' });
  }
});

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  const notificationsRes = await db.execute(`
    SELECT * FROM notifications 
    WHERE user_id = ? OR user_id IS NULL 
    ORDER BY created_at DESC 
    LIMIT 50
  `, [req.user.id]);

  res.json(notificationsRes.rows);
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  const result = await db.execute(`
    SELECT COUNT(*) as count FROM notifications 
    WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0
  `, [req.user.id]);

  res.json({ count: result.rows[0].count });
});

// Mark as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [
    req.params.id, req.user.id
  ]);
  res.json({ message: 'Marked as read.' });
});

// Mark all as read
router.patch('/read-all', authenticateToken, async (req, res) => {
  await db.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL', [req.user.id]);
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
