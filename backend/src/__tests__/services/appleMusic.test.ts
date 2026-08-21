/**
 * De Apple Music-koppeling.
 *
 * Net als bij Spotify praat deze dienst met een partij buiten onze deur, en
 * gelden dezelfde drie vragen: wat gebeurt er als het misgaat, blijven we
 * wachten als de andere kant hangt, en blijft de sleutel binnen.
 *
 * Bij Apple weegt dat laatste zwaarder. Er gaat geen wachtwoord heen en weer
 * maar een JWT die wij zelf ondertekenen met een private sleutel. Die sleutel
 * en het token dat eruit volgt mogen nergens in een logregel of in een
 * antwoord terechtkomen, en het token moet er precies uitzien zoals Apple
 * voorschrijft - een fout daarin merk je pas als de koppeling in productie
 * niets meer teruggeeft.
 *
 * Het netwerk wordt volledig nagebootst. De sleutel is een echte, hier ter
 * plekke gemaakte P-256-sleutel, zodat de ondertekening echt gebeurt en niet
 * wegvalt achter een nagebootste jwt-module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import '../setup';
import logger from '../../utils/logger';
import { AppleMusicClient, getAppleMusicClient, AppleMusicTrack } from '../../services/appleMusic';

const TEAM_ID = 'TEAM123456';
const KEY_ID = 'KEY1234567';

// Apple tekent met ES256; een P-256-sleutel is wat daarbij hoort.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

function dienst(...antwoorden: Response[]) {
  let volgende = 0;
  const nep = vi.fn(async () => antwoorden[Math.min(volgende++, antwoorden.length - 1)]);
  vi.stubGlobal('fetch', nep);
  return nep;
}

function nummer(overrides: Partial<AppleMusicTrack['attributes']> = {}): AppleMusicTrack {
  return {
    id: '1234567890',
    type: 'songs',
    href: '/v1/catalog/nl/songs/1234567890',
    attributes: {
      name: 'Mars der Medici',
      artistName: 'Johan Wichers',
      albumName: 'Nederlandse Marsen',
      durationInMillis: 210000,
      previews: [{ url: 'https://audio-ssl.itunes.apple.com/preview.m4a' }],
      artwork: { url: 'https://is1-ssl.mzstatic.com/image/{w}x{h}bb.jpg', width: 1400, height: 1400 },
      url: 'https://music.apple.com/nl/album/mars-der-medici/999?i=1234567890',
      ...overrides,
    },
  };
}

const zoekantwoord = (data: AppleMusicTrack[]) => antwoord(200, { results: { songs: { data } } });

/** Het token uit de Authorization-header van een aanroep. */
function tokenUit(aanroep: unknown[]): string {
  const kopjes = (aanroep[1] as RequestInit).headers as Record<string, string>;
  return kopjes.Authorization.replace('Bearer ', '');
}

