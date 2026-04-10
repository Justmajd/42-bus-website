import { Link, useLocation } from 'react-router-dom';
import { Bus, LayoutDashboard, User, LogOut, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isDriver = user.role === 'driver';
  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const primaryDestination = isAdmin ? '/admin/stats' : '/';
  const dashboardActive = (!isAdmin && location.pathname === '/') || (isAdmin && location.pathname.startsWith('/admin/stats'));

  return (
    <aside className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <img src="/42-logo.png" alt="42 Logo" className="navbar-logo" />
        </Link>

        <div className="navbar-nav">
          <Link
            to={primaryDestination}
            className={dashboardActive ? 'active' : ''}
          >
            <LayoutDashboard size={16} />
            <span className="nav-text">Home</span>
          </Link>

          {isAdmin && (
            <Link to="/admin/users" className={location.pathname.startsWith('/admin/users') ? 'active' : ''}>
              <Users size={16} />
              <span className="nav-text">Students</span>
            </Link>
          )}
          
          {!isAdmin && !isDriver && (
            <Link to="/profile" className={location.pathname === '/profile' ? 'active' : ''}>
              <User size={16} />
              <span className="nav-text">Paperwork</span>
            </Link>
          )}

          {isDriver && (
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
              <Bus size={16} />
              <span className="nav-text">Trips</span>
            </Link>
          )}
        </div>

        <div className="navbar-footer">
          <NotificationBell />

          <div className="nav-user-info">
            <div className="nav-user-avatar">{initials}</div>
            <div className="nav-user-meta">
              <span className="nav-text">{user.name}</span>
              <span className="nav-role">{user.role}</span>
            </div>
          </div>

          <button onClick={logout} title="Logout" className="logout-btn">
            <LogOut size={16} />
            <span className="nav-text">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
