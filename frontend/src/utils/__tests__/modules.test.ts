/**
 * Welke paden verdwijnen als een module uit staat.
 *
 * Twee dingen die makkelijk misgaan en hier zijn vastgelegd:
 *   - een pad dat bij geen enkele module hoort moet altijd zichtbaar blijven,
 *     anders verdwijnt bij de eerste de beste tikfout de halve navigatie;
 *   - een onderliggende pagina (/accounting/facturen/123) hoort net zo goed
 *     verborgen te zijn als de hoofdpagina, want anders komt een bewaarde
 *     link er alsnog langs.
 */

import { describe, it, expect } from 'vitest';
import { moduleForPath, isPathVisible, isLocationHidden } from '../modules';

const ALL = [
  'accounting',
  'ticketing',
  'stage',
  'polls',
  'tasks',
  'posts',
  'mailings',
  'contacts',
  'issues',
  'practice',
  'externals',
  'inventory',
  'projects',
  'resources',
  'wiki',
  'performances',
  'workflows',
  'seasons',
  'attendance',
];
const NONE: string[] = [];

describe('moduleForPath', () => {
  it.each([
    ['/accounting', 'accounting'],
    ['/ticket-sales', 'ticketing'],
    ['/payment-settings', 'ticketing'],
    ['/stage-designer', 'stage'],
    ['/polls', 'polls'],
    ['/email-campaigns', 'mailings'],
    ['/practice-schedules', 'practice'],
    ['/replacement-requests', 'externals'],
    ['/uniforms', 'inventory'],
    ['/tours', 'projects'],
    ['/season-planner', 'seasons'],
    ['/attendance-analytics', 'attendance'],
  ])('koppelt %s aan %s', (path, expected) => {
    expect(moduleForPath(path)).toBe(expected);
  });

  // De kern moet vrij blijven: zonder deze paden is er geen applicatie meer,
  // dus ze horen bij geen enkele module.
  it.each([
    '/rehearsals',
    '/availability',
    '/members',
    '/concerts',
    '/music-pieces',
    '/lists',
    '/titles',
    '/upload',
    '/my-music',
    '/users',
    '/orchestras',
    '/',
    '/settings',
    '/modules',
    '/health',
  ])('laat %s vrij', (path) => {
    expect(moduleForPath(path)).toBeNull();
  });
});

describe('isPathVisible', () => {
  it('toont een pad zonder module altijd, ook als er niets aan staat', () => {
    expect(isPathVisible('/rehearsals', NONE)).toBe(true);
  });

  it('verbergt een pad waarvan de module uit staat', () => {
    expect(isPathVisible('/accounting', NONE)).toBe(false);
  });

  it('toont een pad waarvan de module aan staat', () => {
    expect(isPathVisible('/accounting', ['accounting'])).toBe(true);
  });

  it('raakt de andere modules niet', () => {
    expect(isPathVisible('/ticket-sales', ['accounting'])).toBe(false);
    expect(isPathVisible('/accounting', ['accounting'])).toBe(true);
  });
});

describe('isLocationHidden', () => {
  it('verbergt de hoofdpagina van een uitgezette module', () => {
    expect(isLocationHidden('/accounting', NONE)).toBe(true);
  });

  it('verbergt ook onderliggende paginas', () => {
    expect(isLocationHidden('/accounting/facturen/123', NONE)).toBe(true);
  });

  it('verbergt niets als alles aan staat', () => {
    expect(isLocationHidden('/accounting/facturen/123', ALL)).toBe(false);
  });

  it('verbergt geen pad dat alleen op een module lijkt', () => {
    // /seating-plan-archief begint met /seating maar is een ander pad; alleen
    // een volledig segment telt.
    expect(isLocationHidden('/seating-plan-archief', NONE)).toBe(false);
  });

  it('laat gewone paginas met rust', () => {
    expect(isLocationHidden('/rehearsals/2026-09-15', NONE)).toBe(false);
    expect(isLocationHidden('/', NONE)).toBe(false);
  });
});
