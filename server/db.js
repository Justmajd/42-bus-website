import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import fs from 'fs';
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

  if (!cleaned.includes('://')) {
    return `libsql://${cleaned.replace(/^\/+|\/+$/g, '')}`;
  }

  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname) return cleaned;
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

function getLocalDbUrl() {
  const dataDir = path.join(__dirname, 'data');
  const dbFile = path.join(dataDir, 'local.db');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return `file:${dbFile}`;
}

const dbUrl = normalizeTursoUrl(
  process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
);
const authToken = cleanEnvValue(
  process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || ''
);
const remoteUrls = buildCandidateUrls(
  process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
);
const localDbUrl = getLocalDbUrl();
const forceLocalDb = /^(1|true|yes)$/i.test(cleanEnvValue(process.env.FORCE_LOCAL_DB || ''));
const remoteConnectTimeoutMs = Number(process.env.TURSO_CONNECT_TIMEOUT_MS || 3500);

if (dbUrl && !remoteUrls.includes(dbUrl)) {
  remoteUrls.unshift(dbUrl);
}

let activeClient = null;
let clientInitPromise = null;
let usingLocalFallback = false;

async function executeWithTimeout(client, sql, timeoutMs) {
  return await Promise.race([
    client.execute(sql),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function getClient() {
  if (activeClient) {
    return activeClient;
  }

  if (!clientInitPromise) {
    clientInitPromise = (async () => {
      let lastRemoteErr = null;

      if (!forceLocalDb && dbUrl && authToken) {
        for (const url of remoteUrls) {
          try {
            const client = createClient({ url, authToken });
            await executeWithTimeout(client, 'SELECT 1', remoteConnectTimeoutMs);
            activeClient = client;
            usingLocalFallback = false;
            console.log(`[DB] Connected using ${url.replace(/:\/\/.*@/, '://***@')}`);
            return activeClient;
          } catch (err) {
            lastRemoteErr = err;
            const cause = err?.cause?.message || err?.cause || 'no-cause';
            console.error(`[DB CONNECT FAILED] ${url}: ${err.message} | cause: ${cause}`);
          }
        }
      }

      if (forceLocalDb) {
        console.log('[DB] FORCE_LOCAL_DB enabled, skipping Turso connection attempts.');
      }

      try {
        const localClient = createClient({ url: localDbUrl });
        await localClient.execute('SELECT 1');
        activeClient = localClient;
        usingLocalFallback = true;
        console.log(`[DB] Using local fallback database at ${localDbUrl}`);
        return activeClient;
      } catch (fallbackErr) {
        const remoteMessage = lastRemoteErr?.message || 'Unable to connect to Turso with all URL variants.';
        throw new Error(`${remoteMessage} Local fallback also failed: ${fallbackErr.message}`);
      }
    })();
  }

  return clientInitPromise;
}

const db = {
  async execute(sql, args) {
    const client = await getClient();

    if (typeof sql === 'string') {
      if (Array.isArray(args)) {
        return client.execute({ sql, args });
      }
      return client.execute(sql);
    }

    return client.execute(sql);
  },
  async executeMultiple(sql) {
    const client = await getClient();
    return client.executeMultiple(sql);
  }
};

export async function initializeDatabase() {
  await getClient();

  try {
    await db.execute('ALTER TABLE users ADD COLUMN profile_picture TEXT');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN custom_name TEXT');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN custom_lat REAL');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN custom_lng REAL');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN driver_lat REAL');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN driver_lng REAL');
  } catch {
    // Ignore if the column already exists.
  }

  try {
    await db.execute('ALTER TABLE trips ADD COLUMN driver_location_updated_at TEXT');
  } catch {
    // Ignore if the column already exists.
  }

  const usersTableSqlRes = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  );
  const usersTableSql = (usersTableSqlRes.rows[0]?.sql || '').toLowerCase();
  const needsRoleMigration = usersTableSql && !usersTableSql.includes("'driver'");

  if (needsRoleMigration) {
    await db.execute('PRAGMA foreign_keys = OFF');

    try {
      await db.execute('DROP TABLE IF EXISTS users_new');

      await db.executeMultiple(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT DEFAULT 'student' CHECK(role IN ('student', 'driver', 'admin')),
          warnings INTEGER DEFAULT 0,
          banned_until TEXT,
          profile_picture TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, email, password_hash, name, role, warnings, banned_until, profile_picture, created_at)
        SELECT id, email, password_hash, name, role, warnings, banned_until, profile_picture, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    } finally {
      await db.execute('PRAGMA foreign_keys = ON');
    }
  }

  const bookingsTableSqlRes = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bookings'"
  );
  const bookingsTableSql = (bookingsTableSqlRes.rows[0]?.sql || '').toLowerCase();
  const needsBookingsMigration = bookingsTableSql && !bookingsTableSql.includes('waitlisted');

  if (needsBookingsMigration) {
    await db.execute('PRAGMA foreign_keys = OFF');

    try {
      await db.execute('DROP TABLE IF EXISTS bookings_new');

      await db.executeMultiple(`
        CREATE TABLE bookings_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trip_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          pickup_point_id INTEGER NOT NULL,
          status TEXT DEFAULT 'booked' CHECK(status IN ('booked', 'confirmed', 'attended', 'no_show', 'cancelled', 'waitlisted')),
          booked_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (trip_id) REFERENCES trips(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (pickup_point_id) REFERENCES pickup_points(id),
          UNIQUE(trip_id, user_id)
        );
        INSERT INTO bookings_new (id, trip_id, user_id, pickup_point_id, status, booked_at)
        SELECT id, trip_id, user_id, pickup_point_id, status, booked_at FROM bookings;
        DROP TABLE bookings;
        ALTER TABLE bookings_new RENAME TO bookings;
      `);
    } finally {
      await db.execute('PRAGMA foreign_keys = ON');
    }
  }

  await db.execute('UPDATE trips SET seats_total = 15 WHERE seats_total IS NULL OR seats_total > 15');

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'student' CHECK(role IN ('student', 'driver', 'admin')),
      warnings INTEGER DEFAULT 0,
      banned_until TEXT,
      profile_picture TEXT,
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
      seats_total INTEGER DEFAULT 15,
      custom_name TEXT,
      custom_lat REAL,
      custom_lng REAL,
      driver_lat REAL,
      driver_lng REAL,
      driver_location_updated_at TEXT,
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

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS mobile_push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT DEFAULT 'unknown',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
    CREATE INDEX IF NOT EXISTS idx_trips_direction ON trips(direction);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user ON mobile_push_tokens(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_uniqueness ON trips(direction, date, time_slot_id);
  `);
}

export function isUsingLocalFallback() {
  return usingLocalFallback;
}

export default db;
