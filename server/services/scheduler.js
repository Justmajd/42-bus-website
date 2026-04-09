import cron from 'node-cron';
import db from '../db.js';
import { createNotification, broadcastNotification, broadcast } from './notifier.js';
import { v4 as uuidv4 } from 'uuid';

export function startScheduler() {
  console.log('⏰ Scheduler started');

  // Run every minute
  cron.schedule('* * * * *', () => {
    const now = new Date();
    checkTripConfirmations(now);
    checkFrom42Notifications(now);
    recalculateDepartureTimes();
  });
}

// Auto-confirm trips 2 hours before departure
function checkTripConfirmations(now) {
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const twoHoursStr = twoHoursLater.toISOString();

  // Find pending trips departing within 2 hours
  const pendingTrips = db.prepare(`
    SELECT t.*, ts.label as time_label 
    FROM trips t 
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.status = 'pending' 
    AND t.calculated_departure IS NOT NULL 
    AND t.calculated_departure <= ?
  `).all(twoHoursStr);

  for (const trip of pendingTrips) {
    // Check if trip has any bookings
    const bookingCount = db.prepare(
      'SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND status = \'booked\''
    ).get(trip.id);

    if (bookingCount.count > 0) {
      // Confirm the trip
      db.prepare('UPDATE trips SET status = \'confirmed\' WHERE id = ?').run(trip.id);
      db.prepare(
        'UPDATE bookings SET status = \'confirmed\' WHERE trip_id = ? AND status = \'booked\''
      ).run(trip.id);

      // Notify all booked students
      const bookings = db.prepare(
        'SELECT user_id FROM bookings WHERE trip_id = ? AND status = \'confirmed\''
      ).all(trip.id);

      const dirLabel = trip.direction === 'to_42' ? 'Point → 42' : '42 → Point';
      for (const b of bookings) {
        createNotification(
          b.user_id,
          'trip_confirmed',
          'Trip Confirmed! 🚌',
          `Your ${dirLabel} trip (${trip.time_label || ''}) on ${trip.date} is confirmed and departing in about 2 hours.`
        );
      }

      // Notify driver
      const admins = db.prepare('SELECT id FROM users WHERE role = \'admin\'').all();
      for (const admin of admins) {
        createNotification(
          admin.id,
          'trip_confirmed',
          'Trip Confirmed 📋',
          `${dirLabel} trip (${trip.time_label || ''}) on ${trip.date} has been confirmed with ${bookingCount.count} students.`
        );
      }

      broadcast('trip_update', { trip_id: trip.id, status: 'confirmed' });
      console.log(`✅ Trip ${trip.id} auto-confirmed`);
    }
  }
}

// Notify all students 1 hour before from_42 departure
function checkFrom42Notifications(now) {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() + 59 * 60 * 1000);
  const oneHourStr = oneHourLater.toISOString();
  const windowStartStr = windowStart.toISOString();

  // Find from_42 trips departing in ~1 hour that haven't been notified yet
  const from42Trips = db.prepare(`
    SELECT t.*, ts.label as time_label 
    FROM trips t 
    LEFT JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.direction = 'from_42' 
    AND t.status IN ('pending', 'confirmed')
    AND t.calculated_departure IS NOT NULL 
    AND t.calculated_departure >= ?
    AND t.calculated_departure <= ?
  `).all(windowStartStr, oneHourStr);

  for (const trip of from42Trips) {
    // Check if we already sent this broadcast
    const alreadyNotified = db.prepare(
      'SELECT id FROM notifications WHERE type = \'broadcast\' AND message LIKE ? AND user_id IS NULL'
    ).get(`%trip ${trip.id}%`);

    if (!alreadyNotified) {
      broadcastNotification(
        'broadcast',
        '🚌 Bus Departing 42 Soon!',
        `A bus is departing 42 toward pickup points in about 1 hour (${trip.time_label || ''}). If you want a ride, be ready! (trip ${trip.id})`
      );
      console.log(`📢 Broadcast: from_42 trip ${trip.id} departing in 1 hour`);
    }
  }
}

// Recalculate departure times based on weighted average of bookings
function recalculateDepartureTimes() {
  const pendingTrips = db.prepare(`
    SELECT t.*, ts.hour 
    FROM trips t 
    JOIN time_slots ts ON t.time_slot_id = ts.id
    WHERE t.status = 'pending' AND t.direction = 'to_42'
  `).all();

  for (const trip of pendingTrips) {
    const bookings = db.prepare(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE trip_id = ? AND status IN ('booked', 'confirmed')
    `).get(trip.id);

    if (bookings.count > 0) {
      // For now, use the slot's hour as base departure
      // The weighted average is calculated when multiple slots exist
      const departure = `${trip.date}T${String(trip.hour).padStart(2, '0')}:00:00`;
      if (trip.calculated_departure !== departure) {
        db.prepare('UPDATE trips SET calculated_departure = ? WHERE id = ?').run(departure, trip.id);
      }
    }
  }
}
