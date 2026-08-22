/**
 * Bladmuziekgegevens opzoeken bij musicainfo.net (routes/musicainfo.ts).
 *
 * De route haalt html op bij een site buiten onze deur en leest die uit. Twee
 * dingen liggen hier vast:
 *
 *  1. Het adres wordt hier samengesteld uit een vaste basis en iets uit de
 *     aanvraag. Zolang dat stuk aanvraag als parameterwaarde wordt gecodeerd,
 *     kan een gebruiker de host, het pad of de andere parameters niet
 *     omzetten - en dus de server geen intern adres laten ophalen. De tests
 *     controleren precies dat, met de gekste zoektermen.
 *  2. Wat er terugkomt is onbetrouwbaar. Een storing, een tijdslimiet of
 *     onzin in plaats van html mag niet als 500 bij onze gebruiker landen en
 *     mag de route niet laten omvallen.
 *
 * Er gaat geen enkel verzoek het netwerk op: `fetch` is vervangen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import musicaInfoRoutes, { parseDurationToSeconds } from '../../routes/musicainfo';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/musicainfo', musicaInfoRoutes);
app.use(errorHandler);

const BASIS = 'https://en.musicainfo.net';

let token: string;
let nep: ReturnType<typeof vi.fn>;

/** Laat de nagebootste site html teruggeven. */
function siteGeeft(html: string, status = 200) {
  nep.mockImplementation(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  }));
}

/** Het adres waar de route naartoe wilde. */
function opgehaaldAdres(index = 0): URL {
  return new URL(String(nep.mock.calls[index][0]));
}

