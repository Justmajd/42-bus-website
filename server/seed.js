import { initializeDatabase } from './db.js';
import db from './db.js';
import bcrypt from 'bcryptjs';
import { getAmmanDateString, getAmmanDate } from './utils/timezone.js';

console.log('🌱 Initialization checking...');
try {
  await initializeDatabase();
} catch (e) {
  console.error('FATAL ERROR DURING DB INITIALIZATION:', e);
  process.exit(1);
}
console.log('🌱 Seeding database...\n');

// Seed pickup points (Irbid area)
const pickupPoints = [
  { name: 'Al-Mal Street', lat: 32.5558, lng: 35.8508, order_index: 1, eta_minutes: 0 },
  { name: 'University Street', lat: 32.5520, lng: 35.8620, order_index: 2, eta_minutes: 8 },
  { name: 'City Center', lat: 32.5500, lng: 35.8450, order_index: 3, eta_minutes: 15 },
  { name: 'Al-Husn Junction', lat: 32.5350, lng: 35.8300, order_index: 4, eta_minutes: 22 },
];

const existingPointsRes = await db.execute('SELECT COUNT(*) as count FROM pickup_points');
if (existingPointsRes.rows[0].count === 0) {
  for (const point of pickupPoints) {
    await db.execute(`
      INSERT INTO pickup_points (name, lat, lng, order_index, eta_minutes) 
      VALUES (?, ?, ?, ?, ?)
    `, [point.name, point.lat, point.lng, point.order_index, point.eta_minutes]);
  }
  console.log('✅ Pickup points seeded');
} else {
  console.log('⏭️  Pickup points already exist');
}

// Seed time slots (9 AM to 3 PM)
const timeSlots = [
  { hour: 9, label: '9:00 - 10:00' },
  { hour: 10, label: '10:00 - 11:00' },
  { hour: 11, label: '11:00 - 12:00' },
  { hour: 12, label: '12:00 - 1:00' },
  { hour: 13, label: '1:00 - 2:00' },
  { hour: 14, label: '2:00 - 3:00' },
];

const existingSlotsRes = await db.execute('SELECT COUNT(*) as count FROM time_slots');
if (existingSlotsRes.rows[0].count === 0) {
  for (const slot of timeSlots) {
    await db.execute(`
      INSERT INTO time_slots (hour, label, is_active) 
      VALUES (?, ?, 1)
    `, [slot.hour, slot.label]);
  }
  console.log('✅ Time slots seeded');
} else {
  console.log('⏭️  Time slots already exist');
}

// Seed admin/driver account
const adminEmail = 'driver@learner.42.tech';
const existingAdminRes = await db.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);
if (!existingAdminRes.rows[0]) {
  const hash = bcrypt.hashSync('driver123', 10);
  await db.execute(`
    INSERT INTO users (email, password_hash, name, role) 
    VALUES (?, ?, ?, 'admin')
  `, [adminEmail, hash, 'Bus Driver']);
  console.log('✅ Admin account seeded (driver@learner.42.tech / driver123)');
} else {
  console.log('⏭️  Admin account already exists');
}

// Seed initial trips for today and tomorrow using Amman logic
const todayStr = getAmmanDateString();
const tomorrow = getAmmanDate();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

const slotsRes = await db.execute('SELECT * FROM time_slots WHERE is_active = 1');
const slots = slotsRes.rows;
const existingTripsRes = await db.execute('SELECT COUNT(*) as count FROM trips');

if (existingTripsRes.rows[0].count === 0) {
  for (const slot of slots) {
    // Tomorrow's to_42 trips
    await db.execute(`
      INSERT INTO trips (direction, date, time_slot_id, calculated_departure, status)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'to_42', 
      tomorrowStr, 
      slot.id, 
      `${tomorrowStr}T${String(slot.hour).padStart(2, '0')}:00:00+03:00`, 
      'pending'
    ]);
  }

  // Today's from_42 trips
  for (const slot of slots) {
    await db.execute(`
      INSERT INTO trips (direction, date, time_slot_id, calculated_departure, status)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'from_42', 
      todayStr, 
      slot.id, 
      `${todayStr}T${String(slot.hour).padStart(2, '0')}:00:00+03:00`, 
      'pending'
    ]);
  }

  console.log('✅ Initial trips seeded');
} else {
  console.log('⏭️  Trips already exist');
}

console.log('\n🎉 Seed complete!');
process.exit(0);
