import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { getCachedPickupPoints, getCachedTimeSlots } from '../services/cache.js';

const router = Router();

async function getBookedTripIdsForStudent(userId, tripIds) {
  if (!tripIds.length) return new Set();

  const placeholders = tripIds.map(() => '?').join(', ');
  const bookingsRes = await db.execute(
    `SELECT DISTINCT trip_id
     FROM bookings
     WHERE user_id = ?
       AND trip_id IN (${placeholders})
       AND status IN ('booked', 'confirmed', 'attended')`,
    [userId, ...tripIds]
  );

  return new Set(bookingsRes.rows.map((row) => Number(row.trip_id)));
}

async function hasBookedTripForStudent(userId, tripId) {
  const bookingsRes = await db.execute(
    `SELECT 1
     FROM bookings
     WHERE user_id = ?
       AND trip_id = ?
       AND status IN ('booked', 'confirmed', 'attended')
     LIMIT 1`,
    [userId, tripId]
  );

  return Boolean(bookingsRes.rows[0]);
}

function sanitizeDriverLocationForStudent(trip, hasBookedSeat) {
  if (!trip) return trip;

  const sanitized = {
    ...trip,
    qr_token: undefined
  };

  if (trip.status === 'started' && hasBookedSeat) return sanitized;

  return {
    ...sanitized,
    driver_lat: null,
    driver_lng: null,
    driver_location_updated_at: null
  };
}

async function getPickupStatsByTripIds(tripIds) {
  if (!tripIds.length) {
    return new Map();
  }

  const placeholders = tripIds.map(() => '?').join(', ');
  const statsRes = await db.execute(
    `SELECT
       t.id AS trip_id,
       pp.id,
       pp.name,
       pp.lat,
       pp.lng,
       pp.eta_minutes,
       COUNT(b.id) AS student_count
     FROM trips t
     CROSS JOIN pickup_points pp
     LEFT JOIN bookings b
       ON b.trip_id = t.id
      AND b.pickup_point_id = pp.id
      AND b.status IN ('booked', 'confirmed', 'attended')
     WHERE t.id IN (${placeholders})
     GROUP BY t.id, pp.id
     ORDER BY t.id, pp.order_index`,
    tripIds
  );

  const grouped = new Map();
  for (const row of statsRes.rows) {
    const tripId = Number(row.trip_id);
    if (!grouped.has(tripId)) {
      grouped.set(tripId, []);
    }

    grouped.get(tripId).push({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      eta_minutes: row.eta_minutes,
      student_count: Number(row.student_count || 0)
    });
  }

  return grouped;
}

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
    WITH booked_counts AS (
      SELECT trip_id, COUNT(*) AS seats_booked
      FROM bookings
      WHERE status IN ('booked', 'confirmed', 'attended')
      GROUP BY trip_id
    )
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      COALESCE(bc.seats_booked, 0) as seats_booked
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    LEFT JOIN booked_counts bc ON bc.trip_id = t.id
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

    // Keep custom trips visible; cutoff applies only to scheduled slot trips.
    if (!trip.time_slot_id) {
      return true;
    }

    const departureHour = getDepartureHour(trip);
    if (departureHour == null) {
      return true;
    }

    return departureHour >= 15;
  });

  const tripIds = trips.map((trip) => Number(trip.id));
  const pickupStatsByTrip = await getPickupStatsByTripIds(tripIds);

  // Enrich with pickup point stats (single batched query).
  const enriched = trips.map((trip) => ({
    ...trip,
    seats_available: trip.seats_total - trip.seats_booked,
    pickup_stats: pickupStatsByTrip.get(Number(trip.id)) || []
  }));

  if (req.user?.role === 'student') {
    const bookedTripIds = await getBookedTripIdsForStudent(req.user.id, enriched.map((trip) => Number(trip.id)));
    return res.json(enriched.map((trip) => sanitizeDriverLocationForStudent(trip, bookedTripIds.has(Number(trip.id)))));
  }

  res.json(enriched);
});

// Get single trip with details
router.get('/:id', authenticateToken, async (req, res) => {
  const tripRes = await db.execute(`
    WITH booked_counts AS (
      SELECT trip_id, COUNT(*) AS seats_booked
      FROM bookings
      WHERE status IN ('booked', 'confirmed', 'attended')
      GROUP BY trip_id
    )
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      COALESCE(bc.seats_booked, 0) as seats_booked
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    LEFT JOIN booked_counts bc ON bc.trip_id = t.id
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

  const visibleTrip = req.user?.role === 'student'
    ? sanitizeDriverLocationForStudent(trip, await hasBookedTripForStudent(req.user.id, req.params.id))
    : trip;

  res.json({
    ...visibleTrip,
    seats_available: visibleTrip.seats_total - visibleTrip.seats_booked,
    bookings: bookingsRes.rows,
    pickup_stats: pickupStatsRes.rows
  });
});

// Get pickup points
router.get('/config/pickup-points', authenticateToken, async (req, res) => {
  const points = await getCachedPickupPoints();
  res.json(points);
});

// Get time slots
router.get('/config/time-slots', authenticateToken, async (req, res) => {
  const slots = await getCachedTimeSlots({ activeOnly: true });
  res.json(slots);
});

export default router;
