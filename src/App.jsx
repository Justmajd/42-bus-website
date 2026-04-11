import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'));
const AdminTrips = lazy(() => import('./pages/AdminTrips'));
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));
const DriverTripDetail = lazy(() => import('./pages/DriverTripDetail'));

function AppRoutes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    const targets = Array.from(document.querySelectorAll([
      '.glass-panel',
      '.card',
      '.trip-card',
      '.auth-card',
      '.alert',
      '.scan-flash-card',
      '.pickup-card',
      '.stat-card',
      '.admin-stat-card',
      '.notification-panel',
      '.qr-container',
      '.profile-header',
      '.empty-state',
      '.toast'
    ].join(',')));

    if (targets.length === 0) return;

    document.documentElement.classList.add('motion-ready');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px',
    });

    targets.forEach((target, index) => {
      target.classList.add('motion-reveal');
      target.style.setProperty('--reveal-delay', `${Math.min(index * 40, 240)}ms`);
      observer.observe(target);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-spinner" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <Suspense fallback={<div className="loading-spinner" style={{ minHeight: '100vh' }}><div className="spinner"></div></div>}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />

          {/* Dashboard index */}
          <Route path="/" element={
            <ProtectedRoute>
              {user?.role === 'admin' ? <Navigate to="/admin/stats" replace /> 
               : user?.role === 'driver' ? <DriverDashboard /> 
               : <StudentDashboard />}
            </ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin/stats" element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/admin/users" element={
            <ProtectedRoute adminOnly>
              <AdminUserManagement />
            </ProtectedRoute>
          } />

          <Route path="/admin/trips" element={
            <ProtectedRoute adminOnly>
              <AdminTrips />
            </ProtectedRoute>
          } />

          <Route path="/admin/notifications" element={
            <ProtectedRoute adminOnly>
              <AdminNotifications />
            </ProtectedRoute>
          } />
        
          {/* Student routes */}
          <Route path="/profile" element={
            <ProtectedRoute>
              <StudentProfile />
            </ProtectedRoute>
          } />

          {/* Driver routes */}
          <Route path="/driver/trips/:id" element={
            <ProtectedRoute driverOnly>
              <DriverTripDetail />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}
