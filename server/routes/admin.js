import { Router } from 'express';
import db from '../db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { broadcast, notifyUser, createNotification } from '../services/notifier.js';

const router = Router();

// Get all trips (admin view)
router.get('/trips', authenticateToken, requireAdmin, (req, res) => {
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

  const trips = db.prepare(query).all(...params);
  res.json(trips.map(t => ({
    ...t,
    seats_available: t.seats_total - t.seats_booked
  })));
});

// Get trip detail (admin view)
router.get('/trips/:id', authenticateToken, requireAdmin, (req, res) => {
  const trip = db.prepare(`
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  const bookings = db.prepare(`
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
  `).all(req.params.id);

  const pickupStats = db.prepare(`
    SELECT 
      pp.id, pp.name, pp.lat, pp.lng, pp.eta_minutes, pp.order_index,
      COUNT(b.id) as student_count
    FROM pickup_points pp
    LEFT JOIN bookings b ON b.pickup_point_id = pp.id AND b.trip_id = ? AND b.status IN ('booked', 'confirmed', 'attended')
    GROUP BY pp.id
    ORDER BY pp.order_index
  `).all(req.params.id);

  res.json({
    ...trip,
    seats_available: trip.seats_total - trip.seats_booked,
    bookings,
    pickup_stats: pickupStats
  });
});

// Update trip status
router.patch('/trips/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const { status } = req.body;
  const tripId = req.params.id;

  const validStatuses = ['pending', 'confirmed', 'started', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  let qrToken = trip.qr_token;

  // Generate QR token when starting trip
  if (status === 'started' && !trip.qr_token) {
    qrToken = `42bus:${tripId}:${uuidv4()}`;
    db.prepare('UPDATE trips SET qr_token = ? WHERE id = ?').run(qrToken, tripId);
  }

  // When confirming, update all booked bookings to confirmed
  if (status === 'confirmed') {
    db.prepare(
      'UPDATE bookings SET status = \'confirmed\' WHERE trip_id = ? AND status = \'booked\''
    ).run(tripId);

    // Notify all booked students
    const bookings = db.prepare(
      'SELECT user_id FROM bookings WHERE trip_id = ? AND status = \'confirmed\''
    ).all(tripId);

    const ts = db.prepare('SELECT label FROM time_slots WHERE id = ?').get(trip.time_slot_id);
    for (const b of bookings) {
      createNotification(
        b.user_id,
        'trip_confirmed',
        'Trip Confirmed! ✅',
        `Your ${trip.direction === 'to_42' ? 'Point → 42' : '42 → Point'} trip (${ts?.label || ''}) on ${trip.date} has been confirmed.`
      );
    }
  }

  // When completing, process no-shows
  if (status === 'completed') {
    const noShows = db.prepare(
      'SELECT b.*, u.warnings FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.trip_id = ? AND b.status IN (\'booked\', \'confirmed\')'
    ).all(tripId);

    for (const noShow of noShows) {
      db.prepare('UPDATE bookings SET status = \'no_show\' WHERE id = ?').run(noShow.id);

      const newWarnings = (noShow.warnings || 0) + 1;
      let banUntil = null;

      if (newWarnings >= 3) {
        // Ban for 2 days
        const ban = new Date();
        ban.setDate(ban.getDate() + 2);
        banUntil = ban.toISOString();
      }

      db.prepare(
        'UPDATE users SET warnings = ?, banned_until = ? WHERE id = ?'
      ).run(newWarnings, banUntil, noShow.user_id);

      // Notify no-show student
      const warningMsg = newWarnings >= 3
        ? `You did not attend your booked trip. You have been banned from booking for 2 days. (Warning ${newWarnings}/3)`
        : `You did not attend your booked trip. Warning ${newWarnings}/3. After 3 warnings, you will receive a 2-day ban.`;

      createNotification(
        noShow.user_id,
        'warning',
        '⚠️ No-Show Warning',
        warningMsg
      );
    }

    // Auto-generate next day's trip for same slot (for to_42 trips)
    if (trip.direction === 'to_42') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const slot = db.prepare('SELECT * FROM time_slots WHERE id = ?').get(trip.time_slot_id);
      if (slot) {
        const existing = db.prepare(
          'SELECT id FROM trips WHERE direction = \'to_42\' AND date = ? AND time_slot_id = ?'
        ).get(tomorrowStr, slot.id);

        if (!existing) {
          db.prepare(
            'INSERT INTO trips (direction, date, time_slot_id, calculated_departure, status) VALUES (?, ?, ?, ?, \'pending\')'
          ).run('to_42', tomorrowStr, slot.id, `${tomorrowStr}T${String(slot.hour).padStart(2, '0')}:00:00`);
        }
      }
    }
  }

  db.prepare('UPDATE trips SET status = ? WHERE id = ?').run(status, tripId);

  // Broadcast status update
  broadcast('trip_update', {
    trip_id: tripId,
    status,
    qr_token: status === 'started' ? qrToken : undefined
  });

  res.json({ message: `Trip status updated to ${status}.`, qr_token: qrToken });
});

// Manage time slots
router.get('/time-slots', authenticateToken, requireAdmin, (req, res) => {
  const slots = db.prepare('SELECT * FROM time_slots ORDER BY hour').all();
  res.json(slots);
});

router.post('/time-slots', authenticateToken, requireAdmin, (req, res) => {
  const { hour, label, is_active } = req.body;
  
  try {
    const result = db.prepare(
      'INSERT OR REPLACE INTO time_slots (hour, label, is_active) VALUES (?, ?, ?)'
    ).run(hour, label, is_active ? 1 : 0);
    res.json({ id: result.lastInsertRowid, hour, label, is_active });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update time slot.' });
  }
});

export default router;
