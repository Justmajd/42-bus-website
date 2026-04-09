import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import bookingRoutes from './routes/bookings.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import { startScheduler } from './services/scheduler.js';
import { generateQRDataUrl } from './utils/qr.js';
import { authenticateToken, requireAdmin } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// QR code endpoint
app.get('/api/qr/:tripId', authenticateToken, requireAdmin, async (req, res) => {
  const { default: db } = await import('./db.js');
  const trip = db.prepare('SELECT qr_token FROM trips WHERE id = ? AND status = \'started\'').get(req.params.tripId);
  
  if (!trip || !trip.qr_token) {
    return res.status(404).json({ error: 'No QR code available. Trip must be started first.' });
  }

  const qrDataUrl = await generateQRDataUrl(trip.qr_token);
  if (!qrDataUrl) {
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }

  res.json({ qr_data_url: qrDataUrl, qr_token: trip.qr_token });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚌 42 Bus Booking API running at http://0.0.0.0:${PORT}`);
  console.log(`📡 SSE stream at http://0.0.0.0:${PORT}/api/notifications/stream`);
  startScheduler();
});
