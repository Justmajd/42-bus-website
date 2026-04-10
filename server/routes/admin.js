import { Router } from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { broadcastNotification, broadcast, createNotification } from '../services/notifier.js';
import { getAmmanDate, getAmmanDateString, getAmmanDateTimeString } from '../utils/timezone.js';

const router = Router();
const ALLOWED_ROLES = new Set(['student', 'driver', 'admin']);

async function ensureSlot(hour, label) {
  await db.execute(
    `INSERT INTO time_slots (hour, label, is_active)
     VALUES (?, ?, 1)
     ON CONFLICT(hour) DO UPDATE SET label = excluded.label, is_active = 1`,
    [hour, label]
  );

  const slotRes = await db.execute('SELECT id FROM time_slots WHERE hour = ?', [hour]);
  return slotRes.rows[0]?.id;
}

function addDays(dateStr, days = 1) {
  const d = new Date(`${dateStr}T12:00:00+03:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function buildSlotLabel(startHour) {
  const endHour = (startHour + 1) % 24;
  const formatHour = (h) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:00 ${suffix}`;
  };

  return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}

async function getTripForSlot({ direction, date, slotId }) {
  const existingRes = await db.execute(
    'SELECT id, status FROM trips WHERE direction = ? AND date = ? AND time_slot_id = ?',
    [direction, date, slotId]
  );
  return existingRes.rows[0] || null;
}

async function purgeFutureWindowTrips({ direction, slotId, fromDate }) {
  const staleRes = await db.execute(
    `SELECT id
     FROM trips
     WHERE direction = ?
       AND time_slot_id = ?
       AND date >= ?
       AND status IN ('pending', 'confirmed')`,
    [direction, slotId, fromDate]
  );

  for (const row of staleRes.rows) {
    await db.execute('DELETE FROM bookings WHERE trip_id = ?', [row.id]);
    await db.execute('DELETE FROM trips WHERE id = ?', [row.id]);
    broadcast('trip_update', { trip_id: row.id, status: 'deleted' });
  }

  return staleRes.rows.length;
}

async function resetTripWindowForDate({ direction, date, slotId, hour }) {
  const existing = await getTripForSlot({ direction, date, slotId });

  if (existing && ['started', 'completed'].includes(existing.status)) {
    return { created: false, skippedLocked: true, deletedTripId: null, createdTripId: null };
  }

  let deletedTripId = null;
  if (existing) {
    deletedTripId = existing.id;
    await db.execute('DELETE FROM bookings WHERE trip_id = ?', [existing.id]);
    await db.execute('DELETE FROM trips WHERE id = ?', [existing.id]);
    broadcast('trip_update', { trip_id: existing.id, status: 'deleted' });
  }

  const departure = `${date}T${String(hour).padStart(2, '0')}:00:00+03:00`;
  const insertRes = await db.execute(
    'INSERT INTO trips (direction, date, time_slot_id, calculated_departure, seats_total, status) VALUES (?, ?, ?, ?, 15, \'pending\')',
    [direction, date, slotId, departure]
  );
  const createdTripId = Number(insertRes.lastInsertRowid);
  broadcast('trip_update', { trip_id: createdTripId, status: 'pending' });

  return { created: true, skippedLocked: false, deletedTripId, createdTripId };
}

// Get Analytics Dashboard
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const startedTripsRes = await db.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'started'");
    const completedTripsRes = await db.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'completed'");
    const pendingTripsRes = await db.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'pending'");
    const confirmedTripsRes = await db.execute("SELECT COUNT(*) as count FROM trips WHERE status = 'confirmed'");
    const activeBookingsRes = await db.execute("SELECT COUNT(*) as count FROM bookings WHERE status IN ('booked', 'confirmed', 'attended')");
    const bannedStudentsRes = await db.execute("SELECT COUNT(*) as count FROM users WHERE banned_until IS NOT NULL AND banned_until > datetime('now')");
    
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
      startedTrips: startedTripsRes.rows[0].count,
      completedTrips: completedTripsRes.rows[0].count,
      pendingTrips: pendingTripsRes.rows[0].count,
      confirmedTrips: confirmedTripsRes.rows[0].count,
      activeBookings: activeBookingsRes.rows[0].count,
      bannedStudents: bannedStudentsRes.rows[0].count,
      popularTimeSlots: timeslotsRes.rows,
      popularPickups: pickupsRes.rows
    });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to generate metrics.' });
  }
});

