# System-Wide Timezone & Scheduling Update

This plan outlines the changes needed to set the application's timezone to Jordan Time (Asia/Amman, UTC+3) universally, update the auto-generation constraints, and modify the trip sorting logic on the frontend.

## Proposed Changes

### 1. Unified Timezone Helpers

We will create dedicated utility functions for both the frontend and backend to guarantee that every timestamp, auto-generation check, cutoff calculation, and display element strictly adheres to Jordan time natively instead of the server/device's local geographic timezone.

#### [NEW] `server/utils/timezone.js`
- Implement `getAmmanDate()`: Returns a JavaScript Date object inherently offset to match Jordan's actual current time (UTC+3).
- Implement `getAmmanString(date)`: Formats timestamps rigidly as `YYYY-MM-DDTHH:mm:ss+03:00` so SQLite and JS engine evaluate all times accurately in UTC+3 without ambiguity.

#### [NEW] `src/utils/timezone.js` (Frontend)
- Implement identical helpers to handle timezone operations like "is this within 2 hours of departure" checking using localized Jordan offsets instead of browser local time.

---

### 2. Auto-Generation & Expiry Engine Updates

#### [MODIFY] `server/services/scheduler.js`
- **Timezone injection:** Replace all `new Date()` instances with `getAmmanDate()`.
- **Immediate Expiry & Generation Engine:**
  Add a new recurring check to the background cron that scans for trips where `calculated_departure < now`.
  When an expired trip is discovered, automatically generate its precise copy for `Date + 1 day` at the exact same hour slot.
- This fulfills the objective of creating tomorrow's trip immediately upon the exact minute today's trip is considered concluded.

#### [MODIFY] `server/routes/admin.js`
- When the driver manually clicks "Complete" on a trip, we will adjust the generation algorithm from the simplistic `Date + 1` logic to utilize securely offset Jordan Dates, eliminating midnight-rollover bugs.
- Auto-generation triggers identical to the scheduler will apply.

---

### 3. Frontend Sorting Adjustments

Both the `.sort()` algorithms across driver and student lists to order trips by scheduled time in ascending order, displaying the most imminent trips distinctly at the top.

#### [MODIFY] `src/pages/StudentDashboard.jsx`
- Replace array processing logic: `trips.sort((a,b) => new Date(a.calculated_departure) - new Date(b.calculated_departure))`.
- Segment the lists: Future available trips cluster visually at the very top. "Expired" or fully completed/banned trips drop to an archived section at the absolute bottom or vanish.

#### [MODIFY] `src/pages/AdminDashboard.jsx`
- Implement the identical sorting mechanism. Drivers need to see the exact imminent trips requiring "Confirmation" or "Starting" at the top of their feed, avoiding scrolling. List drops "Completed" to the bottom recursively.

---

### 4. General Timestamp Validation

#### [MODIFY] `server/routes/bookings.js`
- Update the 2-hour cutoff rule to explicitly interpret the timestamp using the Jordan offset helper to ensure students aren't wrongly blocked/allowed based on the physical location of the cloud server hosting the backend.

#### [MODIFY] `server/seed.js`
- Transition dummy data initialization to populate `YYYY-MM-DD` based exclusively on Amman time.

## Verification Plan

### Automated Testing
- Validate SQLite trip generation handles the explicit `+03:00` modifier without failing foreign constraints.

### Manual Verification
- Book a trip and use the admin dashboard to manually complete it. Verify instantly that tomorrow's duplicate generated automatically.
- Adjust the backend `getAmmanDate` to simulate a "future" time, observing the scheduler successfully expire active trips and spawn their tomorrow's duplicate immediately.
