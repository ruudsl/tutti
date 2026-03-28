import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { LanguageSwitcher } from './LanguageSwitcher';
import { OnboardingTour, resetOnboarding } from './OnboardingTour';
import { DarkModeToggle } from './DarkModeToggle';
import { Breadcrumbs } from './Breadcrumbs';
import { ContextSidebar, useHasSidebar } from './ContextSidebar';
import { QuickActionsMenu } from './QuickActionsMenu';
import { GlobalSearch, useGlobalSearch } from './GlobalSearch';
import { RecentItems } from './RecentItems';
import { KeyboardShortcutsHelp, SequenceIndicator } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { getSettings } from '../api';
import type { AssociationSettings } from '../types';
import { PrefetchNavLink } from './PrefetchNavLink';
import { prefetchPriorityRoutes } from '../hooks/usePrefetch';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [brandSettings, setBrandSettings] = useState<AssociationSettings | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Prefetch priority routes when browser is idle (eliminates spinners)
  useEffect(() => {
    prefetchPriorityRoutes();
  }, []);

  // Global search state
  const { isOpen: isSearchOpen, open: openSearch, close: closeSearch } = useGlobalSearch();

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
  const isConductor = user?.role === ROLES.CONDUCTOR || isAdmin;
  const isMusicCommittee = user?.role === ROLES.MUSIC_COMMITTEE || isAdmin;
  const isEquipmentCommittee = user?.role === ROLES.EQUIPMENT_COMMITTEE || isAdmin;
  const isUniformsCommittee = user?.role === ROLES.UNIFORMS_COMMITTEE || isAdmin;
  const hasSidebar = useHasSidebar();

  // Check if current path is in a navigation group
  const agendaPaths = ['/rehearsals', '/concerts', '/my-tickets', '/ticket-scanner'];
  const orchestraPaths = ['/seating', '/voice-parts', '/instruments', '/occupancy', '/neighbor-preferences'];
  const ledenPaths = ['/members', '/issues', '/practice-schedules'];
  const libraryPaths = ['/lists', '/music-pieces', '/titles', '/upload', '/loans', '/genres', '/statistics', '/pdf-tools', '/imslp'];
  const inventarisPaths = ['/equipment', '/uniforms'];
  const adminPaths = ['/users', '/orchestras', '/settings', '/entra-sync', '/onboarding', '/theme', '/changelog', '/audit-logs', '/health'];

  const isAgendaActive = agendaPaths.some(p => location.pathname.startsWith(p));
  const isOrchestraActive = orchestraPaths.some(p => location.pathname.startsWith(p));
  const isLedenActive = ledenPaths.some(p => location.pathname.startsWith(p));
  const isLibraryActive = libraryPaths.some(p => location.pathname.startsWith(p));
  const isInventarisActive = inventarisPaths.some(p => location.pathname.startsWith(p));
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
              <PrefetchNavLink to="/my-music" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.myMusic')}
              </PrefetchNavLink>
            </li>
            <li>
              <PrefetchNavLink to="/rehearsals" className={() => `nav-link ${isAgendaActive ? 'active' : ''}`}>
                {t('sidebar.agenda')}
              </PrefetchNavLink>
            </li>
            <li>
              <PrefetchNavLink to="/members" className={() => `nav-link ${isLedenActive ? 'active' : ''}`}>
                {t('sidebar.members')}
              </PrefetchNavLink>
            </li>
            {(isConductor || isMusicCommittee) && (
              <li>
                <PrefetchNavLink to="/voice-parts" className={() => `nav-link ${isOrchestraActive ? 'active' : ''}`}>
                  {t('sidebar.orchestra')}
                </PrefetchNavLink>
              </li>
            )}
            <li>
              <PrefetchNavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {t('nav.tools')}
              </PrefetchNavLink>
            </li>

            {isMusicCommittee && (
              <li>
                <PrefetchNavLink to="/music-pieces" className={() => `nav-link ${isLibraryActive ? 'active' : ''}`}>
                  {t('sidebar.library')}
                </PrefetchNavLink>
              </li>
            )}

            {(isEquipmentCommittee || isUniformsCommittee) && (
              <li>
                <PrefetchNavLink to="/equipment" className={() => `nav-link ${isInventarisActive ? 'active' : ''}`}>
                  {t('sidebar.inventory')}
                </PrefetchNavLink>
              </li>
            )}

            {isAdmin && (
              <li>
                <PrefetchNavLink to="/users" className={() => `nav-link ${isAdminActive ? 'active' : ''}`}>
                  {t('sidebar.admin')}
                </PrefetchNavLink>
              </li>
            )}

            {/* Mobile user section */}
            <li className="mobile-user-section">
              <div className="mobile-user-info">
                <div className="user-name">{user?.firstName} {user?.lastName}</div>
                <div className="user-role">{user?.role && t(`roles.${user.role}`)}</div>
              </div>
              <div className="mobile-user-actions">
                <LanguageSwitcher compact />
                <PrefetchNavLink to="/user-guide" className="nav-link">
                  {t('nav.userGuide')}
                </PrefetchNavLink>
                <PrefetchNavLink to="/profile" className="nav-link">
                  {t('nav.profile')}
                </PrefetchNavLink>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                  {t('nav.logout')}
                </button>
              </div>
            </li>
          </ul>

          <div className="navbar-user" aria-label={t('accessibility.userMenu')}>
            <RecentItems />
            <DarkModeToggle />
            <LanguageSwitcher compact />
            <Link to="/user-guide" className="btn btn-outline btn-sm">
              {t('nav.userGuide')}
            </Link>
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

      {hasSidebar ? (
        <div className="main-with-sidebar">
          <ContextSidebar />
          <main id="main-content" className="main-content">
            <Breadcrumbs />
            <Outlet />
          </main>
        </div>
      ) : (
        <main id="main-content" className="main-content">
          <Breadcrumbs />
          <Outlet />
        </main>
      )}

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

      <QuickActionsMenu onOpenSearch={openSearch} />

      <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />

      <KeyboardShortcutsHelp />
      <SequenceIndicator />

      <OnboardingTour
        forceShow={showOnboarding || undefined}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