// Reset trip window to 9AM-11PM (hourly, ending at 12:00 AM) for from_42 and to_42.
router.post('/trips/reset-window', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const windowHours = Array.from({ length: 15 }, (_, i) => i + 9); // 9..23

    const todayStr = getAmmanDateString();
    const tomorrowStr = addDays(todayStr, 1);
    const ammanHour = Number(getAmmanDateTimeString(getAmmanDate()).slice(11, 13));
    const from42BaseDate = ammanHour <= 11 ? todayStr : tomorrowStr;
    const to42BaseDate = tomorrowStr;

    const summary = {
      created: 0,
      skippedLocked: 0,
      deleted: 0,
      shiftedForward: 0,
      windowHours
    };

    for (const hour of windowHours) {
      const slotId = await ensureSlot(hour, buildSlotLabel(hour));
      if (!slotId) continue;

      let from42Date = from42BaseDate;
      for (let i = 0; i < 7; i += 1) {
        const trip = await getTripForSlot({ direction: 'from_42', date: from42Date, slotId });
        if (!trip || !['started', 'completed'].includes(trip.status)) break;
        from42Date = addDays(from42Date, 1);
        summary.shiftedForward += 1;
      }

      summary.deleted += await purgeFutureWindowTrips({
        direction: 'from_42',
        slotId,
        fromDate: from42BaseDate
      });

      const from42Result = await resetTripWindowForDate({
        direction: 'from_42',
        date: from42Date,
        slotId,
        hour
      });

      if (from42Result.created) summary.created += 1;
      if (from42Result.deletedTripId) summary.deleted += 1;
      if (from42Result.skippedLocked) summary.skippedLocked += 1;

      let to42Date = to42BaseDate;
      for (let i = 0; i < 7; i += 1) {
        const trip = await getTripForSlot({ direction: 'to_42', date: to42Date, slotId });
        if (!trip || !['started', 'completed'].includes(trip.status)) break;
        to42Date = addDays(to42Date, 1);
        summary.shiftedForward += 1;
      }

      summary.deleted += await purgeFutureWindowTrips({
        direction: 'to_42',
        slotId,
        fromDate: to42BaseDate
      });

      const to42Result = await resetTripWindowForDate({
        direction: 'to_42',
        date: to42Date,
        slotId,
        hour
      });

      if (to42Result.created) summary.created += 1;
      if (to42Result.deletedTripId) summary.deleted += 1;
      if (to42Result.skippedLocked) summary.skippedLocked += 1;
    }

    return res.status(201).json({
      success: true,
      message: 'Trip window reset complete for 9AM-11PM slots.',
      from42BaseDate,
      to42BaseDate,
      ...summary
    });
  } catch (err) {
    console.error('[ADMIN RESET WINDOW ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to reset trip window.' });
  }
});

// Send a test notification to all users
router.post('/notifications/test', authenticateToken, requireAdmin, async (req, res) => {
  const title = String(req.body?.title || 'Test notification').trim() || 'Test notification';
  const message = String(req.body?.message || 'This is a test notification for all users.').trim() || 'This is a test notification for all users.';

  try {
    const notification = await broadcastNotification('admin_test', title, message);
    res.status(201).json({
      success: true,
      notification,
      message: 'Test notification sent to all users.'
    });
  } catch (err) {
    console.error('[ADMIN TEST NOTIFICATION ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to send test notification.' });
  }
});

// Send a custom notification to all users
router.post('/notifications/custom', authenticateToken, requireAdmin, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  if (title.length > 120) {
    return res.status(400).json({ error: 'Title must be 120 characters or less.' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'Message must be 500 characters or less.' });
  }

  try {
    const notification = await broadcastNotification('admin_custom', title, message);
    res.status(201).json({
      success: true,
      notification,
      message: 'Custom notification sent to all users.'
    });
  } catch (err) {
    console.error('[ADMIN CUSTOM NOTIFICATION ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to send custom notification.' });
  }
});

// Send a notification to one specific student
router.post('/notifications/student', authenticateToken, requireAdmin, async (req, res) => {
  const studentId = Number(req.body?.student_id);
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!Number.isFinite(studentId)) {
    return res.status(400).json({ error: 'Valid student_id is required.' });
  }

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  if (title.length > 120) {
    return res.status(400).json({ error: 'Title must be 120 characters or less.' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'Message must be 500 characters or less.' });
  }

  try {
    const userRes = await db.execute(
      'SELECT id, role FROM users WHERE id = ?',
      [studentId]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (user.role !== 'student') {
      return res.status(400).json({ error: 'Selected user is not a student.' });
    }

    const notification = await createNotification(studentId, 'admin_student', title, message);
    return res.status(201).json({
      success: true,
      notification,
      message: 'Notification sent to selected student.'
    });
  } catch (err) {
    console.error('[ADMIN STUDENT NOTIFICATION ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to send notification to student.' });
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
  const profilePictureRaw = req.body?.profile_picture;
  const profilePicture = profilePictureRaw != null ? String(profilePictureRaw).trim() : undefined;

  if (name === '' || email === '') {
    return res.status(400).json({ error: 'Name and email cannot be empty.' });
  }
  if (role != null && !ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (profilePicture != null && profilePicture !== '') {
    if (!profilePicture.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Profile picture must be a valid image data URL.' });
    }
    if (profilePicture.length > 700000) {
      return res.status(400).json({ error: 'Picture exceeds 500KB limit.' });
    }
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
  if (profilePicture != null) {
    updates.push('profile_picture = ?');
    values.push(profilePicture === '' ? null : profilePicture);
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
