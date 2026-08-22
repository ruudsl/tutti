/**
 * Tests voor het delen van muziek tussen verenigingen.
 *
 * De routes hangen onder /api/music-sharing en zijn vergeleken met
 * backend/src/routes/music-sharing.ts. De veldnamen zijn hier deels Nederlands
 * (`dagen`, `note`) - dat is aan beide kanten zo bedoeld, dus die namen worden
 * hier vastgelegd zodat een "opschoning" aan een van beide kanten opvalt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  maakKoppelcode,
  wisselKoppelcodeIn,
  haalPartners,
  beeindigKoppeling,
  haalTitelDeling,
  zetTitelDeling,
  sluitPartijUit,
  deelPartijWeer,
  haalCatalogus,
  haalCatalogusTitel,
  vraagPartijAan,
  haalBinnengekomenVerzoeken,
  haalEigenVerzoeken,
  keurVerzoekGoed,
  wijsVerzoekAf,
  trekVerzoekIn,
  haalVrijgegevenBestandOp,
  haalOproepen,
  plaatsOproep,
  werkOproepBij,
  verwijderOproep,
  haalAntwoorden,
  antwoordOpOproep,
  haalOverzicht,
} from '../music-sharing';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

// ===========================================
// KOPPELEN
// ===========================================

describe('koppelen', () => {
  it('maakt een koppelcode aan zonder body', async () => {
    antwoordMet({ code: 'ABC12345', expiresAt: '2026-08-22T10:00:00Z', geldigUren: 24 });

    const koppelcode = await maakKoppelcode();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/link-code');
    expect(verzoek.body).toBeUndefined();
    expect(koppelcode.geldigUren).toBe(24);
  });

  it('wisselt een koppelcode in en stuurt hem in de body', async () => {
    antwoordMet({ partnerId: 'v2', partnerNaam: 'Fanfare Concordia' });

    const resultaat = await wisselKoppelcodeIn('ABC12345');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-sharing/link-code/redeem');
    expect(verzoek.body).toEqual({ code: 'ABC12345' });
    // partnerNaam is Nederlands aan beide kanten; het antwoord komt zo binnen.
    expect(resultaat.partnerNaam).toBe('Fanfare Concordia');
  });

  it('laat een onbekende of verlopen code als 400 met melding doorkomen', async () => {
    antwoordMetFout(400, { error: 'Deze koppelcode is verlopen. Vraag de andere vereniging om een nieuwe.' });

    await expect(wisselKoppelcodeIn('OUD')).rejects.toMatchObject({
      response: {
        status: 400,
        data: { error: 'Deze koppelcode is verlopen. Vraag de andere vereniging om een nieuwe.' },
      },
    });
  });

  it('haalt de gekoppelde verenigingen op', async () => {
    antwoordMet([{ id: 'v2', name: 'Fanfare', displayName: null }]);
    const partners = await haalPartners();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/music-sharing/partners');
    expect(partners).toHaveLength(1);
  });

  it('geeft een lege partnerlijst door als er nog niemand gekoppeld is', async () => {
    antwoordMet([]);

    await expect(haalPartners()).resolves.toEqual([]);
  });

  it('beeindigt een koppeling', async () => {
    antwoordMet({ message: 'Koppeling beeindigd.' });
    const resultaat = await beeindigKoppeling('v2');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-sharing/partners/v2');
    expect(resultaat).toBeUndefined();
  });
});

// ===========================================
// DELEN PER TITEL
// ===========================================

describe('delen per titel', () => {
  it('haalt op met wie een titel gedeeld wordt', async () => {
    antwoordMet({ titleId: 't1', title: 'Ammerland', sharedWith: [], parts: [] });
    const deling = await haalTitelDeling('t1');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/titles/t1');
    expect(deling.title).toBe('Ammerland');
  });

  it('zet de deling met PUT en stuurt de partners als lijst', async () => {
    antwoordMet({ message: 'Delen bijgewerkt.', sharedWith: 2 });

    await zetTitelDeling('t1', ['v2', 'v3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-sharing/titles/t1/shares');
    expect(verzoek.body).toEqual({ partnerIds: ['v2', 'v3'] });
  });

  it('stuurt een lege lijst mee om alle delingen op te heffen', async () => {
    antwoordMet({ message: 'Delen bijgewerkt.', sharedWith: 0 });
    await zetTitelDeling('t1', []);

    // Een lege lijst is het signaal "met niemand meer"; het veld weglaten zou
    // de backend op een validatiefout laten stuklopen.
    expect(laatsteVerzoek().body).toEqual({ partnerIds: [] });
  });

  it('sluit een partij uit met een reden', async () => {
    antwoordMet({ message: 'Partij wordt niet gedeeld.' }, { status: 201 });

    await sluitPartijUit('p1', 'Handgeschreven aantekeningen');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/pieces/p1/exclude');
    expect(verzoek.body).toEqual({ reason: 'Handgeschreven aantekeningen' });
  });

  it('sluit een partij ook uit zonder reden', async () => {
    antwoordMet({ message: 'Partij wordt niet gedeeld.' }, { status: 201 });
    await sluitPartijUit('p1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('deelt een partij weer door de uitsluiting te verwijderen', async () => {
    antwoordMet({ message: 'Partij wordt weer gedeeld.' });
    await deelPartijWeer('p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-sharing/pieces/p1/exclude');
  });
});

// ===========================================
// CATALOGUS
// ===========================================

describe('haalCatalogus', () => {
  it('stuurt de zoekterm als q mee', async () => {
    antwoordMet([]);
    await haalCatalogus('mars');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/catalog');
    expect(laatsteVerzoek().query.get('q')).toBe('mars');
  });

  it('stuurt geen queryreeks als er niet gezocht wordt', async () => {
    antwoordMet([]);
    await haalCatalogus();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('laat een lege zoekterm weg in plaats van q= te sturen', async () => {
    antwoordMet([]);
    await haalCatalogus('');

    // De backend trimt en negeert een lege q, maar zo blijft het adres schoon
    // en blijft de respons uit de cache herbruikbaar.
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('codeert een zoekterm met ampersand, spatie en procentteken', async () => {
    antwoordMet([]);
    await haalCatalogus('Bach & Zn 100% mars');

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('100%25');
    expect(query.get('q')).toBe('Bach & Zn 100% mars');
    expect([...query.keys()]).toEqual(['q']);
  });

  it('codeert een zoekterm met een plusteken zodat hij niet als spatie aankomt', async () => {
    antwoordMet([]);
    await haalCatalogus('a+b');

    expect(laatsteVerzoek().query.get('q')).toBe('a+b');
  });

  it('geeft een lege catalogus terug als er niets gedeeld is', async () => {
    antwoordMet([]);

    await expect(haalCatalogus()).resolves.toEqual([]);
  });

  it('haalt een titel uit de catalogus op inclusief de partijen', async () => {
    antwoordMet({
      id: 't1',
      title: 'Ammerland',
      composer: 'Jacob de Haan',
      arranger: null,
      durationSeconds: 300,
      grade: '3',
      youtubeUrl: null,
      associationName: 'Fanfare',
      parts: [{ id: 'p1', instrumentName: 'Trompet 1', tuning: 'Bb', groupNumber: '1', request: null }],
    });

    const titel = await haalCatalogusTitel('t1');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/catalog/t1');
    expect(titel.parts[0].instrumentName).toBe('Trompet 1');
  });

  it('laat een 404 door voor een titel die niet met ons gedeeld is', async () => {
    antwoordMetFout(404, { error: 'Titel niet gevonden.' });

    await expect(haalCatalogusTitel('t9')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// VERZOEKEN
// ===========================================

describe('verzoeken', () => {
  it('vraagt een partij aan met pieceId en bericht', async () => {
    antwoordMet({ id: 'r1' }, { status: 201 });

    await vraagPartijAan('p1', 'We spelen het op 5 mei');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/requests');
    expect(verzoek.body).toEqual({ pieceId: 'p1', message: 'We spelen het op 5 mei' });
  });

  it('vraagt een partij ook aan zonder bericht', async () => {
    antwoordMet({ id: 'r1' }, { status: 201 });
    await vraagPartijAan('p1');

    expect(laatsteVerzoek().body).toEqual({ pieceId: 'p1' });
  });

  it('laat een 409 door als er al een verzoek loopt', async () => {
    antwoordMetFout(409, { error: 'Er loopt al een verzoek voor deze partij.' });

    await expect(vraagPartijAan('p1')).rejects.toMatchObject({ response: { status: 409 } });
  });

  it('haalt binnengekomen en eigen verzoeken van verschillende routes', async () => {
    antwoordMet([]);
    await haalBinnengekomenVerzoeken();
    expect(laatsteVerzoek().pad).toBe('/music-sharing/requests/incoming');

    antwoordMet([]);
    await haalEigenVerzoeken();
    expect(laatsteVerzoek().pad).toBe('/music-sharing/requests/outgoing');

    expect(alleVerzoeken()).toHaveLength(2);
  });

  it('keurt een verzoek goed met notitie en aantal dagen', async () => {
    antwoordMet({ message: 'Partij vrijgegeven.', accessExpiresAt: '2026-09-20T00:00:00Z' });

    await keurVerzoekGoed('r1', { note: 'Alleen voor dit concert', dagen: 30 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/requests/r1/approve');
    // De backend leest letterlijk `note` en `dagen`.
    expect(verzoek.body).toEqual({ note: 'Alleen voor dit concert', dagen: 30 });
  });

  it('keurt een verzoek ook goed zonder opties, zodat de standaardtermijn geldt', async () => {
    antwoordMet({ message: 'Partij vrijgegeven.', accessExpiresAt: '2026-09-20T00:00:00Z' });
    await keurVerzoekGoed('r1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('wijst een verzoek af met een notitie', async () => {
    antwoordMet({ message: 'Verzoek afgewezen.' });
    await wijsVerzoekAf('r1', 'Uitgeleend aan een ander');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/requests/r1/reject');
    expect(laatsteVerzoek().body).toEqual({ note: 'Uitgeleend aan een ander' });
  });

  it('wijst een verzoek ook af zonder notitie', async () => {
    antwoordMet({ message: 'Verzoek afgewezen.' });
    await wijsVerzoekAf('r1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('trekt een eigen verzoek in', async () => {
    antwoordMet({ message: 'Verzoek ingetrokken.' });
    await trekVerzoekIn('r1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-sharing/requests/r1');
  });
});

// ===========================================
// DOWNLOAD VAN EEN VRIJGEGEVEN PARTIJ
// ===========================================

/** Vangt de aangemaakte downloadlink op; jsdom kent createObjectURL niet. */
function vangDownloadOp() {
  const anker = document.createElement('a');
  const klik = vi.spyOn(anker, 'click').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue(anker);
  const maakUrl = vi.fn(() => 'blob:nep');
  const geefVrij = vi.fn();
  Object.defineProperty(window.URL, 'createObjectURL', { value: maakUrl, configurable: true, writable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: geefVrij, configurable: true, writable: true });
  return { anker, klik, maakUrl, geefVrij };
}

