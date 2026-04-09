import db from './db.js';
import bcrypt from 'bcryptjs';

console.log('🌱 Seeding database...\n');

// Seed pickup points (Irbid area)
const pickupPoints = [
  { name: 'Al-Mal Street', lat: 32.5558, lng: 35.8508, order_index: 1, eta_minutes: 0 },
  { name: 'University Street', lat: 32.5520, lng: 35.8620, order_index: 2, eta_minutes: 8 },
  { name: 'City Center', lat: 32.5500, lng: 35.8450, order_index: 3, eta_minutes: 15 },
  { name: 'Al-Husn Junction', lat: 32.5350, lng: 35.8300, order_index: 4, eta_minutes: 22 },
];

const insertPoint = db.prepare(`
  INSERT OR IGNORE INTO pickup_points (name, lat, lng, order_index, eta_minutes) 
  VALUES (@name, @lat, @lng, @order_index, @eta_minutes)
`);

const existingPoints = db.prepare('SELECT COUNT(*) as count FROM pickup_points').get();
if (existingPoints.count === 0) {
  for (const point of pickupPoints) {
    insertPoint.run(point);
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

const insertSlot = db.prepare(`
  INSERT OR IGNORE INTO time_slots (hour, label, is_active) 
  VALUES (@hour, @label, 1)
`);

const existingSlots = db.prepare('SELECT COUNT(*) as count FROM time_slots').get();
if (existingSlots.count === 0) {
  for (const slot of timeSlots) {
    insertSlot.run(slot);
  }
  console.log('✅ Time slots seeded');
} else {
  console.log('⏭️  Time slots already exist');
}

// Seed admin/driver account
const adminEmail = 'driver@learner.42.tech';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync('driver123', 10);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, role) 
    VALUES (?, ?, ?, 'admin')
  `).run(adminEmail, hash, 'Bus Driver');
  console.log('✅ Admin account seeded (driver@learner.42.tech / driver123)');
} else {
  console.log('⏭️  Admin account already exists');
}

// Seed initial trips for today and tomorrow
const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const slots = db.prepare('SELECT * FROM time_slots WHERE is_active = 1').all();
const existingTrips = db.prepare('SELECT COUNT(*) as count FROM trips').get();

if (existingTrips.count === 0) {
  const insertTrip = db.prepare(`
    INSERT INTO trips (direction, date, time_slot_id, calculated_departure, status)
    VALUES (@direction, @date, @time_slot_id, @calculated_departure, @status)
  `);

  for (const slot of slots) {
    // Tomorrow's to_42 trips
    insertTrip.run({
      direction: 'to_42',
      date: tomorrow,
      time_slot_id: slot.id,
      calculated_departure: `${tomorrow}T${String(slot.hour).padStart(2, '0')}:00:00`,
      status: 'pending'
    });
  }

  // Today's from_42 trips
  for (const slot of slots) {
    insertTrip.run({
      direction: 'from_42',
      date: today,
      time_slot_id: slot.id,
      calculated_departure: `${today}T${String(slot.hour).padStart(2, '0')}:00:00`,
      status: 'pending'
    });
  }

  console.log('✅ Initial trips seeded');
} else {
  console.log('⏭️  Trips already exist');
}

console.log('\n🎉 Seed complete!');
