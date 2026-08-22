/**
 * Tests voor het naar beneden trekken om te verversen.
 *
 * De aanraakgebeurtenissen worden met de hand nagebootst. Het gaat om de vraag
 * wanneer er wel en niet ververst wordt (ver genoeg getrokken, bovenaan de
 * lijst, niet uitgezet), welke stand de indicator te zien krijgt, en of de
 * luisteraars bij het opruimen weer van het element af gaan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePullToRefresh } from '../usePullToRefresh';

/** Bouwt een aanraakgebeurtenis; jsdom kent zelf geen TouchEvent-constructor. */
function raakAan(type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientY: y, clientX: 0 }] });
  return event;
}

/** Zet de hook op met een echt element eraan gekoppeld. */
function opzetten(opties: Parameters<typeof usePullToRefresh>[0]) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  Object.defineProperty(element, 'scrollTop', { value: 0, writable: true, configurable: true });

  const hook = renderHook(() => {
    const api = usePullToRefresh<HTMLDivElement>(opties);
    (api.ref as { current: HTMLDivElement | null }).current = element;
    return api;
  });

  return { element, ...hook };
}

/** Trekt het scherm een stuk naar beneden zonder los te laten. */
function trek(element: HTMLElement, vanaf: number, tot: number) {
  act(() => {
    element.dispatchEvent(raakAan('touchstart', vanaf));
  });
  const beweging = raakAan('touchmove', tot);
  act(() => {
    element.dispatchEvent(beweging);
  });
  return beweging;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('usePullToRefresh - trekken', () => {
  it('meldt dat er getrokken wordt en hoe ver', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    trek(element, 100, 200);

    expect(result.current.isPulling).toBe(true);
    // De helft van de vingerbeweging, als weerstand.
    expect(result.current.pullDistance).toBe(50);
  });

  it('rekent de voortgang uit ten opzichte van de drempel', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined), threshold: 100 });

    trek(element, 100, 200);

    expect(result.current.progress).toBe(0.5);
  });

  it('laat de voortgang niet boven de honderd procent komen', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined), threshold: 40 });

    trek(element, 100, 300);

    expect(result.current.progress).toBe(1);
  });

  it('trekt niet verder dan de ingestelde maximumafstand', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined), maxPull: 60 });

    trek(element, 100, 600);

    expect(result.current.pullDistance).toBe(60);
  });

  it('houdt het meescrollen tegen tijdens het trekken', () => {
    const { element } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    const beweging = trek(element, 100, 200);

    expect(beweging.defaultPrevented).toBe(true);
  });

  it('doet niets bij een beweging omhoog', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    const beweging = trek(element, 200, 100);

    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(beweging.defaultPrevented).toBe(false);
  });

  it('trekt niet wanneer de lijst niet bovenaan staat', () => {
    const { element, result } = opzetten({ onRefresh: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(element, 'scrollTop', { value: 120, writable: true, configurable: true });

    trek(element, 100, 300);

    expect(result.current.isPulling).toBe(false);
  });

  it('doet niets wanneer de hook is uitgezet', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element, result } = opzetten({ onRefresh, disabled: true });

    trek(element, 100, 300);
    act(() => {
      element.dispatchEvent(raakAan('touchend', 300));
    });

    expect(result.current.isPulling).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('usePullToRefresh - loslaten', () => {
  it('ververst wanneer er ver genoeg getrokken is', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element } = opzetten({ onRefresh });

    trek(element, 100, 300);
    await act(async () => {
      element.dispatchEvent(raakAan('touchend', 300));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ververst niet wanneer er te weinig getrokken is', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element, result } = opzetten({ onRefresh });

    trek(element, 100, 160);
    await act(async () => {
      element.dispatchEvent(raakAan('touchend', 160));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  it('meldt dat er ververst wordt en daarna weer niet', async () => {
    let afmaken: (() => void) | undefined;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => (afmaken = resolve)));
    const { element, result } = opzetten({ onRefresh });

    trek(element, 100, 300);
    act(() => {
      element.dispatchEvent(raakAan('touchend', 300));
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.isPulling).toBe(false);
    expect(result.current.pullDistance).toBe(0);

    await act(async () => {
      afmaken?.();
    });

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it('begint geen tweede verversing zolang de eerste loopt', async () => {
    let afmaken: (() => void) | undefined;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => (afmaken = resolve)));
    const { element, result } = opzetten({ onRefresh });

    trek(element, 100, 300);
    act(() => {
      element.dispatchEvent(raakAan('touchend', 300));
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));

    trek(element, 100, 300);
    await act(async () => {
      element.dispatchEvent(raakAan('touchend', 300));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      afmaken?.();
    });
  });

  it('ververst niet bij loslaten zonder trekken', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element } = opzetten({ onRefresh });

    act(() => {
      element.dispatchEvent(raakAan('touchstart', 100));
    });
    await act(async () => {
      element.dispatchEvent(raakAan('touchend', 100));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ververst ook wanneer de aanraking wordt afgebroken na ver genoeg trekken', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element } = opzetten({ onRefresh });

    trek(element, 100, 300);
    await act(async () => {
      element.dispatchEvent(raakAan('touchcancel', 300));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('usePullToRefresh - opruimen', () => {
  it('hangt alle vier de aanraakluisteraars aan het element', () => {
    const element = document.createElement('div');
    const toevoegen = vi.spyOn(element, 'addEventListener');

    renderHook(() => {
      const api = usePullToRefresh<HTMLDivElement>({ onRefresh: vi.fn().mockResolvedValue(undefined) });
      (api.ref as { current: HTMLDivElement | null }).current = element;
      return api;
    });

    expect(toevoegen.mock.calls.map(([naam]) => naam)).toEqual(['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    // touchmove moet actief zijn, anders kan het scrollen niet tegengehouden.
    expect(toevoegen.mock.calls[1][2]).toMatchObject({ passive: false });
  });

  it('haalt de luisteraars weer weg bij het opruimen', () => {
    const element = document.createElement('div');
    const verwijderen = vi.spyOn(element, 'removeEventListener');

    const { unmount } = renderHook(() => {
      const api = usePullToRefresh<HTMLDivElement>({ onRefresh: vi.fn().mockResolvedValue(undefined) });
      (api.ref as { current: HTMLDivElement | null }).current = element;
      return api;
    });

    unmount();

    expect(verwijderen.mock.calls.map(([naam]) => naam)).toEqual([
      'touchstart',
      'touchmove',
      'touchend',
      'touchcancel',
    ]);
  });

  it('reageert niet meer op aanraken nadat de hook is opgeruimd', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { element, unmount } = opzetten({ onRefresh });

    unmount();
    trek(element, 100, 300);
    await act(async () => {
      element.dispatchEvent(raakAan('touchend', 300));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
