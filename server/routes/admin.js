import { Router } from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

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
    const usersRes = await db.execute("SELECT id, name, email, role, warnings, banned_until, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC");
    res.json(usersRes.rows);
  } catch (err) {
    console.error('[ADMIN USERS ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// Update user details (name)
router.patch('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  try {
    await db.execute('UPDATE users SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user.' });
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
