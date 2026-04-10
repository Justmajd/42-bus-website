import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import StudentProfile from './pages/StudentProfile';
import AdminDashboard from './pages/AdminDashboard';
import DriverDashboard from './pages/DriverDashboard';
import DriverTripDetail from './pages/DriverTripDetail';

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
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />

        {/* Dashboard index */}
        <Route path="/" element={
          <ProtectedRoute>
            {user?.role === 'admin' ? <AdminDashboard /> 
             : user?.role === 'driver' ? <DriverDashboard /> 
             : <StudentDashboard />}
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
