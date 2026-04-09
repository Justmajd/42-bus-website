import { Router } from 'express';
import db from '../db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { broadcast, notifyUser, createNotification } from '../services/notifier.js';
import { generateNextDayTrip } from '../services/scheduler.js';
import { getAmmanDate, getAmmanDateTimeString } from '../utils/timezone.js';

const router = Router();

// Get all trips (admin view)
router.get('/trips', authenticateToken, requireAdmin, async (req, res) => {
  const { status, direction, date } = req.query;

  let query = `
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status = 'attended') as attended_count
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }
  if (direction) {
    query += ' AND t.direction = ?';
    params.push(direction);
  }
  if (date) {
    query += ' AND t.date = ?';
    params.push(date);
  }

  query += ' ORDER BY t.date DESC, ts.hour ASC';

  const tripsRes = await db.execute(query, params);
  res.json(tripsRes.rows.map(t => ({
    ...t,
    seats_available: t.seats_total - t.seats_booked
  })));
});

// Get trip detail (admin view)
router.get('/trips/:id', authenticateToken, requireAdmin, async (req, res) => {
  const tripRes = await db.execute(`
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.id = ?
  `, [req.params.id]);
  const trip = tripRes.rows[0];

  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  const bookingsRes = await db.execute(`
    SELECT 
      b.*,
      u.name as student_name,
      u.email as student_email,
      u.warnings as student_warnings,
      pp.name as pickup_name,
      pp.lat as pickup_lat,
      pp.lng as pickup_lng
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN pickup_points pp ON b.pickup_point_id = pp.id
    WHERE b.trip_id = ? AND b.status != 'cancelled'
    ORDER BY pp.order_index, b.booked_at ASC
  `, [req.params.id]);

  const pickupStatsRes = await db.execute(`
    SELECT 
      pp.id, pp.name, pp.lat, pp.lng, pp.eta_minutes, pp.order_index,
      COUNT(b.id) as student_count
    FROM pickup_points pp
    LEFT JOIN bookings b ON b.pickup_point_id = pp.id AND b.trip_id = ? AND b.status IN ('booked', 'confirmed', 'attended')
    GROUP BY pp.id
    ORDER BY pp.order_index
  `, [req.params.id]);

  res.json({
    ...trip,
    seats_available: trip.seats_total - trip.seats_booked,
    bookings: bookingsRes.rows,
    pickup_stats: pickupStatsRes.rows
  });
});

// Update trip status
router.patch('/trips/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { status } = req.body;
  const tripId = req.params.id;

  const validStatuses = ['pending', 'confirmed', 'started', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const tripRes = await db.execute('SELECT * FROM trips WHERE id = ?', [tripId]);
  const trip = tripRes.rows[0];
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  let qrToken = trip.qr_token;

  // Generate QR token when starting trip
  if (status === 'started' && !trip.qr_token) {
    qrToken = `42bus:${tripId}:${uuidv4()}`;
    await db.execute('UPDATE trips SET qr_token = ? WHERE id = ?', [qrToken, tripId]);
  }

  // When confirming, update all booked bookings to confirmed
  if (status === 'confirmed') {
    await db.execute(
      'UPDATE bookings SET status = \'confirmed\' WHERE trip_id = ? AND status = \'booked\'',
      [tripId]
    );

    // Notify all booked students
    const bookingsRes = await db.execute(
      'SELECT user_id FROM bookings WHERE trip_id = ? AND status = \'confirmed\'',
      [tripId]
    );

    const tsRes = await db.execute('SELECT label FROM time_slots WHERE id = ?', [trip.time_slot_id]);
    const ts = tsRes.rows[0];
    
    for (const b of bookingsRes.rows) {
      await createNotification(
        b.user_id,
        'trip_confirmed',
        'Trip Confirmed! ✅',
        `Your ${trip.direction === 'to_42' ? 'Point → 42' : '42 → Point'} trip (${ts?.label || ''}) on ${trip.date} has been confirmed.`
      );
    }
  }

  // When completing, process no-shows
  if (status === 'completed') {
    const noShowsRes = await db.execute(
      'SELECT b.*, u.warnings FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.trip_id = ? AND b.status IN (\'booked\', \'confirmed\')',
      [tripId]
    );

    for (const noShow of noShowsRes.rows) {
      await db.execute('UPDATE bookings SET status = \'no_show\' WHERE id = ?', [noShow.id]);

      const newWarnings = (noShow.warnings || 0) + 1;
      let banUntil = null;

      if (newWarnings >= 3) {
        // Ban for 2 days
        const ban = getAmmanDate();
        ban.setDate(ban.getDate() + 2);
        banUntil = getAmmanDateTimeString(ban);
      }

      await db.execute(
        'UPDATE users SET warnings = ?, banned_until = ? WHERE id = ?',
        [newWarnings, banUntil, noShow.user_id]
      );

      // Notify no-show student
      const warningMsg = newWarnings >= 3
        ? `You did not attend your booked trip. You have been banned from booking for 2 days. (Warning ${newWarnings}/3)`
        : `You did not attend your booked trip. Warning ${newWarnings}/3. After 3 warnings, you will receive a 2-day ban.`;

      await createNotification(
        noShow.user_id,
        'warning',
        '⚠️ No-Show Warning',
        warningMsg
      );
    }

    // Auto-generate next day's trip immediately using identical time slot
    if (trip.direction === 'to_42') {
      await generateNextDayTrip(trip);
    }
  }

  await db.execute('UPDATE trips SET status = ? WHERE id = ?', [status, tripId]);

  // Broadcast status update
  broadcast('trip_update', {
    trip_id: tripId,
    status,
    qr_token: status === 'started' ? qrToken : undefined
  });

  res.json({ message: `Trip status updated to ${status}.`, qr_token: qrToken });
});

// Manage time slots
router.get('/time-slots', authenticateToken, requireAdmin, async (req, res) => {
  const slotsRes = await db.execute('SELECT * FROM time_slots ORDER BY hour');
  res.json(slotsRes.rows);
});

router.post('/time-slots', authenticateToken, requireAdmin, async (req, res) => {
  const { hour, label, is_active } = req.body;
  
  try {
    const result = await db.execute(
      'INSERT OR REPLACE INTO time_slots (hour, label, is_active) VALUES (?, ?, ?)',
      [hour, label, is_active ? 1 : 0]
    );
    res.json({ id: Number(result.lastInsertRowid), hour, label, is_active });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update time slot.' });
  }
});

export default router;
