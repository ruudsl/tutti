/**
 * Tests voor het installeren als app.
 *
 * De hook hangt luisteraars aan het venster en onthoudt in localStorage of de
 * gebruiker het aanbod heeft weggeklikt. Beide kanten worden hier getoetst,
 * inclusief de vraag of die luisteraars bij het opruimen ook echt weer
 * losgaan: eentje die blijft hangen reageert later nog op gebeurtenissen van
 * een scherm dat er niet meer is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePWAInstall } from '../usePWAInstall';

const SLEUTEL = 'harmonie-pwa-install-dismissed';

let standalone = false;

/** Bootst het aanbod van de browser om te installeren na. */
function bied(uitkomst: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: uitkomst });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  localStorage.clear();
  standalone = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('display-mode: standalone') ? standalone : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
  delete (navigator as unknown as Record<string, unknown>).standalone;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePWAInstall - aanbod van de browser', () => {
  it('kan nog niet installeren zolang de browser niets aanbiedt', () => {
    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.canInstall).toBe(false);
  });

  it('kan installeren zodra de browser het aanbiedt', () => {
    const { result } = renderHook(() => usePWAInstall());

    bied();

    expect(result.current.canInstall).toBe(true);
  });

  it('houdt het eigen aanbod van de browser tegen', () => {
    renderHook(() => usePWAInstall());

    const event = bied();

    expect(event.defaultPrevented).toBe(true);
  });

  it('vraagt bij installeren om bevestiging en meldt dat het gelukt is', async () => {
    const { result } = renderHook(() => usePWAInstall());
    const event = bied('accepted');

    let gelukt: boolean | undefined;
    await act(async () => {
      gelukt = await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(gelukt).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('meldt het wanneer de gebruiker de installatie afwijst', async () => {
    const { result } = renderHook(() => usePWAInstall());
    bied('dismissed');

    let gelukt: boolean | undefined;
    await act(async () => {
      gelukt = await result.current.promptInstall();
    });

    expect(gelukt).toBe(false);
  });

  it('doet niets bij installeren zonder aanbod', async () => {
    const { result } = renderHook(() => usePWAInstall());

    let gelukt: boolean | undefined;
    await act(async () => {
      gelukt = await result.current.promptInstall();
    });

    expect(gelukt).toBe(false);
  });
});

describe('usePWAInstall - al geinstalleerd', () => {
  it('herkent een app die als zelfstandig venster draait', () => {
    standalone = true;

    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('herkent de iOS-manier van zelfstandig draaien', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });

    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.isInstalled).toBe(true);
  });

  it('luistert niet naar aanbiedingen wanneer de app al draait als app', () => {
    standalone = true;
    const { result } = renderHook(() => usePWAInstall());

    bied();

    expect(result.current.canInstall).toBe(false);
  });

  it('onthoudt dat de app geinstalleerd is', () => {
    const { result } = renderHook(() => usePWAInstall());
    bied();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });
});

describe('usePWAInstall - wegklikken onthouden', () => {
  it('begint zonder weggeklikt aanbod', () => {
    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.isDismissed).toBe(false);
  });

  it('onthoudt het wegklikken met een tijdstempel', () => {
    const { result } = renderHook(() => usePWAInstall());

    act(() => {
      result.current.dismissPrompt();
    });

    expect(result.current.isDismissed).toBe(true);
    expect(Number(localStorage.getItem(SLEUTEL))).toBeGreaterThan(0);
  });

  it('houdt het aanbod een week weg', () => {
    const zesDagenGeleden = Date.now() - 6 * 24 * 60 * 60 * 1000;
    localStorage.setItem(SLEUTEL, String(zesDagenGeleden));

    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.isDismissed).toBe(true);
  });

  it('biedt het na een week weer aan', () => {
    const achtDagenGeleden = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(SLEUTEL, String(achtDagenGeleden));

    const { result } = renderHook(() => usePWAInstall());

    expect(result.current.isDismissed).toBe(false);
  });

  it('vergeet het wegklikken zodra de app geinstalleerd is', () => {
    localStorage.setItem(SLEUTEL, String(Date.now()));
    renderHook(() => usePWAInstall());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(localStorage.getItem(SLEUTEL)).toBeNull();
  });
});

describe('usePWAInstall - opruimen', () => {
  it('reageert niet meer op een aanbod nadat het scherm weg is', () => {
    const { unmount } = renderHook(() => usePWAInstall());
    unmount();

    const event = bied();

    expect(event.defaultPrevented).toBe(false);
  });

  it('reageert niet meer op een installatie nadat het scherm weg is', () => {
    // Deze luisteraar bleef hangen: na het opruimen wiste hij nog steeds de
    // bewaarde keuze van de gebruiker, en bij elk nieuw scherm kwam er weer
    // een luisteraar bij.
    localStorage.setItem(SLEUTEL, String(Date.now()));
    const { unmount } = renderHook(() => usePWAInstall());

    unmount();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(localStorage.getItem(SLEUTEL)).not.toBeNull();
  });

  it('haalt beide luisteraars weer van het venster af', () => {
    const toevoegen = vi.spyOn(window, 'addEventListener');
    const verwijderen = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => usePWAInstall());
    const aangehangen = toevoegen.mock.calls.filter(([naam]) =>
      ['beforeinstallprompt', 'appinstalled'].includes(String(naam)),
    );
    expect(aangehangen.map(([naam]) => naam)).toEqual(['beforeinstallprompt', 'appinstalled']);

    unmount();

    const losgehaald = verwijderen.mock.calls.filter(([naam]) =>
      ['beforeinstallprompt', 'appinstalled'].includes(String(naam)),
    );
    expect(losgehaald.map(([naam]) => naam).sort()).toEqual(['appinstalled', 'beforeinstallprompt']);
    // En wel met dezelfde functies, anders gaat er niets los.
    for (const [naam, functie] of aangehangen) {
      expect(
        losgehaald.some(([n, f]) => n === naam && f === functie),
        String(naam),
      ).toBe(true);
    }

    toevoegen.mockRestore();
    verwijderen.mockRestore();
  });
});
