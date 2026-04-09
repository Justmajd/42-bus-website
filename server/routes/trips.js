import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get available trips
router.get('/', authenticateToken, (req, res) => {
  const { direction, date } = req.query;

  let query = `
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE 1=1
  `;
  const params = [];

  if (direction) {
    query += ' AND t.direction = ?';
    params.push(direction);
  }
  if (date) {
    query += ' AND t.date = ?';
    params.push(date);
  }

  query += ' AND t.status != \'completed\' ORDER BY t.date ASC, ts.hour ASC';

  const trips = db.prepare(query).all(...params);

  // Enrich with pickup point stats
  const enriched = trips.map(trip => {
    const pickupStats = db.prepare(`
      SELECT 
        pp.id, pp.name, pp.lat, pp.lng, pp.eta_minutes,
        COUNT(b.id) as student_count
      FROM pickup_points pp
      LEFT JOIN bookings b ON b.pickup_point_id = pp.id AND b.trip_id = ? AND b.status IN ('booked', 'confirmed', 'attended')
      GROUP BY pp.id
      ORDER BY pp.order_index
    `).all(trip.id);

    return {
      ...trip,
      seats_available: trip.seats_total - trip.seats_booked,
      pickup_stats: pickupStats
    };
  });

  res.json(enriched);
});

// Get single trip with details
router.get('/:id', authenticateToken, (req, res) => {
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
      pp.name as pickup_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN pickup_points pp ON b.pickup_point_id = pp.id
    WHERE b.trip_id = ? AND b.status != 'cancelled'
    ORDER BY b.booked_at ASC
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

// Get pickup points
router.get('/config/pickup-points', authenticateToken, (req, res) => {
  const points = db.prepare('SELECT * FROM pickup_points ORDER BY order_index').all();
  res.json(points);
});

// Get time slots
router.get('/config/time-slots', authenticateToken, (req, res) => {
  const slots = db.prepare('SELECT * FROM time_slots WHERE is_active = 1 ORDER BY hour').all();
  res.json(slots);
});

export default router;
