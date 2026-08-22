/**
 * Tests voor de lijst met recent bekeken items.
 *
 * De onderliggende hook die de server bevraagt wordt gemockt; hier gaat het om
 * de vertaalslag daarna: welke soorten bij welke categorie horen, welk pad en
 * welk pictogram erbij hoort, hoeveel er opgehaald wordt en hoe lang geleden
 * iets bekeken is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const useRecentViewsMock = vi.fn();
vi.mock('../useRecentViews', () => ({
  useRecentViews: (...args: unknown[]) => useRecentViewsMock(...args),
}));

import {
  useRecentItems,
  formatRelativeTime,
  categoryTranslationKeys,
  itemTypeTranslationKeys,
} from '../useRecentItems';
import type { RecentView } from '../useRecentViews';

/** Bouwt een bekeken item zoals de server dat teruggeeft. */
function bekeken(id: string, itemType: RecentView['itemType'], titel = `Titel ${id}`): RecentView {
  return { id, itemType, itemId: `item-${id}`, itemTitle: titel, viewedAt: '2026-08-20T10:00:00.000Z' };
}

/** Laat de gemockte hook een vaste lijst teruggeven. */
function metViews(views: RecentView[], rest: Record<string, unknown> = {}) {
  useRecentViewsMock.mockReturnValue({ views, isLoading: false, error: null, ...rest });
}

beforeEach(() => {
  useRecentViewsMock.mockReset();
  metViews([]);
});

describe('useRecentItems - ophalen', () => {
  it('haalt voor "alle" precies het gevraagde aantal op zonder filter', () => {
    renderHook(() => useRecentItems('all', 10));

    expect(useRecentViewsMock).toHaveBeenCalledWith(undefined, 10);
  });

  it('haalt bij een categorie ruimer op, omdat er nog gefilterd moet worden', () => {
    renderHook(() => useRecentItems('music', 5));

    expect(useRecentViewsMock).toHaveBeenCalledWith(undefined, 15);
  });

  it('laat de server filteren op lijsten', () => {
    renderHook(() => useRecentItems('lists', 5));

    expect(useRecentViewsMock).toHaveBeenCalledWith('music_list', 15);
  });

  it('gebruikt tien als standaardaantal', () => {
    renderHook(() => useRecentItems());

    expect(useRecentViewsMock).toHaveBeenCalledWith(undefined, 10);
  });

  it('geeft de laadstand en de fout door', () => {
    const fout = new Error('server weg');
    metViews([], { isLoading: true, error: fout });

    const { result } = renderHook(() => useRecentItems());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(fout);
  });

  it('levert een lege lijst wanneer er niets bekeken is', () => {
    const { result } = renderHook(() => useRecentItems());

    expect(result.current.items).toEqual([]);
  });
});

describe('useRecentItems - omzetten naar items', () => {
  it('zet een bekeken muziekstuk om naar pad, categorie en pictogram', () => {
    metViews([bekeken('1', 'music_piece', 'Eine kleine Nachtmusik')]);

    const { result } = renderHook(() => useRecentItems());
    const item = result.current.items[0];

    expect(item.title).toBe('Eine kleine Nachtmusik');
    expect(item.itemId).toBe('item-1');
    expect(item.path).toBe('/music-pieces/item-1');
    expect(item.category).toBe('music');
    expect(item.icon).toContain('M9 19V6l12-3v13');
  });

  it('maakt van het bekeken-moment een echte datum', () => {
    metViews([bekeken('1', 'music_piece')]);

    const { result } = renderHook(() => useRecentItems());

    expect(result.current.items[0].viewedAt).toBeInstanceOf(Date);
    expect(result.current.items[0].viewedAt.toISOString()).toBe('2026-08-20T10:00:00.000Z');
  });

  it('geeft elke soort het bijbehorende pad', () => {
    metViews([
      bekeken('1', 'music_piece'),
      bekeken('2', 'music_title'),
      bekeken('3', 'music_list'),
      bekeken('4', 'rehearsal'),
      bekeken('5', 'concert'),
    ]);

    const { result } = renderHook(() => useRecentItems());

    expect(result.current.items.map((i) => i.path)).toEqual([
      '/music-pieces/item-1',
      '/titles/item-2',
      '/lists/item-3',
      '/rehearsals/item-4',
      '/concerts/item-5',
    ]);
  });
});

