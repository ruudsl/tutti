/**
 * Tests voor de aan/uit-stand van de modules.
 *
 * Deze stand bepaalt welke navigatie-items en welke routes bestaan. Hij komt
 * uit twee bronnen: localStorage (meteen bij het opstarten) en de server
 * (zodra er een gebruiker is). Die eerste bron is de kwetsbare: alles wat daar
 * staat is door de gebruiker te bewerken en kan half geschreven zijn omdat de
 * tab tijdens het opslaan wegviel.
 *
 * Wat er misgaat als het fout loopt:
 *
 *   - een lijst die geen lijst is, gaat als lijst de app in. `enabled.includes`
 *     gooit dan tijdens het renderen van de zijbalk, en dat is een wit scherm
 *     dat alleen met het wissen van de sitegegevens weggaat.
 *   - te vroeg oordelen. Zolang de stand niet is opgehaald, weet de app niet
 *     welke modules uit staan en mag ze niemand wegsturen van een pagina die
 *     gewoon mag.
 *   - te laat opruimen. Blijft de stand na uitloggen staan, dan ziet de
 *     volgende gebruiker op een gedeelde tablet de zijbalk van zijn
 *     voorganger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { User } from '../../types';

const haalModulesOp = vi.fn();
vi.mock('../../api/modules', () => ({
  getEnabledModules: () => haalModulesOp(),
}));

/** De ingelogde gebruiker die `useAuth` teruggeeft; per test in te stellen. */
let ingelogd: User | null = null;
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: ingelogd }),
}));

import { ModulesProvider, useModules } from '../ModulesContext';

const omhulsel = ({ children }: { children: ReactNode }) => createElement(ModulesProvider, null, children);

const gebruiker = { id: 'lid-1', email: 'ruud@slaats.net', role: 'member' } as User;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  ingelogd = null;
  haalModulesOp.mockResolvedValue(['ticketing', 'tasks']);
});

// =============================================================================
// De stand uit localStorage
// =============================================================================

describe('de bewaarde stand bij het opstarten', () => {
  beforeEach(() => {
    // De echte situatie: de gebruiker is al ingelogd en de aanvraag bij de
    // server loopt nog. Wat in die tussentijd op het scherm staat, komt
    // helemaal uit localStorage - en dat is precies het gevaarlijke moment.
    ingelogd = gebruiker;
    haalModulesOp.mockReturnValue(new Promise<string[]>(() => {}));
  });

  it('gebruikt de stand van de vorige keer meteen', async () => {
    // Zonder deze voorsprong toont de zijbalk eerst alle onderdelen om ze
    // daarna weg te halen: de navigatie springt op onder de muis van de
    // gebruiker.
    localStorage.setItem('enabledModules', JSON.stringify(['ticketing', 'polls']));

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    expect(result.current.enabled).toEqual(['ticketing', 'polls']);
    expect(result.current.isEnabled('ticketing')).toBe(true);
  });

  it('begint leeg als er nog niets bewaard is', () => {
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    expect(result.current.enabled).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });

  it('valt niet om over een half geschreven waarde', () => {
    // Een tab die tijdens het schrijven wordt afgekapt laat halve JSON achter.
    localStorage.setItem('enabledModules', '["ticketing её');

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    expect(result.current.enabled).toEqual([]);
  });

  it('valt niet om over een bewaarde waarde die geen lijst is', () => {
    // JSON.parse gooit alleen bij kapotte tekst. Een geldige waarde van de
    // verkeerde soort kwam er ongemoeid doorheen en werd daarna als lijst
    // gebruikt: `enabled.includes(...)` gooit dan tijdens het renderen van de
    // zijbalk. Dat is geen foutmelding maar een wit scherm, en het gaat pas
    // weg als de gebruiker zijn sitegegevens wist - iets wat niemand uit
    // zichzelf doet.
    for (const rommel of ['null', '123', '"ticketing"', '{"ticketing":true}', 'true']) {
      localStorage.setItem('enabledModules', rommel);

      const { result, unmount } = renderHook(() => useModules(), { wrapper: omhulsel });

      expect(Array.isArray(result.current.enabled), rommel).toBe(true);
      expect(() => result.current.isEnabled('ticketing'), rommel).not.toThrow();
      expect(result.current.isEnabled('ticketing'), rommel).toBe(false);
      unmount();
    }
  });

  it('laat losse waarden binnen de lijst niet als modulesleutel gelden', () => {
    // Een lijst met een getal erin zou bij `includes` nooit matchen, maar wel
    // ongemerkt in de zijbalklogica belanden.
    localStorage.setItem('enabledModules', JSON.stringify(['ticketing', 42, null, { key: 'tasks' }]));

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    expect(result.current.enabled).toEqual(['ticketing']);
  });

  it('valt niet om als localStorage helemaal niet mag', () => {
    // In een privévenster of achter strenge instellingen gooit getItem.
    const weigeren = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('toegang geweigerd');
    });

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    expect(result.current.enabled).toEqual([]);
    weigeren.mockRestore();
  });
});

// =============================================================================
// Ophalen bij de server
// =============================================================================

