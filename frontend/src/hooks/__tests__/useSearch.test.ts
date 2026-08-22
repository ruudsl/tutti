/**
 * Tests voor de zoekhook.
 *
 * De server wordt gemockt op `fetch`-niveau. Waar het hier om gaat: hoeveel
 * verzoeken er de deur uit gaan (een zoekhook die per render opnieuw begint
 * legt de server plat), wanneer er juist niet gezocht wordt, en hoe de
 * toetsenbordnavigatie door de resultaten loopt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearch, useSearchCategoryLabels, type SearchResult } from '../useSearch';

const resultaat = (id: string, type: SearchResult['type'] = 'music'): SearchResult => ({
  id,
  type,
  title: `Titel ${id}`,
  path: `/x/${id}`,
  icon: 'music',
});

/** Antwoord dat past bij elk van de drie eindpunten die de hook gebruikt. */
function antwoord(body: unknown) {
  return { ok: true, statusText: 'OK', json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Aanroepen van fetch naar een bepaald eindpunt. */
function aanroepen(deel: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(deel));
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/search/suggestions')) return antwoord({ suggestions: ['aap', 'noot'] });
    if (String(url).includes('/search/recent')) return antwoord({ searches: [] });
    return antwoord({ results: [], total: 0, query: '' });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSearch - verzoeken beperken', () => {
  it('blijft niet in een lus zoeken zolang de zoekterm niet verandert', async () => {
    // Zonder een stabiele filterwaarde draait het zoek-effect na elke render
    // opnieuw, terwijl dat effect zelf state zet. Dat is een zichzelf
    // aanjagende lus die de server met verzoeken bestookt.
    const { result } = renderHook(() => useSearch());

    await waitFor(() => expect(aanroepen('/search/recent').length).toBeGreaterThan(0));

    act(() => {
      result.current.setQuery('mozart');
    });

    await waitFor(() => expect(aanroepen('/search?').length).toBe(1));

    // Even laten bezinken: er mag geen tweede ronde op gang komen.
    await new Promise((r) => setTimeout(r, 300));

    expect(aanroepen('/search?')).toHaveLength(1);
    expect(aanroepen('/search/suggestions')).toHaveLength(1);
    expect(aanroepen('/search/recent')).toHaveLength(1);
  });

  it('begint niet opnieuw wanneer de aanroeper elke render een nieuw filterobject doorgeeft', async () => {
    const { rerender } = renderHook(() => useSearch('mozart', { type: 'music' }));

    await waitFor(() => expect(aanroepen('/search?').length).toBe(1));

    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 300));

    expect(aanroepen('/search?')).toHaveLength(1);
  });

  it('zoekt wel opnieuw wanneer het filter inhoudelijk verandert', async () => {
    const { rerender } = renderHook(({ type }) => useSearch('mozart', { type }), {
      initialProps: { type: 'music' },
    });

    await waitFor(() => expect(aanroepen('/search?').length).toBe(1));

    rerender({ type: 'member' });

    await waitFor(() => expect(aanroepen('/search?').length).toBe(2));
    const zoekopdrachten = aanroepen('/search?');
    expect(String(zoekopdrachten[zoekopdrachten.length - 1][0])).toContain('type=member');
  });

  it('zoekt niet bij een zoekterm van minder dan twee tekens', async () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('m');
    });
    await new Promise((r) => setTimeout(r, 300));

    expect(aanroepen('/search?')).toHaveLength(0);
    expect(aanroepen('/search/suggestions')).toHaveLength(0);
  });

  it('wacht de debounce af voordat er gezocht wordt', async () => {
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(1));

    act(() => {
      result.current.setQuery('mo');
    });
    act(() => {
      result.current.setQuery('moz');
    });
    act(() => {
      result.current.setQuery('moza');
    });

    await waitFor(() => expect(aanroepen('/search?').length).toBe(1));
    await new Promise((r) => setTimeout(r, 300));

    // Alleen de laatste zoekterm gaat de deur uit.
    expect(aanroepen('/search?')).toHaveLength(1);
    expect(String(fetchMock.mock.calls.find(([u]) => String(u).includes('/search?'))?.[0])).toContain('q=moza');
  });
});

