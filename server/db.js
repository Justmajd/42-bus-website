import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

let dbUrl = process.env.TURSO_DATABASE_URL || '';
// Force native protocol which natively bypasses HTTP routing 400 errors
if (dbUrl.startsWith('https://')) {
  dbUrl = dbUrl.replace('https://', 'libsql://');
}

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Create tables async
export async function initializeDatabase() {
  await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK(role IN ('student', 'admin')),
    warnings INTEGER DEFAULT 0,
    banned_until TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pickup_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    order_index INTEGER DEFAULT 0,
    eta_minutes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour INTEGER NOT NULL UNIQUE,
    label TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK(direction IN ('to_42', 'from_42')),
    date TEXT NOT NULL,
    time_slot_id INTEGER,
    calculated_departure TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'started', 'completed')),
    qr_token TEXT,
    seats_total INTEGER DEFAULT 25,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    pickup_point_id INTEGER NOT NULL,
    status TEXT DEFAULT 'booked' CHECK(status IN ('booked', 'confirmed', 'attended', 'no_show', 'cancelled')),
    booked_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id),
    UNIQUE(trip_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
  CREATE INDEX IF NOT EXISTS idx_trips_direction ON trips(direction);
  CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_uniqueness ON trips(direction, date, time_slot_id);
  `);
}

export default db;
