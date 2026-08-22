/**
 * De Spotify-koppeling.
 *
 * Deze dienst praat met een partij buiten onze deur. Drie dingen tellen dan
 * zwaarder dan de gelukkige weg:
 *
 * 1. **Wat er gebeurt als het misgaat.** Een storing, een leeg antwoord, een
 *    antwoord in een vorm die we niet kennen - dat moet een duidelijke fout
 *    worden en geen half ingevuld resultaat.
 * 2. **Dat we niet blijven wachten.** Zonder tijdslimiet houdt een hangende
 *    dienst onze eigen aanvraag net zo lang bezet, met een verbinding en een
 *    werker eraan vast.
 * 3. **Dat de sleutel binnen blijft.** Het clientgeheim en het token mogen
 *    nooit in een logregel of in een antwoord aan de gebruiker terechtkomen.
 *
 * Het netwerk wordt hier volledig nagebootst; er gaat geen enkel verzoek de
 * deur uit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import logger from '../../utils/logger';
import { SpotifyClient, getSpotifyClient, SpotifyTrack } from '../../services/spotify';

const CLIENT_ID = 'onze-client-id';
const CLIENT_SECRET = 'geheim-van-de-vereniging-xyz';
const TOKEN = 'toegangstoken-abc123';

function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

/** Een geldig token, gevolgd door wat de zoekopdracht teruggeeft. */
function dienst(...antwoorden: Response[]) {
  const tokenAntwoord = antwoord(200, { access_token: TOKEN, expires_in: 3600 });
  const rij = [tokenAntwoord, ...antwoorden];
  let volgende = 0;
  const nep = vi.fn(async () => rij[Math.min(volgende++, rij.length - 1)]);
  vi.stubGlobal('fetch', nep);
  return nep;
}

function nummer(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: '6rqhFgbbKwnb9MLmUQDhG6',
    name: 'Mars der Medici',
    artists: [{ id: 'a1', name: 'Johan Wichers' }],
    album: {
      id: 'al1',
      name: 'Nederlandse Marsen',
      images: [{ url: 'https://i.scdn.co/image/groot', width: 640, height: 640 }],
    },
    duration_ms: 210000,
    preview_url: 'https://p.scdn.co/mp3-preview/abc',
    external_urls: { spotify: 'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6' },
    ...overrides,
  };
}

const zoekantwoord = (items: SpotifyTrack[]) =>
  antwoord(200, { tracks: { items, total: items.length, limit: 10, offset: 0 } });

