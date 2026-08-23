import { Suspense, lazy } from 'react';
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
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />

          <Route path="/" element={
            <ProtectedRoute>
              {user?.role === 'admin' ? <Navigate to="/admin/stats" replace /> 
               : user?.role === 'driver' ? <DriverDashboard /> 
               : <StudentDashboard />}
            </ProtectedRoute>
          } />

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
        
          <Route path="/profile" element={
            <ProtectedRoute>
              <StudentProfile />
            </ProtectedRoute>
          } />

          <Route path="/driver/trips/:id" element={
            <ProtectedRoute driverOnly>
              <DriverTripDetail />
            </ProtectedRoute>
          } />

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
