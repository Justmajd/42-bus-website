import cron from 'node-cron';
import db from '../db.js';
import { createNotification, broadcastNotification, broadcast } from './notifier.js';
import { v4 as uuidv4 } from 'uuid';
import { getAmmanDate, getAmmanDateTimeString, getAmmanDateString } from '../utils/timezone.js';

export function startScheduler() {
  console.log('⏰ Scheduler started');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = getAmmanDate();
      await checkTripConfirmations(now);
      await removeUnconfirmedTo42Trips(now);
      await checkFrom42Notifications(now);
      await recalculateDepartureTimes();
      await checkTripExpiry(now);
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  });
}

export async function generateNextDayTrip(oldTrip) {
  // Map old date strict to Amman base, add 1 day
  const oldDate = new Date(oldTrip.date + 'T12:00:00+03:00');
  oldDate.setDate(oldDate.getDate() + 1);
  // Re-format to get strictly "YYYY-MM-DD"
  const nextDateStr = oldDate.toISOString().split('T')[0];

  const slotRes = await db.execute('SELECT * FROM time_slots WHERE id = ?', [oldTrip.time_slot_id]);
  const slot = slotRes.rows[0];
  if (!slot) return;

  const existingRes = await db.execute(
    'SELECT id FROM trips WHERE direction = ? AND date = ? AND time_slot_id = ?',
    [oldTrip.direction, nextDateStr, slot.id]
  );
  const existing = existingRes.rows[0];

  if (!existing) {
    const nextDeparture = `${nextDateStr}T${String(slot.hour).padStart(2, '0')}:00:00+03:00`;
    await db.execute(
      'INSERT INTO trips (direction, date, time_slot_id, calculated_departure, seats_total, status) VALUES (?, ?, ?, ?, 15, \'pending\')',
      [oldTrip.direction, nextDateStr, slot.id, nextDeparture]
    );
    console.log(`♻️ Auto-generated next-day trip: ${oldTrip.direction} for ${nextDateStr}`);
  }
}

async function checkTripExpiry(now) {
  // A trip expires 1 hour after its calculated_departure.
  // Only trips that actually started should become completed.
  const expiryTime = new Date(now.getTime() - 60 * 60 * 1000);
  const cutoffStr = getAmmanDateTimeString(expiryTime);

  const expiredTripsRes = await db.execute(`
    SELECT * 
    FROM trips 
    WHERE status IN ('pending', 'confirmed', 'started') 
    AND calculated_departure IS NOT NULL 
    AND calculated_departure < ?
  `, [cutoffStr]);

  for (const trip of expiredTripsRes.rows) {
    if (trip.status === 'started') {
      await db.execute('UPDATE trips SET status = \'completed\' WHERE id = ?', [trip.id]);
      broadcast('trip_update', { trip_id: trip.id, status: 'completed' });
      console.log(`⏳ Trip ${trip.id} elapsed after starting. Marked completed.`);

      // Auto-generate tomorrow's slot immediately
      await generateNextDayTrip(trip);
      continue;
    }

    // Trips that never started still need tomorrow's replacement slot.
    await generateNextDayTrip(trip);

    // Trips that never started should be removed instead of counted as completed.
    await db.execute('DELETE FROM bookings WHERE trip_id = ?', [trip.id]);
    await db.execute('DELETE FROM trips WHERE id = ?', [trip.id]);
    broadcast('trip_update', { trip_id: trip.id, status: 'deleted' });
    console.log(`🗑️ Trip ${trip.id} expired without starting. Removed.`);
  }
}

