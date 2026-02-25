import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';

interface NavItem {
  path: string;
  labelKey: string;
  roles?: string[]; // If undefined, visible to all
}

interface NavGroup {
  titleKey: string;
  icon: string;
  basePaths: string[]; // Routes that trigger this sidebar
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleKey: 'sidebar.agenda',
    icon: '📅',
    basePaths: ['/rehearsals', '/concerts', '/seating'],
    items: [
      { path: '/rehearsals', labelKey: 'nav.rehearsals' },
      { path: '/concerts', labelKey: 'nav.concerts', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
      { path: '/seating', labelKey: 'nav.seating', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR] },
    ],
  },
  {
    titleKey: 'sidebar.members',
    icon: '👥',
    basePaths: ['/members', '/issues'],
    items: [
      { path: '/members', labelKey: 'nav.memberDirectory' },
      { path: '/issues', labelKey: 'nav.issues' },
    ],
  },
  {
    titleKey: 'sidebar.library',
    icon: '📚',
    basePaths: ['/lists', '/music-pieces', '/titles', '/upload', '/loans', '/instruments', '/genres', '/statistics', '/pdf-tools'],
    items: [
      { path: '/music-pieces', labelKey: 'nav.pieces', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/lists', labelKey: 'nav.lists', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/titles', labelKey: 'nav.titles', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/upload', labelKey: 'nav.upload', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/loans', labelKey: 'nav.loans', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/pdf-tools', labelKey: 'nav.pdfTools', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/instruments', labelKey: 'nav.instruments', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/genres', labelKey: 'nav.genres', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
      { path: '/statistics', labelKey: 'nav.statistics', roles: [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] },
    ],
  },
  {
    titleKey: 'sidebar.inventory',
    icon: '📦',
    basePaths: ['/equipment', '/uniforms'],
    items: [
      { path: '/equipment', labelKey: 'nav.equipment', roles: [ROLES.ADMIN, ROLES.EQUIPMENT_COMMITTEE] },
      { path: '/uniforms', labelKey: 'nav.uniforms', roles: [ROLES.ADMIN, ROLES.UNIFORMS_COMMITTEE] },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    icon: '⚙️',
    basePaths: ['/users', '/orchestras', '/settings', '/entra-sync', '/theme', '/changelog', '/audit-logs'],
    items: [
      { path: '/users', labelKey: 'nav.members', roles: [ROLES.ADMIN] },
      { path: '/orchestras', labelKey: 'nav.orchestras', roles: [ROLES.ADMIN] },
      { path: '/settings', labelKey: 'nav.settings', roles: [ROLES.ADMIN] },
      { path: '/entra-sync', labelKey: 'nav.entraSync', roles: [ROLES.ADMIN] },
      { path: '/theme', labelKey: 'nav.theme', roles: [ROLES.ADMIN] },
      { path: '/changelog', labelKey: 'nav.changelog', roles: [ROLES.ADMIN] },
      { path: '/audit-logs', labelKey: 'nav.auditLogs', roles: [ROLES.ADMIN] },
    ],
  },
];

export function ContextSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();

  // Find the active nav group based on current path
  const activeGroup = navGroups.find(group =>
    group.basePaths.some(basePath => location.pathname.startsWith(basePath))
  );

  if (!activeGroup) {
    return null; // No sidebar for pages like Dashboard, My Music, Tools, Profile
  }

  // Filter items based on user role
  const visibleItems = activeGroup.items.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  // Don't show sidebar if user has no access to any items
  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <aside className="context-sidebar" aria-label={t(activeGroup.titleKey)}>
      <div className="sidebar-header">
        <span className="sidebar-icon" aria-hidden="true">{activeGroup.icon}</span>
        <span className="sidebar-title">{t(activeGroup.titleKey)}</span>
      </div>
      <nav className="sidebar-nav">
        <ul>
          {visibleItems.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export function useHasSidebar(): boolean {
  const location = useLocation();
  const { user } = useAuth();

  const activeGroup = navGroups.find(group =>
    group.basePaths.some(basePath => location.pathname.startsWith(basePath))
  );

  if (!activeGroup) return false;

  const visibleItems = activeGroup.items.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  return visibleItems.length > 0;
}
