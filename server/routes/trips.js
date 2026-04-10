import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

function getDepartureHour(trip) {
  if (Number.isFinite(Number(trip?.hour))) {
    return Number(trip.hour);
  }

  const departureMatch = String(trip?.calculated_departure || '').match(/T(\d{2}):(\d{2})/);
  if (departureMatch) {
    return Number(departureMatch[1]);
  }

  const labelMatch = String(trip?.time_label || '').match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)$/i);
  if (labelMatch) {
    let hour = Number(labelMatch[1]);
    const meridiem = labelMatch[2].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour;
  }

  return null;
}

// Get available trips
// Get available trips
router.get('/', authenticateToken, async (req, res) => {
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

  const tripsRes = await db.execute(query, params);
  const trips = tripsRes.rows.filter((trip) => {
    if (trip.direction !== 'from_42') {
      return true;
    }

    const departureHour = getDepartureHour(trip);
    if (departureHour == null) {
      return true;
    }

    return departureHour >= 15;
  });

  // Enrich with pickup point stats
  const enriched = await Promise.all(trips.map(async trip => {
    const pickupStatsRes = await db.execute(`
      SELECT 
        pp.id, pp.name, pp.lat, pp.lng, pp.eta_minutes,
        COUNT(b.id) as student_count
      FROM pickup_points pp
      LEFT JOIN bookings b ON b.pickup_point_id = pp.id AND b.trip_id = ? AND b.status IN ('booked', 'confirmed', 'attended')
      GROUP BY pp.id
      ORDER BY pp.order_index
    `, [trip.id]);

    return {
      ...trip,
      seats_available: trip.seats_total - trip.seats_booked,
      pickup_stats: pickupStatsRes.rows
    };
  }));

  res.json(enriched);
});

// Get single trip with details
router.get('/:id', authenticateToken, async (req, res) => {
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
      pp.name as pickup_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN pickup_points pp ON b.pickup_point_id = pp.id
    WHERE b.trip_id = ? AND b.status != 'cancelled'
    ORDER BY b.booked_at ASC
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

// Get pickup points
router.get('/config/pickup-points', authenticateToken, async (req, res) => {
  const pointsRes = await db.execute('SELECT * FROM pickup_points ORDER BY order_index');
  res.json(pointsRes.rows);
});

// Get time slots
router.get('/config/time-slots', authenticateToken, async (req, res) => {
  const slotsRes = await db.execute('SELECT * FROM time_slots WHERE is_active = 1 ORDER BY hour');
  res.json(slotsRes.rows);
});

export default router;
