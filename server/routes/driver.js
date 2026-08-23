import { Router } from 'express';
import db from '../db.js';
import { authenticateToken, requireDriver } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { broadcast, notifyUser, createNotification } from '../services/notifier.js';
import { generateNextDayTrip } from '../services/scheduler.js';
import { getCachedTimeSlots, invalidateTimeSlotsCache } from '../services/cache.js';
import { getAmmanDate, getAmmanDateTimeString } from '../utils/timezone.js';

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

function shouldHideTripForDriver(trip, isAdmin) {
  if (isAdmin) return false;
  if (!trip || trip.direction !== 'from_42') return false;

  // Keep custom trips visible; cutoff applies only to scheduled slot trips.
  if (!trip.time_slot_id) return false;

  const departureHour = getDepartureHour(trip);
  return departureHour != null && departureHour < 15;
}

function validateCustomTripPayload(body) {
  const customName = String(body?.custom_name || '').trim();
  const direction = String(body?.direction || '').trim();
  const date = String(body?.date || '').trim();
  const departureTime = String(body?.departure_time || '').trim();
  const customLat = Number(body?.custom_lat);
  const customLng = Number(body?.custom_lng);
  const seatsTotalRaw = Number(body?.seats_total || 15);
  const seatsTotal = Number.isFinite(seatsTotalRaw) ? Math.min(Math.max(Math.floor(seatsTotalRaw), 1), 30) : 15;

  if (!customName || customName.length < 3) {
    return { error: 'Trip name is required (minimum 3 characters).' };
  }

  if (!Number.isFinite(customLat) || !Number.isFinite(customLng)) {
    return { error: 'Custom trip pin location is required.' };
  }

  if (customLat < -90 || customLat > 90 || customLng < -180 || customLng > 180) {
    return { error: 'Custom trip pin location is invalid.' };
  }

  if (!['to_42', 'from_42'].includes(direction)) {
    return { error: 'Direction must be to_42 or from_42.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Date must be in YYYY-MM-DD format.' };
  }

  if (!/^\d{2}:\d{2}$/.test(departureTime)) {
    return { error: 'Departure time must be in HH:mm format.' };
  }

  const [hourStr, minuteStr] = departureTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { error: 'Invalid departure time.' };
  }

  const calculatedDeparture = `${date}T${departureTime}:00+03:00`;
  return {
    customName,
    direction,
    date,
    departureTime,
    customLat,
    customLng,
    seatsTotal,
    calculatedDeparture
  };
}

// Get all trips (driver view)
router.get('/trips', authenticateToken, requireDriver, async (req, res) => {
  const { status, direction, date } = req.query;
  const isAdmin = req.user?.role === 'admin';

  let query = `
    WITH booked_counts AS (
      SELECT trip_id, COUNT(*) AS seats_booked
      FROM bookings
      WHERE status IN ('booked', 'confirmed', 'attended')
      GROUP BY trip_id
    ),
    attended_counts AS (
      SELECT trip_id, COUNT(*) AS attended_count
      FROM bookings
      WHERE status = 'attended'
      GROUP BY trip_id
    )
    SELECT 
      t.*,
      ts.hour,
      ts.label as time_label,
      COALESCE(bc.seats_booked, 0) as seats_booked,
      COALESCE(ac.attended_count, 0) as attended_count
    FROM trips t
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    LEFT JOIN booked_counts bc ON bc.trip_id = t.id
    LEFT JOIN attended_counts ac ON ac.trip_id = t.id
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
  if (!isAdmin) {
    query += ' AND t.time_slot_id IS NOT NULL';
  }

  query += ' ORDER BY t.date DESC, ts.hour ASC';

  const tripsRes = await db.execute(query, params);
  res.json(tripsRes.rows
    .filter((t) => !shouldHideTripForDriver(t, isAdmin))
    .map(t => ({
      ...t,
      seats_available: t.seats_total - t.seats_booked
    })));
});

// Get trip detail (driver view)
router.get('/trips/:id', authenticateToken, requireDriver, async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
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
  if (shouldHideTripForDriver(trip, isAdmin)) {
    return res.status(404).json({ error: 'Trip not found.' });
  }
  if (!isAdmin && !trip.time_slot_id) {
    return res.status(403).json({ error: 'Custom trips are staff-only.' });
  }

  const bookingsRes = await db.execute(`
    SELECT 
      b.*,
      u.name as student_name,
      u.email as student_email,
      u.warnings as student_warnings,
      u.profile_picture as student_picture,
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
router.patch('/trips/:id/status', authenticateToken, requireDriver, async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
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
  if (!isAdmin && !trip.time_slot_id) {
    return res.status(403).json({ error: 'Custom trips are staff-only.' });
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
        'Trip confirmed',
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
        'No-show warning',
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

// Update live driver location while a trip is started
router.patch('/trips/:id/location', authenticateToken, requireDriver, async (req, res) => {
  const tripId = req.params.id;
  const driverLat = Number(req.body?.lat);
  const driverLng = Number(req.body?.lng);

  if (!Number.isFinite(driverLat) || !Number.isFinite(driverLng)) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
  }

  if (driverLat < -90 || driverLat > 90 || driverLng < -180 || driverLng > 180) {
    return res.status(400).json({ error: 'Invalid driver location.' });
  }

  const tripRes = await db.execute('SELECT * FROM trips WHERE id = ?', [tripId]);
  const trip = tripRes.rows[0];
  if (!trip) {
    return res.status(404).json({ error: 'Trip not found.' });
  }

  if (trip.status !== 'started') {
    return res.status(409).json({ error: 'Driver location can only be updated while the trip is started.' });
  }

  await db.execute(
    'UPDATE trips SET driver_lat = ?, driver_lng = ?, driver_location_updated_at = datetime(\'now\') WHERE id = ?',
    [driverLat, driverLng, tripId]
  );

  broadcast('trip_update', {
    trip_id: tripId,
    status: trip.status,
    driver_lat: driverLat,
    driver_lng: driverLng,
    driver_location_updated_at: new Date().toISOString()
  });

  res.json({
    message: 'Driver location updated.',
    driver_lat: driverLat,
    driver_lng: driverLng
  });
});

// Manage time slots
router.get('/time-slots', authenticateToken, requireDriver, async (req, res) => {
  const slots = await getCachedTimeSlots({ activeOnly: false });
  res.json(slots);
});

router.post('/time-slots', authenticateToken, requireDriver, async (req, res) => {
  const { hour, label, is_active } = req.body;
  
  try {
    const result = await db.execute(
      'INSERT OR REPLACE INTO time_slots (hour, label, is_active) VALUES (?, ?, ?)',
      [hour, label, is_active ? 1 : 0]
    );
    invalidateTimeSlotsCache();
    res.json({ id: Number(result.lastInsertRowid), hour, label, is_active });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update time slot.' });
  }
});

// Create custom trip (staff/admin only)
router.post('/trips/custom', authenticateToken, requireDriver, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Custom trips are staff-only.' });
  }

  const parsed = validateCustomTripPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { customName, direction, date, departureTime, customLat, customLng, seatsTotal, calculatedDeparture } = parsed;

  try {
    const result = await db.execute(
      `INSERT INTO trips (direction, date, time_slot_id, calculated_departure, seats_total, status, custom_name, custom_lat, custom_lng)
       VALUES (?, ?, NULL, ?, ?, 'pending', ?, ?, ?)`,
      [direction, date, calculatedDeparture, seatsTotal, customName, customLat, customLng]
    );

    const tripId = Number(result.lastInsertRowid);

    broadcast('trip_update', {
      trip_id: tripId,
      status: 'pending'
    });

    return res.status(201).json({
      id: tripId,
      direction,
      date,
      calculated_departure: calculatedDeparture,
      seats_total: seatsTotal,
      status: 'pending',
      custom_name: customName,
      custom_lat: customLat,
      custom_lng: customLng,
      time_label: departureTime,
      is_custom: 1
    });
  } catch (err) {
    console.error('[CUSTOM TRIP CREATE ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to create custom trip.' });
  }
});

