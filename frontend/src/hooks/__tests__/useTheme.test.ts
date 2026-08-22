/**
 * Tests voor het thema.
 *
 * De hook zet de kleuren, het lettertype en de rondingen als inline stijl op
 * het html-element. Daar draait het hier om: welke CSS-variabelen erop komen,
 * of het terugzetten naar de standaard echt alles weghaalt, en of de luisteraar
 * op 'theme-updated' bij het opruimen weer verdwijnt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from '../useTheme';
import type { ThemeSettings } from '../../types';

const html = () => document.documentElement;

let fetchMock: ReturnType<typeof vi.fn>;

/** Laat de server een bepaald thema teruggeven. */
function serverGeeft(theme: ThemeSettings | null, ok = true) {
  fetchMock.mockResolvedValue({ ok, json: async () => ({ theme }) });
}

const volledigThema: ThemeSettings = {
  primaryColor: '#1a2b3c',
  primaryDarkColor: '#0d1520',
  secondaryColor: '#445566',
  successColor: '#00ff00',
  dangerColor: '#ff0000',
  warningColor: '#ffaa00',
  backgroundColor: '#fefefe',
  surfaceColor: '#f0f0f0',
  textColor: '#111111',
  textLightColor: '#666666',
  borderColor: '#dddddd',
  fontFamily: 'georgia',
  fontSizeBase: 18,
  borderRadius: 0.5,
};

beforeEach(() => {
  html().removeAttribute('style');
  fetchMock = vi.fn();
  serverGeeft(null);
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useTheme - ophalen', () => {
  it('haalt het thema op bij het openen', async () => {
    renderHook(() => useTheme());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings/theme'));
  });

  it('bewaart het opgehaalde thema', async () => {
    serverGeeft(volledigThema);

    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.theme).toEqual(volledigThema));
  });

  it('verandert niets wanneer de server nee zegt', async () => {
    serverGeeft(volledigThema, false);

    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.theme).toBeNull();
    expect(html().style.getPropertyValue('--primary')).toBe('');
  });

  it('laat de app draaien wanneer het ophalen mislukt', async () => {
    fetchMock.mockRejectedValue(new Error('geen netwerk'));

    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(result.current.theme).toBeNull();
  });

  it('haalt het thema opnieuw op na een thema-wijziging elders', async () => {
    renderHook(() => useTheme());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('theme-updated'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('luistert niet meer na het opruimen', async () => {
    const { unmount } = renderHook(() => useTheme());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => {
      window.dispatchEvent(new Event('theme-updated'));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useTheme - toepassen', () => {
  it('zet alle kleuren als CSS-variabele', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme(volledigThema));

    expect(html().style.getPropertyValue('--primary')).toBe('#1a2b3c');
    expect(html().style.getPropertyValue('--primary-dark')).toBe('#0d1520');
    expect(html().style.getPropertyValue('--secondary')).toBe('#445566');
    expect(html().style.getPropertyValue('--success')).toBe('#00ff00');
    expect(html().style.getPropertyValue('--danger')).toBe('#ff0000');
    expect(html().style.getPropertyValue('--warning')).toBe('#ffaa00');
    expect(html().style.getPropertyValue('--background')).toBe('#fefefe');
    expect(html().style.getPropertyValue('--surface')).toBe('#f0f0f0');
    expect(html().style.getPropertyValue('--text')).toBe('#111111');
    expect(html().style.getPropertyValue('--text-light')).toBe('#666666');
    expect(html().style.getPropertyValue('--border')).toBe('#dddddd');
  });

  it('rekent de focusrand uit op basis van de hoofdkleur', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ primaryColor: '#1a2b3c' }));

    expect(html().style.getPropertyValue('--focus-ring')).toBe('0 0 0 3px rgba(26, 43, 60, 0.4)');
  });

  it('vertaalt de lettertypekeuze naar een echte lettertypestapel', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ fontFamily: 'mono' }));

    expect(html().style.getPropertyValue('--font-family')).toContain('JetBrains Mono');
  });

  it('negeert een onbekend lettertype', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ fontFamily: 'comic-sans-uit-1998' }));

    expect(html().style.getPropertyValue('--font-family')).toBe('');
  });

  it('zet de basisletergrootte in pixels', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ fontSizeBase: 18 }));

    expect(html().style.getPropertyValue('--font-size-base')).toBe('18px');
  });

  it('leidt de kleine en grote ronding af van de gewone ronding', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ borderRadius: 0.5 }));

    expect(html().style.getPropertyValue('--radius')).toBe('0.5rem');
    expect(html().style.getPropertyValue('--radius-sm')).toBe('0.25rem');
    expect(html().style.getPropertyValue('--radius-lg')).toBe('0.75rem');
  });

  it('staat vierkante hoeken toe', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ borderRadius: 0 }));

    expect(html().style.getPropertyValue('--radius')).toBe('0rem');
    expect(html().style.getPropertyValue('--radius-sm')).toBe('0rem');
  });

  it('laat velden die niet in het thema staan ongemoeid', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme({ primaryColor: '#123456' }));

    expect(html().style.getPropertyValue('--surface')).toBe('');
    expect(html().style.getPropertyValue('--radius')).toBe('');
  });
});

describe('useTheme - terug naar de standaard', () => {
  it('haalt alle eigen kleuren en maten weer weg', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.applyTheme(volledigThema));

    act(() => result.current.applyTheme(null));

    for (const eigenschap of [
      '--primary',
      '--primary-dark',
      '--secondary',
      '--success',
      '--danger',
      '--warning',
      '--background',
      '--surface',
      '--text',
      '--text-light',
      '--border',
      '--font-family',
      '--font-size-base',
      '--radius',
      '--radius-sm',
      '--radius-lg',
    ]) {
      expect(html().style.getPropertyValue(eigenschap), eigenschap).toBe('');
    }
  });

  it('haalt ook de focusrand weg', () => {
    // De focusrand wordt door applyTheme zelf gezet. Blijft hij staan bij het
    // terugzetten, dan houdt de gebruiker een focusrand in de kleur van het
    // oude thema, terwijl alle andere kleuren al standaard zijn.
    const { result } = renderHook(() => useTheme());
    act(() => result.current.applyTheme(volledigThema));
    expect(html().style.getPropertyValue('--focus-ring')).not.toBe('');

    act(() => result.current.applyTheme(null));

    expect(html().style.getPropertyValue('--focus-ring')).toBe('');
  });
});
