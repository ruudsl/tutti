import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';

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
  const { t } = useTranslation();

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
                {t('nav.dashboard')}
              </NavLink>
            </li>
            <li>
              <NavLink to="/my-music" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.myMusic')}
              </NavLink>
            </li>
            <li>
              <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.tools')}
              </NavLink>
            </li>
            <li>
              <NavLink to="/issues" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.issues')}
              </NavLink>
            </li>

            {isMusicCommittee && (
              <>
                <NavDropdown label={t('nav.music')} isActive={isMusicActive}>
                  <li>
                    <NavLink to="/lists" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.lists')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/music-pieces" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.pieces')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/titles" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.titles')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/upload" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.upload')}
                    </NavLink>
                  </li>
                </NavDropdown>

                <NavDropdown label={t('nav.management')} isActive={isBeheerActive}>
                  <li>
                    <NavLink to="/instruments" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.instruments')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/genres" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.genres')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/pdf-tools" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.pdfTools')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/loans" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.loans')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/statistics" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.statistics')}
                    </NavLink>
                  </li>
                </NavDropdown>
              </>
            )}

            {isAdmin && (
              <NavDropdown label={t('nav.admin')} isActive={isAdminActive}>
                <li>
                  <NavLink to="/users" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.members')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/orchestras" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.orchestras')}
                  </NavLink>
                </li>
              </NavDropdown>
            )}
          </ul>

          <div className="navbar-user">
            <LanguageSwitcher compact />
            <Link to="/profile" className="user-info" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="user-name">{user?.firstName} {user?.lastName}</div>
              <div className="user-role">
                {user?.role && t(`roles.${user.role}`)}
              </div>
            </Link>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              {t('nav.logout')}
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