// Auto-confirm trips when they reach 8 booked students.
async function checkTripConfirmations(now) {
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const nowStr = getAmmanDateTimeString(now);
  const twoHoursStr = getAmmanDateTimeString(twoHoursLater);

  // Find pending trips with enough bookings to auto-confirm.
  const pendingTripsRes = await db.execute(`
    SELECT t.*, ts.label as time_label 
    FROM trips t 
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.status = 'pending' 
    AND t.calculated_departure IS NOT NULL
    AND t.calculated_departure >= ?
    AND t.calculated_departure <= ?
  `, [nowStr, twoHoursStr]);

  for (const trip of pendingTripsRes.rows) {
    const bookingCountRes = await db.execute(
      'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status = \'booked\'',
      [trip.id]
    );

    if (bookingCountRes.rows[0].count >= 8) {
      await db.execute('UPDATE trips SET status = \'confirmed\' WHERE id = ?', [trip.id]);
      await db.execute(
        'UPDATE bookings SET status = \'confirmed\' WHERE trip_id = ? AND status = \'booked\'',
        [trip.id]
      );

      const bookingsRes = await db.execute(
        'SELECT user_id FROM bookings WHERE trip_id = ? AND status = \'confirmed\'',
        [trip.id]
      );

      const dirLabel = trip.direction === 'to_42' ? 'Point → 42' : '42 → Point';
      for (const b of bookingsRes.rows) {
        await createNotification(
          b.user_id,
          'trip_confirmed',
          'Trip Confirmed! 🚌',
          `Your ${dirLabel} trip (${trip.time_label || ''}) on ${trip.date} is confirmed with 8 or more students and will depart as scheduled.`
        );
      }

      const adminsRes = await db.execute('SELECT id FROM users WHERE role = \'admin\'');
      for (const admin of adminsRes.rows) {
        await createNotification(
          admin.id,
          'trip_confirmed',
          'Trip Confirmed 📋',
          `${dirLabel} trip (${trip.time_label || ''}) on ${trip.date} has been confirmed with ${bookingCountRes.rows[0].count} students.`
        );
      }

      broadcast('trip_update', { trip_id: trip.id, status: 'confirmed' });
      console.log(`✅ Trip ${trip.id} auto-confirmed`);
    }
  }
}

// Remove Point → 42 trips that are still pending within the next 2 hours.
async function removeUnconfirmedTo42Trips(now) {
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const nowStr = getAmmanDateTimeString(now);
  const twoHoursStr = getAmmanDateTimeString(twoHoursLater);

  const pendingTripsRes = await db.execute(
    `
      SELECT id
      FROM trips
      WHERE direction = 'to_42'
      AND status = 'pending'
      AND calculated_departure IS NOT NULL
      AND calculated_departure >= ?
      AND calculated_departure <= ?
    `,
    [nowStr, twoHoursStr]
  );

  for (const trip of pendingTripsRes.rows) {
    await db.execute('DELETE FROM bookings WHERE trip_id = ?', [trip.id]);
    await db.execute('DELETE FROM trips WHERE id = ?', [trip.id]);
    broadcast('trip_update', { trip_id: trip.id, status: 'deleted' });
    console.log(`🗑️ Point → 42 trip ${trip.id} was not confirmed within 2 hours. Removed.`);
  }
}

// Notify all students 1 hour before from_42 departure
async function checkFrom42Notifications(now) {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() + 59 * 60 * 1000);
  const oneHourStr = getAmmanDateTimeString(oneHourLater);
  const windowStartStr = getAmmanDateTimeString(windowStart);

  const from42TripsRes = await db.execute(`
    SELECT t.*, ts.label as time_label 
    FROM trips t 
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.direction = 'from_42' 
    AND t.status = 'confirmed'
    AND t.calculated_departure IS NOT NULL 
    AND t.calculated_departure >= ?
    AND t.calculated_departure <= ?
  `, [windowStartStr, oneHourStr]);

  for (const trip of from42TripsRes.rows) {
    const alreadyNotifiedRes = await db.execute(
      'SELECT id FROM notifications WHERE type = \'broadcast\' AND message LIKE ? AND user_id IS NULL',
      [`%trip ${trip.id}%`]
    );

    if (!alreadyNotifiedRes.rows[0]) {
      await broadcastNotification(
        'broadcast',
        '🚌 Bus Departing 42 Soon!',
        `A bus is departing 42 toward pickup points in about 1 hour (${trip.time_label || ''}). If you want a ride, be ready! (trip ${trip.id})`
      );
      console.log(`📢 Broadcast: from_42 trip ${trip.id} departing in 1 hour`);
    }
  }
}

// Recalculate departure times based on weighted average of bookings
async function recalculateDepartureTimes() {
  const pendingTripsRes = await db.execute(`
    SELECT t.*, ts.hour 
    FROM trips t 
    JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.status = 'pending' AND t.direction = 'to_42'
  `);

  for (const trip of pendingTripsRes.rows) {
    const bookingsRes = await db.execute(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE trip_id = ? AND status IN ('booked', 'confirmed')
    `, [trip.id]);

    if (bookingsRes.rows[0].count > 0) {
      const departure = `${trip.date}T${String(trip.hour).padStart(2, '0')}:00:00+03:00`;
      if (trip.calculated_departure !== departure) {
        await db.execute('UPDATE trips SET calculated_departure = ? WHERE id = ?', [departure, trip.id]);
      }
    }
  }
}
