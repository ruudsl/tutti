/**
 * De indeling van het dashboard: welke vakken, in welke volgorde.
 *
 * Deze hook bewaart de indeling in localStorage en houdt twee lijsten uit
 * elkaar: `widgets` (wat er getekend wordt) en `allWidgets` (wat er in de
 * bewerkstand te zien is, inclusief de uitgezette vakken). Het scherm werkt
 * met indexen in die getoonde lijst - een sleepactie zegt "het derde vak gaat
 * naar de eerste plek" - terwijl de hook zijn eigen lijst in een andere
 * volgorde bewaart.
 *
 * Precies daar zat de fout die dit bestand bewijst, zie
 * 'slepen verplaatst het vak dat de gebruiker aanwijst'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardWidgets } from '../useDashboardWidgets';
import type { DashboardWidget } from '../useDashboardWidgets';

// De aan/uit-stand van de modules is per test te zetten.
let aangezetteModules: string[] = ['tasks', 'practice', 'posts'];
vi.mock('../../context/ModulesContext', () => ({
  useModules: () => ({
    enabled: aangezetteModules,
    loading: false,
    loaded: true,
    isEnabled: (sleutel: string) => aangezetteModules.includes(sleutel),
    refresh: async () => {},
  }),
}));

const OPSLAGSLEUTEL = 'dashboard-widgets';

/** Wat er in localStorage staat, als lijst van id met volgnummer. */
function bewaardeVolgorde(): [string, number][] {
  const rauw = JSON.parse(localStorage.getItem(OPSLAGSLEUTEL)!) as DashboardWidget[];
  return rauw.map((w) => [w.id, w.order]);
}

beforeEach(() => {
  localStorage.clear();
  aangezetteModules = ['tasks', 'practice', 'posts'];
});

describe('dashboardindeling - laden', () => {
  it('begint met de standaardindeling als er nog niets bewaard is', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.allWidgets.map((w) => w.id)).toEqual([
      'stats',
      'tasks',
      'music-lists',
      'upcoming-rehearsals',
      'recent-activity',
      'practice-progress',
      'favorites',
      'quick-actions',
      'announcements',
    ]);
    // Mededelingen staan standaard uit, dus die worden niet getekend.
    expect(result.current.widgets.map((w) => w.id)).not.toContain('announcements');
    expect(result.current.widgets).toHaveLength(8);
  });

  it('neemt de bewaarde keuzes over en vult onbekende vakken aan met de standaard', () => {
    localStorage.setItem(
      OPSLAGSLEUTEL,
      JSON.stringify([{ id: 'favorites', type: 'favorites', title: 'Favorieten', enabled: false, order: 6, size: 'large' }]),
    );

    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.widgets.map((w) => w.id)).not.toContain('favorites');
    expect(result.current.allWidgets.find((w) => w.id === 'favorites')!.size).toBe('large');
    // De rest komt gewoon uit de standaardlijst.
    expect(result.current.allWidgets).toHaveLength(9);
  });

  it('valt terug op de standaard als de bewaarde indeling onleesbaar is', () => {
    localStorage.setItem(OPSLAGSLEUTEL, '{kapot');

    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.allWidgets).toHaveLength(9);
    expect(result.current.widgets[0].id).toBe('stats');
  });

  it('laat vakken van uitgezette modules weg, ook uit de bewerklijst', () => {
    aangezetteModules = ['posts'];

    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.allWidgets.map((w) => w.id)).not.toContain('tasks');
    expect(result.current.allWidgets.map((w) => w.id)).not.toContain('practice-progress');
    expect(result.current.allWidgets.map((w) => w.id)).toContain('announcements');
    expect(result.current.widgets.map((w) => w.id)).not.toContain('tasks');
  });
});

describe('dashboardindeling - aanpassen', () => {
  it('zet een vak uit en bewaart dat', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.toggleWidget('favorites'));

    expect(result.current.widgets.map((w) => w.id)).not.toContain('favorites');
    expect(result.current.allWidgets.find((w) => w.id === 'favorites')!.enabled).toBe(false);
    const bewaard = JSON.parse(localStorage.getItem(OPSLAGSLEUTEL)!) as DashboardWidget[];
    expect(bewaard.find((w) => w.id === 'favorites')!.enabled).toBe(false);
  });

  it('zet een uitgezet vak weer aan', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.toggleWidget('announcements'));

    expect(result.current.widgets.map((w) => w.id)).toContain('announcements');
  });

  it('verandert de grootte van een vak', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.setWidgetSize('favorites', 'full'));

    expect(result.current.allWidgets.find((w) => w.id === 'favorites')!.size).toBe('full');
  });

  it('vult de instellingen van een vak aan zonder de bestaande weg te gooien', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.setWidgetConfig('stats', { periode: 30 }));
    act(() => result.current.setWidgetConfig('stats', { kleur: 'blauw' }));

    expect(result.current.allWidgets.find((w) => w.id === 'stats')!.config).toEqual({
      periode: 30,
      kleur: 'blauw',
    });
  });

  it('zet alles terug op de standaard', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.toggleWidget('favorites'));
    act(() => result.current.setWidgetSize('stats', 'small'));
    act(() => result.current.resetToDefaults());

    expect(result.current.allWidgets.find((w) => w.id === 'favorites')!.enabled).toBe(true);
    expect(result.current.allWidgets.find((w) => w.id === 'stats')!.size).toBe('full');
  });

  it('houdt de bewerkstand bij', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.isEditMode).toBe(false);
    act(() => result.current.setIsEditMode(true));
    expect(result.current.isEditMode).toBe(true);
  });
});