describe('useSearch - resultaten', () => {
  it('geeft de resultaten van de server door en groepeert ze per soort', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/suggestions')) return antwoord({ suggestions: [] });
      if (String(url).includes('/search/recent')) return antwoord({ searches: [] });
      return antwoord({
        results: [resultaat('1', 'music'), resultaat('2', 'member'), resultaat('3', 'music')],
        total: 3,
        query: 'mozart',
      });
    });

    const { result } = renderHook(() => useSearch('mozart'));

    await waitFor(() => expect(result.current.results).toHaveLength(3));
    expect(result.current.groupedResults.music.map((r) => r.id)).toEqual(['1', '3']);
    expect(result.current.groupedResults.member.map((r) => r.id)).toEqual(['2']);
  });

  it('meldt een fout van de server en gooit de resultaten weg', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/suggestions')) return antwoord({ suggestions: [] });
      if (String(url).includes('/search/recent')) return antwoord({ searches: [] });
      return { ok: false, statusText: 'Kapot', json: async () => ({}) };
    });

    const { result } = renderHook(() => useSearch('mozart'));

    await waitFor(() => expect(result.current.error).toBe('Search request failed: Kapot'));
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('haalt de suggesties op bij de ingetypte term', async () => {
    const { result } = renderHook(() => useSearch('moz'));

    await waitFor(() => expect(result.current.suggestions).toEqual(['aap', 'noot']));
  });

  it('laat de suggesties leeg wanneer dat eindpunt hapert', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/suggestions')) throw new Error('offline');
      if (String(url).includes('/search/recent')) return antwoord({ searches: [] });
      return antwoord({ results: [resultaat('1')], total: 1, query: 'moz' });
    });

    const { result } = renderHook(() => useSearch('moz'));

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.suggestions).toEqual([]);
  });
});

