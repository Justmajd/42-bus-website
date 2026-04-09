import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';
import { addClient, removeClient } from '../services/notifier.js';

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

// Get user notifications
router.get('/', authenticateToken, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications 
    WHERE user_id = ? OR user_id IS NULL 
    ORDER BY created_at DESC 
    LIMIT 50
  `).all(req.user.id);

  res.json(notifications);
});

// Get unread count
router.get('/unread-count', authenticateToken, (req, res) => {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM notifications 
    WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0
  `).get(req.user.id);

  res.json({ count: result.count });
});

// Mark as read
router.patch('/:id/read', authenticateToken, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(
    req.params.id, req.user.id
  );
  res.json({ message: 'Marked as read.' });
});

// Mark all as read
router.patch('/read-all', authenticateToken, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL').run(req.user.id);
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
