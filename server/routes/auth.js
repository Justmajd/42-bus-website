import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';

const router = Router();

// Register
// Register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Validate email domain
  const domain = email.split('@')[1];
  if (domain !== 'learner.42.tech') {
    return res.status(400).json({ error: 'Only @learner.42.tech emails are allowed.' });
  }

  // Check if user already exists
  const existingRes = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existingRes.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Hash password and create user
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = await db.execute(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
    [email, passwordHash, name, 'student']
  );

  const user = {
    id: Number(result.lastInsertRowid),
    email,
    name,
    role: 'student'
  };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const userRes = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  const user = userRes.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: {
      ...payload,
      warnings: user.warnings,
      banned_until: user.banned_until
    }
  });
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  const userRes = await db.execute(
    'SELECT id, email, name, role, warnings, banned_until, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  const user = userRes.rows[0];

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json(user);
});

export default router;