describe('dashboardindeling - slepen', () => {
  it('verplaatst het eerste vak naar de tweede plek', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.reorderWidgets(0, 1));

    expect(result.current.allWidgets.map((w) => w.id).slice(0, 3)).toEqual(['tasks', 'stats', 'music-lists']);
  });

  it('verplaatst een vak van achteren naar voren', () => {
    const { result } = renderHook(() => useDashboardWidgets());

    // Favorieten staat op plek 6 en gaat naar de kop.
    act(() => result.current.reorderWidgets(6, 0));

    expect(result.current.allWidgets.map((w) => w.id).slice(0, 3)).toEqual(['favorites', 'stats', 'tasks']);
  });

  /**
   * Bewijs. Op de oude code was deze test rood.
   *
   * Het scherm sleept in `allWidgets`: gesorteerd op volgnummer en zonder de
   * vakken van uitgezette modules. `reorderWidgets` knipte en plakte in de
   * bewaarde lijst, en die staat in de volgorde van de standaardlijst, mét de
   * weggelaten vakken ertussen. Zodra die twee lijsten uit elkaar lopen pakt
   * een sleepactie het verkeerde vak.
   *
   * Hier staat de takenmodule uit. Het scherm toont dan als eerste twee vakken
   * Statistieken en Mijn muzieklijsten. De gebruiker sleept het eerste naar de
   * tweede plek en verwacht die twee omgedraaid te zien.
   *
   * Oud gedrag: de hook knipte in [stats, tasks, music-lists, ...] en zette
   * stats achter tasks. Beide kregen een nieuw volgnummer, waarna stats nog
   * steeds vóór music-lists stond - de gebruiker sleepte, en er gebeurde in
   * beeld niets. De verplaatsing landde op het onzichtbare takenvak.
   */
  it('slepen verplaatst het vak dat de gebruiker aanwijst, ook als er vakken verborgen zijn', () => {
    aangezetteModules = ['posts'];
    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.allWidgets.map((w) => w.id).slice(0, 2)).toEqual(['stats', 'music-lists']);

    act(() => result.current.reorderWidgets(0, 1));

    expect(result.current.allWidgets.map((w) => w.id).slice(0, 2)).toEqual(['music-lists', 'stats']);
  });

  /**
   * Bewijs. Op de oude code was ook deze test rood.
   *
   * Tweede manier waarop de twee lijsten uit elkaar lopen, en deze heeft geen
   * uitgezette module nodig: na een eerdere sleepactie staat er een eigen
   * volgorde in de opslag. Bij het opnieuw laden zet de hook die vakken terug
   * in de volgorde van de standaardlijst - alleen hun volgnummers zijn
   * verhuisd. Het scherm sorteert wél op volgnummer.
   *
   * Hier stond de gebruiker eerder Favorieten bovenaan. Hij sleept dat vak nu
   * naar de tweede plek. Oud gedrag: de hook knipte het eerste vak uit de
   * bewaarde lijst, en dat is Statistieken - een ander vak dan hij vasthad.
   */
  it('slepen na een eerder bewaarde volgorde pakt niet het verkeerde vak', () => {
    localStorage.setItem(
      OPSLAGSLEUTEL,
      JSON.stringify([
        { id: 'favorites', type: 'favorites', title: 'Favorieten', enabled: true, order: 0, size: 'small' },
        { id: 'stats', type: 'stats', title: 'Statistieken', enabled: true, order: 6, size: 'full' },
      ]),
    );
    const { result } = renderHook(() => useDashboardWidgets());

    expect(result.current.allWidgets[0].id).toBe('favorites');

    act(() => result.current.reorderWidgets(0, 1));

    expect(result.current.allWidgets.map((w) => w.id).slice(0, 2)).toEqual(['tasks', 'favorites']);
    // Statistieken stond op plek 6 en hoort daar te blijven staan.
    expect(result.current.allWidgets.map((w) => w.id)).toContain('stats');
  });

  it('laat de vakken van uitgezette modules op hun eigen plek staan', () => {
    aangezetteModules = ['posts'];
    const { result } = renderHook(() => useDashboardWidgets());

    act(() => result.current.reorderWidgets(0, 1));

    // Taken en oefenvoortgang zijn onzichtbaar, maar hun volgnummers 1 en 5
    // blijven bewaard zodat de indeling terugkomt als de module weer aan gaat.
    const bewaard = new Map(bewaardeVolgorde());
    expect(bewaard.get('tasks')).toBe(1);
    expect(bewaard.get('practice-progress')).toBe(5);
  });

  it('doet niets bij een plek die niet bestaat', () => {
    const { result } = renderHook(() => useDashboardWidgets());
    const voor = result.current.allWidgets.map((w) => w.id);

    act(() => result.current.reorderWidgets(0, 42));

    expect(result.current.allWidgets.map((w) => w.id)).toEqual(voor);
  });
});
