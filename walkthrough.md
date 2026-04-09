# 42 Bus Booking — Build Walkthrough

## What Was Built

A complete full-stack student bus booking system for 42 School, built from scratch in `/Users/justmajd/Documents/42 bus website/`.

---

## Screenshots

````carousel
![Login page with glassmorphism design](/Users/justmajd/.gemini/antigravity/brain/5432c655-ce65-4f43-966d-9bc67e43fe0c/login_page.png)
<!-- slide -->
![Registration with domain validation](/Users/justmajd/.gemini/antigravity/brain/5432c655-ce65-4f43-966d-9bc67e43fe0c/register_page.png)
<!-- slide -->
![Student dashboard with trip booking](/Users/justmajd/.gemini/antigravity/brain/5432c655-ce65-4f43-966d-9bc67e43fe0c/student_dashboard.png)
<!-- slide -->
![Dashboard after booking a ride](/Users/justmajd/.gemini/antigravity/brain/5432c655-ce65-4f43-966d-9bc67e43fe0c/dashboard_booked.png)
<!-- slide -->
![Admin driver dashboard with trip management](/Users/justmajd/.gemini/antigravity/brain/5432c655-ce65-4f43-966d-9bc67e43fe0c/admin_dashboard.png)
````

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 6 |
| Backend | Express.js 5 |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + bcryptjs |
| Real-time | Server-Sent Events (SSE) |
| QR | qrcode (generate) + html5-qrcode (scan) |
| Maps | Leaflet.js + react-leaflet |
| Scheduling | node-cron |
| Styling | Vanilla CSS (premium dark theme) |

---

## Features Implemented

### ✅ Authentication
- Email/password registration with `@learner.42.tech` domain validation
- JWT-based authentication (7-day tokens)
- Auto-login on page refresh
- Role-based access (student/admin)

### ✅ Booking System (Two Directions)
- **Point → 42**: Tomorrow's trips with 2-hour cutoff, auto-generated when trips complete
- **42 → Point**: Available anytime, no time restriction
- 6 time slots (9 AM – 3 PM), 25-seat capacity per trip
- 4 predefined pickup points with ETA display
- Real-time seat availability tracking

### ✅ Trip Status Lifecycle
- `Pending → Confirmed → Started → Completed`
- Auto-confirmation 2 hours before departure (via cron)
- No-show detection on trip completion

### ✅ Cancellation & No-Show Policy
- Cancel anytime before 2-hour cutoff (Point → 42)
- Cancel anytime for 42 → Point
- No-show → warning (3 warnings = 2-day ban)

### ✅ QR Attendance System
- Auto-generated unique QR code when trip status = Started
- Students scan via camera on Profile page
- Server-side verification: correct student + correct trip + started status

### ✅ Real-Time (SSE)
- Live seat count updates across clients
- Trip status change broadcasts
- Notification delivery via SSE events
- Auto-reconnection on disconnect

### ✅ Notifications
- Trip confirmation notifications to students + driver
- 1-hour broadcast to ALL students before 42→Point departure
- Warning/ban notifications
- Unread badge + notification panel

### ✅ Admin / Driver Panel
- Dashboard with trip stats (pending/confirmed/started/total students)
- Filter by status + date
- Trip detail page with:
  - QR code display (when started)
  - Pickup point breakdown (4 cards with student counts)
  - Interactive dark-themed Leaflet map with numbered markers
  - Student list with attendance status

### ✅ UI Design
- Premium dark glassmorphism theme
- Inter font from Google Fonts
- Smooth animations and transitions
- Mobile-first responsive layout
- Custom scrollbar styling

---

## Project Structure

```
42 bus website/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── public/bus-icon.svg
├── server/
│   ├── index.js          # Express server entry
│   ├── db.js             # SQLite schema
│   ├── seed.js           # Database seeder
│   ├── middleware/auth.js # JWT middleware
│   ├── routes/
│   │   ├── auth.js       # Register/Login
│   │   ├── trips.js      # Trip listing
│   │   ├── bookings.js   # Create/cancel/attend
│   │   ├── admin.js      # Driver panel
│   │   └── notifications.js # SSE + notifications
│   ├── services/
│   │   ├── notifier.js   # SSE broadcast engine
│   │   └── scheduler.js  # Cron jobs
│   └── utils/qr.js       # QR code generation
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css          # Full design system
    ├── contexts/
    │   ├── AuthContext.jsx
    │   └── NotificationContext.jsx
    ├── components/
    │   ├── Navbar.jsx
    │   ├── ProtectedRoute.jsx
    │   ├── NotificationBell.jsx
    │   ├── MapView.jsx
    │   └── QRScanner.jsx
    └── pages/
        ├── Login.jsx
        ├── Register.jsx
        ├── StudentDashboard.jsx
        ├── StudentProfile.jsx
        ├── AdminDashboard.jsx
        └── AdminTripDetail.jsx
```

---

## How to Run

```bash
cd "/Users/justmajd/Documents/42 bus website"
npm install              # Install dependencies
npm run seed             # Seed database (pickup points, time slots, admin account)
npm run dev:all          # Start Vite (5173) + Express (3001) together
```

### Default Accounts
| Role | Email | Password |
|------|-------|----------|
| Driver/Admin | `driver@learner.42.tech` | `driver123` |
| Student | Register with any `@learner.42.tech` email | Your choice |

---

## What Was Tested

1. ✅ Registration with valid domain → success
2. ✅ Login → redirects to dashboard
3. ✅ Trip listing (Point → 42 tab) shows tomorrow's trips
4. ✅ Booking a trip → seat count updates → booking appears in My Bookings
5. ✅ Admin login → sees Driver Dashboard with stats
6. ✅ Admin trip list with Confirm/Start/Complete buttons
7. ✅ Real-time seat updates reflected across views
8. ✅ Notification bell in navbar
9. ✅ Interactive map with dark tiles renders
