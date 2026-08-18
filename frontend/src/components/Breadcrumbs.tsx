import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BreadcrumbItem {
  label: string;
  path?: string;
  isDynamic?: boolean;
}

interface BreadcrumbContext {
  [key: string]: {
    label: string;
    parentPath?: string;
  };
}

// Route to breadcrumb mapping
const routeConfig: Record<string, { labelKey: string; parent?: string }> = {
  '/': { labelKey: 'nav.dashboard' },
  '/my-music': { labelKey: 'nav.myMusic', parent: '/' },
  '/tools': { labelKey: 'nav.tools', parent: '/' },
  '/issues': { labelKey: 'nav.issues', parent: '/' },
  '/contacts': { labelKey: 'nav.contacts', parent: '/' },
  '/custom-fields': { labelKey: 'nav.customFields', parent: '/' },
  '/privacy-settings': { labelKey: 'nav.privacySettings', parent: '/' },
  '/polls': { labelKey: 'nav.polls', parent: '/' },
  '/tasks': { labelKey: 'nav.tasks', parent: '/' },
  '/posts': { labelKey: 'nav.posts', parent: '/' },
  '/email-campaigns': { labelKey: 'nav.emailCampaigns', parent: '/' },
  '/accounting': { labelKey: 'nav.accounting', parent: '/' },
  '/rehearsals': { labelKey: 'nav.rehearsals', parent: '/' },
  '/profile': { labelKey: 'profile.title', parent: '/' },
  '/lists': { labelKey: 'nav.lists', parent: '/' },
  '/music-pieces': { labelKey: 'nav.pieces', parent: '/' },
  '/titles': { labelKey: 'nav.titles', parent: '/' },
  '/upload': { labelKey: 'nav.upload', parent: '/' },
  '/concerts': { labelKey: 'nav.concerts', parent: '/' },
  '/genres': { labelKey: 'nav.genres', parent: '/' },
  '/pdf-tools': { labelKey: 'nav.pdfTools', parent: '/' },
  '/loans': { labelKey: 'nav.loans', parent: '/' },
  '/statistics': { labelKey: 'nav.statistics', parent: '/' },
  '/users': { labelKey: 'nav.members', parent: '/' },
  '/orchestras': { labelKey: 'nav.orchestras', parent: '/' },
  '/settings': { labelKey: 'nav.settings', parent: '/' },
  '/theme': { labelKey: 'nav.theme', parent: '/' },
  '/changelog': { labelKey: 'nav.changelog', parent: '/' },
  '/uniforms': { labelKey: 'nav.uniforms', parent: '/' },
  '/entra-sync': { labelKey: 'nav.entraSync', parent: '/' },
  '/onboarding': { labelKey: 'nav.onboarding', parent: '/' },
  '/user-guide': { labelKey: 'userGuide.title', parent: '/' },
  '/audit-logs': { labelKey: 'auditLogs.title', parent: '/' },
  '/members': { labelKey: 'nav.memberDirectory', parent: '/' },
  '/seating': { labelKey: 'nav.seating', parent: '/' },
  '/voice-parts': { labelKey: 'nav.voiceParts', parent: '/' },
  '/occupancy': { labelKey: 'nav.occupancy', parent: '/' },
  '/neighbor-preferences': { labelKey: 'nav.neighborPreferences', parent: '/' },
  '/projects': { labelKey: 'nav.projects', parent: '/' },
  '/tours': { labelKey: 'nav.tours', parent: '/' },
  '/resources': { labelKey: 'nav.resources', parent: '/' },
  '/equipment': { labelKey: 'nav.equipment', parent: '/' },
};

// Extended route config with nested paths
const nestedRouteConfig: Record<string, { labelKey: string; parent: string }> = {
  '/lists/:orchestraId': { labelKey: 'breadcrumbs.orchestra', parent: '/lists' },
  '/lists/:orchestraId/:listId': { labelKey: 'breadcrumbs.list', parent: '/lists/:orchestraId' },
  '/lists/:orchestraId/:listId/:titleId': { labelKey: 'breadcrumbs.title', parent: '/lists/:orchestraId/:listId' },
  '/rehearsals/:id': { labelKey: 'breadcrumbs.rehearsalDetail', parent: '/rehearsals' },
  '/concerts/:id': { labelKey: 'breadcrumbs.concertDetail', parent: '/concerts' },
  '/music-pieces/:id': { labelKey: 'breadcrumbs.pieceDetail', parent: '/music-pieces' },
  '/titles/:id': { labelKey: 'breadcrumbs.titleDetail', parent: '/titles' },
  '/uniforms/:id': { labelKey: 'breadcrumbs.uniformDetail', parent: '/uniforms' },
  '/users/:id': { labelKey: 'breadcrumbs.userDetail', parent: '/users' },
  '/equipment/:id': { labelKey: 'breadcrumbs.equipmentDetail', parent: '/equipment' },
  '/projects/:id': { labelKey: 'breadcrumbs.projectDetail', parent: '/projects' },
  '/tours/:id': { labelKey: 'breadcrumbs.tourDetail', parent: '/tours' },
  '/resources/:id': { labelKey: 'breadcrumbs.resourceDetail', parent: '/resources' },
  '/contacts/:id': { labelKey: 'breadcrumbs.contactDetail', parent: '/contacts' },
  '/polls/:id': { labelKey: 'breadcrumbs.pollDetail', parent: '/polls' },
  '/tasks/:id': { labelKey: 'breadcrumbs.taskDetail', parent: '/tasks' },
};

