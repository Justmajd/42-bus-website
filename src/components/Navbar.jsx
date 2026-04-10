import { Link, useLocation } from 'react-router-dom';
import { Bus, LayoutDashboard, User, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <img src="/42-logo.png" alt="42 Logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <span>Bus</span>
        </Link>

        <div className="navbar-nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            <LayoutDashboard size={16} />
            <span className="nav-text">Dashboard</span>
          </Link>
          
          {!isAdmin && (
            <Link to="/profile" className={location.pathname === '/profile' ? 'active' : ''}>
              <User size={16} />
              <span className="nav-text">Profile</span>
            </Link>
          )}

          <NotificationBell />

          <div className="nav-user-info">
            <div className="nav-user-avatar">{initials}</div>
            <span className="nav-text">{user.name}</span>
          </div>

          <button onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