describe('useRecentItems - filteren per categorie', () => {
  const alles = [
    bekeken('1', 'music_piece'),
    bekeken('2', 'music_title'),
    bekeken('3', 'music_list'),
    bekeken('4', 'rehearsal'),
    bekeken('5', 'concert'),
  ];

  it('houdt bij "muziek" zowel stukken als titels over', () => {
    metViews(alles);

    const { result } = renderHook(() => useRecentItems('music'));

    expect(result.current.items.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('houdt bij "repetities" zowel repetities als concerten over', () => {
    metViews(alles);

    const { result } = renderHook(() => useRecentItems('rehearsals'));

    expect(result.current.items.map((i) => i.id)).toEqual(['4', '5']);
  });

  it('laat bij "alle" alles staan', () => {
    metViews(alles);

    const { result } = renderHook(() => useRecentItems('all'));

    expect(result.current.items).toHaveLength(5);
  });

  it('kapt de lijst af op het gevraagde aantal', () => {
    metViews([bekeken('1', 'music_piece'), bekeken('2', 'music_title'), bekeken('3', 'music_piece')]);

    const { result } = renderHook(() => useRecentItems('music', 2));

    expect(result.current.items.map((i) => i.id)).toEqual(['1', '2']);
  });
});

describe('useRecentItems - groeperen', () => {
  it('zet elk item in zijn eigen groep en in de groep "alle"', () => {
    metViews([bekeken('1', 'music_piece'), bekeken('3', 'music_list'), bekeken('5', 'concert')]);

    const { result } = renderHook(() => useRecentItems());
    const groepen = result.current.groupedItems;

    expect(groepen.music.map((i) => i.id)).toEqual(['1']);
    expect(groepen.lists.map((i) => i.id)).toEqual(['3']);
    expect(groepen.rehearsals.map((i) => i.id)).toEqual(['5']);
    expect(groepen.all.map((i) => i.id)).toEqual(['1', '3', '5']);
  });

  it('houdt lege groepen leeg in plaats van weg te laten', () => {
    metViews([bekeken('1', 'music_piece')]);

    const { result } = renderHook(() => useRecentItems());

    expect(result.current.groupedItems.lists).toEqual([]);
    expect(result.current.groupedItems.rehearsals).toEqual([]);
  });
});

describe('formatRelativeTime', () => {
  const t = (key: string, opties?: Record<string, unknown>) => (opties ? `${key}:${opties.count}` : key);
  const nu = new Date('2026-08-22T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(nu);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Een moment zoveel milliseconden geleden. */
  const geleden = (ms: number) => new Date(nu.getTime() - ms);

  it('zegt "zojuist" binnen de minuut', () => {
    expect(formatRelativeTime(geleden(30 * 1000), t)).toBe('recentItems.time.justNow');
  });

  it('telt de minuten binnen het uur', () => {
    expect(formatRelativeTime(geleden(45 * 60 * 1000), t)).toBe('recentItems.time.minutesAgo:45');
  });

  it('telt de uren binnen de dag', () => {
    expect(formatRelativeTime(geleden(5 * 3600 * 1000), t)).toBe('recentItems.time.hoursAgo:5');
  });

  it('zegt "gisteren" bij precies een dag geleden', () => {
    expect(formatRelativeTime(geleden(25 * 3600 * 1000), t)).toBe('recentItems.time.yesterday');
  });

  it('telt de dagen binnen de week', () => {
    expect(formatRelativeTime(geleden(3 * 86400 * 1000), t)).toBe('recentItems.time.daysAgo:3');
  });

  it('geeft vanaf een week gewoon de datum', () => {
    const oud = geleden(10 * 86400 * 1000);

    expect(formatRelativeTime(oud, t)).toBe(oud.toLocaleDateString());
  });

  it('zit op de grens van een uur nog op minuten', () => {
    expect(formatRelativeTime(geleden(59 * 60 * 1000), t)).toBe('recentItems.time.minutesAgo:59');
  });
});

describe('vertaalsleutels', () => {
  it('heeft voor elke categorie een sleutel', () => {
    expect(categoryTranslationKeys).toEqual({
      all: 'recentItems.categories.all',
      music: 'recentItems.categories.music',
      lists: 'recentItems.categories.lists',
      rehearsals: 'recentItems.categories.rehearsals',
    });
  });

  it('heeft voor elke soort een sleutel', () => {
    expect(Object.keys(itemTypeTranslationKeys).sort()).toEqual([
      'concert',
      'music_list',
      'music_piece',
      'music_title',
      'rehearsal',
    ]);
  });
});
