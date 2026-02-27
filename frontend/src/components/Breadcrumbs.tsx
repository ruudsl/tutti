import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

// Route to breadcrumb mapping
const routeConfig: Record<string, { labelKey: string; parent?: string }> = {
  '/': { labelKey: 'nav.dashboard' },
  '/my-music': { labelKey: 'nav.myMusic', parent: '/' },
  '/tools': { labelKey: 'nav.tools', parent: '/' },
  '/issues': { labelKey: 'nav.issues', parent: '/' },
  '/rehearsals': { labelKey: 'nav.rehearsals', parent: '/' },
  '/profile': { labelKey: 'profile.title', parent: '/' },
  '/lists': { labelKey: 'nav.lists', parent: '/' },
  '/music-pieces': { labelKey: 'nav.pieces', parent: '/' },
  '/titles': { labelKey: 'nav.titles', parent: '/' },
  '/upload': { labelKey: 'nav.upload', parent: '/' },
  '/concerts': { labelKey: 'nav.concerts', parent: '/' },
  '/instruments': { labelKey: 'nav.instruments', parent: '/' },
  '/genres': { labelKey: 'nav.genres', parent: '/' },
  '/pdf-tools': { labelKey: 'nav.pdfTools', parent: '/' },
  '/loans': { labelKey: 'nav.loans', parent: '/' },
  '/statistics': { labelKey: 'nav.statistics', parent: '/' },
  '/users': { labelKey: 'nav.members', parent: '/' },
  '/orchestras': { labelKey: 'nav.orchestras', parent: '/' },
  '/settings': { labelKey: 'nav.settings', parent: '/' },
  '/theme': { labelKey: 'nav.theme', parent: '/' },
  '/changelog': { labelKey: 'nav.changelog', parent: '/' },
  '/equipment': { labelKey: 'nav.equipment', parent: '/' },
  '/uniforms': { labelKey: 'nav.uniforms', parent: '/' },
  '/entra-sync': { labelKey: 'nav.entraSync', parent: '/' },
  '/onboarding': { labelKey: 'nav.onboarding', parent: '/' },
  '/user-guide': { labelKey: 'userGuide.title', parent: '/' },
  '/audit-logs': { labelKey: 'auditLogs.title', parent: '/' },
};

export function Breadcrumbs() {
  const location = useLocation();
  const { t } = useTranslation();

  // Don't show breadcrumbs on dashboard
  if (location.pathname === '/') {
    return null;
  }

  const buildBreadcrumbs = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [];
    let currentPath = location.pathname;

    // Handle dynamic routes (e.g., /lists/:orchestraId/:listId)
    const basePath = '/' + currentPath.split('/').filter(Boolean)[0];
    const config = routeConfig[basePath] || routeConfig[currentPath];

    if (!config) {
      return [{ label: t('nav.dashboard'), path: '/' }];
    }

    // Build path from parent to current
    const paths: string[] = [];
    let path: string | undefined = basePath;

    while (path) {
      paths.unshift(path);
      path = routeConfig[path]?.parent;
    }

    paths.forEach((p, index) => {
      const cfg = routeConfig[p];
      if (cfg) {
        items.push({
          label: t(cfg.labelKey),
          path: index < paths.length - 1 ? p : undefined,
        });
      }
    });

    return items;
  };

  const breadcrumbs = buildBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label={t('accessibility.breadcrumbs')}>
      <ol className="breadcrumbs-list">
        {breadcrumbs.map((item, index) => (
          <li key={index} className="breadcrumbs-item">
            {item.path ? (
              <>
                <Link to={item.path} className="breadcrumbs-link">
                  {item.label}
                </Link>
                <span className="breadcrumbs-separator" aria-hidden="true">/</span>
              </>
            ) : (
              <span className="breadcrumbs-current" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
