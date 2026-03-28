/**
 * Route prefetching utilities to eliminate spinners on navigation
 *
 * Problem: Lazy-loaded routes show a spinner until the chunk loads.
 * In incognito mode (no service worker cache), this happens on every navigation.
 *
 * Solution: Prefetch route chunks before the user navigates:
 * 1. On hover/focus of navigation links
 * 2. During browser idle time for priority routes
 */

// Map of route paths to their lazy import functions
const routeImports: Record<string, () => Promise<unknown>> = {
  // User pages
  '/profile': () => import('../pages/Profile'),
  '/sessions': () => import('../pages/SessionManagement'),
  '/data-export': () => import('../pages/DataExport'),
  '/my-music': () => import('../pages/MyMusic'),
  '/tools': () => import('../pages/Tools'),
  '/issues': () => import('../pages/Issues'),

  // Music management
  '/music-pieces': () => import('../pages/MusicPieces'),
  '/titles': () => import('../pages/MusicTitles'),
  '/upload': () => import('../pages/Upload'),
  '/pdf-tools': () => import('../pages/PdfTools'),
  '/lists': () => import('../pages/MusicListManager'),
  '/imslp': () => import('../pages/ImslpBrowser'),

  // Reference data
  '/instruments': () => import('../pages/Instruments'),
  '/genres': () => import('../pages/Genres'),
  '/loans': () => import('../pages/Loans'),

  // Statistics
  '/statistics': () => import('../pages/Statistics'),
  '/audit-logs': () => import('../pages/AuditLogs'),

  // Admin
  '/users': () => import('../pages/Users'),
  '/orchestras': () => import('../pages/Orchestras'),
  '/settings': () => import('../pages/Settings'),
  '/theme': () => import('../pages/ThemeSettings'),
  '/changelog': () => import('../pages/Changelog'),
  '/entra-sync': () => import('../pages/EntraSync'),
  '/onboarding': () => import('../pages/Onboarding'),

  // Rehearsals and events
  '/rehearsals': () => import('../pages/Rehearsals'),
  '/concerts': () => import('../pages/Concerts'),

  // Equipment
  '/equipment': () => import('../pages/Equipment'),
  '/uniforms': () => import('../pages/Uniforms'),

  // Seating
  '/seating': () => import('../pages/Seating'),
  '/voice-parts': () => import('../pages/VoiceParts'),
  '/occupancy': () => import('../pages/Occupancy'),
  '/neighbor-preferences': () => import('../pages/NeighborPreferences'),

  // Other
  '/members': () => import('../pages/MemberDirectory'),
  '/user-guide': () => import('../pages/UserGuide'),
  '/practice-schedules': () => import('../pages/PracticeSchedules'),
  '/health': () => import('../pages/HealthDashboard'),
  '/my-tickets': () => import('../pages/MyTickets'),
  '/ticket-scanner': () => import('../pages/TicketScanner'),
};

// Track which routes have been prefetched to avoid duplicate requests
const prefetchedRoutes = new Set<string>();

/**
 * Prefetch a route's chunk
 */
export function prefetchRoute(path: string): void {
  // Normalize path (remove trailing slash, query params)
  const normalizedPath = path.split('?')[0].replace(/\/$/, '') || '/';

  // Skip if already prefetched or no import function
  if (prefetchedRoutes.has(normalizedPath)) return;

  const importFn = routeImports[normalizedPath];
  if (!importFn) return;

  // Mark as prefetched immediately to prevent race conditions
  prefetchedRoutes.add(normalizedPath);

  // Start the import (this loads the chunk)
  importFn().catch(() => {
    // Remove from set so it can be retried
    prefetchedRoutes.delete(normalizedPath);
  });
}

/**
 * Priority routes to prefetch during idle time
 * These are the most commonly accessed pages
 */
const priorityRoutes = [
  '/my-music',
  '/rehearsals',
  '/members',
  '/profile',
  '/tools',
];

/**
 * Prefetch priority routes when the browser is idle
 */
export function prefetchPriorityRoutes(): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(
      () => {
        priorityRoutes.forEach(prefetchRoute);
      },
      { timeout: 3000 }
    );
  } else {
    // Fallback: use setTimeout with delay
    setTimeout(() => {
      priorityRoutes.forEach(prefetchRoute);
    }, 2000);
  }
}

/**
 * Get onMouseEnter/onFocus handlers for prefetching
 */
export function getPrefetchHandlers(path: string) {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
  };
}