// Maximum items to show before collapsing
const MAX_VISIBLE_ITEMS = 4;

// Store for dynamic breadcrumb context (set by pages)
const dynamicContext: BreadcrumbContext = {};

export function setBreadcrumbContext(key: string, label: string, parentPath?: string) {
  dynamicContext[key] = { label, parentPath };
}

export function clearBreadcrumbContext(key: string) {
  delete dynamicContext[key];
}

export function Breadcrumbs() {
  const location = useLocation();
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLLIElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [location.pathname]);

  // Don't show breadcrumbs on dashboard
  if (location.pathname === '/') {
    return null;
  }

  const buildBreadcrumbs = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [];
    const pathSegments = location.pathname.split('/').filter(Boolean);

    // Always start with dashboard
    items.push({ label: t('nav.dashboard'), path: '/' });

    // Check if we have a matching nested route
    const matchNestedRoute = (): { config: typeof nestedRouteConfig[string]; pattern: string } | null => {
      for (const pattern of Object.keys(nestedRouteConfig)) {
        const patternSegments = pattern.split('/').filter(Boolean);
        if (patternSegments.length !== pathSegments.length) continue;

        let matches = true;
        for (let i = 0; i < patternSegments.length; i++) {
          const isParam = patternSegments[i].startsWith(':');
          if (!isParam && patternSegments[i] !== pathSegments[i]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return { config: nestedRouteConfig[pattern], pattern };
        }
      }
      return null;
    };

    const nestedMatch = matchNestedRoute();

    if (nestedMatch) {
      // Build breadcrumbs using the nested route config
      let currentPattern = nestedMatch.pattern;

      // Collect all parent patterns
      const patterns: string[] = [currentPattern];
      while (nestedRouteConfig[currentPattern]?.parent) {
        currentPattern = nestedRouteConfig[currentPattern].parent;
        patterns.unshift(currentPattern);
      }

      // Process each pattern
      for (const pattern of patterns) {
        const patternSegments = pattern.split('/').filter(Boolean);
        let path = '';

        for (let i = 0; i < patternSegments.length; i++) {
          if (patternSegments[i].startsWith(':')) {
            path += '/' + pathSegments[i];
          } else {
            path += '/' + patternSegments[i];
          }
        }

        // Check if this is a base route with static config
        const baseConfig = routeConfig[path] || routeConfig['/' + patternSegments[0]];
        const nestedConfig = nestedRouteConfig[pattern];

        if (baseConfig && pattern === '/' + patternSegments[0]) {
          items.push({
            label: t(baseConfig.labelKey),
            path: pattern === nestedMatch.pattern ? undefined : path,
          });
        } else if (nestedConfig) {
          // Check for dynamic context
          const contextKey = path;
          const context = dynamicContext[contextKey];

          items.push({
            label: context?.label || t(nestedConfig.labelKey),
            path: pattern === nestedMatch.pattern ? undefined : path,
            isDynamic: !!context,
          });
        }
      }
    } else {
      // Handle simple routes
      const basePath = '/' + pathSegments[0];
      const config = routeConfig[basePath] || routeConfig[location.pathname];

      if (!config) {
        return items;
      }

      // Build path from parent to current
      const paths: string[] = [];
      let path: string | undefined = basePath;

      while (path) {
        paths.unshift(path);
        path = routeConfig[path]?.parent;
      }

      // Skip dashboard as we already added it
      paths.forEach((p, index) => {
        if (p === '/') return;
        const cfg = routeConfig[p];
        if (cfg) {
          items.push({
            label: t(cfg.labelKey),
            path: index < paths.length - 1 ? p : undefined,
          });
        }
      });

      // Handle detail pages with dynamic segments
      if (pathSegments.length > 1) {
        const detailContext = dynamicContext[location.pathname];
        if (detailContext) {
          items.push({
            label: detailContext.label,
            isDynamic: true,
          });
        }
      }
    }

    return items;
  };

  const breadcrumbs = buildBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return null;
  }

  // Determine if we need to collapse breadcrumbs
  const shouldCollapse = breadcrumbs.length > MAX_VISIBLE_ITEMS;
  const collapsedItems = shouldCollapse ? breadcrumbs.slice(1, -2) : [];
  const visibleStart = shouldCollapse ? [breadcrumbs[0]] : breadcrumbs.slice(0, -1);
  const visibleEnd = shouldCollapse ? breadcrumbs.slice(-2) : [];

  const renderBreadcrumbItem = (
    item: BreadcrumbItem,
    index: number,
    _isLast: boolean,
    showSeparator: boolean = true
  ) => (
    <li key={index} className="breadcrumbs-item">
      {item.path ? (
        <>
          <Link to={item.path} className="breadcrumbs-link">
            {item.label}
          </Link>
          {showSeparator && (
            <span className="breadcrumbs-separator" aria-hidden="true">
              /
            </span>
          )}
        </>
      ) : (
        <span className="breadcrumbs-current" aria-current="page">
          {item.label}
        </span>
      )}
    </li>
  );

  return (
    <nav className="breadcrumbs" aria-label={t('accessibility.breadcrumbs')}>
      <ol className="breadcrumbs-list">
        {shouldCollapse ? (
          <>
            {/* First item (Dashboard) */}
            {renderBreadcrumbItem(visibleStart[0], 0, false)}

            {/* Collapsed items dropdown */}
            <li className="breadcrumbs-item breadcrumbs-collapsed" ref={dropdownRef}>
              <button
                type="button"
                className="breadcrumbs-collapse-btn"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-expanded={isDropdownOpen}
                aria-haspopup="menu"
                aria-label={t('breadcrumbs.showMore')}
              >
                ...
              </button>
              <span className="breadcrumbs-separator" aria-hidden="true">
                /
              </span>

              {isDropdownOpen && (
                <div className="breadcrumbs-dropdown" role="menu">
                  {collapsedItems.map((item, index) => (
                    <Link
                      key={index}
                      to={item.path || '#'}
                      className="breadcrumbs-dropdown-item"
                      role="menuitem"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>

            {/* Last two visible items */}
            {visibleEnd.map((item, index) =>
              renderBreadcrumbItem(
                item,
                index + visibleStart.length + collapsedItems.length,
                index === visibleEnd.length - 1
              )
            )}
          </>
        ) : (
          // Normal rendering without collapse
          breadcrumbs.map((item, index) =>
            renderBreadcrumbItem(item, index, index === breadcrumbs.length - 1)
          )
        )}
      </ol>

      <style>{`
        .breadcrumbs {
          margin-bottom: 1rem;
        }

        .breadcrumbs-list {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.25rem;
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 0.875rem;
        }

        .breadcrumbs-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .breadcrumbs-link {
          color: var(--primary);
          text-decoration: none;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          transition: background-color 0.15s, color 0.15s;
        }

        .breadcrumbs-link:hover {
          background-color: var(--primary-light, rgba(var(--primary-rgb, 59, 130, 246), 0.1));
          text-decoration: underline;
        }

        .breadcrumbs-link:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .breadcrumbs-current {
          color: var(--text);
          font-weight: 500;
          padding: 0.125rem 0.25rem;
        }

        .breadcrumbs-separator {
          color: var(--text-light);
          user-select: none;
        }

        .breadcrumbs-collapsed {
          position: relative;
        }

        .breadcrumbs-collapse-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          padding: 0;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 0.25rem;
          color: var(--text-light);
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: bold;
          transition: background-color 0.15s, border-color 0.15s;
        }

        .breadcrumbs-collapse-btn:hover {
          background-color: var(--background);
          border-color: var(--text-light);
        }

        .breadcrumbs-collapse-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .breadcrumbs-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 12rem;
          margin-top: 0.25rem;
          padding: 0.25rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }

        .breadcrumbs-dropdown-item {
          display: block;
          padding: 0.5rem 0.75rem;
          color: var(--text);
          text-decoration: none;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          transition: background-color 0.15s;
        }

        .breadcrumbs-dropdown-item:hover {
          background-color: var(--background);
        }

        .breadcrumbs-dropdown-item:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
        }

        @media (max-width: 640px) {
          .breadcrumbs-list {
            font-size: 0.8125rem;
          }
        }
      `}</style>
    </nav>
  );
}

// Hook to set dynamic breadcrumb context
export function useBreadcrumbContext(
  path: string,
  label: string | undefined,
  parentPath?: string
) {
  useEffect(() => {
    if (label) {
      setBreadcrumbContext(path, label, parentPath);
    }
    return () => {
      clearBreadcrumbContext(path);
    };
  }, [path, label, parentPath]);
}
