import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface DropdownProps {
  label: string;
  children: React.ReactNode;
  isActive?: boolean;
}

function NavDropdown({ label, children, isActive }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <li className="nav-dropdown" ref={dropdownRef}>
      <button
        className={`nav-link nav-dropdown-toggle ${isActive ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {label} <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <ul className="nav-dropdown-menu" onClick={() => setIsOpen(false)}>
          {children}
        </ul>
      )}
    </li>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  const isMusicCommittee = user?.role === 'music_committee' || isAdmin;

  // Check if current path is in a dropdown group
  const musicPaths = ['/lists', '/music-pieces', '/titles', '/upload'];
  const beheerPaths = ['/instruments', '/genres', '/pdf-tools', '/loans', '/statistics'];
  const adminPaths = ['/users', '/orchestras'];

  const isMusicActive = musicPaths.some(p => location.pathname.startsWith(p));
  const isBeheerActive = beheerPaths.some(p => location.pathname.startsWith(p));
  const isAdminActive = adminPaths.some(p => location.pathname.startsWith(p));

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-content">
          <Link to="/" className="navbar-brand">
            🎵 Harmonie
          </Link>

          <ul className="navbar-nav">
            <li>
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/my-music" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Mijn Muziek
              </NavLink>
            </li>
            <li>
              <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Tools
              </NavLink>
            </li>
            <li>
              <NavLink to="/issues" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Meldkamer
              </NavLink>
            </li>

            {isMusicCommittee && (
              <>
                <NavDropdown label="Muziek" isActive={isMusicActive}>
                  <li>
                    <NavLink to="/lists" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Lijsten
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/music-pieces" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Muziekstukken
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/titles" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Titels
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/upload" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Uploaden
                    </NavLink>
                  </li>
                </NavDropdown>

                <NavDropdown label="Beheer" isActive={isBeheerActive}>
                  <li>
                    <NavLink to="/instruments" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Instrumenten
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/genres" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Genres
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/pdf-tools" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      PDF Tools
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/loans" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Uitleningen
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/statistics" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      Statistieken
                    </NavLink>
                  </li>
                </NavDropdown>
              </>
            )}

            {isAdmin && (
              <NavDropdown label="Admin" isActive={isAdminActive}>
                <li>
                  <NavLink to="/users" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    Leden
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/orchestras" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    Orkesten
                  </NavLink>
                </li>
              </NavDropdown>
            )}
          </ul>

          <div className="navbar-user">
            <Link to="/profile" className="user-info" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="user-name">{user?.firstName} {user?.lastName}</div>
              <div className="user-role">
                {user?.role === 'admin' && 'Beheerder'}
                {user?.role === 'music_committee' && 'Muziekcommissie'}
                {user?.role === 'member' && 'Lid'}
              </div>
            </Link>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Uitloggen
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