// Update custom trip details (staff/admin only)
router.patch('/trips/custom/:id', authenticateToken, requireDriver, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Custom trips are staff-only.' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isFinite(tripId)) {
    return res.status(400).json({ error: 'Invalid trip id.' });
  }

  const parsed = validateCustomTripPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { customName, direction, date, departureTime, customLat, customLng, seatsTotal, calculatedDeparture } = parsed;

  try {
    const tripRes = await db.execute(
      `SELECT
         t.id,
         t.time_slot_id,
         t.status,
         (SELECT COUNT(*) FROM bookings WHERE trip_id = t.id AND status IN ('booked', 'confirmed', 'attended')) as seats_booked
       FROM trips t
       WHERE t.id = ?`,
      [tripId]
    );
    const trip = tripRes.rows[0];

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    if (trip.time_slot_id) {
      return res.status(400).json({ error: 'Only custom trips can be edited here.' });
    }

    if (seatsTotal < Number(trip.seats_booked || 0)) {
      return res.status(400).json({ error: `Seats total cannot be less than current booked seats (${trip.seats_booked}).` });
    }

    await db.execute(
      `UPDATE trips
       SET custom_name = ?, direction = ?, date = ?, calculated_departure = ?, seats_total = ?, custom_lat = ?, custom_lng = ?
       WHERE id = ?`,
      [customName, direction, date, calculatedDeparture, seatsTotal, customLat, customLng, tripId]
    );

    broadcast('trip_update', {
      trip_id: tripId,
      status: trip.status
    });

    return res.json({
      id: tripId,
      custom_name: customName,
      direction,
      date,
      calculated_departure: calculatedDeparture,
      departure_time: departureTime,
      seats_total: seatsTotal,
      custom_lat: customLat,
      custom_lng: customLng
    });
  } catch (err) {
    console.error('[CUSTOM TRIP UPDATE ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to update custom trip.' });
  }
});

// Delete custom trip (staff/admin only)
router.delete('/trips/custom/:id', authenticateToken, requireDriver, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Custom trips are staff-only.' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isFinite(tripId)) {
    return res.status(400).json({ error: 'Invalid trip id.' });
  }

  try {
    const tripRes = await db.execute('SELECT id, time_slot_id FROM trips WHERE id = ?', [tripId]);
    const trip = tripRes.rows[0];
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    if (trip.time_slot_id) {
      return res.status(400).json({ error: 'Only custom trips can be deleted here.' });
    }

    await db.execute('DELETE FROM bookings WHERE trip_id = ?', [tripId]);
    await db.execute('DELETE FROM trips WHERE id = ?', [tripId]);

    broadcast('trip_update', {
      trip_id: tripId,
      status: 'deleted'
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[CUSTOM TRIP DELETE ERROR]', err?.message || err);
    return res.status(500).json({ error: 'Failed to delete custom trip.' });
  }
});

export default router;