describe('ophalen zodra er een gebruiker is', () => {
  it('haalt de stand op en onthoudt hem', async () => {
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.enabled).toEqual(['ticketing', 'tasks']));
    expect(result.current.loaded).toBe(true);
    expect(JSON.parse(localStorage.getItem('enabledModules') ?? 'null')).toEqual(['ticketing', 'tasks']);
  });

  it('haalt niets op zonder gebruiker', () => {
    renderHook(() => useModules(), { wrapper: omhulsel });

    expect(haalModulesOp).not.toHaveBeenCalled();
  });

  it('meldt tijdens het ophalen dat het bezig is', async () => {
    let losmaken: (waarde: string[]) => void = () => {};
    haalModulesOp.mockReturnValue(
      new Promise<string[]>((resolve) => {
        losmaken = resolve;
      }),
    );
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      losmaken(['polls']);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.enabled).toEqual(['polls']);
  });

  it('houdt de laatst bekende stand aan als de server niet antwoordt', async () => {
    // Alles onzichtbaar maken zou erger zijn dan een module te veel tonen: de
    // gebruiker zou bij een haperend netwerk een lege app zien.
    localStorage.setItem('enabledModules', JSON.stringify(['ticketing']));
    haalModulesOp.mockRejectedValue(new Error('netwerk weg'));
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toEqual(['ticketing']);
  });

  it('blijft na een mislukte poging op "nog niet opgehaald" staan', async () => {
    // `loaded` is wat routes mag verbergen. Zou een mislukte poging hem toch
    // op waar zetten, dan stuurt een netwerkhapering de gebruiker weg van
    // pagina's die gewoon mogen.
    haalModulesOp.mockRejectedValue(new Error('netwerk weg'));
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loaded).toBe(false);
  });

  it('valt niet om over een antwoord dat geen lijst is', async () => {
    // Een proxy of een inlogportaal antwoordt soms met een HTML-pagina en
    // status 200. `data.enabled` is dan undefined, en dat kwam ongemoeid in de
    // stand terecht - opnieuw een wit scherm bij het renderen van de zijbalk.
    haalModulesOp.mockResolvedValue(undefined);
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(Array.isArray(result.current.enabled)).toBe(true);
    expect(() => result.current.isEnabled('ticketing')).not.toThrow();
  });

  it('gaat door als de stand niet bewaard kan worden', async () => {
    // Zonder opslag werkt alles nog, alleen zonder voorsprong bij de start.
    const weigeren = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    ingelogd = gebruiker;

    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.enabled).toEqual(['ticketing', 'tasks']));
    expect(result.current.loaded).toBe(true);
    weigeren.mockRestore();
  });
});

// =============================================================================
// Opnieuw ophalen en uitloggen
// =============================================================================

describe('refresh', () => {
  it('haalt de stand opnieuw op, bijvoorbeeld na het beheerscherm', async () => {
    ingelogd = gebruiker;
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    haalModulesOp.mockResolvedValue(['ticketing', 'tasks', 'polls']);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.enabled).toEqual(['ticketing', 'tasks', 'polls']);
    expect(haalModulesOp).toHaveBeenCalledTimes(2);
  });

  it('doet niets zonder gebruiker', async () => {
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.refresh();
    });

    expect(haalModulesOp).not.toHaveBeenCalled();
  });
});

describe('uitloggen', () => {
  it('wist de stand en de bewaarde kopie', async () => {
    // Anders houdt de volgende gebruiker op een gedeelde tablet de zijbalk van
    // zijn voorganger, inclusief onderdelen die zijn eigen vereniging uit heeft
    // staan.
    localStorage.setItem('enabledModules', JSON.stringify(['ticketing']));
    ingelogd = gebruiker;
    const { result, rerender } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    ingelogd = null;
    rerender();

    await waitFor(() => expect(result.current.enabled).toEqual([]));
    expect(result.current.loaded).toBe(false);
    expect(localStorage.getItem('enabledModules')).toBeNull();
  });

  it('blijft uitloggen ook als localStorage weigert', async () => {
    ingelogd = gebruiker;
    const { result, rerender } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const weigeren = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('toegang geweigerd');
    });
    ingelogd = null;
    rerender();

    await waitFor(() => expect(result.current.enabled).toEqual([]));
    weigeren.mockRestore();
  });
});

// =============================================================================
// isEnabled en het gebruik buiten de provider
// =============================================================================

describe('isEnabled', () => {
  it('meldt waar voor een module die aan staat', async () => {
    ingelogd = gebruiker;
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.isEnabled('ticketing')).toBe(true);
    expect(result.current.isEnabled('tasks')).toBe(true);
  });

  it('meldt onwaar voor een module die uit staat', async () => {
    ingelogd = gebruiker;
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.isEnabled('accounting')).toBe(false);
  });

  it('meldt onwaar voor een sleutel die de server niet kent', async () => {
    // VASTGELEGD GEDRAG: een onbekende sleutel telt als uit. Dat is het
    // veilige antwoord - een module die de backend niet noemt, bestaat voor
    // deze vereniging niet. Let op: paden werken andersom, daar is onbekend
    // juist altijd zichtbaar (zie utils/modules.ts).
    ingelogd = gebruiker;
    const { result } = renderHook(() => useModules(), { wrapper: omhulsel });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.isEnabled('bestaat-niet')).toBe(false);
    expect(result.current.isEnabled('')).toBe(false);
  });
});

describe('useModules buiten een provider', () => {
  it('zegt waar het aan ligt in plaats van undefined terug te geven', () => {
    // Zonder deze melding gaat het pas veel verderop stuk, op een plek waar de
    // oorzaak niet meer te zien is.
    expect(() => renderHook(() => useModules())).toThrow(/ModulesProvider/);
  });
});
