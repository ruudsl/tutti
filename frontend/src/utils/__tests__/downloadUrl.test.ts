/**
 * Tests voor het kortlopende downloadtoken.
 *
 * Een `<img src>`, een `<audio src>` en een `window.open` kunnen geen
 * Authorization-kop meesturen. In plaats van het gewone JWT in de URL te
 * plakken - waar het in serverlogs, proxies en de browsergeschiedenis blijft
 * hangen - vraagt de app een token dat vijf minuten meegaat.
 *
 * Wat hier stuk kan:
 *
 *   - de cache mist, en een ledenlijst met veertig pasfoto's doet veertig
 *     POST's in plaats van één;
 *   - de cache is te gretig, en een token wordt na het verlopen nog gebruikt:
 *     alle foto's worden dan stille 401's, ofwel lege vlakken;
 *   - de cache blijft na het uitloggen staan. Op de gedeelde tablet in de
 *     repetitieruimte logt de volgende binnen vier minuten in en haalt zijn
 *     pasfoto's op met het token van zijn voorganger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * De tokenaanvraag liep als kale `fetch`, en dat bootste dit bestand ook na.
 * Sinds hij via de gedeelde axios-instantie gaat, hoort de nabootsing daar te
 * zitten. Het object komt uit `vi.hoisted` zodat het dezelfde identiteit houdt
 * over de `vi.resetModules()` in `verseModule()` heen - anders kijkt elke test
 * naar een andere nepfunctie dan de module gebruikt.
 *
 * Dat de Authorization-kop erop komt, wordt niet meer hier getoetst: dat is nu
 * het werk van de request-interceptor in client.ts, en daar staan eigen tests
 * voor in src/__tests__/api-interceptors.test.ts.
 */
const { nepClient } = vi.hoisted(() => ({ nepClient: { post: vi.fn() } }));
vi.mock('../../api/client', () => ({ default: nepClient, api: nepClient }));

/**
 * Laadt de module opnieuw in.
 *
 * De cache staat in modulevariabelen; zonder deze stap lekt het token van de
 * ene test naar de volgende en toetst de tweede test niets meer.
 */
async function verseModule() {
  vi.resetModules();
  return import('../downloadUrl');
}

/** Een aanvraag die telkens hetzelfde token teruggeeft. */
function nepPost(token = 'kort-token') {
  return vi.fn().mockResolvedValue({ data: { token } });
}

/** Zet de nepaanvraag klaar en geeft hem terug, zodat je erop kunt toetsen. */
function zetPost<T extends { (...args: never[]): unknown }>(post: T): T {
  nepClient.post = post as unknown as typeof nepClient.post;
  return post;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'jwt-van-de-gebruiker');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// =============================================================================
// Het token opvragen
// =============================================================================