describe('haalVrijgegevenBestandOp', () => {
  it('haalt het bestand als blob op en gebruikt de naam uit de kopregel', async () => {
    const { anker, klik, geefVrij } = vangDownloadOp();
    antwoordMet('PDF-inhoud', {
      headers: { 'content-disposition': 'attachment; filename="Trompet 1.pdf"' },
    });

    await haalVrijgegevenBestandOp('r1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/music-sharing/requests/r1/download');
    expect(verzoek.responseType).toBe('blob');
    expect(anker.getAttribute('download')).toBe('Trompet 1.pdf');
    expect(klik).toHaveBeenCalledTimes(1);
    expect(geefVrij).toHaveBeenCalledWith('blob:nep');
  });

  it('leest ook een bestandsnaam zonder aanhalingstekens', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('PDF-inhoud', { headers: { 'content-disposition': 'attachment; filename=partij-3.pdf' } });

    await haalVrijgegevenBestandOp('r1');

    expect(anker.getAttribute('download')).toBe('partij-3.pdf');
  });

  it('valt terug op partij.pdf als de kopregel geen bestandsnaam bevat', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('PDF-inhoud', { headers: { 'content-disposition': 'attachment' } });

    await haalVrijgegevenBestandOp('r1');

    expect(anker.getAttribute('download')).toBe('partij.pdf');
  });

  it('valt terug op partij.pdf als er geen kopregel is', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('PDF-inhoud');

    await haalVrijgegevenBestandOp('r1');

    expect(anker.getAttribute('download')).toBe('partij.pdf');
  });

  it('haalt de link weer uit de pagina zodat er niets blijft hangen', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('PDF-inhoud');

    await haalVrijgegevenBestandOp('r1');

    expect(document.body.contains(anker)).toBe(false);
  });

  it('zet geen download klaar als de toegang inmiddels verlopen is', async () => {
    const { klik } = vangDownloadOp();
    antwoordMetFout(403, { error: 'Toegang verlopen.' });

    await expect(haalVrijgegevenBestandOp('r1')).rejects.toMatchObject({ response: { status: 403 } });
    expect(klik).not.toHaveBeenCalled();
  });
});