describe('useSearch - toetsenbordnavigatie', () => {
  async function metDrieResultaten() {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/suggestions')) return antwoord({ suggestions: [] });
      if (String(url).includes('/search/recent')) return antwoord({ searches: [] });
      return antwoord({ results: [resultaat('1'), resultaat('2'), resultaat('3')], total: 3, query: 'moz' });
    });
    const hook = renderHook(() => useSearch('moz'));
    await waitFor(() => expect(hook.result.current.results).toHaveLength(3));
    return hook;
  }

  const pijl = (key: string) => ({ key, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent;

  it('loopt met pijl omlaag door de lijst en springt aan het eind terug naar boven', async () => {
    const { result } = await metDrieResultaten();

    act(() => result.current.handleKeyDown(pijl('ArrowDown')));
    expect(result.current.selectedIndex).toBe(0);

    act(() => result.current.handleKeyDown(pijl('ArrowDown')));
    act(() => result.current.handleKeyDown(pijl('ArrowDown')));
    expect(result.current.selectedIndex).toBe(2);

    act(() => result.current.handleKeyDown(pijl('ArrowDown')));
    expect(result.current.selectedIndex).toBe(0);
  });

  it('springt met pijl omhoog vanaf het begin naar het laatste resultaat', async () => {
    const { result } = await metDrieResultaten();

    act(() => result.current.handleKeyDown(pijl('ArrowUp')));

    expect(result.current.selectedIndex).toBe(2);
  });

  it('springt met Home en End naar het eerste en laatste resultaat', async () => {
    const { result } = await metDrieResultaten();

    act(() => result.current.handleKeyDown(pijl('End')));
    expect(result.current.selectedIndex).toBe(2);

    act(() => result.current.handleKeyDown(pijl('Home')));
    expect(result.current.selectedIndex).toBe(0);
  });

  it('houdt de standaardactie van de browser tegen bij de pijltoetsen', async () => {
    const { result } = await metDrieResultaten();
    const event = pijl('ArrowDown');

    act(() => result.current.handleKeyDown(event));

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('doet niets bij een toets die niet voor navigatie is', async () => {
    const { result } = await metDrieResultaten();
    const event = pijl('a');

    act(() => result.current.handleKeyDown(event));

    expect(result.current.selectedIndex).toBe(-1);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('geeft het gekozen resultaat terug, en niets zolang er niets gekozen is', async () => {
    const { result } = await metDrieResultaten();

    expect(result.current.getSelectedResult()).toBeNull();

    act(() => result.current.handleKeyDown(pijl('ArrowDown')));

    expect(result.current.getSelectedResult()?.id).toBe('1');
  });
});

describe('useSearch - recente zoekopdrachten', () => {
  it('haalt de recente zoekopdrachten op bij het openen', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/recent')) {
        return antwoord({ searches: [{ id: 'r1', query: 'mozart', timestamp: '2026-01-01T00:00:00Z' }] });
      }
      return antwoord({ results: [], total: 0, query: '', suggestions: [] });
    });

    const { result } = renderHook(() => useSearch());

    await waitFor(() => expect(result.current.recentSearches).toHaveLength(1));
    expect(result.current.recentSearches[0].query).toBe('mozart');
  });

  it('bewaart een zoekopdracht en haalt de lijst daarna opnieuw op', async () => {
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(1));

    await act(async () => {
      await result.current.saveRecentSearch('mozart');
    });

    const opslaan = aanroepen('/search/recent').filter(([, opties]) => (opties as RequestInit)?.method === 'POST');
    expect(opslaan).toHaveLength(1);
    expect((opslaan[0][1] as RequestInit).body).toBe(JSON.stringify({ query: 'mozart' }));
    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(3));
  });

  it('bewaart een te korte zoekopdracht niet', async () => {
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(1));

    await act(async () => {
      await result.current.saveRecentSearch(' a ');
    });

    expect(aanroepen('/search/recent')).toHaveLength(1);
  });

  it('haalt een recente zoekopdracht meteen uit de lijst', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/recent')) {
        return antwoord({
          searches: [
            { id: 'r1', query: 'mozart', timestamp: '2026-01-01T00:00:00Z' },
            { id: 'r2', query: 'bach', timestamp: '2026-01-02T00:00:00Z' },
          ],
        });
      }
      return antwoord({ results: [], total: 0, query: '', suggestions: [] });
    });
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(result.current.recentSearches).toHaveLength(2));

    await act(async () => {
      await result.current.deleteRecentSearch('r1');
    });

    expect(result.current.recentSearches.map((s) => s.id)).toEqual(['r2']);
    expect(aanroepen('/search/recent/r1')).toHaveLength(1);
  });

  it('wist de hele lijst', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/search/recent')) {
        return antwoord({ searches: [{ id: 'r1', query: 'mozart', timestamp: '2026-01-01T00:00:00Z' }] });
      }
      return antwoord({ results: [], total: 0, query: '', suggestions: [] });
    });
    const { result } = renderHook(() => useSearch());
    await waitFor(() => expect(result.current.recentSearches).toHaveLength(1));

    await act(async () => {
      await result.current.clearRecentSearches();
    });

    expect(result.current.recentSearches).toEqual([]);
  });

  it('stuurt het token mee wanneer de gebruiker is ingelogd', async () => {
    localStorage.setItem('token', 'geheim');
    renderHook(() => useSearch());

    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(1));

    const [, opties] = aanroepen('/search/recent')[0];
    expect((opties as RequestInit).headers).toMatchObject({ Authorization: 'Bearer geheim' });
  });

  it('stuurt geen Authorization-kop mee zonder token', async () => {
    renderHook(() => useSearch());

    await waitFor(() => expect(aanroepen('/search/recent').length).toBe(1));

    const [, opties] = aanroepen('/search/recent')[0];
    expect((opties as RequestInit).headers).not.toHaveProperty('Authorization');
  });
});

describe('useSearchCategoryLabels', () => {
  it('geeft voor elke soort een label en een pictogram', () => {
    const { result } = renderHook(() => useSearchCategoryLabels());

    expect(result.current.music).toEqual({ label: 'Muziek', icon: 'music' });
    expect(Object.keys(result.current)).toHaveLength(6);
  });
});
