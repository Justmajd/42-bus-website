import db from '../db.js';

const DEFAULT_TTL_MS = Number(process.env.STATIC_CACHE_TTL_MS || 60_000);

function createEntry() {
  return {
    value: null,
    expiresAt: 0,
    inFlight: null,
  };
}

const pickupPointsEntry = createEntry();
const activeTimeSlotsEntry = createEntry();
const allTimeSlotsEntry = createEntry();

async function readThrough(entry, loader, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  if (entry.value && now < entry.expiresAt) {
    return entry.value;
  }

  if (entry.inFlight) {
    return entry.inFlight;
  }

  entry.inFlight = (async () => {
    const rows = await loader();
    entry.value = rows;
    entry.expiresAt = Date.now() + ttlMs;
    entry.inFlight = null;
    return rows;
  })().catch((error) => {
    entry.inFlight = null;
    throw error;
  });

  return entry.inFlight;
}

export async function getCachedPickupPoints() {
  return readThrough(pickupPointsEntry, async () => {
    const result = await db.execute('SELECT * FROM pickup_points ORDER BY order_index');
    return result.rows;
  });
}

export async function isValidPickupPointId(pickupPointId) {
  const points = await getCachedPickupPoints();
  const target = Number(pickupPointId);
  return points.some((point) => Number(point.id) === target);
}

export async function getCachedTimeSlots({ activeOnly = false } = {}) {
  const entry = activeOnly ? activeTimeSlotsEntry : allTimeSlotsEntry;
  return readThrough(entry, async () => {
    const sql = activeOnly
      ? 'SELECT * FROM time_slots WHERE is_active = 1 ORDER BY hour'
      : 'SELECT * FROM time_slots ORDER BY hour';
    const result = await db.execute(sql);
    return result.rows;
  });
}

export function invalidatePickupPointsCache() {
  pickupPointsEntry.value = null;
  pickupPointsEntry.expiresAt = 0;
}

export function invalidateTimeSlotsCache() {
  activeTimeSlotsEntry.value = null;
  activeTimeSlotsEntry.expiresAt = 0;
  allTimeSlotsEntry.value = null;
  allTimeSlotsEntry.expiresAt = 0;
}

export function invalidateStaticConfigCache() {
  invalidatePickupPointsCache();
  invalidateTimeSlotsCache();
}
