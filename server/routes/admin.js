import { Router } from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();
const ALLOWED_ROLES = new Set(['student', 'driver', 'admin']);

// Get Analytics Dashboard
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalRidesRes = await db.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'completed'");
    const totalStudentsRes = await db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
    
    // Most popular timeslots
    const timeslotsRes = await db.execute(`
      SELECT ts.label, COUNT(t.id) as trip_count
      FROM time_slots ts
      JOIN trips t ON t.time_slot_id = ts.id
      GROUP BY ts.id
      ORDER BY trip_count DESC
      LIMIT 3
    `);

    // Most popular pickup points
    const pickupsRes = await db.execute(`
      SELECT pp.name, COUNT(b.id) as request_count
      FROM pickup_points pp
      JOIN bookings b ON b.pickup_point_id = pp.id
      GROUP BY pp.id
      ORDER BY request_count DESC
      LIMIT 3
    `);

    res.json({
      totalRides: totalRidesRes.rows[0].count,
      totalStudents: totalStudentsRes.rows[0].count,
      popularTimeSlots: timeslotsRes.rows,
      popularPickups: pickupsRes.rows
    });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to generate metrics.' });
  }
});

// Get all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const usersRes = await db.execute(
      'SELECT id, name, email, role, warnings, banned_until, profile_picture, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(usersRes.rows);
  } catch (err) {
    console.error('[ADMIN USERS ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// Create user
router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || 'student').trim().toLowerCase();

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existingRes = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existingRes.rows[0]) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );

    const createdRes = await db.execute(
      'SELECT id, name, email, role, warnings, banned_until, profile_picture, created_at FROM users WHERE id = ?',
      [Number(result.lastInsertRowid)]
    );

    return res.status(201).json(createdRes.rows[0]);
  } catch (err) {
    console.error('[ADMIN CREATE USER ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
});

// Update user details (name)
router.patch('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
  const email = req.body?.email != null ? String(req.body.email).trim().toLowerCase() : undefined;
  const role = req.body?.role != null ? String(req.body.role).trim().toLowerCase() : undefined;

  if (name === '' || email === '') {
    return res.status(400).json({ error: 'Name and email cannot be empty.' });
  }
  if (role != null && !ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  const updates = [];
  const values = [];
  if (name != null) {
    updates.push('name = ?');
    values.push(name);
  }
  if (email != null) {
    updates.push('email = ?');
    values.push(email);
  }
  if (role != null) {
    updates.push('role = ?');
    values.push(role);
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'No updates provided.' });
  }

  try {
    if (role && req.user.id === Number(req.params.id) && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    }

    values.push(req.params.id);
    await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN UPDATE USER ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// Delete user
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }

  if (req.user.id === userId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const existingRes = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existingRes.rows[0]) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await db.execute('DELETE FROM bookings WHERE user_id = ?', [userId]);
    await db.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await db.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN DELETE USER ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// Reset Password
router.patch('/users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Block/Unblock
router.patch('/users/:id/block', authenticateToken, requireAdmin, async (req, res) => {
  const { block } = req.body;
  
  try {
    let bannedUntil = null;
    if (block) {
      // Ban for roughly 100 years to simulate permanent block, or just set it far out
      bannedUntil = '2100-01-01 00:00:00';
    }
    
    await db.execute('UPDATE users SET banned_until = ?, warnings = 0 WHERE id = ?', [bannedUntil, req.params.id]);
    res.json({ success: true, banned_until: bannedUntil });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle block status.' });
  }
});

export default router;
