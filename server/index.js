import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import path from 'path';

import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import bookingRoutes from './routes/bookings.js';
import driverRoutes from './routes/driver.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import { startScheduler } from './services/scheduler.js';
import { generateQRDataUrl } from './utils/qr.js';
import { authenticateToken, requireDriver } from './middleware/auth.js';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.disable('x-powered-by');
app.use(cors());
app.use(compression({ threshold: 1024 }));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.json({ ok: true, status: 'healthy' });
  } catch (err) {
    console.error('[HEALTH ERROR]', err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || 'Database check failed' });
  }
});

// QR code endpoint
app.get('/api/qr/:tripId', authenticateToken, requireDriver, async (req, res) => {
  const result = await db.execute('SELECT qr_token FROM trips WHERE id = ? AND status = \'started\'', [req.params.tripId]);
  const trip = result.rows[0];
  
  if (!trip || !trip.qr_token) {
    return res.status(404).json({ error: 'No QR code available. Trip must be started first.' });
  }

  const qrDataUrl = await generateQRDataUrl(trip.qr_token);
  if (!qrDataUrl) {
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }

  res.json({ qr_data_url: qrDataUrl, qr_token: trip.qr_token });
});

// Serve frontend in production environments
app.use(express.static(path.join(__dirname, '../dist')));

// Return JSON for API errors instead of HTML error pages.
app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next(err);
  }

  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  console.error('[API ERROR]', req.method, req.path, message);
  res.status(status).json({ error: message });
});

// Fallback all unhandled routes to React's index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
import { initializeDatabase } from './db.js';

initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n42 Bus API running at http://0.0.0.0:${PORT}`);
    console.log(`SSE stream at http://0.0.0.0:${PORT}/api/notifications/stream`);
    startScheduler();
  });
}).catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
