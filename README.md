# 42 Bus

42 Bus is the campus shuttle booking system for the 42 Irbid community. Students reserve seats and confirm attendance, drivers manage trips and passenger lists, and administrators manage schedules, users, and announcements.

The project contains a React web application, an Express API, a libSQL/SQLite data layer, and Capacitor projects for Android and iOS.

## Features

- Student booking, cancellation, waitlists, booking history, and profile management.
- Pickup-point selection with ETA information and map views.
- Live trip status and driver location updates.
- QR-code attendance for active trips.
- Browser and native push notification support.
- Driver trip controls, passenger lists, and attendance tracking.
- Admin analytics, user management, custom trips, and broadcast notifications.

## Stack

- React 19, React Router, Vite, and Lucide React.
- Express 5, JWT, bcryptjs, and Server-Sent Events.
- libSQL through `@libsql/client`; local SQLite is used as a fallback.
- Leaflet and React Leaflet for maps.
- Capacitor for Android and iOS builds.
- Railway configuration is included for a single-host production deployment.

## Requirements

- Node.js 18 or newer.
- npm.
- Android Studio for Android builds.
- Xcode on macOS for iOS builds.

## Local setup

```bash
git clone <repository-url>
cd 42-bus-website
npm install
cp .env.example .env
npm run seed
```

The API falls back to `server/data/local.db` when Turso variables are not set. The local database is generated at runtime and is intentionally not committed. To force local SQLite even when remote variables exist, set `FORCE_LOCAL_DB=1` in `.env`.

### Development commands

```bash
npm run dev          # Vite frontend at http://localhost:5173
npm run dev:server  # Express API at http://localhost:3001
npm run dev:all     # Run both processes
npm run build       # Create a production frontend build
npm run preview     # Preview the production build
```

When the frontend and API run separately, Vite proxies `/api` requests to `http://localhost:3001`. Native builds need an API origin in `VITE_API_URL`, `VITE_ANDROID_API_URL`, or `VITE_IOS_API_URL`.

## Environment variables

Copy `.env.example` to `.env` and set only the values needed for the environment.

| Variable | Used for |
| --- | --- |
| `TURSO_DATABASE_URL` | Remote libSQL database URL. |
| `TURSO_AUTH_TOKEN` | Remote database authentication. |
| `JWT_SECRET` | Signing login tokens. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push notifications. |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Native push notifications. |
| `VITE_API_URL` | API origin for web and native builds. |
| `VITE_ANDROID_API_URL` / `VITE_IOS_API_URL` | Optional native platform overrides. |
| `VITE_ENABLE_NATIVE_PUSH` | Enables native push registration when set to `true`. |
| `PORT` | Express port; Railway supplies this in production. |

Do not commit `.env` files containing credentials or private keys.

## Repository layout

```text
src/
  components/       Shared UI, maps, QR scanning, and route guards
  contexts/         Authentication and notification state
  hooks/            Reusable client-side behavior
  pages/            Role-specific screens
  utils/            Time and timezone helpers
  App.jsx           Route tree and application shell
server/
  routes/           API route groups
  services/         Scheduling, caching, and notification services
  middleware/       Authentication and role checks
  utils/            Server-side helpers
  db.js             Database connection and schema migrations
  seed.js           Local and remote seed data
public/              Service worker and static brand assets
android/             Capacitor Android project
ios/                 Capacitor iOS project
docs/                Architecture and maintenance notes
```

The database directory, native build output, archives, and export packages are ignored. Only source assets and native project configuration belong in the repository.

## Application architecture

Authentication is held in `src/contexts/AuthContext.jsx`. Notification state and the SSE connection live in `src/contexts/NotificationContext.jsx`. Routes are defined in `src/App.jsx`, while the API is grouped under `/api/auth`, `/api/trips`, `/api/bookings`, `/api/driver`, `/api/admin`, and `/api/notifications`.

The server initializes and migrates the schema in `server/db.js`. Scheduled trip lifecycle work runs from `server/services/scheduler.js`. See [docs/architecture.md](docs/architecture.md) for the main product flows and data model.

## Mobile builds

Build the web bundle and sync it into the Capacitor projects:

```bash
npm run cap:sync
```

Then open the native project in Android Studio or Xcode:

```bash
npm run cap:open:android
npm run cap:open:ios
```

`build-apps.sh` is provided for a complete native export on a machine with the required SDKs installed.

## Deployment

Railway uses the configuration in `railway.json`:

- Build: `npm run build`
- Start: `npm start`

Set the production environment variables in Railway before deploying. The Express server serves `dist/` after the frontend build completes.

## Maintenance

- Run `npm run build` before shipping frontend changes.
- Run `npm run seed` only when you intentionally want to initialize or refresh seed data.
- Keep generated databases, archives, APKs, IPAs, and local environment files out of commits.
- Keep role and authorization checks in the backend as the source of truth.
