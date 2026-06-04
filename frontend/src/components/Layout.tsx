import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { OnboardingTour, resetOnboarding } from './OnboardingTour';
import { DarkModeToggle } from './DarkModeToggle';
import { Breadcrumbs } from './Breadcrumbs';
import { QuickActionsMenu } from './QuickActionsMenu';
import { GlobalSearch, useGlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationCenter';
import { RecentItems } from './RecentItems';
import { KeyboardShortcutsHelp, SequenceIndicator } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { getSettings } from '../api';
import { Icon, type IconName } from './Icon';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { AssociationSwitcher } from './AssociationSwitcher';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import type { AssociationSettings } from '../types';

interface SidebarNavItem {
  path: string;
  labelKey: string;
  roles?: string[];
}

interface SidebarNavGroup {
  titleKey: string;
  icon: IconName;
  basePaths: string[];
  items: SidebarNavItem[];
}

const navGroups: SidebarNavGroup[] = [
  {
    titleKey: 'nav.dashboard',
    icon: 'home',
    basePaths: ['/'],
    items: [
      { path: '/', labelKey: 'nav.dashboard' },
    ],
  },
  {
    titleKey: 'nav.myMusic',
    icon: 'music',
    basePaths: ['/my-music'],
    items: [
      { path: '/my-music', labelKey: 'nav.myMusic' },
    ],
  },
  {
    titleKey: 'sidebar.agenda',
    icon: 'calendar',
    basePaths: ['/rehearsals', '/availability', '/concerts', '/my-tickets', '/ticket-sales', '/ticket-scanner', '/holiday-settings', '/season-planner', '/attendance-analytics'],
    items: [
      { path: '/rehearsals', labelKey: 'nav.rehearsals' },
      { path: '/availability', labelKey: 'nav.availability' },
      { path: '/attendance-analytics', labelKey: 'nav.attendanceAnalytics', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/concerts', labelKey: 'nav.concerts', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/season-planner', labelKey: 'nav.seasonPlanner', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/holiday-settings', labelKey: 'nav.holidays', roles: [ROLES.ADMIN] },
      { path: '/my-tickets', labelKey: 'nav.myTickets' },
      { path: '/ticket-sales', labelKey: 'nav.ticketSales', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/ticket-scanner', labelKey: 'nav.ticketScanner', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
    ],
  },
  {
    titleKey: 'sidebar.members',
    icon: 'users',
    basePaths: ['/members', '/issues', '/practice-schedules', '/practice', '/contacts'],
    items: [
      { path: '/members', labelKey: 'nav.memberDirectory' },
      { path: '/contacts', labelKey: 'nav.contacts' },
      { path: '/issues', labelKey: 'nav.issues' },
      { path: '/practice-schedules', labelKey: 'nav.practiceSchedules' },
      { path: '/practice', labelKey: 'nav.practice' },
    ],
  },
  {
    titleKey: 'sidebar.communication',
    icon: 'message',
    basePaths: ['/polls', '/tasks', '/posts', '/email-campaigns'],
    items: [
      { path: '/posts', labelKey: 'nav.posts' },
      { path: '/polls', labelKey: 'nav.polls' },
      { path: '/tasks', labelKey: 'nav.tasks' },
      { path: '/email-campaigns', labelKey: 'nav.emailCampaigns', roles: [ROLES.ADMIN] },
    ],
  },
  {
    titleKey: 'sidebar.orchestra',
    icon: 'music2',
    basePaths: ['/seating', '/voice-parts', '/occupancy', '/neighbor-preferences'],
    items: [
      { path: '/seating', labelKey: 'nav.seating', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/voice-parts', labelKey: 'nav.voiceParts', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/occupancy', labelKey: 'nav.occupancy', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/neighbor-preferences', labelKey: 'nav.neighborPreferences', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
    ],
  },
  {
    titleKey: 'nav.tools',
    icon: 'wrench',
    basePaths: ['/tools'],
    items: [
      { path: '/tools', labelKey: 'nav.tools' },
    ],
  },
  {
    titleKey: 'sidebar.library',
    icon: 'book',
    basePaths: ['/lists', '/music-pieces', '/titles', '/upload', '/loans', '/genres', '/statistics', '/pdf-tools', '/imslp'],
    items: [
      { path: '/music-pieces', labelKey: 'nav.pieces', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/lists', labelKey: 'nav.lists', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/titles', labelKey: 'nav.titles', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/upload', labelKey: 'nav.upload', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/imslp', labelKey: 'nav.imslp', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/loans', labelKey: 'nav.loans', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/pdf-tools', labelKey: 'nav.pdfTools', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/genres', labelKey: 'nav.genres', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/statistics', labelKey: 'nav.statistics', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
    ],
  },
  {
    titleKey: 'sidebar.inventory',
    icon: 'package',
    basePaths: ['/instrument-assets', '/uniforms', '/equipment'],
    items: [
      { path: '/instrument-assets', labelKey: 'nav.instrumentAssets', roles: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE] },
      { path: '/uniforms', labelKey: 'nav.uniforms', roles: [ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE] },
      { path: '/equipment', labelKey: 'nav.equipment', roles: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE] },
    ],
  },
  {
    titleKey: 'sidebar.operations',
    icon: 'clipboard',
    basePaths: ['/projects', '/tours', '/resources'],
    items: [
      { path: '/projects', labelKey: 'nav.projects', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/tours', labelKey: 'nav.tours', roles: [ROLES.ADMIN, ROLES.BOARD] },
      { path: '/resources', labelKey: 'nav.resources', roles: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE] },
    ],
  },
  {
    titleKey: 'sidebar.content',
    icon: 'fileText',
    basePaths: ['/wiki', '/outfits', '/performances', '/workflows'],
    items: [
      { path: '/wiki', labelKey: 'nav.wiki' },
      { path: '/outfits', labelKey: 'nav.outfits' },
      { path: '/performances', labelKey: 'nav.performances' },
      { path: '/workflows', labelKey: 'nav.workflows', roles: [ROLES.ADMIN] },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    icon: 'settings',
    basePaths: ['/users', '/orchestras', '/settings', '/payment-settings', '/entra-sync', '/onboarding', '/theme', '/changelog', '/audit-logs', '/health', '/custom-fields', '/accounting'],
    items: [
      { path: '/users', labelKey: 'nav.members', roles: [ROLES.ADMIN] },
      { path: '/onboarding', labelKey: 'nav.onboarding', roles: [ROLES.ADMIN] },
      { path: '/orchestras', labelKey: 'nav.orchestras', roles: [ROLES.ADMIN] },
      { path: '/custom-fields', labelKey: 'nav.customFields', roles: [ROLES.ADMIN] },
      { path: '/accounting', labelKey: 'nav.accounting', roles: [ROLES.ADMIN] },
      { path: '/settings', labelKey: 'nav.settings', roles: [ROLES.ADMIN] },
      { path: '/payment-settings', labelKey: 'nav.paymentSettings', roles: [ROLES.ADMIN] },
      { path: '/entra-sync', labelKey: 'nav.entraSync', roles: [ROLES.ADMIN] },
      { path: '/theme', labelKey: 'nav.theme', roles: [ROLES.ADMIN] },
      { path: '/changelog', labelKey: 'nav.changelog', roles: [ROLES.ADMIN] },
      { path: '/audit-logs', labelKey: 'nav.auditLogs', roles: [ROLES.ADMIN] },
      { path: '/health', labelKey: 'nav.health', roles: [ROLES.ADMIN] },
    ],
  },
];

// Bottom tabs for mobile - the 4 most common sections + More
const mobileBottomTabs: { path: string; labelKey: string; icon: IconName; exact?: boolean }[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: 'home', exact: true },
  { path: '/my-music', labelKey: 'nav.myMusic', icon: 'music' },
  { path: '/rehearsals', labelKey: 'nav.rehearsals', icon: 'calendar' },
  { path: '/members', labelKey: 'sidebar.members', icon: 'users' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [brandSettings, setBrandSettings] = useState<AssociationSettings | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

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

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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

  const userRole = user?.role || '';

  // Filter nav groups based on user role
  const visibleGroups = navGroups.filter(group => {
    const visibleItems = group.items.filter(item => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    });
    return visibleItems.length > 0;
  });

  // Check if a group is active based on current path
  const isGroupActive = (group: SidebarNavGroup) => {
    // Special case for dashboard - exact match only
    if (group.basePaths.length === 1 && group.basePaths[0] === '/') {
      return location.pathname === '/';
    }
    return group.basePaths.some(p => location.pathname.startsWith(p));
  };

  // Check if a bottom tab is active
  const isTabActive = (tab: typeof mobileBottomTabs[0]) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  // Check if current path is not covered by bottom tabs (for "More" highlight)
  const isMoreActive = !mobileBottomTabs.some(tab => isTabActive(tab));

  return (
    <div className={`app app-with-sidebar ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <a href="#main-content" className="skip-to-content">
        {t('accessibility.skipToContent')}
      </a>

      {/* Top header bar */}
      <header className="app-header" aria-label={t('accessibility.mainNavigation')}>
        <div className="header-left">
          <button
            className="sidebar-toggle-btn desktop-only"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? t('nav.expandSidebar', 'Zijbalk uitklappen') : t('nav.collapseSidebar', 'Zijbalk inklappen')}
          >
            <Icon name={sidebarCollapsed ? 'expand' : 'collapse'} size={20} />
          </button>
          <Link to="/" className="navbar-brand">
            {brandSettings?.logoUrl ? (
              <img
                src={brandSettings.logoUrl}
                alt=""
                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }}
              />
            ) : (
              <Icon name="music" size={22} />
            )}
            {' '}{brandSettings?.displayName || 'Tutti'}
          </Link>
        </div>

        <div className="header-right">
          <SyncStatusIndicator compact inHeader />
          <button
            className="header-search-btn"
            onClick={openSearch}
            title={t('search.placeholder', 'Zoeken (Cmd+K)')}
            aria-label={t('search.label', 'Zoeken')}
          >
            <Icon name="search" size={18} />
          </button>
          <NotificationBell />
          <RecentItems />
          <AssociationSwitcher />
          <DarkModeToggle />
          <Link to="/profile" className="user-info header-user-info" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="user-name">{user?.firstName} {user?.lastName}</div>
            <div className="user-role">
              {user?.role && t(`roles.${user.role}`)}
            </div>
          </Link>
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Desktop sidebar navigation */}
        <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label={t('accessibility.mainNavigation')}>
          <nav className="sidebar-main-nav">
            {visibleGroups.map(group => {
              const active = isGroupActive(group);
              const isSingleItem = group.items.length === 1;
              const visibleItems = group.items.filter(item => {
                if (!item.roles) return true;
                return item.roles.includes(userRole);
              });

              if (isSingleItem) {
                // Single-item groups render as direct links
                return (
                  <NavLink
                    key={group.titleKey}
                    to={visibleItems[0].path}
                    end={visibleItems[0].path === '/'}
                    className={({ isActive }) => `sidebar-direct-link ${isActive ? 'active' : ''}`}
                    title={sidebarCollapsed ? t(group.titleKey) : undefined}
                  >
                    <span className="sidebar-item-icon" aria-hidden="true">
                      <Icon name={group.icon} size={20} />
                    </span>
                    <span className="sidebar-item-label">{t(group.titleKey)}</span>
                  </NavLink>
                );
              }

              // Multi-item groups render as collapsible sections
              return (
                <div key={group.titleKey} className={`sidebar-group ${active ? 'active' : ''}`}>
                  <NavLink
                    to={visibleItems[0].path}
                    className={`sidebar-group-header ${active ? 'active' : ''}`}
                    title={sidebarCollapsed ? t(group.titleKey) : undefined}
                  >
                    <span className="sidebar-item-icon" aria-hidden="true">
                      <Icon name={group.icon} size={20} />
                    </span>
                    <span className="sidebar-item-label">{t(group.titleKey)}</span>
                    {visibleItems.length > 1 && (
                      <span className="sidebar-group-arrow" aria-hidden="true">
                        <Icon name={active ? 'chevronDown' : 'chevronRight'} size={14} />
                      </span>
                    )}
                  </NavLink>
                  {active && !sidebarCollapsed && (
                    <ul className="sidebar-group-items">
                      {visibleItems.map(item => (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            className={({ isActive }) => `sidebar-sub-link ${isActive ? 'active' : ''}`}
                          >
                            {t(item.labelKey)}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar footer with secondary links */}
          <div className="sidebar-footer">
            <NavLink
              to="/user-guide"
              className={({ isActive }) => `sidebar-direct-link sidebar-footer-link ${isActive ? 'active' : ''}`}
              title={sidebarCollapsed ? t('nav.userGuide') : undefined}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <Icon name="book" size={18} />
              </span>
              <span className="sidebar-item-label">{t('nav.userGuide')}</span>
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) => `sidebar-direct-link sidebar-footer-link ${isActive ? 'active' : ''}`}
              title={sidebarCollapsed ? t('nav.profile') : undefined}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <Icon name="user" size={18} />
              </span>
              <span className="sidebar-item-label">{t('nav.profile')}</span>
            </NavLink>
            <NavLink
              to="/privacy-settings"
              className={({ isActive }) => `sidebar-direct-link sidebar-footer-link ${isActive ? 'active' : ''}`}
              title={sidebarCollapsed ? t('nav.privacySettings') : undefined}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <Icon name="shield" size={18} />
              </span>
              <span className="sidebar-item-label">{t('nav.privacySettings')}</span>
            </NavLink>
            <button
              className="sidebar-direct-link sidebar-footer-link"
              onClick={handleRestartOnboarding}
              title={sidebarCollapsed ? t('onboarding.menuItem') : undefined}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <Icon name="graduationCap" size={18} />
              </span>
              <span className="sidebar-item-label">{t('onboarding.menuItem')}</span>
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <main id="main-content" className="main-content">
          <SectionErrorBoundary sectionName="Breadcrumbs" compact>
            <Breadcrumbs />
          </SectionErrorBoundary>
          <SectionErrorBoundary sectionName="Page Content">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-bottom-tabs" aria-label={t('nav.mobileNavigation', 'Navigatie')}>
        {mobileBottomTabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.exact}
            className={`bottom-tab ${isTabActive(tab) ? 'active' : ''}`}
          >
            <span className="bottom-tab-icon" aria-hidden="true">
              <Icon name={tab.icon} size={22} />
            </span>
            <span className="bottom-tab-label">{t(tab.labelKey)}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-tab ${mobileMenuOpen ? 'active' : ''} ${isMoreActive ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={t('nav.more', 'Meer')}
          aria-expanded={mobileMenuOpen}
        >
          <span className="bottom-tab-icon" aria-hidden="true">
            <Icon name="menu" size={22} />
          </span>
          <span className="bottom-tab-label">{t('nav.more', 'Meer')}</span>
        </button>
      </nav>

      {/* Mobile full menu overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="mobile-menu-overlay"
            onClick={() => setMobileMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setMobileMenuOpen(false);
              }
            }}
            role="presentation"
            aria-hidden="true"
          />
          <div
            className="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mobileMenu', 'Menu')}
          >
            <div className="mobile-menu-header">
              <div className="mobile-user-info">
                <div className="user-name">{user?.firstName} {user?.lastName}</div>
                <div className="user-role">{user?.role && t(`roles.${user.role}`)}</div>
              </div>
              <button
                className="btn btn-outline btn-sm btn-icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t('nav.closeMenu')}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav className="mobile-menu-nav">
              {visibleGroups.map(group => {
                const visibleItems = group.items.filter(item => {
                  if (!item.roles) return true;
                  return item.roles.includes(userRole);
                });

                if (visibleItems.length === 1) {
                  return (
                    <NavLink
                      key={group.titleKey}
                      to={visibleItems[0].path}
                      end={visibleItems[0].path === '/'}
                      className={({ isActive }) => `mobile-menu-link ${isActive ? 'active' : ''}`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="mobile-menu-icon" aria-hidden="true">
                        <Icon name={group.icon} size={20} />
                      </span>
                      {t(group.titleKey)}
                    </NavLink>
                  );
                }

                return (
                  <div key={group.titleKey} className="mobile-menu-group">
                    <div className="mobile-menu-group-title">
                      <span className="mobile-menu-icon" aria-hidden="true">
                        <Icon name={group.icon} size={20} />
                      </span>
                      {t(group.titleKey)}
                    </div>
                    {visibleItems.map(item => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `mobile-menu-sublink ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t(item.labelKey)}
                      </NavLink>
                    ))}
                  </div>
                );
              })}
            </nav>
            <div className="mobile-menu-footer">
              <NavLink to="/user-guide" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
                <span className="mobile-menu-icon" aria-hidden="true">
                  <Icon name="book" size={20} />
                </span>
                {t('nav.userGuide')}
              </NavLink>
              <NavLink to="/profile" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
                <span className="mobile-menu-icon" aria-hidden="true">
                  <Icon name="user" size={20} />
                </span>
                {t('nav.profile')}
              </NavLink>
              <div className="mobile-menu-actions">
                <DarkModeToggle />
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                  {t('nav.logout')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <footer className="app-footer">
        <Link to="/accessibility" className="feedback-link">
          {t('accessibility.statement', 'Toegankelijkheid')}
        </Link>
        <span aria-hidden="true" style={{ margin: '0 0.5rem', color: 'var(--text-muted)' }}>|</span>
        <a
          href="https://github.com/ruudsl/harmonie/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="feedback-link"
        >
          {t('feedback.linkText')}
        </a>
      </footer>

      <SectionErrorBoundary sectionName="Quick Actions" compact>
        <QuickActionsMenu onOpenSearch={openSearch} />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Global Search" compact>
        <GlobalSearch isOpen={isSearchOpen} onClose={closeSearch} />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Keyboard Shortcuts" compact>
        <KeyboardShortcutsHelp />
        <SequenceIndicator />
      </SectionErrorBoundary>

      <OnboardingTour
        forceShow={showOnboarding || undefined}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
