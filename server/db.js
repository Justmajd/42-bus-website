import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

function cleanEnvValue(value = '') {
  return String(value).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function normalizeTursoUrl(rawUrl) {
  const cleaned = cleanEnvValue(rawUrl);
  if (!cleaned) return '';

  // Accept protocol-less hostnames and normalize to libsql://
  if (!cleaned.includes('://')) {
    return `libsql://${cleaned.replace(/^\/+|\/+$/g, '')}`;
  }

  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname) return cleaned;

    // Turso/libsql remote URLs should target the DB host. Drop paths that can cause 400s.
    return `libsql://${parsed.host}`;
  } catch {
    return cleaned;
  }
}

function buildCandidateUrls(rawUrl) {
  const cleaned = cleanEnvValue(rawUrl);
  if (!cleaned) return [];

  const urls = [];

  const pushUnique = (value) => {
    if (value && !urls.includes(value)) {
      urls.push(value);
    }
  };

  const addGlobalTursoFallback = (host) => {
    // Render sometimes fails resolving regional Turso hosts; try global host form too.
    const regional = host.match(/^(.*)\.aws-[^.]+\.turso\.io$/);
    if (!regional) return;
    const baseHost = `${regional[1]}.turso.io`;
    pushUnique(`libsql://${baseHost}`);
    pushUnique(`https://${baseHost}`);
  };

  if (!cleaned.includes('://')) {
    const host = cleaned.replace(/^\/+|\/+$/g, '');
    pushUnique(`libsql://${host}`);
    pushUnique(`https://${host}`);
    addGlobalTursoFallback(host);
    return urls;
  }

  try {
    const parsed = new URL(cleaned);
    const host = parsed.host;
    if (!host) return [cleaned];

    pushUnique(cleaned);
    pushUnique(`libsql://${host}`);
    pushUnique(`https://${host}`);
    addGlobalTursoFallback(host);
    return urls;
  } catch {
    return [cleaned];
  }
}

const dbUrl = normalizeTursoUrl(
  process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
);
const authToken = cleanEnvValue(
  process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || ''
);

const candidateUrls = buildCandidateUrls(
  process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
);
if (dbUrl && !candidateUrls.includes(dbUrl)) {
  candidateUrls.unshift(dbUrl);
}

let dbInitError = null;
let activeClient = null;
let clientInitPromise = null;

if (!dbUrl || !authToken) {
  const missing = [];
  if (!dbUrl) missing.push('TURSO_DATABASE_URL');
  if (!authToken) missing.push('TURSO_AUTH_TOKEN');
  dbInitError = new Error(`Missing required Turso environment variable(s): ${missing.join(', ')}`);
  console.error('[DB CONFIG ERROR]', dbInitError.message);
}

async function getClient() {
  if (dbInitError) {
    throw dbInitError;
  }

  if (activeClient) {
    return activeClient;
  }

  if (!clientInitPromise) {
    clientInitPromise = (async () => {
      let lastErr = null;

      for (const url of candidateUrls) {
        try {
          const client = createClient({ url, authToken });
          await client.execute('SELECT 1');
          activeClient = client;
          console.log(`[DB] Connected using ${url.replace(/:\/\/.*@/, '://***@')}`);
          return activeClient;
        } catch (err) {
          lastErr = err;
          const cause = err?.cause?.message || err?.cause || 'no-cause';
          console.error(`[DB CONNECT FAILED] ${url}: ${err.message} | cause: ${cause}`);
        }
      }

      throw new Error(lastErr?.message || 'Unable to connect to Turso with all URL variants.');
    })();
  }

  try {
    return await clientInitPromise;
  } catch (err) {
    dbInitError = err;
    throw err;
  }
}

const db = {
  async execute(sql, args) {
    const client = await getClient();
    return client.execute(sql, args);
  },
  async executeMultiple(sql) {
    const client = await getClient();
    return client.executeMultiple(sql);
  }
};

// Create tables async
export async function initializeDatabase() {
  if (dbInitError) {
    throw dbInitError;
  }

  await getClient();

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