beforeEach(() => {
  const omgeving = createTestEnvironment();
  token = omgeving.memberToken;
  nep = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html></html>' }));
  vi.stubGlobal('fetch', nep);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function zoek(queryString: string) {
  return request(app).get(`/api/musicainfo/search${queryString}`).set('Authorization', `Bearer ${token}`);
}

function detail(queryString: string) {
  return request(app).get(`/api/musicainfo/detail${queryString}`).set('Authorization', `Bearer ${token}`);
}

describe('speelduur uit een tekst halen', () => {
  it.each([
    ['05:30', 330],
    ['5:30', 330],
    ['1:05:30', 3930],
    ['Speelduur 4:05 minuten', 245],
    ['', 0],
    ['onbekend', 0],
    ['5:3', 0],
  ])('leest %s als %i seconden', (tekst, seconden) => {
    expect(parseDurationToSeconds(tekst)).toBe(seconden);
  });
});

describe('GET /api/musicainfo/search', () => {
  it('weigert een aanvraag zonder token', async () => {
    const res = await request(app).get('/api/musicainfo/search?q=Requiem');

    expect(res.status).toBe(401);
    expect(nep).not.toHaveBeenCalled();
  });

  it('eist een zoekterm en gaat er zonder niet op uit', async () => {
    const res = await zoek('?q=%20%20');

    expect(res.status).toBe(400);
    expect(nep).not.toHaveBeenCalled();
  });

  it('geeft een 400 bij een zoekterm die twee keer meegestuurd wordt', async () => {
    // ?q=a&q=b maakt van req.query.q een lijst. Wordt daar zonder controle
    // .trim() op gedaan, dan is het een 500 - een aanvraag die de gebruiker
    // fout deed komt dan naar buiten als een defect van ons.
    const res = await zoek('?q=a&q=b');

    expect(res.status).toBe(400);
    expect(nep).not.toHaveBeenCalled();
  });

  it('bouwt het adres op de vaste basis met de zoekterm als parameterwaarde', async () => {
    siteGeeft('<html></html>');

    const res = await zoek('?q=Requiem%20%26%20Co');

    expect(res.status).toBe(200);
    expect(nep).toHaveBeenCalledTimes(1);
    const adres = opgehaaldAdres();
    expect(adres.origin).toBe(BASIS);
    expect(adres.pathname).toBe('/ergebnis.php');
    expect(adres.searchParams.get('kat')).toBe('2');
    expect(adres.searchParams.get('vol')).toBe('Requiem & Co');
    expect(res.body.searchUrl).toBe(adres.toString());
  });

  it.each([
    ['een intern adres', 'http://169.254.169.254/latest/meta-data/'],
    ['een pad omhoog', '../../../etc/passwd'],
    ['een tweede host achter een schuine streep', '/../admin.php?x=1'],
    ['een extra parameter', 'iets&kat=99&vol=anders'],
    ['een anker met daarachter van alles', 'iets#@169.254.169.254/'],
  ])('laat %s de host en het pad niet verzetten', async (_naam, zoekterm) => {
    siteGeeft('<html></html>');

    const res = await zoek(`?q=${encodeURIComponent(zoekterm)}`);

    expect(res.status).toBe(200);
    const adres = opgehaaldAdres();
    // De hele zoekterm belandt als waarde van vol, en nergens anders: host,
    // pad en kat blijven wat ze waren.
    expect(adres.origin).toBe(BASIS);
    expect(adres.pathname).toBe('/ergebnis.php');
    expect(adres.searchParams.get('kat')).toBe('2');
    expect(adres.searchParams.get('vol')).toBe(zoekterm);
  });

  it('leest de treffers uit de tabel en houdt elk artikelnummer een keer over', async () => {
    siteGeeft(`
      <table>
        <tr>
          <td><a href="detail.php?kat=2&artnr=1234">Requiem</a></td>
          <td>Mozart</td><td>De Haan</td><td>Molenaar</td>
        </tr>
        <tr>
          <td><a href="detail.php?kat=2&artnr=1234">Requiem (dubbel)</a></td>
          <td>Mozart</td><td>De Haan</td><td>Molenaar</td>
        </tr>
        <tr>
          <td><a href="detail.php?kat=2&artnr=5678">Mars</a></td>
          <td>Sousa</td><td></td><td>Hal Leonard</td>
        </tr>
        <tr><td><a href="detail.php?kat=2">Zonder nummer</a></td><td>x</td></tr>
      </table>`);

    const res = await zoek('?q=Requiem');

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('Requiem');
    expect(res.body.resultCount).toBe(2);
    expect(res.body.results[0]).toMatchObject({
      title: 'Requiem',
      composer: 'Mozart',
      arranger: 'De Haan',
      publisher: 'Molenaar',
      articleNumber: '1234',
      detailUrl: `${BASIS}/detail.php?kat=2&artnr=1234`,
    });
    expect(res.body.results[1].articleNumber).toBe('5678');
  });

  it('geeft hooguit vijftig treffers terug', async () => {
    const rijen = Array.from(
      { length: 60 },
      (_, i) => `<tr><td><a href="detail.php?artnr=${i}">Werk ${i}</a></td><td>Componist</td></tr>`,
    ).join('');
    siteGeeft(`<table>${rijen}</table>`);

    const res = await zoek('?q=werk');

    expect(res.body.resultCount).toBe(60);
    expect(res.body.results).toHaveLength(50);
  });

  it('levert gewoon een lege lijst als er niets bruikbaars terugkomt', async () => {
    // Geen html maar json, en daarna html zonder enige koppeling: allebei
    // moeten ze een leeg antwoord opleveren en geen fout.
    siteGeeft('{"melding":"niets te zien"}');
    const rommel = await zoek('?q=Requiem');
    expect(rommel.status).toBe(200);
    expect(rommel.body.results).toEqual([]);

    siteGeeft('<html><body><p>Geen resultaten</p></body></html>');
    const leeg = await zoek('?q=Requiem');
    expect(leeg.status).toBe(200);
    expect(leeg.body.resultCount).toBe(0);
  });

  it('maakt van een storing bij musicainfo geen 500 maar een 502', async () => {
    siteGeeft('<html>Internal Server Error</html>', 500);

    const res = await zoek('?q=Requiem');

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/MusicaInfo/i);
  });

  it('maakt van een onbereikbare site geen 500 maar een 502', async () => {
    nep.mockRejectedValue(new Error('getaddrinfo ENOTFOUND en.musicainfo.net'));

    const res = await zoek('?q=Requiem');

    expect(res.status).toBe(502);
  });

  it('geeft het verzoek een tijdslimiet mee, zodat een trage site ons niet ophoudt', async () => {
    // Zonder limiet blijft een verzoek aan een trage of hangende site staan en
    // houdt het aan onze kant een verbinding bezet.
    siteGeeft('<html></html>');

    await zoek('?q=Requiem');

    const opties = nep.mock.calls[0][1] as { signal?: AbortSignal };
    expect(opties.signal).toBeInstanceOf(AbortSignal);
  });

  it('maakt van een afgebroken traag verzoek een 502', async () => {
    nep.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));

    const res = await zoek('?q=Requiem');

    expect(res.status).toBe(502);
  });
});

