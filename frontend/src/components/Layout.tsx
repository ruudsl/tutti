import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OnboardingTour, resetOnboarding } from './OnboardingTour';
import { getSettings } from '../api';
import type { AssociationSettings } from '../types';

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

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <li className="nav-dropdown" ref={dropdownRef}>
      <button
        className={`nav-link nav-dropdown-toggle ${isActive ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label} <span className="dropdown-arrow" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <ul className="nav-dropdown-menu" role="menu" onClick={() => setIsOpen(false)}>
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
  const [brandSettings, setBrandSettings] = useState<AssociationSettings | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleRestartOnboarding = () => {
    if (user) {
      resetOnboarding(user.id);
      setShowOnboarding(true);
    }
  };

  const loadBrandSettings = () => {
    getSettings().then(setBrandSettings).catch(() => {});
  };

  useEffect(() => {
    loadBrandSettings();

    // Refresh brand when settings are updated from the Settings page
    const handler = () => loadBrandSettings();
    window.addEventListener('settings-updated', handler);
    return () => window.removeEventListener('settings-updated', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === ROLES.ADMIN;
  const isMusicCommittee = user?.role === ROLES.MUSIC_COMMITTEE || isAdmin;

  // Check if current path is in a dropdown group
  const musicPaths = ['/lists', '/music-pieces', '/titles', '/upload'];
  const beheerPaths = ['/instruments', '/genres', '/pdf-tools', '/loans', '/statistics'];
  const adminPaths = ['/users', '/orchestras', '/settings', '/theme', '/changelog'];

  const isMusicActive = musicPaths.some(p => location.pathname.startsWith(p));
  const isBeheerActive = beheerPaths.some(p => location.pathname.startsWith(p));
  const isAdminActive = adminPaths.some(p => location.pathname.startsWith(p));

  return (
    <div className="app">
      <a href="#main-content" className="skip-to-content">
        {t('accessibility.skipToContent')}
      </a>

      <nav className="navbar" aria-label={t('accessibility.mainNavigation')}>
        <div className="navbar-content">
          <Link to="/" className="navbar-brand">
            {brandSettings?.logoUrl ? (
              <img
                src={brandSettings.logoUrl}
                alt=""
                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }}
              />
            ) : (
              <span aria-hidden="true">🎵</span>
            )}
            {' '}{brandSettings?.displayName || 'Harmonie'}
          </Link>

          <button
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={mobileMenuOpen}
          >
            <span className={`hamburger-icon ${mobileMenuOpen ? 'open' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>

          <ul className={`navbar-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
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
              <NavLink to="/rehearsals" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.rehearsals')}
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
                  <li role="none">
                    <NavLink to="/lists" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.lists')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/music-pieces" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.pieces')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/titles" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.titles')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/upload" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.upload')}
                    </NavLink>
                  </li>
                </NavDropdown>

                <NavDropdown label={t('nav.management')} isActive={isBeheerActive}>
                  <li role="none">
                    <NavLink to="/instruments" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.instruments')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/genres" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.genres')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/pdf-tools" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.pdfTools')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/loans" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.loans')}
                    </NavLink>
                  </li>
                  <li role="none">
                    <NavLink to="/statistics" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                      {t('nav.statistics')}
                    </NavLink>
                  </li>
                </NavDropdown>
              </>
            )}

            {isAdmin && (
              <NavDropdown label={t('nav.admin')} isActive={isAdminActive}>
                <li role="none">
                  <NavLink to="/users" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.members')}
                  </NavLink>
                </li>
                <li role="none">
                  <NavLink to="/orchestras" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.orchestras')}
                  </NavLink>
                </li>
                <li role="none">
                  <NavLink to="/settings" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.settings')}
                  </NavLink>
                </li>
                <li role="none">
                  <NavLink to="/theme" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.theme')}
                  </NavLink>
                </li>
                <li role="none">
                  <NavLink to="/changelog" role="menuitem" className={({ isActive }) => `dropdown-item ${isActive ? 'active' : ''}`}>
                    {t('nav.changelog')}
                  </NavLink>
                </li>
              </NavDropdown>
            )}

            {/* Mobile user section */}
            <li className="mobile-user-section">
              <div className="mobile-user-info">
                <div className="user-name">{user?.firstName} {user?.lastName}</div>
                <div className="user-role">{user?.role && t(`roles.${user.role}`)}</div>
              </div>
              <div className="mobile-user-actions">
                <LanguageSwitcher compact />
                <NavLink to="/profile" className="nav-link">
                  {t('nav.profile')}
                </NavLink>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                  {t('nav.logout')}
                </button>
              </div>
            </li>
          </ul>

          <div className="navbar-user" aria-label={t('accessibility.userMenu')}>
            <LanguageSwitcher compact />
            <button
              className="btn btn-outline btn-sm"
              onClick={handleRestartOnboarding}
              title={t('onboarding.menuItem')}
            >
              {t('onboarding.menuItem')}
            </button>
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

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div
            className="mobile-menu-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </nav>

      <main id="main-content" className="main-content">
        <Outlet />
      </main>

      <footer className="app-footer">
        <a
          href="https://github.com/ruudsl/harmonie/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="feedback-link"
        >
          {t('feedback.linkText')}
        </a>
      </footer>

      <OnboardingTour
        forceShow={showOnboarding || undefined}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
