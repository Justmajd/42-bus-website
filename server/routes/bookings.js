import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { broadcast } from '../services/notifier.js';

const router = Router();

// Create booking
router.post('/', authenticateToken, (req, res) => {
  const { trip_id, pickup_point_id } = req.body;
  const userId = req.user.id;

  if (!trip_id || !pickup_point_id) {
    return res.status(400).json({ error: 'Trip and pickup point are required.' });
  }

  // Check if user is banned
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (user.banned_until) {
    const banEnd = new Date(user.banned_until);
    if (banEnd > new Date()) {
      return res.status(403).json({
        error: `You are banned from booking until ${banEnd.toLocaleDateString()}. Reason: repeated no-shows.`
      });
    }
  }

  // Get trip
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip_id);
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
    if (new Date() > cutoff) {
      return res.status(400).json({ error: 'Registration has closed (2 hours before departure).' });
    }
  }

  // Check seat availability
  const bookedCount = db.prepare(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')'
  ).get(trip_id);
  if (bookedCount.count >= trip.seats_total) {
    return res.status(400).json({ error: 'No seats available.' });
  }

  // Check if user already booked this trip
  const existing = db.prepare(
    'SELECT id FROM bookings WHERE trip_id = ? AND user_id = ? AND status != \'cancelled\''
  ).get(trip_id, userId);
  if (existing) {
    return res.status(409).json({ error: 'You have already booked this trip.' });
  }

  // Validate pickup point
  const point = db.prepare('SELECT id FROM pickup_points WHERE id = ?').get(pickup_point_id);
  if (!point) {
    return res.status(400).json({ error: 'Invalid pickup point.' });
  }

  // Create booking
  const result = db.prepare(
    'INSERT INTO bookings (trip_id, user_id, pickup_point_id, status) VALUES (?, ?, ?, \'booked\')'
  ).run(trip_id, userId, pickup_point_id);

  // Broadcast seat update
  const newCount = db.prepare(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')'
  ).get(trip_id);

  broadcast('seat_update', {
    trip_id,
    seats_booked: newCount.count,
    seats_available: trip.seats_total - newCount.count
  });

  res.status(201).json({
    id: result.lastInsertRowid,
    trip_id,
    pickup_point_id,
    status: 'booked'
  });
});

// Get user's bookings
router.get('/', authenticateToken, (req, res) => {
  const bookings = db.prepare(`
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
  `).all(req.user.id);

  res.json(bookings);
});

// Cancel booking
router.delete('/:id', authenticateToken, (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, t.direction, t.calculated_departure, t.status as trip_status
    FROM bookings b
    JOIN trips t ON b.trip_id = t.id
    WHERE b.id = ? AND b.user_id = ?
  `).get(req.params.id, req.user.id);

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
    if (new Date() > cutoff) {
      return res.status(400).json({ error: 'Cannot cancel within 2 hours of departure.' });
    }
  }

  db.prepare('UPDATE bookings SET status = \'cancelled\' WHERE id = ?').run(req.params.id);

  // Broadcast seat update
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(booking.trip_id);
  const newCount = db.prepare(
    'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status IN (\'booked\', \'confirmed\', \'attended\')'
  ).get(booking.trip_id);

  broadcast('seat_update', {
    trip_id: booking.trip_id,
    seats_booked: newCount.count,
    seats_available: trip.seats_total - newCount.count
  });

  res.json({ message: 'Booking cancelled successfully.' });
});

// Attend via QR code
router.post('/attend', authenticateToken, (req, res) => {
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
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND status = \'started\'').get(tripId);
  if (!trip) {
    return res.status(400).json({ error: 'Trip not found or not yet started.' });
  }

  // Verify QR token matches
  if (trip.qr_token !== qr_token) {
    return res.status(400).json({ error: 'Invalid QR code for this trip.' });
  }

  // Find user's booking for this trip
  const booking = db.prepare(
    'SELECT * FROM bookings WHERE trip_id = ? AND user_id = ? AND status IN (\'booked\', \'confirmed\')'
  ).get(tripId, userId);

  if (!booking) {
    return res.status(403).json({ error: 'You do not have a booking for this trip.' });
  }

  // Mark as attended
  db.prepare('UPDATE bookings SET status = \'attended\' WHERE id = ?').run(booking.id);

  broadcast('attendance_update', {
    trip_id: tripId,
    user_id: userId,
    booking_id: booking.id,
    status: 'attended'
  });

  res.json({ message: 'Attendance confirmed! ✅', booking_id: booking.id });
});

export default router;
