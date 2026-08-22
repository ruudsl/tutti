/**
 * Tests voor inloggen, het herstellen van een sessie en het bijwerken van het
 * profiel.
 *
 * Het uitloggen zelf staat in `uitloggen-wist-offline.test.tsx`; dit bestand
 * gaat over de andere kant.
 *
 * De gevoelige plek is het opstarten. De gebruiker komt uit localStorage,
 * zodat de app bij een koude start meteen iets kan tonen in plaats van een
 * draaiend rondje. Alles wat daar staat is door de gebruiker te bewerken, kan
 * half geschreven zijn omdat de tab tijdens het opslaan wegviel, en overleeft
 * updates van de app. `JSON.parse` op zo'n waarde gooit, en een fout tijdens
 * het aanmaken van de begintoestand van een provider die om de hele app heen
 * staat is geen foutmelding maar een wit scherm - dat pas weggaat als de
 * gebruiker zijn sitegegevens wist, iets wat niemand uit zichzelf doet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { User, LoginResponse } from '../../types';

const inloggenBijServer = vi.fn();
const profielOphalen = vi.fn();
vi.mock('../../api/auth', () => ({
  login: (email: string, wachtwoord: string, code?: string) => inloggenBijServer(email, wachtwoord, code),
  getProfile: () => profielOphalen(),
}));

const wisCache = vi.fn();
vi.mock('../../lib/queryClient', () => ({ clearPersistedCache: () => wisCache() }));
vi.mock('../../lib/offlineStorage', () => ({ clearAllData: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/offlineDb', () => ({ wisAlleOfflineGegevens: vi.fn().mockResolvedValue(undefined) }));

const wisDownloadToken = vi.fn();
vi.mock('../../utils/downloadUrl', () => ({ clearDownloadTokenCache: () => wisDownloadToken() }));

import { AuthProvider, useAuth } from '../AuthContext';

const omhulsel = ({ children }: { children: ReactNode }) => createElement(AuthProvider, null, children);

const lid = {
  id: 'lid-1',
  email: 'ruud@slaats.net',
  firstName: 'Ruud',
  lastName: 'Slaats',
  role: 'member',
} as User;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  profielOphalen.mockResolvedValue(lid);
});

// =============================================================================
// Inloggen
// =============================================================================

describe('inloggen', () => {
  it('bewaart het token en de gebruiker en zet de sessie', async () => {
    inloggenBijServer.mockResolvedValue({ token: 'vers-token', user: lid } as LoginResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.login('ruud@slaats.net', 'geheim12');
    });

    expect(result.current.user).toEqual(lid);
    expect(localStorage.getItem('token')).toBe('vers-token');
    expect(JSON.parse(localStorage.getItem('user') ?? 'null')).toEqual(lid);
  });

  it('geeft het antwoord van de server ongewijzigd door', async () => {
    // De aanroeper leest er zelf uit of er nog een tweede stap volgt.
    const antwoord = { token: 'vers-token', user: lid } as LoginResponse;
    inloggenBijServer.mockResolvedValue(antwoord);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    let gekregen: LoginResponse | undefined;
    await act(async () => {
      gekregen = await result.current.login('ruud@slaats.net', 'geheim12');
    });

    expect(gekregen).toBe(antwoord);
  });

  it('geeft e-mailadres, wachtwoord en tweestapscode door aan de server', async () => {
    inloggenBijServer.mockResolvedValue({ token: 't', user: lid } as LoginResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.login('ruud@slaats.net', 'geheim12', '123456');
    });

    expect(inloggenBijServer).toHaveBeenCalledWith('ruud@slaats.net', 'geheim12', '123456');
  });

  it('logt niemand in zolang de tweede stap nog moet komen', async () => {
    // Dit is de belangrijkste grens van het inloggen: een antwoord met
    // requiresMfa is géén geslaagde inlog. Zou de sessie hier al staan, dan
    // was de tweestapsverificatie te omzeilen door de tweede stap gewoon niet
    // in te vullen.
    inloggenBijServer.mockResolvedValue({ requiresMfa: true } as LoginResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.login('ruud@slaats.net', 'geheim12');
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('zet geen sessie bij een antwoord zonder token', async () => {
    inloggenBijServer.mockResolvedValue({ user: lid } as LoginResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.login('ruud@slaats.net', 'geheim12');
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('zet geen sessie bij een antwoord zonder gebruiker', async () => {
    inloggenBijServer.mockResolvedValue({ token: 'vers-token' } as LoginResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await result.current.login('ruud@slaats.net', 'geheim12');
    });

    expect(result.current.user).toBeNull();
  });

  it('laat een verkeerd wachtwoord als fout doorgaan naar het scherm', async () => {
    // Het inlogscherm moet de melding zelf kunnen tonen; hier inslikken
    // betekent een formulier dat niets doet als je op inloggen drukt.
    inloggenBijServer.mockRejectedValue(new Error('Ongeldige inloggegevens'));
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await expect(result.current.login('ruud@slaats.net', 'fout')).rejects.toThrow('Ongeldige inloggegevens');
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('loginWithToken', () => {
  it('zet de sessie zonder de server nog een keer te bevragen', async () => {
    // Gebruikt na de tweede stap van de tweestapsverificatie en na een
    // magic link: het token is er al.
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.loginWithToken('token-uit-de-tweede-stap', lid);
    });

    expect(result.current.user).toEqual(lid);
    expect(localStorage.getItem('token')).toBe('token-uit-de-tweede-stap');
    expect(JSON.parse(localStorage.getItem('user') ?? 'null')).toEqual(lid);
    expect(inloggenBijServer).not.toHaveBeenCalled();
  });

  it('vervangt een lopende sessie volledig', async () => {
    localStorage.setItem('token', 'oud-token');
    localStorage.setItem('user', JSON.stringify({ ...lid, id: 'lid-oud' }));
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.loginWithToken('nieuw-token', lid);
    });

    expect(result.current.user).toEqual(lid);
    expect(localStorage.getItem('token')).toBe('nieuw-token');
  });
});

// =============================================================================
// Een sessie terughalen bij het opstarten
// =============================================================================

describe('een sessie terughalen uit localStorage', () => {
  it('toont de bewaarde gebruiker meteen, zonder te wachten op de server', () => {
    // Zonder dit begint elke koude start met een draaiend rondje, ook al is er
    // niets veranderd sinds de vorige keer.
    localStorage.setItem('user', JSON.stringify(lid));

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    expect(result.current.user).toEqual(lid);
  });

  it('begint zonder gebruiker als er niets bewaard is', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    expect(result.current.user).toBeNull();
  });

  it('ververst de gebruiker op de achtergrond als er een token is', async () => {
    // Een lid dat beheerder is geworden, of dat uit een orkest is gehaald,
    // hoort dat bij de eerstvolgende start te merken - zonder dat het scherm
    // ondertussen leeg is.
    const bijgewerkt = { ...lid, role: 'admin' } as User;
    profielOphalen.mockResolvedValue(bijgewerkt);
    localStorage.setItem('token', 'geldig-token');
    localStorage.setItem('user', JSON.stringify(lid));

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.user).toEqual(bijgewerkt));
    expect(JSON.parse(localStorage.getItem('user') ?? 'null')).toEqual(bijgewerkt);
  });

  it('vraagt niets aan de server als er geen token is', async () => {
    localStorage.setItem('user', JSON.stringify(lid));

    renderHook(() => useAuth(), { wrapper: omhulsel });

    await act(async () => {
      await Promise.resolve();
    });
    expect(profielOphalen).not.toHaveBeenCalled();
  });

  it('ruimt een verlopen sessie op', async () => {
    // Antwoordt de server dat het token niet meer geldt, dan moet alles weg.
    // Blijft de gebruiker staan, dan ziet hij een app waarin elke aanvraag
    // faalt en waaruit hij niet meer bij het inlogscherm komt.
    profielOphalen.mockRejectedValue(new Error('401'));
    localStorage.setItem('token', 'verlopen-token');
    localStorage.setItem('user', JSON.stringify(lid));

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('zet niets meer klaar als het scherm ondertussen weg is', async () => {
    let losmaken: (waarde: User) => void = () => {};
    profielOphalen.mockReturnValue(
      new Promise<User>((resolve) => {
        losmaken = resolve;
      }),
    );
    localStorage.setItem('token', 'geldig-token');
    const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useAuth(), { wrapper: omhulsel });
    unmount();

    await act(async () => {
      losmaken(lid);
      await Promise.resolve();
    });

    expect(fouten).not.toHaveBeenCalled();
    fouten.mockRestore();
  });
});

// =============================================================================
// Rommel in localStorage
// =============================================================================

describe('rommel in localStorage', () => {
  it('start gewoon op bij een half geschreven gebruiker', () => {
    // Een tab die tijdens het schrijven wordt afgekapt laat halve JSON achter.
    // `JSON.parse` gooit daarop, en een fout in de begintoestand van deze
    // provider haalt de hele app onderuit.
    localStorage.setItem('user', '{"id":"lid-1","firstName":"Ru');

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    expect(result.current.user).toBeNull();
  });

  it('start gewoon op bij een lege of onzinnige waarde', () => {
    for (const rommel of ['', 'undefined', 'niet eens json', '{{}}']) {
      localStorage.setItem('user', rommel);

      const { result, unmount } = renderHook(() => useAuth(), { wrapper: omhulsel });

      expect(result.current.user, rommel).toBeNull();
      unmount();
    }
  });

  it('houdt een waarde die geldig is maar geen gebruiker voor niemand', () => {
    // Deze waarden komen wél door `JSON.parse` heen. Zonder controle op de
    // vorm gaat de app ermee door alsof er iemand is ingelogd: het inlogscherm
    // is dan onbereikbaar (dat stuurt ingelogde bezoekers weg) terwijl elk
    // veld van die "gebruiker" leeg is.
    for (const rommel of ['"ruud"', '123', 'true', '[]', '["ruud"]']) {
      localStorage.setItem('user', rommel);

      const { result, unmount } = renderHook(() => useAuth(), { wrapper: omhulsel });

      expect(result.current.user, rommel).toBeNull();
      unmount();
    }
  });

  it('leest een bewaarde null gewoon als "niemand"', () => {
    localStorage.setItem('user', 'null');

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    expect(result.current.user).toBeNull();
  });

  it('start gewoon op als localStorage helemaal niet mag', () => {
    // In een privévenster of achter strenge browserinstellingen gooit getItem.
    const weigeren = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('toegang geweigerd');
    });

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    expect(result.current.user).toBeNull();
    weigeren.mockRestore();
  });

  it('zet de gebruiker ook als het bewaren mislukt', async () => {
    // Een volle opslag mag niet betekenen dat een verse sessie niet doorgaat.
    profielOphalen.mockResolvedValue(lid);
    localStorage.setItem('token', 'geldig-token');
    const weigeren = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    await waitFor(() => expect(result.current.user).toEqual(lid));
    weigeren.mockRestore();
  });
});

// =============================================================================
// Het profiel bijwerken
// =============================================================================

describe('refreshProfile', () => {
  it('haalt het profiel opnieuw op en zet het in de sessie', async () => {
    // Gebruikt na het wijzigen van eigen gegevens of na het wisselen van
    // vereniging: de naam in de kop hoort meteen te kloppen.
    const bijgewerkt = { ...lid, firstName: 'Ruud-Jan' } as User;
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });
    profielOphalen.mockResolvedValue(bijgewerkt);

    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(result.current.user).toEqual(bijgewerkt);
  });

  it('geeft een mislukte poging door aan de aanroeper', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });
    profielOphalen.mockRejectedValue(new Error('server weg'));

    await expect(result.current.refreshProfile()).rejects.toThrow('server weg');
  });

  it('laat de bestaande sessie staan als het ophalen mislukt', async () => {
    // Een hapering in het netwerk hoort niemand uit te loggen.
    localStorage.setItem('user', JSON.stringify(lid));
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });
    profielOphalen.mockRejectedValue(new Error('server weg'));

    await expect(result.current.refreshProfile()).rejects.toThrow();

    expect(result.current.user).toEqual(lid);
  });
});

// =============================================================================
// Wat uitloggen nog meer moet opruimen
// =============================================================================

describe('uitloggen en het downloadtoken', () => {
  it('gooit het kortlopende downloadtoken weg', async () => {
    // Dat token hangt vier minuten in het geheugen en kan geen kop meesturen,
    // dus het zit in de URL van elke pasfoto en elk pdf-fragment. Blijft het
    // staan, dan haalt de volgende gebruiker op een gedeelde tablet zijn
    // afbeeldingen op met het token van zijn voorganger, en aan de serverkant
    // is dat niet van echt te onderscheiden.
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(wisDownloadToken).toHaveBeenCalledTimes(1);
  });
});

describe('useAuth buiten een provider', () => {
  it('zegt waar het aan ligt in plaats van undefined terug te geven', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});