// ===========================================
// OPROEPEN
// ===========================================

describe('oproepen', () => {
  it('haalt de oproepen op met een statusfilter', async () => {
    antwoordMet([]);
    await haalOproepen('open');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/wanted');
    expect(laatsteVerzoek().query.get('status')).toBe('open');
  });

  it('haalt alle oproepen op zonder filter', async () => {
    antwoordMet([]);
    await haalOproepen();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('plaatst een oproep met de velden uit oproepSchema', async () => {
    antwoordMet({ id: 'o1' }, { status: 201 });

    await plaatsOproep({
      title: 'Concerto d Amore',
      composer: 'Jacob de Haan',
      arranger: 'onbekend',
      description: 'Wie heeft dit op de plank?',
      referenceUrl: 'https://example.com/stuk',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/wanted');
    expect(verzoek.body).toEqual({
      title: 'Concerto d Amore',
      composer: 'Jacob de Haan',
      arranger: 'onbekend',
      description: 'Wie heeft dit op de plank?',
      referenceUrl: 'https://example.com/stuk',
    });
  });

  it('laat een 400 door als de verwijzing geen geldig adres is', async () => {
    antwoordMetFout(400, { error: 'Alleen http- en https-adressen' });

    await expect(plaatsOproep({ title: 'X', referenceUrl: 'ftp://example.com' })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it('werkt een oproep bij met PATCH', async () => {
    antwoordMet({ message: 'Oproep bijgewerkt.' });

    await werkOproepBij('o1', { status: 'resolved', description: 'Gevonden bij de fanfare' });

    const verzoek = laatsteVerzoek();
    // PATCH en niet PUT: de backend heeft alleen een patch-route voor /wanted/:id.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/music-sharing/wanted/o1');
    expect(verzoek.body).toEqual({ status: 'resolved', description: 'Gevonden bij de fanfare' });
  });

  it('verwijdert een oproep', async () => {
    antwoordMet({ message: 'Oproep verwijderd.' });
    await verwijderOproep('o1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-sharing/wanted/o1');
  });

  it('haalt de antwoorden bij een oproep op', async () => {
    antwoordMet([{ id: 'a1', body: 'Wij hebben het', musicTitleId: 't1' }]);
    const antwoorden = await haalAntwoorden('o1');

    expect(laatsteVerzoek().pad).toBe('/music-sharing/wanted/o1/replies');
    expect(antwoorden[0].musicTitleId).toBe('t1');
  });

  it('plaatst een antwoord met verwijzing naar een eigen titel', async () => {
    antwoordMet({ id: 'a1' }, { status: 201 });

    await antwoordOpOproep('o1', 'Wij hebben het liggen', 't1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-sharing/wanted/o1/replies');
    expect(verzoek.body).toEqual({ body: 'Wij hebben het liggen', musicTitleId: 't1' });
  });

  it('plaatst een antwoord zonder titelverwijzing', async () => {
    antwoordMet({ id: 'a1' }, { status: 201 });
    await antwoordOpOproep('o1', 'Wij hebben het liggen');

    expect(laatsteVerzoek().body).toEqual({ body: 'Wij hebben het liggen' });
  });

  it('laat een 400 door als de aangewezen titel niet van de eigen vereniging is', async () => {
    antwoordMetFout(400, { error: 'Dat stuk staat niet in jullie eigen bibliotheek.' });

    await expect(antwoordOpOproep('o1', 'tekst', 't9')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Dat stuk staat niet in jullie eigen bibliotheek.' } },
    });
  });
});

// ===========================================
// OVERZICHT
// ===========================================

describe('haalOverzicht', () => {
  it('bevraagt /music-sharing/overview', async () => {
    const antwoord = {
      partners: [{ partnerId: 'v2', partnerName: 'Fanfare', titles: [] }],
      excludedParts: [{ id: 'p1', originalFilename: 'trompet.pdf', title: 'Mars', instrumentName: null, reason: null }],
    };
    antwoordMet(antwoord);

    const overzicht = await haalOverzicht();

    expect(laatsteVerzoek().pad).toBe('/music-sharing/overview');
    expect(overzicht).toEqual(antwoord);
  });

  it('geeft een overzicht zonder partners ongewijzigd door', async () => {
    antwoordMet({ partners: [], excludedParts: [] });

    await expect(haalOverzicht()).resolves.toEqual({ partners: [], excludedParts: [] });
  });

  it('laat een netwerkfout door in plaats van een leeg overzicht', async () => {
    antwoordMetNetwerkfout();

    await expect(haalOverzicht()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('laat een 401 door', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(haalOverzicht()).rejects.toMatchObject({ response: { status: 401 } });
  });
});
