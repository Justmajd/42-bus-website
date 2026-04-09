import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcast } from '../services/notifier.js';
import { getAmmanDate } from '../utils/timezone.js';

const router = Router();

// Create booking
router.post('/', authenticateToken, async (req, res) => {
  const { trip_id, pickup_point_id } = req.body;
  const userId = req.user.id;

  if (!trip_id || !pickup_point_id) {
    return res.status(400).json({ error: 'Trip and pickup point are required.' });
  }

  // Check if user is banned
  const userRes = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
  const user = userRes.rows[0];
  if (user.banned_until) {
    const banEnd = new Date(user.banned_until);
    if (banEnd > getAmmanDate()) {
      return res.status(403).json({
        error: `You are banned from booking until ${banEnd.toLocaleDateString()}. Reason: repeated no-shows.`
      });
    }
  }

  // Get trip
  const tripRes = await db.execute('SELECT * FROM trips WHERE id = ?', [trip_id]);
  const trip = tripRes.rows[0];
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  if (trip.status === 'completed' || trip.status === 'started') {
    return res.status(400).json({ error: 'This trip is no longer accepting bookings.' });
  }

  // Check 2-hour cutoff for to_42 trips
  if (trip.direction === 'to_42' && trip.calculated_departure) {
    const departure = new Date(trip.calculated_departure);
    const cutoff = new Date(departure.getTime() - 2 * 60 * 60 * 1000);
    if (getAmmanDate() > cutoff) {
      return res.status(400).json({ error: 'Registration has closed (2 hours before departure).' });
    }
  }

  // Check seat availability
  const bookedCountRes = await db.execute(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')',
    [trip_id]
  );
  if (bookedCountRes.rows[0].count >= trip.seats_total) {
    return res.status(400).json({ error: 'No seats available.' });
  }

  // Check if user already booked this exact trip
  const anyBookingRes = await db.execute(
    'SELECT id, status FROM bookings WHERE trip_id = ? AND user_id = ?',
    [trip_id, userId]
  );
  const anyBooking = anyBookingRes.rows[0];
  
  if (anyBooking && anyBooking.status !== 'cancelled') {
    return res.status(409).json({ error: 'You have already booked this trip.' });
  }

  // Implementation of One Active Booking Per Day rule
  const activeBookingForDayRes = await db.execute(`
    SELECT b.id 
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    WHERE b.user_id = ? 
      AND t.date = ? 
      AND b.status IN ('booked', 'confirmed')
  `, [userId, trip.date]);

  if (activeBookingForDayRes.rows[0]) {
    return res.status(400).json({ error: 'You can only hold one active booking per day. Please complete or cancel your current booking to reserve another.' });
  }

  // Validate pickup point
  const pointRes = await db.execute('SELECT id FROM pickup_points WHERE id = ?', [pickup_point_id]);
  if (!pointRes.rows[0]) {
    return res.status(400).json({ error: 'Invalid pickup point.' });
  }

  let insertId;
  try {
    if (anyBooking) {
      await db.execute('UPDATE bookings SET status = \'booked\', pickup_point_id = ? WHERE id = ?', [pickup_point_id, anyBooking.id]);
      insertId = anyBooking.id;
    } else {
      const result = await db.execute(
        'INSERT INTO bookings (trip_id, user_id, pickup_point_id, status) VALUES (?, ?, ?, \'booked\')',
        [trip_id, userId, pickup_point_id]
      );
      insertId = Number(result.lastInsertRowid);
    }
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'You are already booking this trip.' });
    }
    return res.status(500).json({ error: 'Database error occurred during booking.' });
  }

  // Broadcast seat update
  const newCountRes = await db.execute(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')',
    [trip_id]
  );

  broadcast('seat_update', {
    trip_id,
    seats_booked: newCountRes.rows[0].count,
    seats_available: trip.seats_total - newCountRes.rows[0].count
  });

  res.status(201).json({
    id: insertId,
    trip_id,
    pickup_point_id,
    status: 'booked'
  });
});

