# 🚌 42 Bus Booking App

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Web%20|%20Android%20|%20iOS-brightgreen.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)
![Status](https://img.shields.io/badge/status-Active-success.svg?style=for-the-badge)

**A Modern Cross-Platform Bus Booking & Management System for 42 Irbid Campus**

[Live Demo](https://42bus.up.railway.app) • [Features](#-features) • [Tech Stack](#-technologies) • [Installation](#-installation)

</div>

---

## 📱 Overview

**42 Bus** is a comprehensive, full-stack bus booking and management application designed specifically for the 42 Irbid campus community. Built with modern technologies and optimized for real-world deployment, this app streamlines the entire bus transportation experience for students, drivers, and administrators.

The application is available on **Web**, **Android**, and **iOS**, providing seamless access across all devices using a single codebase powered by Capacitor.

---

## ✨ Key Features

### 👨‍🎓 Student Features

- **🎫 Easy Bus Booking**
  - Browse available bus trips with real-time schedules
  - One-click booking with instant confirmation
  - View all bookings history and upcoming trips
  - Cancel or modify bookings easily

- **📍 Real-Time Location Tracking**
  - Interactive map view showing bus location in real-time
  - Live ETA calculations for pickups and drop-offs
  - Track your assigned driver's location
  - Multiple pickup points visualization

- **🎯 QR Code Check-In**
  - Seamless attendance confirmation using QR code scanning
  - Mobile-optimized camera interface for easy scanning
  - One-tap verification without manual input
  - Automatic attendance history tracking

- **🔔 Smart Notifications**
  - Real-time push notifications for trip updates
  - Alerts for booking confirmations and changes
  - Bus arrival notifications
  - Driver departure and ETA notifications
  - Customizable notification preferences

- **👤 Student Profile Management**
  - Personal information edit and management
  - Booking history
  - Payment and fare information
  - Account settings and preferences
  - View academic information

### 🚗 Driver Features

- **📊 Dashboard & Trip Management**
  - View all assigned trips with passenger details
  - Trip-by-trip navigation with passenger lists
  - Real-time status updates and monitoring
  - Quick access to important trip information

- **🗺️ Advanced Navigation**
  - Interactive map with pickup and drop-off locations
  - Real-time location sharing with central system
  - Route optimization and turn-by-turn guidance
  - Multiple stops management

- **🧑‍💼 Passenger Management**
  - Complete passenger list for each trip
  - QR code generation for attendance verification
  - Passenger confirmation and tracking
  - Contact information readily available

- **✅ Quick Attendance**
  - Fast passenger scanning with QR codes or manual entry
  - Real-time attendance confirmation
  - Automatic passenger status updates
  - Attendance history logs

- **🔐 Secure Access**
  - Role-based driver authentication
  - Session management
  - Secure data transmission

### 🛡️ Admin Features

- **📈 Statistics & Analytics Dashboard**
  - Real-time trip statistics
  - Booking overview and trends
  - Passenger analytics
  - Driver performance metrics
  - System health monitoring

- **👥 User Management**
  - Create and manage student accounts in bulk
  - Driver account management
  - User role assignments
  - Account activation/deactivation
  - Search and filter capabilities

- **🚌 Trip Management**
  - Create and schedule new trips
  - Edit trip details and routes
  - Manage trip capacity and schedules
  - Archive completed trips
  - Trip history and analytics

- **📢 Notification Broadcasting**
  - Send system-wide notifications
  - Targeted notifications to specific groups
  - Scheduled announcements
  - Notification history and tracking
  - Two-factor messaging (Web Push + In-App)

- **🔍 System Monitoring**
  - Live system statistics
  - Active users tracking
  - Trip execution monitoring
  - Error and performance logs
  - Database health status

---

## 🛠️ Technologies

### Frontend

| Technology | Purpose |
|-----------|---------|
| ⚛️ **React 19** | UI framework with hooks and lazy loading |
| 🎨 **React Router v7** | Client-side navigation and routing |
| 🗺️ **Leaflet & React-Leaflet** | Interactive map visualization |
| 📷 **HTML5 QRCode** | QR code scanning and detection |
| 🎯 **Lucide React** | Beautiful SVG icons and UI elements |
| ⚡ **Vite** | Lightning-fast build tool and dev server |

### Mobile (Cross-Platform)

| Technology | Purpose |
|-----------|---------|
| 📦 **Capacitor** | Build native iOS and Android apps from web code |
| 🔔 **Capacitor Local Notifications** | Native push notifications |
| 📲 **Capacitor Push Notifications** | Firebase Cloud Messaging integration |

### Backend

| Technology | Purpose |
|-----------|---------|
| 🟢 **Node.js** | JavaScript runtime for server |
| 🚀 **Express v5** | Fast web application framework |
| 🔐 **JWT (jsonwebtoken)** | Secure token-based authentication |
| 🔒 **bcryptjs** | Password hashing and security |
| 📊 **LibSQL (Turso)** | Modern SQLite database with replication |
| ⏰ **Node-Cron** | Task scheduling for automated operations |
| 📧 **Web-Push** | Web push notifications |
| 🔥 **Firebase Admin SDK** | Google Cloud messaging and services |

### Infrastructure & DevOps

| Technology | Purpose |
|-----------|---------|
| 🌐 **Railway** | Cloud deployment and hosting |
| 📦 **CORS** | Cross-origin resource handling |
| 🗜️ **Compression** | Response compression middleware |
| 🔧 **Concurrently** | Run multiple dev processes simultaneously |
| 🌍 **dotenv** | Environment variable management |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- Android Studio (for mobile Android builds)
- Xcode (for iOS builds on macOS)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/42-bus-website.git
   cd 42-bus-website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp railway.env.example .env
   ```
   Configure your `.env` file with:
   - Database credentials
   - Firebase configuration
   - Web push VAPID keys
   - Server port and API endpoints

4. **Initialize the database**
   ```bash
   npm run seed
   ```
   This populates the database with initial data.

### Development

**Run web app in development mode:**
```bash
npm run dev
```

**Run backend server:**
```bash
npm run dev:server
```

**Run both simultaneously:**
```bash
npm run dev:all
```

**Build for production:**
```bash
npm run build
```

### Mobile Development

**Add Android platform:**
```bash
npm run cap:add:android
npm run cap:open:android
```

**Add iOS platform:**
```bash
npm run cap:add:ios
npm run cap:open:ios
```

**Sync native code (build and sync):**
```bash
npm run cap:sync
```

**Sync for mobile deployment:**
```bash
npm run cap:sync:railway
```

---

## 📋 Project Structure

```
42-bus-website/
├── src/                          # React frontend
│   ├── components/               # Reusable React components
│   │   ├── QRScanner.jsx           # QR code scanning interface
│   │   ├── MapView.jsx             # Interactive map display
│   │   ├── Navbar.jsx              # Navigation bar
│   │   ├── NotificationBell.jsx    # Notification UI
│   │   └── ProtectedRoute.jsx      # Role-based route protection
│   ├── pages/                    # Page components
│   │   ├── StudentDashboard.jsx    # Student interface
│   │   ├── DriverDashboard.jsx     # Driver interface
│   │   ├── AdminDashboard.jsx      # Admin statistics
│   │   ├── AdminTrips.jsx          # Trip management
│   │   ├── AdminUserManagement.jsx # User administration
│   │   ├── AdminNotifications.jsx  # Notification broadcasting
│   │   ├── Login.jsx               # Authentication
│   │   └── Register.jsx            # User registration
│   ├── contexts/                 # React Context API
│   │   ├── AuthContext.jsx         # Authentication state
│   │   └── NotificationContext.jsx # Notification state
│   ├── hooks/                    # Custom React hooks
│   │   └── useTripLocationTracking.js # Real-time location tracking
│   ├── utils/                    # Utility functions
│   ├── api.js                    # API client and requests
│   └── App.jsx                   # Main app component
├── server/                       # Node.js/Express backend
│   ├── routes/                   # API endpoint handlers
│   │   ├── auth.js               # Authentication endpoints
│   │   ├── trips.js              # Trip management endpoints
│   │   ├── bookings.js           # Booking endpoints
│   │   ├── driver.js             # Driver-specific endpoints
│   │   ├── notifications.js      # Notification endpoints
│   │   └── admin.js              # Admin endpoints
│   ├── services/                 # Business logic services
│   │   ├── push.js               # Push notification service
│   │   ├── notifier.js           # Notification management
│   │   ├── cache.js              # Caching service
│   │   └── scheduler.js          # Task scheduling
│   ├── middleware/               # Express middleware
│   │   └── auth.js               # Authentication middleware
│   ├── utils/                    # Server utilities
│   │   ├── qr.js                 # QR code generation
│   │   └── timezone.js           # Timezone handling
│   ├── db.js                     # Database connection
│   ├── seed.js                   # Database seeding
│   └── index.js                  # Server entry point
├── android/                      # Android native project
│   └── app/
│       ├── src/
│       └── build.gradle
├── ios/                          # iOS native project
│   └── App/
│       ├── App/
│       └── App.xcodeproj
├── public/                       # Static assets
│   └── sw.js                     # Service Worker
├── capacitor.config.ts           # Capacitor configuration
├── vite.config.js                # Vite bundler config
├── package.json                  # Dependencies
└── index.html                    # HTML entry point
```

---

## 🔐 Authentication & Security

- **Role-Based Access Control (RBAC)**
  - Three user roles: Student, Driver, Admin
  - Protected routes with permission checking
  - Secure middleware authentication

- **Secure Authentication**
  - JWT token-based authentication
  - Bcrypt password hashing with salt rounds
  - Secure session management
  - Token refresh mechanisms

- **Data Security**
  - HTTPS encryption in production
  - CORS protection
  - Input validation and sanitization
  - Secure database connections with LibSQL

---

## 📊 Database

The app uses **LibSQL (Turso)** - a modern, distributed SQLite database:

- **Auto-synced schemas** across multiple regions
- **Real-time replication** for data consistency
- **Embedded replicas** for offline-first capabilities
- **Secure, encrypted** data transmission
- **Scalable architecture** for growing user base

---

## 🌐 real-time Features

### Live Bus Tracking
- Real-time GPS location updates
- WebSocket connections for instant communication
- Map visualization with passenger location
- ETA calculations based on actual movement

### Push Notifications
- **Web Push**: Using VAPID protocol for browser notifications
- **Native Push**: Firebase Cloud Messaging for mobile apps
- **In-App Notifications**: Real-time notification center
- **Scheduled Notifications**: Automatic reminders and alerts

### Automatic Scheduling
- Cron jobs for recurring trips
- Automatic trip archival
- Scheduled notifications
- Maintenance tasks automation

---

## 📦 Deployment

The application is deployed on **Railway.app** - a modern cloud platform:

- **Live URL**: [42bus.up.railway.app](42bus.up.railway.app)
- **Automatic deployments** from git
- **Environment configuration** for different stages
- **Database hosting** with secure backups
- **API monitoring** and analytics

---

## 📱 Supported Platforms

| Platform | Support | Build Tool |
|----------|---------|-----------|
| 🌐 Web | Desktop & Mobile browsers | Vite |
| 🤖 Android | Android 8.0+ | Capacitor + Android Studio |
| 🍎 iOS | iOS 14+ | Capacitor + Xcode |

All platforms share the same React codebase, ensuring consistent features and UX across devices.

---

## 🎯 Use Cases

### Before Departure
1. Student books a bus ticket
2. Gets instant confirmation and receives notifications
3. Driver sees updated passenger list
4. Admin receives real-time statistics

### During Transport
1. Driver updates trip status
2. Students can see live bus location
3. Real-time ETA calculations
4. Notifications for important events

### At Destination
1. Driver initiates QR code check-in
2. Students scan to confirm attendance
3. Automatic attendance records
4. Trip completion and rating

---

## 🔧 API Endpoints Overview

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh

### Trips & Bookings
- `GET /api/trips` - Get all available trips
- `POST /api/bookings` - Create a booking
- `GET /api/bookings/my-bookings` - Get user's bookings
- `DELETE /api/bookings/:id` - Cancel booking

### Driver Operations
- `GET /api/driver/trips` - Get driver's trips
- `PUT /api/driver/trips/:id/status` - Update trip status
- `POST /api/driver/attendance` - Record attendance

### Admin
- `GET /api/admin/stats` - Get system statistics
- `POST /api/admin/users` - Create new users
- `GET /api/admin/notifications` - Get notification history
- `POST /api/admin/notifications/broadcast` - Send notifications

---

## 🧪 Testing

The codebase includes examples for:
- Component testing with React
- API endpoint testing
- Mobile app testing across platforms
- Real-world functionality scenarios

---

## 🚀 Hackathon Highlights

This project demonstrates:

✅ **Full-Stack Development** - Frontend, backend, and mobile
✅ **Modern Tech Stack** - Latest frameworks and best practices
✅ **Cross-Platform Compatibility** - Web, Android, iOS from one codebase
✅ **Real-Time Features** - Live tracking, push notifications
✅ **Scalable Architecture** - Cloud deployment ready
✅ **Role-Based System** - Complex user management
✅ **Beautiful UI/UX** - Professional design with animations
✅ **Production Ready** - All security and optimization features included

---

## 📈 Performance Features

- **Code Splitting** with lazy loading for fast initial load
- **Compression** middleware for reduced bandwidth
- **Caching** strategies for improved response times
- **Database Optimization** with indexed queries
- **Mobile Optimization** for fast mobile performance

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📞 Contact & Support

For questions, support, or feedback:
- Create an issue on GitHub
- Visit: [42bus.up.railway.app](https://42bus.up.railway.app)

---

<div align="center">

### Made for 42 Irbid Community with ❤️

**Built during Hackathon | Powered by Modern Technologies**

[⬆ Back to Top](#-42-bus-booking-app)

</div>
