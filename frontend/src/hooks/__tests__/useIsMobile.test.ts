/**
 * Tests voor het herkennen van een smal scherm.
 *
 * jsdom kent geen matchMedia; die wordt hier nagebouwd zodat we het venster van
 * maat kunnen laten veranderen. Naast de uitkomst gaat het om de vraag welke
 * mediaquery de hook precies gebruikt, en of de luisteraar bij het opruimen en
 * bij een nieuwe breedte netjes wordt losgekoppeld.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile, useMediaQuery } from '../useIsMobile';

/** Per mediaquery: staat hij aan, en wie luistert ernaar. */
const queries = new Map<string, { matcht: boolean; luisteraars: Set<(e: MediaQueryListEvent) => void> }>();

/** Zorgt dat een mediaquery bekend is en geeft zijn stand terug. */
function query(q: string) {
  if (!queries.has(q)) queries.set(q, { matcht: false, luisteraars: new Set() });
  return queries.get(q)!;
}

/** Zet een mediaquery om en meldt dat aan wie luistert. */
function zetQuery(q: string, matcht: boolean) {
  const stand = query(q);
  stand.matcht = matcht;
  act(() => {
    stand.luisteraars.forEach((cb) => cb({ matches: matcht } as MediaQueryListEvent));
  });
}

/** Zet de gerapporteerde vensterbreedte. */
function zetBreedte(breedte: number) {
  Object.defineProperty(window, 'innerWidth', { value: breedte, configurable: true, writable: true });
}

beforeEach(() => {
  queries.clear();
  zetBreedte(1024);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => {
      const stand = query(q);
      return {
        get matches() {
          return stand.matcht;
        },
        media: q,
        onchange: null,
        addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => stand.luisteraars.add(cb),
        removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => stand.luisteraars.delete(cb),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsMobile', () => {
  const STANDAARD = '(max-width: 767px)';

  it('is niet mobiel op een breed scherm', () => {
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('is mobiel wanneer de mediaquery aanstaat', () => {
    query(STANDAARD).matcht = true;

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('vraagt standaard naar schermen smaller dan 768 pixels', () => {
    renderHook(() => useIsMobile());

    expect(matchMedia).toHaveBeenCalledWith(STANDAARD);
  });

  it('gebruikt een eigen grenswaarde', () => {
    renderHook(() => useIsMobile(1024));

    expect(matchMedia).toHaveBeenCalledWith('(max-width: 1023px)');
  });

  it('slaat bij het openen al aan op een smal venster', () => {
    zetBreedte(375);
    query(STANDAARD).matcht = true;

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('gaat mee wanneer het venster smaller wordt', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    zetQuery(STANDAARD, true);

    expect(result.current).toBe(true);
  });

  it('gaat ook weer mee wanneer het venster breder wordt', () => {
    query(STANDAARD).matcht = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    zetQuery(STANDAARD, false);

    expect(result.current).toBe(false);
  });

  it('luistert niet meer na het opruimen', () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(query(STANDAARD).luisteraars.size).toBe(1);

    unmount();

    expect(query(STANDAARD).luisteraars.size).toBe(0);
  });

  it('stapt over naar de nieuwe grenswaarde en laat de oude los', () => {
    const { rerender } = renderHook(({ grens }) => useIsMobile(grens), { initialProps: { grens: 768 } });

    rerender({ grens: 1024 });

    expect(query(STANDAARD).luisteraars.size).toBe(0);
    expect(query('(max-width: 1023px)').luisteraars.size).toBe(1);
  });
});

describe('useMediaQuery', () => {
  it('geeft de stand van de meegegeven query', () => {
    query('(orientation: portrait)').matcht = true;

    const { result } = renderHook(() => useMediaQuery('(orientation: portrait)'));

    expect(result.current).toBe(true);
  });

  it('gaat mee wanneer de query omslaat', () => {
    const { result } = renderHook(() => useMediaQuery('(prefers-reduced-motion: reduce)'));
    expect(result.current).toBe(false);

    zetQuery('(prefers-reduced-motion: reduce)', true);

    expect(result.current).toBe(true);
  });

  it('luistert niet meer na het opruimen', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'));
    expect(query('(min-width: 900px)').luisteraars.size).toBe(1);

    unmount();

    expect(query('(min-width: 900px)').luisteraars.size).toBe(0);
  });

  it('stapt over naar een nieuwe query en laat de oude los', () => {
    const { rerender } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: '(min-width: 900px)' } });

    rerender({ q: '(min-width: 1200px)' });

    expect(query('(min-width: 900px)').luisteraars.size).toBe(0);
    expect(query('(min-width: 1200px)').luisteraars.size).toBe(1);
  });
});
