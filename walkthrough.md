# 42 Bus Website Walkthrough

## 1. What This Website Is
The project is a role-based bus booking platform for the 42 community with three main user roles:
- Student: books trips, manages personal profile, joins waitlist, scans trip QR for attendance.
- Driver: confirms/starts/completes trips, views riders and pickup points, handles live trip operations.
- Admin: monitors analytics, manages users, and sends announcements/notifications.

It is a full-stack app with a React frontend and an Express backend using Turso (libSQL) as the database.

## 2. Core Technology Stack
### Frontend
- React 19: UI and state-driven pages.
- React Router DOM 7: role-based routing and protected pages.
- Vite 6: build/dev tooling.
- Context API: authentication and notifications state.
- Leaflet + React Leaflet: pickup point maps.
- Lucide React: icons.

### Backend
- Node.js + Express 5: REST API and server runtime.
- @libsql/client: Turso database client.
- jsonwebtoken: auth tokens (JWT).
- bcryptjs: password hashing.
- node-cron: scheduler for automation jobs.
- web-push + service worker: browser push notifications.
- qrcode: trip QR generation.

## 3. High-Level Architecture
### Frontend App Shell
- Entry and routes are in src/App.jsx.
- Auth state is managed in src/contexts/AuthContext.jsx.
- Notification state and real-time channels are in src/contexts/NotificationContext.jsx.
- The navbar is global and role-aware in src/components/Navbar.jsx.

### Backend API
- Main server setup is in server/index.js.
- API route groups:
  - /api/auth
  - /api/trips
  - /api/bookings
  - /api/driver
  - /api/admin
  - /api/notifications
- DB initialization and migrations happen at startup in server/db.js.

### Data and Migrations
- The backend auto-creates and migrates tables on startup.
- Key tables: users, trips, bookings, notifications, push_subscriptions, pickup_points, time_slots.

## 4. Main Product Flows
### 4.1 Authentication
Feature:
- Register with email/password/name (restricted to @learner.42.tech).
- Login with JWT.
- Persist login in localStorage.

Technology:
- Backend: server/routes/auth.js + JWT + bcryptjs.
- Frontend: src/contexts/AuthContext.jsx.

Behavior:
- Token expires in 7 days.
- Role in token controls route access.

### 4.2 Student Booking Flow
Feature:
- View available trips by direction.
- Select pickup point and book.
- One active booking per day rule.
- 2-hour cutoff for to_42 booking/cancel.
- Profile picture required before booking.

Technology:
- Backend logic: server/routes/bookings.js.
- Frontend UI: src/pages/StudentDashboard.jsx.
- Realtime seat updates via SSE from notifications context.

### 4.3 Waitlist Auto-Fill
Feature:
- If trip is full, booking creates waitlisted status.
- If a booked seat is canceled, oldest waitlisted booking is promoted automatically.
- Promoted student receives notification.

Technology:
- Booking status model in bookings table (waitlisted status).
- Promotion logic in server/routes/bookings.js.
- Notification delivery via server/services/notifier.js.

### 4.4 Driver Operations
Feature:
- See trips and apply filters.
- Confirm trip, start trip, complete trip.
- On start, QR token/code is generated.
- Students scan QR to mark attendance.
- Completion marks no-shows and increments warnings.

Technology:
- Driver routes: server/routes/driver.js.
- QR endpoint: /api/qr/:tripId.
- Driver pages: src/pages/DriverDashboard.jsx and src/pages/DriverTripDetail.jsx.

### 4.5 Trip Lifecycle Automation
Feature:
- Auto-confirm pending trips when seats reach threshold and departure window rules are met.
- Delete trips that expire without starting.
- Complete started trips after expiry window.
- Auto-generate next-day replacement trips.

Technology:
- Scheduled jobs in server/services/scheduler.js.
- node-cron runs checks every minute.

### 4.6 Admin Control Center Features
Feature:
- Analytics cards (started/completed/pending/confirmed, active bookings, banned students).
- Popular timings and pickup trends.
- Full user management (CRUD, role update, block/unblock, reset password, photo updates).
- Send test notification to all users.
- Send custom notification to all users.

Technology:
- Admin routes: server/routes/admin.js.
- Admin pages: src/pages/AdminDashboard.jsx and src/pages/AdminUserManagement.jsx.

### 4.7 Notification System
Feature:
- In-app notifications list with unread tracking.
- Read one, read all, clear read.
- Browser notification enable/disable toggle.
- Push delivery (including when tab is closed).

Technology Layers:
- Persistent storage: notifications table in DB.
- Real-time stream: SSE endpoint /api/notifications/stream.
- Push channel: web-push + service worker at public/sw.js.
- Client orchestration: src/contexts/NotificationContext.jsx and src/components/NotificationBell.jsx.

Important note:
- Browser permission cannot be force-revoked by the app, but the app-level disable toggle unsubscribes push and suppresses app-triggered browser notifications.

## 5. Role-Based Access Model
- Protected routes are enforced in frontend (ProtectedRoute) and backend middleware.
- Middleware in server/middleware/auth.js provides:
  - authenticateToken
  - requireAdmin
  - requireDriver
- Backend remains source of truth for access control.

## 6. Time and Scheduling Behavior
- Jordan/Amman timezone helpers are used to normalize server-side trip timing logic.
- UI time labels are formatted to AM/PM display in student/driver/admin views via src/utils/timeFormat.js.

## 7. Scripts and Runtime
From package.json:
- npm run dev: frontend dev server.
- npm run dev:server: backend API server.
- npm run dev:all: run both frontend and backend concurrently.
- npm run build: production frontend build.
- npm start: start backend server (serves API + built frontend).
- npm run seed: initialize/seed baseline data.

## 8. Push Notification Setup Requirements
Environment variables needed on backend:
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT (mailto:contact@example.com)

How it works:
- Frontend asks permission and registers service worker.
- Subscription is saved in push_subscriptions.
- Notification creation sends to SSE and Web Push.

## 9. Database Entities (Simplified)
- users: identity, role, warnings, ban state, profile picture.
- trips: direction/date/time slot/status/seat capacity/QR token.
- bookings: trip-to-user reservation and state machine (booked/confirmed/attended/no_show/cancelled/waitlisted).
- notifications: persistent per-user/global alerts and read state.
- push_subscriptions: per-user browser push endpoints/keys.
- pickup_points/time_slots: operational configuration.

## 10. Feature-to-Technology Map (Quick Reference)
- Auth and session: JWT + bcryptjs + AuthContext.
- Booking and waitlist: Express booking routes + Turso SQL state transitions.
- Driver QR attendance: UUID token + qrcode + scanner frontend.
- Realtime in-app updates: Server-Sent Events (EventSource).
- Closed-tab alerts: Web Push + service worker + VAPID.
- Admin analytics and management: SQL aggregates + admin routes + React admin pages.
- Auto operations: node-cron scheduler jobs.
- Maps and pickup visualization: Leaflet/react-leaflet.

## 11. Current Product Strengths
- End-to-end role-based workflow (student/driver/admin).
- Realtime operational updates and push alerts.
- Automated trip lifecycle and policy enforcement.
- Waitlist auto-fill with automatic user promotion notifications.
- Rich admin controls with user management and broadcasts.

## 12. Good Next Improvements
- Targeted notifications by role or route segment.
- Driver live GPS tracking with ETA prediction.
- Notification preference granularity (trip alerts vs admin announcements).
- Reporting/export for operations history.
