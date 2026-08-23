# Architecture notes

This document is a short maintenance reference for the 42 Bus application. It describes the boundaries between the client, API, and database without duplicating the implementation.

## Request flow

1. The React client resolves the API origin in `src/api.js`.
2. Login returns a JWT. The token is stored in local storage and sent with protected requests.
3. `ProtectedRoute` handles client-side navigation, while `server/middleware/auth.js` enforces access on the API.
4. Express route modules read and write through the shared database client in `server/db.js`.
5. Booking and trip changes are published through Server-Sent Events. Push services handle notifications when the app is not open.

## Client areas

- `src/App.jsx` contains the route tree and application providers.
- `src/pages/` contains the student, driver, and admin workflows.
- `src/components/` contains UI used by more than one page, including maps, QR scanning, notifications, and confirmation dialogs.
- `src/contexts/AuthContext.jsx` owns the current user, token, login, registration, and logout behavior.
- `src/contexts/NotificationContext.jsx` owns the notification list, SSE connection, and push registration.
- `src/utils/timezone.js` and `src/utils/timeFormat.js` keep Amman date and time handling consistent.

## API areas

| Route group | Responsibility |
| --- | --- |
| `/api/auth` | Registration, login, current-user data, and profile pictures. |
| `/api/trips` | Student trip lists and pickup-point configuration. |
| `/api/bookings` | Reservations, cancellations, waitlists, and attendance. |
| `/api/driver` | Driver trip lists, status changes, custom trips, and location updates. |
| `/api/admin` | Analytics, user administration, custom trip administration, and broadcasts. |
| `/api/notifications` | Notification history, SSE, and browser/native push registration. |

The API also exposes `/api/health` for a database connectivity check and `/api/qr/:tripId` for a driver’s active attendance QR code.

## Data model

The database is initialized on startup and currently uses these main tables:

- `users`: account identity, role, warnings, ban state, and profile picture.
- `pickup_points`: named pickup locations with coordinates and ETA values.
- `time_slots`: reusable schedule slots.
- `trips`: direction, date, status, capacity, optional custom location, and live driver location.
- `bookings`: the relationship between a user and a trip, including waitlist and attendance states.
- `notifications`: persistent user or broadcast notifications.
- `push_subscriptions` and `mobile_push_tokens`: delivery endpoints for background notifications.

The server first attempts a configured remote libSQL database. If no remote credentials are available, it creates `server/data/local.db`. Local database files are generated artifacts and are ignored by Git.

## Trip lifecycle

Trips move through `pending`, `confirmed`, `started`, and `completed` states. The scheduler checks lifecycle rules every minute, including confirmation thresholds, expiry, completion, and next-day trip generation. A started trip receives a QR token; a student with an active booking can scan that token to become `attended`.

## Notifications

Notifications are written to the database first. Connected clients receive updates over the SSE stream. Browser Web Push and native Firebase delivery are optional layers that use the same notification events. The service worker is kept in `public/sw.js` so Vite and Capacitor can package it with the web assets.

## Change guidelines

- Keep API authorization in the backend even when a page is protected in the client.
- Use the shared time helpers for dates shown to users or used in scheduling rules.
- Prefer existing UI classes in `src/index.css` over new inline visual styles.
- Keep generated output, local data, and machine-specific build products out of source folders.
- Verify a frontend change with `npm run build`; verify database changes against a local database before deploying them.