describe('GET /api/musicainfo/detail', () => {
  it('weigert een aanvraag zonder token', async () => {
    const res = await request(app).get('/api/musicainfo/detail?artnr=1234');

    expect(res.status).toBe(401);
    expect(nep).not.toHaveBeenCalled();
  });

  it('eist een artikelnummer', async () => {
    const res = await detail('?artnr=%20');

    expect(res.status).toBe(400);
    expect(nep).not.toHaveBeenCalled();
  });

  it('geeft een 400 bij een artikelnummer dat twee keer meegestuurd wordt', async () => {
    const res = await detail('?artnr=1&artnr=2');

    expect(res.status).toBe(400);
    expect(nep).not.toHaveBeenCalled();
  });

  it('houdt ook een gek artikelnummer binnen de vaste basis en het vaste pad', async () => {
    siteGeeft('<html></html>');

    const res = await detail(`?artnr=${encodeURIComponent('../../admin?x=1#@169.254.169.254')}`);

    expect(res.status).toBe(200);
    const adres = opgehaaldAdres();
    expect(adres.origin).toBe(BASIS);
    expect(adres.pathname).toBe('/detail.php');
    expect(adres.searchParams.get('artnr')).toBe('../../admin?x=1#@169.254.169.254');
  });

  it('leest de gegevens uit een tabel met labels, ook in het Duits en Nederlands', async () => {
    siteGeeft(`
      <table>
        <tr><td>Title</td><td>Requiem</td></tr>
        <tr><td>Komponist</td><td>Mozart</td></tr>
        <tr><td>Bearbeiter</td><td>De Haan</td></tr>
        <tr><td>Speelduur</td><td>05:30</td></tr>
        <tr><td>Schwierigkeit</td><td>4</td></tr>
        <tr><td>Uitgever</td><td>Molenaar</td></tr>
        <tr><td>Besetzung</td><td>Harmonie</td></tr>
        <tr><td>Leeg</td><td></td></tr>
      </table>`);

    const res = await detail('?artnr=1234');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      title: 'Requiem',
      composer: 'Mozart',
      arranger: 'De Haan',
      publisher: 'Molenaar',
      duration: '05:30',
      durationSeconds: 330,
      difficulty: '4',
      instrumentation: 'Harmonie',
      articleNumber: '1234',
    });
  });

  it('leest ook een definitielijst', async () => {
    siteGeeft(`
      <h1>Requiem</h1>
      <dl>
        <dt>Duration</dt><dd>4:05</dd>
        <dt>Grade</dt><dd>3</dd>
        <dt>Composer</dt><dd>Mozart</dd>
        <dt>Arrangeur</dt><dd>De Haan</dd>
      </dl>`);

    const res = await detail('?artnr=1234');

    expect(res.body).toMatchObject({
      title: 'Requiem',
      composer: 'Mozart',
      arranger: 'De Haan',
      duration: '4:05',
      durationSeconds: 245,
      difficulty: '3',
    });
  });

  it('valt terug op de tekst van de pagina als er geen labels staan', async () => {
    siteGeeft(`<html><title>MusicaInfo.net/details/Requiem (1234)</title>
      <body>Duration: 05:30 Difficulty: Grade 4</body></html>`);

    const res = await detail('?artnr=1234');

    expect(res.body).toMatchObject({
      title: 'Requiem',
      duration: '05:30',
      durationSeconds: 330,
    });
    expect(res.body.difficulty).toContain('Grade 4');
  });

  it('valt niet om op iets dat helemaal geen html is', async () => {
    siteGeeft('%PDF-1.4 zomaar wat bytes');

    const res = await detail('?artnr=1234');

    expect(res.status).toBe(200);
    expect(res.body.articleNumber).toBe('1234');
    expect(res.body.composer).toBe('');
    expect(res.body.durationSeconds).toBe(0);
  });

  it('maakt van een storing bij musicainfo geen 500 maar een 502', async () => {
    siteGeeft('<html>Service Unavailable</html>', 503);

    const res = await detail('?artnr=1234');

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/MusicaInfo/i);
  });

  it('maakt van een onbereikbare site geen 500 maar een 502', async () => {
    nep.mockRejectedValue(new Error('socket hang up'));

    const res = await detail('?artnr=1234');

    expect(res.status).toBe(502);
  });
});