// Get user's bookings
router.get('/', authenticateToken, async (req, res) => {
  const bookingsRes = await db.execute(`
    SELECT 
      b.*,
      t.direction,
      t.date as trip_date,
      t.calculated_departure,
      t.status as trip_status,
      t.seats_total,
      ts.label as time_label,
      ts.hour,
      pp.name as pickup_name,
      pp.lat as pickup_lat,
      pp.lng as pickup_lng,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    JOIN pickup_points pp ON b.pickup_point_id = pp.id
    WHERE b.user_id = ? AND b.status != 'cancelled'
    ORDER BY t.date DESC, ts.hour DESC
  `, [req.user.id]);

  res.json(bookingsRes.rows);
});

// Cancel booking
router.delete('/:id', authenticateToken, async (req, res) => {
  const bookingRes = await db.execute(`
    SELECT b.*, t.direction, t.calculated_departure, t.status as trip_status
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    WHERE b.id = ? AND b.user_id = ?
  `, [req.params.id, req.user.id]);
  const booking = bookingRes.rows[0];

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking already cancelled.' });
  }

  if (booking.trip_status === 'started' || booking.trip_status === 'completed') {
    return res.status(400).json({ error: 'Cannot cancel booking for a trip that has already started.' });
  }

  // Check 2-hour cutoff for to_42 trips
  if (booking.direction === 'to_42' && booking.calculated_departure) {
    const departure = new Date(booking.calculated_departure);
    const cutoff = new Date(departure.getTime() - 2 * 60 * 60 * 1000);
    if (getAmmanDate() > cutoff) {
      return res.status(400).json({ error: 'Cannot cancel within 2 hours of departure.' });
    }
  }

  await db.execute('UPDATE bookings SET status = \'cancelled\' WHERE id = ?', [req.params.id]);

  // Broadcast seat update
  const tripRes = await db.execute('SELECT * FROM trips WHERE id = ?', [booking.trip_id]);
  const trip = tripRes.rows[0];
  const newCountRes = await db.execute(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')',
    [booking.trip_id]
  );

  broadcast('seat_update', {
    trip_id: booking.trip_id,
    seats_booked: newCountRes.rows[0].count,
    seats_available: trip.seats_total - newCountRes.rows[0].count
  });

  res.json({ message: 'Booking cancelled successfully.' });
});

// Attend via QR code
router.post('/attend', authenticateToken, async (req, res) => {
  const { qr_token } = req.body;
  const userId = req.user.id;

  if (!qr_token) {
    return res.status(400).json({ error: 'QR token is required.' });
  }

  // Parse QR token: format is "42bus:{tripId}:{uuid}"
  const parts = qr_token.split(':');
  if (parts.length !== 3 || parts[0] !== '42bus') {
    return res.status(400).json({ error: 'Invalid QR code.' });
  }

  const tripId = parseInt(parts[1]);

  // Verify trip exists and is started
  const tripRes = await db.execute('SELECT * FROM trips WHERE id = ? AND status = \'started\'', [tripId]);
  const trip = tripRes.rows[0];
  if (!trip) {
    return res.status(400).json({ error: 'Trip not found or not yet started.' });
  }

  // Verify QR token matches
  if (trip.qr_token !== qr_token) {
    return res.status(400).json({ error: 'Invalid QR code for this trip.' });
  }

  // Find user's booking for this trip
  const bookingRes = await db.execute(
    'SELECT * FROM bookings WHERE trip_id = ? AND user_id = ? AND status IN (\'booked\', \'confirmed\')',
    [tripId, userId]
  );
  const booking = bookingRes.rows[0];

  if (!booking) {
    return res.status(403).json({ error: 'You do not have a booking for this trip.' });
  }

  // Mark as attended
  await db.execute('UPDATE bookings SET status = \'attended\' WHERE id = ?', [booking.id]);

  broadcast('attendance_update', {
    trip_id: tripId,
    user_id: userId,
    booking_id: booking.id,
    status: 'attended'
  });

  res.json({ message: 'Attendance confirmed! ✅', booking_id: booking.id });
});

export default router;
