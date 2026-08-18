/**
 * Welke paden bij welke module horen.
 *
 * Dit is de frontend-helft van backend/src/modules/registry.ts. De backend is
 * de baas over wat er bestaat en wat er aan staat; deze tabel bepaalt alleen
 * welke navigatie-items en routes verdwijnen zodra een module uit gaat.
 *
 * Uitzetten verbergt, het verwijdert niets: de gegevens blijven staan en komen
 * bij aanzetten ongewijzigd terug.
 */

/** Modulesleutel per pad. Wat hier niet in staat, is altijd zichtbaar. */
const MODULE_BY_PATH: Record<string, string> = {
  '/accounting': 'accounting',

  '/my-tickets': 'ticketing',
  '/ticket-sales': 'ticketing',
  '/ticket-scanner': 'ticketing',
  '/payment-settings': 'ticketing',

  '/seating': 'stage',
  '/voice-parts': 'stage',
  '/occupancy': 'stage',
  '/neighbor-preferences': 'stage',
  '/stage-designer': 'stage',

  '/polls': 'polls',
  '/tasks': 'tasks',
  '/posts': 'posts',
  '/email-campaigns': 'mailings',
  '/contacts': 'contacts',
  '/issues': 'issues',

  '/practice': 'practice',
  '/practice-schedules': 'practice',

  '/external-musicians': 'externals',
  '/replacement-requests': 'externals',

  '/instrument-assets': 'inventory',
  '/uniforms': 'inventory',
  '/equipment': 'inventory',
  '/outfits': 'inventory',

  '/projects': 'projects',
  '/tours': 'projects',

  '/resources': 'resources',
  '/wiki': 'wiki',
  '/performances': 'performances',
  '/workflows': 'workflows',
  '/season-planner': 'seasons',
  '/attendance-analytics': 'attendance',
};

/** De module waar dit pad bij hoort, of null als het pad altijd zichtbaar is. */
export function moduleForPath(path: string): string | null {
  return MODULE_BY_PATH[path] ?? null;
}

/**
 * Mag dit pad worden getoond?
 *
 * @param path       het pad uit de navigatie, bijvoorbeeld '/ticket-sales'
 * @param enabled    de sleutels van de modules die aan staan
 */
export function isPathVisible(path: string, enabled: string[]): boolean {
  const key = moduleForPath(path);
  return key === null || enabled.includes(key);
}

/**
 * Hoort deze locatie bij een uitgezette module?
 *
 * Kijkt naar het voorvoegsel, zodat ook /accounting/facturen/123 meetelt.
 */
export function isLocationHidden(pathname: string, enabled: string[]): boolean {
  return Object.entries(MODULE_BY_PATH).some(
    ([path, key]) => (pathname === path || pathname.startsWith(`${path}/`)) && !enabled.includes(key),
  );
}