describe('getDownloadToken', () => {
  it('vraagt het token op met het gewone token als bewijs', async () => {
    const post = zetPost(nepPost());
    const { getDownloadToken } = await verseModule();

    await expect(getDownloadToken()).resolves.toBe('kort-token');

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('/download-token');
  });

  it('weigert zonder ingelogde gebruiker', async () => {
    // Anders gaat er een POST zonder bewijs de deur uit en krijgt de gebruiker
    // een onbegrijpelijke fout in plaats van het inlogscherm.
    localStorage.removeItem('token');
    const post = zetPost(nepPost());
    const { getDownloadToken } = await verseModule();

    await expect(getDownloadToken()).rejects.toThrow('Not authenticated');
    expect(post).not.toHaveBeenCalled();
  });

  it('gebruikt het token uit de cache bij een tweede aanvraag', async () => {
    // Dit is de hele reden dat de cache bestaat: een ledenlijst met veertig
    // pasfoto's mag geen veertig POST's veroorzaken.
    const post = zetPost(nepPost());
    const { getDownloadToken } = await verseModule();

    await getDownloadToken();
    await getDownloadToken();
    await getDownloadToken();

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('laat gelijktijdige aanvragers één aanvraag delen', async () => {
    // Veertig afbeeldingen die tegelijk renderen vragen tegelijk om een token.
    // Zonder gedeelde aanvraag gaan er veertig POST's tegelijk uit.
    let losmaken: (waarde: { data: { token: string } }) => void = () => {};
    const post = vi.fn(
      () =>
        new Promise((resolve) => {
          losmaken = resolve;
        }),
    );
    zetPost(post);
    const { getDownloadToken } = await verseModule();

    const drie = Promise.all([getDownloadToken(), getDownloadToken(), getDownloadToken()]);
    losmaken({ data: { token: 'gedeeld-token' } });

    await expect(drie).resolves.toEqual(['gedeeld-token', 'gedeeld-token', 'gedeeld-token']);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('haalt een nieuw token op zodra het oude bijna verlopen is', async () => {
    // De server laat het token vijf minuten leven; de cache houdt vier minuten
    // aan. Rekt de cache verder op, dan worden alle afbeeldingen op een scherm
    // stille 401's - lege vlakken zonder foutmelding.
    vi.useFakeTimers();
    const post = zetPost(nepPost());
    const { getDownloadToken } = await verseModule();

    await getDownloadToken();
    vi.advanceTimersByTime(3 * 60 * 1000);
    await getDownloadToken();
    expect(post).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await getDownloadToken();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('meldt een weigering van de server als fout', async () => {
    // Een 401 komt nu als afwijzing binnen in plaats van als antwoord met
    // ok:false; de gedeelde interceptor handelt hem af en gooit door.
    const afwijzing = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401 },
    });
    zetPost(vi.fn().mockRejectedValue(afwijzing));
    const { getDownloadToken } = await verseModule();

    await expect(getDownloadToken()).rejects.toThrow();
  });

  it('probeert het na een mislukte aanvraag opnieuw', async () => {
    // De mislukte aanvraag mag niet als "er loopt al iets" blijven staan; dan
    // wacht elke volgende afbeelding op een aanvraag die nooit meer komt.
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error('netwerk weg'))
      .mockResolvedValue({ data: { token: 'tweede-poging' } });
    zetPost(post);
    const { getDownloadToken } = await verseModule();

    await expect(getDownloadToken()).rejects.toThrow('netwerk weg');
    await expect(getDownloadToken()).resolves.toBe('tweede-poging');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('bewaart een mislukte aanvraag niet als geldig token', async () => {
    const post = vi.fn().mockRejectedValue(new Error('netwerk weg'));
    zetPost(post);
    const { getDownloadToken } = await verseModule();

    await expect(getDownloadToken()).rejects.toThrow();
    await expect(getDownloadToken()).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Het token aan een adres hangen
// =============================================================================

describe('withDownloadToken', () => {
  it('hangt het token achter een adres zonder vraagteken', async () => {
    zetPost(nepPost());
    const { withDownloadToken } = await verseModule();

    await expect(withDownloadToken('/api/pdf-tools/download/stuk.pdf')).resolves.toBe(
      '/api/pdf-tools/download/stuk.pdf?token=kort-token',
    );
  });

  it('hangt het token met een &-teken achter een adres dat al vragen stelt', async () => {
    // Met een tweede vraagteken raakt de hele parameterreeks zoek en krijgt de
    // gebruiker het verkeerde bestand of een 404.
    zetPost(nepPost());
    const { withDownloadToken } = await verseModule();

    await expect(withDownloadToken('/api/export?soort=pdf')).resolves.toBe('/api/export?soort=pdf&token=kort-token');
  });

  it('maakt tekens in het token veilig voor een adres', async () => {
    // Een token met een + of een / erin verandert zonder codering van waarde
    // zodra de server hem uitleest.
    zetPost(nepPost('a+b/c=d&e'));
    const { withDownloadToken } = await verseModule();

    const adres = await withDownloadToken('/api/bestand');

    expect(adres).toBe('/api/bestand?token=a%2Bb%2Fc%3Dd%26e');
    expect(new URL(adres, 'https://harmonie.nl').searchParams.get('token')).toBe('a+b/c=d&e');
  });

  it('doet geen tweede aanvraag voor een tweede adres', async () => {
    const post = zetPost(nepPost());
    const { withDownloadToken } = await verseModule();

    await withDownloadToken('/api/een');
    await withDownloadToken('/api/twee');

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('zet het token achter een anker in plaats van ervoor', async () => {
    // VASTGELEGD GEDRAG: bij een adres met een #-anker (zoals '#page=3' voor
    // een pdf-lezer) komt de parameter achter het anker terecht en leest de
    // server hem niet. Geen aanroeper doet dat nu, maar wie het probeert
    // krijgt een 401 zonder duidelijke oorzaak.
    zetPost(nepPost());
    const { withDownloadToken } = await verseModule();

    await expect(withDownloadToken('/api/bestand.pdf#page=3')).resolves.toBe(
      '/api/bestand.pdf#page=3?token=kort-token',
    );
  });
});

// =============================================================================
// De cache leegmaken bij het uitloggen
// =============================================================================

describe('clearDownloadTokenCache', () => {
  it('dwingt een nieuwe aanvraag af', async () => {
    const post = zetPost(nepPost());
    const { getDownloadToken, clearDownloadTokenCache } = await verseModule();

    await getDownloadToken();
    clearDownloadTokenCache();
    await getDownloadToken();

    expect(post).toHaveBeenCalledTimes(2);
  });

  it('laat een aanvraag die tijdens het uitloggen loopt niet alsnog in de cache belanden', async () => {
    // Dit is het gevaarlijke geval. Op de gedeelde tablet drukt iemand op
    // uitloggen terwijl er nog een tokenaanvraag onderweg is. Die aanvraag
    // komt daarna binnen en schreef het token van de vórige gebruiker alsnog
    // in de cache - vier minuten lang. Logt de volgende binnen die tijd in,
    // dan haalt zijn ledenlijst de pasfoto's op met het token van zijn
    // voorganger, en aan de serverkant is dat niet van echt te onderscheiden.
    let losmaken: (waarde: { data: { token: string } }) => void = () => {};
    const post = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            losmaken = resolve;
          }),
      )
      .mockResolvedValue({ data: { token: 'token-van-de-nieuwe' } });
    zetPost(post);
    const { getDownloadToken, clearDownloadTokenCache } = await verseModule();

    const lopend = getDownloadToken();
    clearDownloadTokenCache();
    losmaken({ data: { token: 'token-van-de-vorige' } });
    await lopend;

    await expect(getDownloadToken()).resolves.toBe('token-van-de-nieuwe');
    expect(post).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// De hook voor gebruik tijdens het renderen
// =============================================================================

describe('useDownloadToken', () => {
  it('begint met niets en levert het token zodra het binnen is', async () => {
    // Tot die tijd horen aanroepers hun terugval te tonen (initialen in plaats
    // van een pasfoto), niet een kapot afbeeldingsicoon.
    zetPost(nepPost());
    const { useDownloadToken } = await verseModule();

    const { result } = renderHook(() => useDownloadToken());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('kort-token'));
  });

  it('heeft het token meteen als het al in de cache staat', async () => {
    // Anders knipperen bij elke paginawissel alle pasfoto's een keer weg,
    // omdat elke <img> een nieuwe src krijgt.
    zetPost(nepPost());
    const { useDownloadToken, getDownloadToken } = await verseModule();
    await getDownloadToken();

    const { result } = renderHook(() => useDownloadToken());

    expect(result.current).toBe('kort-token');
  });

  it('blijft op niets staan als het ophalen mislukt', async () => {
    // Een mislukte tokenaanvraag mag geen foutscherm opleveren; de pagina moet
    // gewoon zonder pasfoto's door.
    zetPost(vi.fn().mockRejectedValue(new Error('netwerk weg')));
    const { useDownloadToken } = await verseModule();

    const { result } = renderHook(() => useDownloadToken());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('doet één aanvraag voor twee tegelijk getoonde onderdelen', async () => {
    const post = zetPost(nepPost());
    const { useDownloadToken } = await verseModule();

    const eerste = renderHook(() => useDownloadToken());
    const tweede = renderHook(() => useDownloadToken());

    await waitFor(() => expect(eerste.result.current).toBe('kort-token'));
    await waitFor(() => expect(tweede.result.current).toBe('kort-token'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('zet niets meer klaar nadat het onderdeel uit beeld is', async () => {
    // React klaagt anders over een toestandswijziging op een verdwenen
    // onderdeel, en bij een lijst die snel scrollt gebeurt dat voortdurend.
    let losmaken: (waarde: { data: { token: string } }) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            losmaken = resolve;
          }),
      ),
    );
    const { useDownloadToken } = await verseModule();
    const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useDownloadToken());
    unmount();

    await act(async () => {
      losmaken({ data: { token: 'te-laat' } });
      await Promise.resolve();
    });

    expect(fouten).not.toHaveBeenCalled();
    fouten.mockRestore();
  });
});
