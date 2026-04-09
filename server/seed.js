import { initializeDatabase } from './db.js';
import db from './db.js';
import bcrypt from 'bcryptjs';
import { getAmmanDateString, getAmmanDate } from './utils/timezone.js';

console.log('🌱 Initialization checking...');
async function testConnection() {
  let retries = 5;
  while (retries > 0) {
    try {
      console.log('📡 Testing connection to Turso...');
      await db.execute('SELECT 1');
      console.log('✅ Connection test successful.');
      return;
    } catch (e) {
      console.error(`❌ Connection test failed (${retries} retries left):`, e.message);
      retries -= 1;
      if (retries === 0) {
        console.error('❌ FATAL: Could not connect to Turso database after multiple attempts. Aborting.');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    }
  }
}
await testConnection();

try {
  console.log('🧹 Pruning previous duplicates to prepare for strict mode...');
  // Only attempt if trips table actually exists yet
  try {
    await db.execute(`
      DELETE FROM trips 
      WHERE id NOT IN (
        SELECT MIN(id) FROM trips GROUP BY direction, date, time_slot_id
      )
    `);
  } catch (err) {
    // Ignore if table doesn't exist on fresh boots
  }

  console.log('🏗️ Building tables with strict unique indexes...');
  await initializeDatabase();
} catch (e) {
  console.error('❌ FATAL ERROR DURING DB INITIALIZATION:', e.message);
  process.exit(1);
}
console.log('🌱 Seeding database...\n');

// Seed actual pickup points (Irbid coordinates matching reality)
const pickupPoints = [
  { name: 'المجمع الشمالي', lat: 32.56802982426975, lng: 35.855675875688576, order_index: 1, eta_minutes: 0 },
  { name: 'الحي الشرقي', lat: 32.55398159822269, lng: 35.867237768419514, order_index: 2, eta_minutes: 8 },
  { name: 'مجمع الشيخ خليل', lat: 32.550117146365146, lng: 35.855572864769265, order_index: 3, eta_minutes: 15 },
  { name: 'مجمع عمان الجديد', lat: 32.5350833459638, lng: 35.86965088164056, order_index: 4, eta_minutes: 22 },
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
  console.log('🔄  Updating existing pickup points with new Arabic locations...');
  for (const point of pickupPoints) {
    await db.execute(`
      UPDATE pickup_points SET name = ?, lat = ?, lng = ? WHERE order_index = ?
    `, [point.name, point.lat, point.lng, point.order_index]);
  }
  console.log('✅ Pickup points fully synced to proper coordinates');
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
