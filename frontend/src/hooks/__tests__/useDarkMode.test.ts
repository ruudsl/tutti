/**
 * Tests voor de donkere modus.
 *
 * jsdom kent geen matchMedia, dus die wordt hier nagebouwd; daardoor kunnen we
 * de systeemvoorkeur omzetten en kijken wat de hook doet. Verder gaat het om
 * wat er in localStorage terechtkomt, wat er op het html-element gezet wordt,
 * en of de luisteraar op de systeemvoorkeur weer weggaat bij het opruimen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from '../useDarkMode';

const SLEUTEL = 'harmonie-dark-mode';

let systeemDonker = false;
let mediaLuisteraars: Set<(e: MediaQueryListEvent) => void>;

/** Zet de systeemvoorkeur om en meldt dat aan de luisteraars. */
function zetSysteemvoorkeur(donker: boolean) {
  systeemDonker = donker;
  act(() => {
    mediaLuisteraars.forEach((cb) => cb({ matches: donker } as MediaQueryListEvent));
  });
}

const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  systeemDonker = false;
  mediaLuisteraars = new Set();
  html().className = '';
  html().removeAttribute('style');
  html().removeAttribute('data-theme');

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? systeemDonker : false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => mediaLuisteraars.add(cb),
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => mediaLuisteraars.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDarkMode - beginstand', () => {
  it('volgt standaard het systeem', () => {
    const { result } = renderHook(() => useDarkMode());

    expect(result.current.mode).toBe('system');
    expect(result.current.isDark).toBe(false);
  });

  it('is donker wanneer het systeem donker is en de stand op "systeem" staat', () => {
    systeemDonker = true;

    const { result } = renderHook(() => useDarkMode());

    expect(result.current.isDark).toBe(true);
    expect(result.current.isDarkMode).toBe(true);
  });

  it('neemt de bewaarde keuze over', () => {
    localStorage.setItem(SLEUTEL, 'dark');

    const { result } = renderHook(() => useDarkMode());

    expect(result.current.mode).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('negeert een onzinnige bewaarde keuze', () => {
    localStorage.setItem(SLEUTEL, 'paars');

    const { result } = renderHook(() => useDarkMode());

    expect(result.current.mode).toBe('system');
  });

  it('blijft licht bij de stand "licht", ook als het systeem donker is', () => {
    systeemDonker = true;
    localStorage.setItem(SLEUTEL, 'light');

    const { result } = renderHook(() => useDarkMode());

    expect(result.current.isDark).toBe(false);
  });
});

describe('useDarkMode - keuze wisselen', () => {
  it('loopt met togglen langs licht, donker en systeem', () => {
    localStorage.setItem(SLEUTEL, 'light');
    const { result } = renderHook(() => useDarkMode());

    act(() => result.current.toggleDarkMode());
    expect(result.current.mode).toBe('dark');

    act(() => result.current.toggleDarkMode());
    expect(result.current.mode).toBe('system');

    act(() => result.current.toggleDarkMode());
    expect(result.current.mode).toBe('light');
  });

  it('zet een keuze rechtstreeks', () => {
    const { result } = renderHook(() => useDarkMode());

    act(() => result.current.setDarkMode('dark'));

    expect(result.current.mode).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('bewaart de keuze zodat die een volgende keer terugkomt', () => {
    const { result } = renderHook(() => useDarkMode());

    act(() => result.current.setDarkMode('dark'));

    expect(localStorage.getItem(SLEUTEL)).toBe('dark');
  });
});

describe('useDarkMode - systeemvoorkeur volgen', () => {
  it('wordt donker zodra het systeem omgaat', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);

    zetSysteemvoorkeur(true);

    expect(result.current.isDark).toBe(true);
  });

  it('laat de vaste keuze met rust wanneer het systeem omgaat', () => {
    localStorage.setItem(SLEUTEL, 'light');
    const { result } = renderHook(() => useDarkMode());

    zetSysteemvoorkeur(true);

    expect(result.current.isDark).toBe(false);
  });

  it('luistert niet meer naar het systeem nadat de hook is opgeruimd', () => {
    const { unmount } = renderHook(() => useDarkMode());
    expect(mediaLuisteraars.size).toBe(1);

    unmount();

    expect(mediaLuisteraars.size).toBe(0);
  });
});

describe('useDarkMode - het html-element aankleden', () => {
  it('zet de donkere klasse, het thema en de kleuren erop', () => {
    localStorage.setItem(SLEUTEL, 'dark');

    renderHook(() => useDarkMode());

    expect(html().classList.contains('dark-mode')).toBe(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().style.getPropertyValue('--background')).toBe('#0f172a');
    expect(html().style.getPropertyValue('--text')).toBe('#f1f5f9');
  });

  it('haalt dat er weer af bij een lichte stand', () => {
    localStorage.setItem(SLEUTEL, 'dark');
    const { result } = renderHook(() => useDarkMode());
    expect(html().style.getPropertyValue('--background')).toBe('#0f172a');

    act(() => result.current.setDarkMode('light'));

    expect(html().classList.contains('dark-mode')).toBe(false);
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().style.getPropertyValue('--background')).toBe('');
  });

  it('zet de donkere kleuren terug wanneer iets anders ze overschrijft', async () => {
    localStorage.setItem(SLEUTEL, 'dark');
    renderHook(() => useDarkMode());

    // Zoals useTheme dat doet: rechtstreeks een inline kleur op html zetten.
    await act(async () => {
      html().style.setProperty('--background', '#ffffff');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(html().style.getPropertyValue('--background')).toBe('#0f172a');
  });

  it('kijkt niet meer mee nadat de hook is opgeruimd', async () => {
    localStorage.setItem(SLEUTEL, 'dark');
    const { unmount } = renderHook(() => useDarkMode());

    unmount();

    await act(async () => {
      html().style.setProperty('--background', '#ffffff');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(html().style.getPropertyValue('--background')).toBe('#ffffff');
  });
});