describe('Apple Music-koppeling', () => {
  let client: AppleMusicClient;

  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
    client = new AppleMusicClient(TEAM_ID, KEY_ID, PRIVATE_PEM);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('of de koppeling is ingericht', () => {
    it('is ingericht met alle drie de gegevens', () => {
      expect(client.isConfigured()).toBe(true);
    });

    it.each([
      ['zonder team', '', KEY_ID, PRIVATE_PEM],
      ['zonder sleutel-id', TEAM_ID, '', PRIVATE_PEM],
      ['zonder private sleutel', TEAM_ID, KEY_ID, ''],
    ])('is niet ingericht %s', (_naam, team, keyId, key) => {
      expect(new AppleMusicClient(team, keyId, key).isConfigured()).toBe(false);
    });

    it('gaat de deur niet uit als er niets is ingericht', () => {
      const nep = dienst(zoekantwoord([]));
      const leeg = new AppleMusicClient('', '', '');

      return expect(leeg.searchTracks('iets'))
        .rejects.toThrow(/not configured/i)
        .then(() => {
          expect(nep).not.toHaveBeenCalled();
        });
    });
  });

  describe('het ontwikkelaarstoken', () => {
    it('tekent een token dat met de eigen sleutel klopt', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const geldig = jwt.verify(tokenUit(nep.mock.calls[0]), PUBLIC_PEM, { algorithms: ['ES256'] }) as {
        iss: string;
        iat: number;
        exp: number;
      };
      expect(geldig.iss).toBe(TEAM_ID);
    });

    it('zet het sleutel-id in de kop van het token', async () => {
      // Apple zoekt aan de hand van `kid` op met welke sleutel hij moet
      // controleren; zonder dat is het token onbruikbaar.
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const kop = JSON.parse(Buffer.from(tokenUit(nep.mock.calls[0]).split('.')[0], 'base64url').toString());
      expect(kop.alg).toBe('ES256');
      expect(kop.kid).toBe(KEY_ID);
    });

    it('laat het token zes uur meegaan', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const inhoud = jwt.decode(tokenUit(nep.mock.calls[0])) as { iat: number; exp: number };
      expect(inhoud.exp - inhoud.iat).toBe(6 * 60 * 60);
    });

    it('gebruikt hetzelfde token opnieuw voor een tweede vraag', async () => {
      // Elke keer opnieuw tekenen kost een handtekening met de private sleutel
      // en levert niets op zolang het token nog uren geldig is.
      const nep = dienst(zoekantwoord([]), zoekantwoord([]));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
      await client.searchTracks('een');

      vi.setSystemTime(new Date('2026-05-01T11:00:00Z'));
      await client.searchTracks('twee');

      expect(tokenUit(nep.mock.calls[1])).toBe(tokenUit(nep.mock.calls[0]));
    });

    it('tekent een nieuw token zodra het oude bijna om is', async () => {
      // De marge is vijf minuten voor het einde van de zes uur.
      const nep = dienst(zoekantwoord([]), zoekantwoord([]));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
      await client.searchTracks('een');

      vi.setSystemTime(new Date('2026-05-01T15:56:00Z'));
      await client.searchTracks('twee');

      expect(tokenUit(nep.mock.calls[1])).not.toBe(tokenUit(nep.mock.calls[0]));
    });

    it('meldt duidelijk dat de gegevens ontbreken', () => {
      const leeg = new AppleMusicClient('', '', '');
      return expect(leeg.getTrack('1')).rejects.toThrow(
        /APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY/,
      );
    });

    it('laat een onbruikbare sleutel als fout doorkomen', async () => {
      // Een verkeerd geplakte sleutel in de omgevingsvariabelen is het meest
      // voorkomende geval; dat moet stuklopen bij het tekenen en niet leiden
      // tot een verzoek met een leeg token.
      const nep = dienst(zoekantwoord([]));
      const kapot = new AppleMusicClient(TEAM_ID, KEY_ID, 'dit-is-geen-sleutel');

      await expect(kapot.searchTracks('Mars')).rejects.toThrow();
      expect(nep).not.toHaveBeenCalled();
    });
  });

  describe('zoeken', () => {
    it('geeft de gevonden nummers vereenvoudigd terug', async () => {
      dienst(zoekantwoord([nummer()]));

      expect(await client.searchTracks('Mars der Medici')).toEqual([
        {
          id: '1234567890',
          name: 'Mars der Medici',
          artist: 'Johan Wichers',
          album: 'Nederlandse Marsen',
          albumArt: 'https://is1-ssl.mzstatic.com/image/300x300bb.jpg',
          durationMs: 210000,
          previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
          appleMusicUrl: 'https://music.apple.com/nl/album/mars-der-medici/999?i=1234567890',
        },
      ]);
    });

    it('zoekt in de Nederlandse catalogus', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      const url = new URL(nep.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/v1/catalog/nl/search');
      expect(url.searchParams.get('types')).toBe('songs');
    });

    it('plakt de componist achter de titel', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars der Medici', 'Wichers');

      expect(new URL(nep.mock.calls[0][0] as string).searchParams.get('term')).toBe('Mars der Medici Wichers');
    });

    it('geeft het aantal door dat gevraagd is', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars', undefined, 5);

      expect(new URL(nep.mock.calls[0][0] as string).searchParams.get('limit')).toBe('5');
    });

    it('geeft een lege lijst bij een lege trefferlijst', async () => {
      dienst(zoekantwoord([]));
      expect(await client.searchTracks('bestaat niet')).toEqual([]);
    });

    it('geeft een lege lijst als Apple het songs-blok weglaat', async () => {
      // Apple laat het hele blok weg als er niets gevonden is; dat is een
      // geldig antwoord en geen fout.
      dienst(antwoord(200, { results: {} }));
      expect(await client.searchTracks('bestaat niet')).toEqual([]);
    });

    it('vult de hoesmaat in op de plaatshouders', async () => {
      dienst(
        zoekantwoord([
          nummer({ artwork: { url: 'https://is1-ssl.mzstatic.com/{w}-{h}-{w}.jpg', width: 100, height: 100 } }),
        ]),
      );

      // Alleen de eerste plaatshouder van elk soort wordt vervangen; de rest
      // blijft staan. Apple gebruikt er in de praktijk een van elk.
      expect((await client.searchTracks('Mars'))[0].albumArt).toBe('https://is1-ssl.mzstatic.com/300-300-{w}.jpg');
    });

    it('houdt een ontbrekende hoes op null', async () => {
      dienst(zoekantwoord([nummer({ artwork: undefined })]));
      expect((await client.searchTracks('Mars'))[0].albumArt).toBeNull();
    });

    it('houdt een ontbrekend voorbeeldfragment op null', async () => {
      dienst(zoekantwoord([nummer({ previews: [] })]));
      expect((await client.searchTracks('Mars'))[0].previewUrl).toBeNull();
    });
  });

  describe('een nummer opvragen', () => {
    it('haalt een nummer op het id op', async () => {
      const nep = dienst(antwoord(200, { data: [nummer()] }));
      const resultaat = await client.getTrack('1234567890');

      expect(resultaat.name).toBe('Mars der Medici');
      expect(nep.mock.calls[0][0]).toContain('/catalog/nl/songs/1234567890');
    });

    it('meldt een leeg antwoord als "niet gevonden"', async () => {
      // Apple geeft hier een 200 met een lege lijst, geen 404. Zonder deze
      // controle zou mapTrack op undefined stuklopen met een onbegrijpelijke
      // melding.
      dienst(antwoord(200, { data: [] }));
      await expect(client.getTrack('1234567890')).rejects.toThrow('Track not found');
    });

    it('meldt een antwoord zonder data als "niet gevonden"', async () => {
      dienst(antwoord(200, {}));
      await expect(client.getTrack('1234567890')).rejects.toThrow('Track not found');
    });
  });

  describe('als het bij Apple misgaat', () => {
    it('meldt een geweigerd token met de status erbij', async () => {
      dienst(antwoord(401, 'Unauthorized'));
      await expect(client.searchTracks('Mars')).rejects.toThrow('Apple Music API request failed: 401');
    });

    it('meldt een storing van de dienst', async () => {
      dienst(antwoord(503, 'Service Unavailable'));
      await expect(client.searchTracks('Mars')).rejects.toThrow('Apple Music API request failed: 503');
    });

    it('laat een tempolimiet als fout doorkomen', async () => {
      dienst(antwoord(429, 'Too Many Requests'));
      await expect(client.searchTracks('Mars')).rejects.toThrow('Apple Music API request failed: 429');
    });

    it('laat een netwerkfout door zoals hij is', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('getaddrinfo ENOTFOUND api.music.apple.com');
        }),
      );

      await expect(client.searchTracks('Mars')).rejects.toThrow(/ENOTFOUND/);
    });

    it('loopt stuk op een antwoord in een onbekende vorm', async () => {
      // `results` hoort bij elk geslaagd zoekantwoord te zitten. Ontbreekt
      // het, dan is er iets anders aan de hand dan "niets gevonden", en dat
      // hoort niet als lege lijst te eindigen. Vastgelegd zoals het is.
      dienst(antwoord(200, { onverwacht: true }));
      await expect(client.searchTracks('Mars')).rejects.toThrow(TypeError);
    });
  });

  describe('een tijdslimiet op de aanroep', () => {
    it('geeft het verzoek een tijdslimiet mee', async () => {
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      expect((nep.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it('geeft het op als de dienst blijft hangen', async () => {
      // De echte limiet is te lang voor een test; hier tien milliseconden.
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

  describe('de sleutel blijft binnen', () => {
    it('zet sleutel noch token in een logregel bij een mislukt verzoek', async () => {
      const nep = dienst(antwoord(500, 'Internal Server Error'));
      await client.searchTracks('Mars').catch(() => undefined);

      expect(logger.error).toHaveBeenCalled();
      const gelogd = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(gelogd).not.toContain(PRIVATE_PEM);
      expect(gelogd).not.toContain('PRIVATE KEY');
      expect(gelogd).not.toContain(tokenUit(nep.mock.calls[0]));
    });

    it('houdt sleutel en token uit de foutmelding die naar boven gaat', async () => {
      // Deze melding komt via de foutafhandeling op het scherm van een lid.
      const nep = dienst(antwoord(401, 'Unauthorized: token rejected'));
      const fout = await client.searchTracks('Mars').catch((e: Error) => e);

      expect((fout as Error).message).not.toContain(PRIVATE_PEM);
      expect((fout as Error).message).not.toContain(tokenUit(nep.mock.calls[0]));
    });

    it('geeft geen token terug in het resultaat', async () => {
      const nep = dienst(zoekantwoord([nummer()]));
      const resultaten = await client.searchTracks('Mars');

      const uitkomst = JSON.stringify(resultaten);
      expect(uitkomst).not.toContain(tokenUit(nep.mock.calls[0]));
      expect(uitkomst).not.toContain(PRIVATE_PEM);
      expect(uitkomst).not.toContain(TEAM_ID);
      expect(uitkomst).not.toContain(KEY_ID);
    });

    it('zet het token in de header en niet in het webadres', async () => {
      // Een token in de query komt in logboeken van elke tussenliggende partij
      // terecht.
      const nep = dienst(zoekantwoord([]));
      await client.searchTracks('Mars');

      expect(String(nep.mock.calls[0][0])).not.toContain(tokenUit(nep.mock.calls[0]));
      expect(String(nep.mock.calls[0][0])).not.toContain(KEY_ID);
    });
  });

  describe('webadressen van Apple Music lezen en maken', () => {
    it.each([
      ['https://music.apple.com/nl/album/mars-der-medici/999?i=1234567890', '1234567890'],
      ['https://music.apple.com/us/album/some-track/555?i=987654321', '987654321'],
      ['https://music.apple.com/nl/song/mars-der-medici/1234567890', '1234567890'],
      ['apple-music://song/1234567890', '1234567890'],
    ])('leest het id uit %s', (url, id) => {
      expect(AppleMusicClient.extractTrackId(url)).toBe(id);
    });

    it.each([
      ['https://music.apple.com/nl/album/mars-der-medici/999'],
      ['https://music.apple.com/album/mars-der-medici/999?i=123'],
      ['https://example.com/song/123'],
      ['zomaar wat tekst'],
      [''],
    ])('leest geen id uit %s', (url) => {
      expect(AppleMusicClient.extractTrackId(url)).toBeNull();
    });

    it('bouwt een webadres uit een id', () => {
      expect(AppleMusicClient.buildTrackUrl('1234567890')).toBe('https://music.apple.com/nl/song/1234567890');
    });

    it('leest een zelfgebouwd adres zonder naamdeel niet terug', () => {
      // buildTrackUrl laat het naamdeel weg, terwijl extractTrackId er wel een
      // verwacht (`/song/<naam>/<id>`). Wat we zelf bouwen kunnen we dus niet
      // teruglezen. Dat valt in de praktijk niet op omdat de opgeslagen link
      // van Apple zelf komt, maar het is wel de reden dat dit hier staat.
      const gebouwd = AppleMusicClient.buildTrackUrl('1234567890');
      expect(AppleMusicClient.extractTrackId(gebouwd)).toBeNull();
    });
  });

  describe('de gedeelde koppeling', () => {
    it('geeft steeds dezelfde koppeling terug', () => {
      expect(getAppleMusicClient()).toBe(getAppleMusicClient());
    });
  });
});