/** Alles wat nooit naar buiten mag, op een hoop. */
const GEHEIMEN = [CLIENT_SECRET, TOKEN, Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')];

function verwachtGeenGeheimen(tekst: string): void {
  for (const geheim of GEHEIMEN) {
    expect(tekst).not.toContain(geheim);
  }
}

describe('Spotify-koppeling', () => {
  let client: SpotifyClient;

  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
    client = new SpotifyClient(CLIENT_ID, CLIENT_SECRET);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('of de koppeling is ingericht', () => {
    it('is ingericht met beide gegevens', () => {
      expect(client.isConfigured()).toBe(true);
    });

    it('is niet ingericht zonder geheim', () => {
      expect(new SpotifyClient(CLIENT_ID, '').isConfigured()).toBe(false);
      expect(new SpotifyClient('', CLIENT_SECRET).isConfigured()).toBe(false);
    });

    it('gaat de deur niet uit als er niets is ingericht', () => {
      // Een verzoek zonder gegevens zou een 400 van Spotify opleveren; het is
      // netter en sneller om dat hier al te weten.
      const nep = dienst(zoekantwoord([]));
      const leeg = new SpotifyClient('', '');

      return expect(leeg.searchTracks('iets'))
        .rejects.toThrow(/not configured/i)
        .then(() => {
          expect(nep).not.toHaveBeenCalled();
        });
    });
  });

  describe('zoeken', () => {
    it('geeft de gevonden nummers vereenvoudigd terug', async () => {
      dienst(zoekantwoord([nummer()]));

      const resultaten = await client.searchTracks('Mars der Medici');
      expect(resultaten).toEqual([
        {
          id: '6rqhFgbbKwnb9MLmUQDhG6',
          name: 'Mars der Medici',
          artist: 'Johan Wichers',
          album: 'Nederlandse Marsen',
          albumArt: 'https://i.scdn.co/image/groot',
          durationMs: 210000,
          previewUrl: 'https://p.scdn.co/mp3-preview/abc',
          spotifyUrl: 'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6',
        },
      ]);
    });

    it('geeft een lege lijst bij geen resultaten', async () => {
      dienst(zoekantwoord([]));
      expect(await client.searchTracks('bestaat niet')).toEqual([]);
    });

    it('zoekt op de Nederlandse markt', async () => {
      // Zonder markt komen er nummers terug die hier niet af te spelen zijn.
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const url = new URL(nep.mock.calls[1][0] as string);
      expect(url.searchParams.get('market')).toBe('NL');
      expect(url.searchParams.get('type')).toBe('track');
    });

    it('neemt de componist als artiest mee in de zoekopdracht', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars der Medici', 'Wichers');

      const url = new URL(nep.mock.calls[1][0] as string);
      expect(url.searchParams.get('q')).toBe('track:Mars der Medici artist:Wichers');
    });

    it('geeft het aantal door dat gevraagd is', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars', undefined, 3);

      expect(new URL(nep.mock.calls[1][0] as string).searchParams.get('limit')).toBe('3');
    });

    it('plakt meer artiesten aan elkaar', async () => {
      dienst(
        zoekantwoord([
          nummer({
            artists: [
              { id: 'a1', name: 'Koninklijke Militaire Kapel' },
              { id: 'a2', name: 'Johan Wichers' },
            ],
          }),
        ]),
      );

      expect((await client.searchTracks('Mars'))[0].artist).toBe('Koninklijke Militaire Kapel, Johan Wichers');
    });

    it('houdt een ontbrekende hoes en voorbeeld op null', async () => {
      dienst(
        zoekantwoord([
          nummer({
            album: { id: 'al1', name: 'Zonder hoes', images: [] },
            preview_url: null,
          }),
        ]),
      );

      const resultaat = (await client.searchTracks('Mars'))[0];
      expect(resultaat.albumArt).toBeNull();
      expect(resultaat.previewUrl).toBeNull();
    });

    it('neemt de eerste hoes, die het grootst is', async () => {
      dienst(
        zoekantwoord([
          nummer({
            album: {
              id: 'al1',
              name: 'Met hoezen',
              images: [
                { url: 'https://i.scdn.co/image/groot', width: 640, height: 640 },
                { url: 'https://i.scdn.co/image/klein', width: 64, height: 64 },
              ],
            },
          }),
        ]),
      );

      expect((await client.searchTracks('Mars'))[0].albumArt).toBe('https://i.scdn.co/image/groot');
    });
  });

  describe('een nummer opvragen', () => {
    it('haalt een nummer op het id op', async () => {
      const nep = dienst(antwoord(200, nummer()));
      const resultaat = await client.getTrack('6rqhFgbbKwnb9MLmUQDhG6');

      expect(resultaat.name).toBe('Mars der Medici');
      expect(nep.mock.calls[1][0]).toContain('/tracks/6rqhFgbbKwnb9MLmUQDhG6');
    });

    it('meldt een nummer dat er niet is als fout', async () => {
      dienst(antwoord(404, { error: { status: 404, message: 'non existing id' } }));
      await expect(client.getTrack('bestaatniet')).rejects.toThrow('Spotify API request failed: 404');
    });
  });

  describe('als het bij Spotify misgaat', () => {
    it('meldt een mislukte aanmelding met de status erbij', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => antwoord(401, { error: 'invalid_client' })),
      );

      await expect(client.searchTracks('Mars')).rejects.toThrow('Spotify authentication failed: 401');
    });

    it('meldt een storing van de dienst', async () => {
      dienst(antwoord(503, 'Service Unavailable'));
      await expect(client.searchTracks('Mars')).rejects.toThrow('Spotify API request failed: 503');
    });

    it('laat een tempolimiet als fout doorkomen', async () => {
      // 429 hoort bij deze dienst; hem stil voor "geen resultaten" laten
      // doorgaan zou de gebruiker een leeg scherm geven zonder uitleg.
      dienst(antwoord(429, 'Too Many Requests'));
      await expect(client.searchTracks('Mars')).rejects.toThrow('Spotify API request failed: 429');
    });

    it('laat een netwerkfout door zoals hij is', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('getaddrinfo ENOTFOUND api.spotify.com');
        }),
      );

      await expect(client.searchTracks('Mars')).rejects.toThrow(/ENOTFOUND/);
    });

    /**
     * Een antwoord met een goede status maar zonder de verwachte inhoud loopt
     * stuk op de eerste veronderstelling. Dat is hier bewust vastgelegd en niet
     * gerepareerd: `tracks.items` hoort bij elk geslaagd zoekantwoord van
     * Spotify te zitten, dus het ontbreken ervan betekent dat er iets
     * fundamenteel anders is dan we denken. Daar een lege lijst van maken zou
     * dat verbergen achter "niets gevonden".
     */
    it('loopt stuk op een antwoord in een onbekende vorm', async () => {
      dienst(antwoord(200, { onverwacht: true }));
      await expect(client.searchTracks('Mars')).rejects.toThrow(TypeError);
    });

    it('loopt stuk op een aanmelding zonder token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => antwoord(200, {})),
      );

      // Geen token betekent 'Bearer undefined'; die vraag hoort niet de deur
      // uit te gaan, maar doet dat nu wel. Vastgelegd zoals het is.
      await expect(client.searchTracks('Mars')).rejects.toThrow();
    });
  });

  describe('een tijdslimiet op de aanroep', () => {
    it('geeft de aanmelding een tijdslimiet mee', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      expect((nep.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it('geeft het zoekverzoek een tijdslimiet mee', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      expect((nep.mock.calls[1][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it('geeft het op als de dienst blijft hangen', async () => {
      // De echte limiet is te lang voor een test, dus hij wordt hier op tien
      // milliseconden gezet. Waar het om gaat is dat de aanroep eindigt en
      // niet blijft staan tot de andere kant hem sluit.
      const echteLimiet = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => echteLimiet(10));

      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_, afwijzen) => {
              init?.signal?.addEventListener('abort', () =>
                afwijzen(new DOMException('The operation was aborted', 'TimeoutError')),
              );
            }),
        ),
      );

      const uitkomst = await Promise.race([
        client.searchTracks('Mars').then(
          () => 'geslaagd',
          (fout: Error) => `afgebroken: ${fout.name}`,
        ),
        new Promise((los) => setTimeout(() => los('bleef hangen'), 1000)),
      ]);

      expect(uitkomst).toBe('afgebroken: TimeoutError');
    });
  });

  describe('het geheim blijft binnen', () => {
    it('zet het clientgeheim niet in een logregel bij een mislukte aanmelding', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => antwoord(401, { error: 'invalid_client' })),
      );

      await client.searchTracks('Mars').catch(() => undefined);

      expect(logger.error).toHaveBeenCalled();
      verwachtGeenGeheimen(JSON.stringify(vi.mocked(logger.error).mock.calls));
    });

    it('zet het token niet in een logregel bij een mislukt verzoek', async () => {
      dienst(antwoord(500, 'Internal Server Error'));
      await client.searchTracks('Mars').catch(() => undefined);

      expect(logger.error).toHaveBeenCalled();
      verwachtGeenGeheimen(JSON.stringify(vi.mocked(logger.error).mock.calls));
    });

    it('houdt het geheim uit de foutmelding die naar boven gaat', async () => {
      // Deze melding komt via de foutafhandeling in een antwoord terecht; wat
      // erin staat, staat straks op het scherm van een lid.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => antwoord(401, `client_secret=${CLIENT_SECRET} is invalid`)),
      );

      const fout = await client.searchTracks('Mars').catch((e: Error) => e);
      verwachtGeenGeheimen((fout as Error).message);
    });

    it('geeft geen token terug in het resultaat', async () => {
      dienst(zoekantwoord([nummer()]));
      const resultaten = await client.searchTracks('Mars');

      verwachtGeenGeheimen(JSON.stringify(resultaten));
    });

    it('stuurt het geheim alleen naar de aanmeldingsdienst', async () => {
      // Het geheim hoort in de Basic-header van het tokenverzoek en nergens
      // anders; de API zelf krijgt alleen het bearer-token.
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const aanmelding = nep.mock.calls[0];
      expect(aanmelding[0]).toBe('https://accounts.spotify.com/api/token');
      expect((aanmelding[1] as RequestInit).method).toBe('POST');

      const zoekopdracht = nep.mock.calls[1];
      const kopjes = (zoekopdracht[1] as RequestInit).headers as Record<string, string>;
      expect(kopjes.Authorization).toBe(`Bearer ${TOKEN}`);
      verwachtGeenGeheimen(String(zoekopdracht[0]));
    });
  });

  describe('het token hergebruiken', () => {
    it('meldt zich maar een keer aan voor twee vragen', async () => {
      const nep = dienst(zoekantwoord([]), zoekantwoord([]));
      await client.searchTracks('een');
      await client.searchTracks('twee');

      const aanmeldingen = nep.mock.calls.filter((c) => c[0] === 'https://accounts.spotify.com/api/token');
      expect(aanmeldingen).toHaveLength(1);
    });

    it('haalt een nieuw token zodra het oude bijna verloopt', async () => {
      // De marge is zestig seconden: een token dat over dertig seconden
      // verloopt telt al als op, want anders verloopt hij onderweg.
      const nep = vi.fn(async (url: string) =>
        url === 'https://accounts.spotify.com/api/token'
          ? antwoord(200, { access_token: TOKEN, expires_in: 30 })
          : zoekantwoord([]),
      );
      vi.stubGlobal('fetch', nep);

      await client.searchTracks('een');
      await client.searchTracks('twee');

      const aanmeldingen = nep.mock.calls.filter((c) => c[0] === 'https://accounts.spotify.com/api/token');
      expect(aanmeldingen).toHaveLength(2);
    });
  });

  describe('webadressen van Spotify lezen en maken', () => {
    it.each([
      ['https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6', '6rqhFgbbKwnb9MLmUQDhG6'],
      ['https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=abc123', '6rqhFgbbKwnb9MLmUQDhG6'],
      ['spotify:track:6rqhFgbbKwnb9MLmUQDhG6', '6rqhFgbbKwnb9MLmUQDhG6'],
      ['open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6', '6rqhFgbbKwnb9MLmUQDhG6'],
    ])('leest het id uit %s', (url, id) => {
      expect(SpotifyClient.extractTrackId(url)).toBe(id);
    });

    it.each([
      ['https://open.spotify.com/album/6rqhFgbbKwnb9MLmUQDhG6'],
      ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'],
      ['https://example.com/track/abc'],
      ['zomaar wat tekst'],
      [''],
    ])('leest geen id uit %s', (url) => {
      expect(SpotifyClient.extractTrackId(url)).toBeNull();
    });

    it('bouwt een webadres uit een id', () => {
      expect(SpotifyClient.buildTrackUrl('6rqhFgbbKwnb9MLmUQDhG6')).toBe(
        'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6',
      );
    });

    it('leest terug wat het zelf gebouwd heeft', () => {
      const id = '6rqhFgbbKwnb9MLmUQDhG6';
      expect(SpotifyClient.extractTrackId(SpotifyClient.buildTrackUrl(id))).toBe(id);
    });
  });

  describe('de gedeelde koppeling', () => {
    it('geeft steeds dezelfde koppeling terug', () => {
      expect(getSpotifyClient()).toBe(getSpotifyClient());
    });
  });
});
