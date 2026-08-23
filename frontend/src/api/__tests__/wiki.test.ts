/**
 * Tests voor de wiki-api.
 *
 * De wiki is de enige plek in deze applicatie waar een pagina niet op een id
 * maar op een slug wordt opgehaald, en waar diezelfde slug ook in de paden van
 * de versies en de bijlagen zit. Dat maakt de padopbouw hier het gevoeligste
 * onderdeel: een pagina, zijn versiegeschiedenis en zijn bijlagen hangen alle
 * drie aan dezelfde tekst, en een spelfout in een van die paden geeft geen
 * typefout maar een 404 op een pagina die gewoon bestaat.
 *
 * Twee dingen die hier echt fout kunnen gaan, staan hieronder vastgelegd:
 *
 * De zichtbaarheid. Elke pagina heeft een `visibility`, en de server bepaalt
 * per rol wat er teruggegeven wordt. Er is in deze router ooit een lek geweest:
 * de versies en de bijlagen haalden de pagina alleen op zijn slug op, zonder
 * de zichtbaarheid mee te wegen, waardoor een lid de inhoud van een
 * admin-pagina kon lezen via /wiki/<slug>/versions/<id>. De api-laag mag dus
 * nooit zelf een pagina samenstellen uit losse antwoorden - hij hoort door te
 * geven wat de server na zijn eigen controle overhoudt.
 *
 * Het herstellen van een versie. Dat is een POST naar
 * /wiki/<slug>/versions/<id>/restore. Wie dat als PUT of als PATCH op de
 * pagina zelf schrijft, overschrijft de pagina met de body in plaats van met
 * de oude versie - en de versiegeschiedenis raakt dan een stap kwijt.
 *
 * De paden zijn vergeleken met backend/src/routes/wiki.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getWikiPages,
  searchWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiPageVersions,
  getWikiPageVersion,
  restoreWikiPageVersion,
  getWikiAttachments,
  uploadWikiAttachment,
  deleteWikiAttachment,
} from '../wiki';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('paginaboom', () => {
  it('haalt de boom op met de kinderen erin genest', async () => {
    antwoordMet([
      {
        id: 'p1',
        slug: 'huishoudelijk-reglement',
        title: 'Huishoudelijk reglement',
        visibility: 'members',
        isPinned: true,
        isPublished: true,
        sortOrder: 0,
        viewCount: 51,
        updatedAt: '2026-07-01',
        children: [
          {
            id: 'p2',
            slug: 'contributie',
            title: 'Contributie',
            visibility: 'members',
            isPinned: false,
            isPublished: true,
            sortOrder: 0,
            viewCount: 12,
            updatedAt: '2026-07-01',
            children: [],
          },
        ],
      },
    ]);

    const paginas = await getWikiPages();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/wiki');
    // De boom wordt aan de serverkant opgebouwd. Zou de api-laag hem zelf uit
    // parentId in elkaar zetten, dan verdwijnen kinderen waarvan de ouder om
    // zichtbaarheidsredenen weggefilterd is - of erger, ze komen als losse
    // hoofdpagina's bovendrijven.
    expect(paginas[0].children[0].slug).toBe('contributie');
  });

  it('geeft door wat de server na zijn zichtbaarheidsfilter overhoudt', async () => {
    antwoordMet([]);

    await expect(getWikiPages()).resolves.toEqual([]);
  });
});

describe('zoeken', () => {
  it('stuurt de zoekterm onder de naam q', async () => {
    antwoordMet([]);

    await searchWikiPages('contributie');

    expect(laatsteVerzoek().pad).toBe('/wiki/search');
    // Elke andere naam levert een lege lijst op zonder fout: de server ziet
    // dan nul tekens en antwoordt bewust met [].
    expect(laatsteVerzoek().query.get('q')).toBe('contributie');
  });

  it('codeert een zoekterm met spaties en leestekens heel', async () => {
    antwoordMet([]);

    await searchWikiPages('rooster & vervanging');

    expect(laatsteVerzoek().queryreeks).toContain('q=rooster+%26+vervanging');
    expect(laatsteVerzoek().query.get('q')).toBe('rooster & vervanging');
  });

  it('geeft het fragment per treffer door', async () => {
    antwoordMet([
      {
        id: 'p2',
        slug: 'contributie',
        title: 'Contributie',
        excerpt: 'De contributie bedraagt',
        updatedAt: '2026-07-01',
      },
    ]);

    const treffers = await searchWikiPages('contributie');

    // `excerpt` is de eerste tweehonderd tekens van de inhoud, aan de
    // serverkant afgekapt. Het is het enige stuk inhoud dat de zoeklijst
    // krijgt; valt het weg, dan is elke treffer een kale titel.
    expect(treffers[0].excerpt).toBe('De contributie bedraagt');
  });
});

describe('één pagina', () => {
  it('haalt een pagina op zijn slug op, niet op zijn id', async () => {
    antwoordMet({
      id: 'p2',
      slug: 'contributie',
      title: 'Contributie',
      content: '# Contributie',
      breadcrumbs: [{ slug: 'huishoudelijk-reglement', title: 'Huishoudelijk reglement' }],
      children: [],
    });

    const pagina = await getWikiPage('contributie');

    expect(laatsteVerzoek().pad).toBe('/wiki/contributie');
    // De kruimelpaden komen van de server, die de ouderketen aflopt. Ze zijn
    // niet af te leiden uit deze pagina alleen.
    expect(pagina.breadcrumbs[0].title).toBe('Huishoudelijk reglement');
  });

  it('laat een 403 door als de pagina niet voor deze rol zichtbaar is', async () => {
    // Weggeslikt worden zou hier het ergst zijn: dan leek de pagina leeg in
    // plaats van afgeschermd, en niemand wist dat er iets stond.
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getWikiPage('bestuursnotulen')).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('maakt een pagina aan met slug en inhoud in de body', async () => {
    antwoordMet({ id: 'p9', slug: 'busreis', message: 'Page created' }, { status: 201 });

    const antwoord = await createWikiPage({
      title: 'Busreis',
      slug: 'busreis',
      content: 'Vertrek om 8 uur.',
      visibility: 'members',
    });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/wiki');
    expect(laatsteVerzoek().body).toEqual({
      title: 'Busreis',
      slug: 'busreis',
      content: 'Vertrek om 8 uur.',
      visibility: 'members',
    });
    expect(antwoord.slug).toBe('busreis');
  });

  it('laat een 409 door als de slug al bestaat', async () => {
    antwoordMetFout(409, { error: 'A page with this slug already exists' });

    await expect(createWikiPage({ title: 'Busreis', slug: 'busreis', content: '' })).rejects.toMatchObject({
      response: { status: 409 },
    });
  });

  it('wijzigt met PATCH en kan een pagina uit de boom losmaken met parentId null', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateWikiPage('contributie', { parentId: null, changeSummary: 'Losgemaakt van het reglement.' });

    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/wiki/contributie');
    // `null` is hier een waarde met betekenis: hij maakt de pagina los. Zou
    // hij als ontbrekend veld verstuurd worden, dan bleef de ouder staan en
    // gebeurde er niets - zonder foutmelding.
    expect(laatsteVerzoek().body).toEqual({
      parentId: null,
      changeSummary: 'Losgemaakt van het reglement.',
    });
  });

  it('verwijdert een pagina op zijn slug', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deleteWikiPage('busreis');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/wiki/busreis');
  });
});

describe('versies', () => {
  it('haalt de versielijst op onder de pagina', async () => {
    antwoordMet([
      {
        id: 'ver-2',
        versionNumber: 2,
        title: 'Contributie',
        changeSummary: 'Bedrag bijgewerkt',
        createdBy: 'g1',
        createdAt: 'x',
      },
    ]);

    const versies = await getWikiPageVersions('contributie');

    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/versions');
    expect(versies[0].versionNumber).toBe(2);
  });

  it('haalt één versie op met zijn inhoud', async () => {
    antwoordMet({
      id: 'ver-1',
      versionNumber: 1,
      title: 'Contributie',
      content: 'Oude tekst',
      createdBy: 'g1',
      createdAt: 'x',
    });

    const versie = await getWikiPageVersion('contributie', 'ver-1');

    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/versions/ver-1');
    // Alleen de losse versie heeft `content`; de lijst niet. Dat verschil is
    // waarom er twee functies zijn.
    expect(versie.content).toBe('Oude tekst');
  });

  it('herstelt een versie met POST op .../restore, zonder body', async () => {
    antwoordMet({ message: 'Version restored' });

    await restoreWikiPageVersion('contributie', 'ver-1');

    // Als dit als PATCH op de pagina geschreven zou worden, kwam er een lege
    // wijziging binnen in plaats van een herstel: de oude tekst blijft weg en
    // de geschiedenis krijgt er een lege stap bij.
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/versions/ver-1/restore');
    expect(laatsteVerzoek().body).toBeUndefined();
  });
});

describe('bijlagen', () => {
  it('haalt de bijlagen op met een adres dat het scherm direct kan gebruiken', async () => {
    antwoordMet([
      {
        id: 'b1',
        filename: 'a1b2c3.pdf',
        originalFilename: 'Huishoudelijk reglement.pdf',
        mimeType: 'application/pdf',
        fileSize: 51234,
        url: '/uploads/wiki/a1b2c3.pdf',
        uploadedBy: 'g1',
        uploadedAt: 'x',
      },
    ]);

    const bijlagen = await getWikiAttachments('contributie');

    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/attachments');
    // Er zijn twee namen: de naam op schijf en de naam die de gebruiker gaf.
    // Wie ze verwisselt, laat de lezer een bestand zien dat "a1b2c3.pdf" heet.
    expect(bijlagen[0].filename).toBe('a1b2c3.pdf');
    expect(bijlagen[0].originalFilename).toBe('Huishoudelijk reglement.pdf');
    expect(bijlagen[0].url).toBe('/uploads/wiki/a1b2c3.pdf');
  });

  it('verstuurt een bijlage als formulier onder de veldnaam file', async () => {
    antwoordMet({ id: 'b9', url: '/uploads/wiki/x.pdf', message: 'Attachment uploaded' }, { status: 201 });

    const bestand = new File(['inhoud'], 'notulen.pdf', { type: 'application/pdf' });
    await uploadWikiAttachment('contributie', bestand);

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/attachments');
    // De server leest het met upload.single('file'). Een andere veldnaam geeft
    // "No file uploaded" op een verzoek waar het bestand gewoon in zit.
    const body = laatsteVerzoek().body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('notulen.pdf');
  });

  it('verwijdert een bijlage via de pagina waar hij aan hangt', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deleteWikiAttachment('contributie', 'b1');

    // De server controleert eerst of de bijlage bij deze pagina hoort. Een pad
    // zonder de slug zou geen route raken.
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/wiki/contributie/attachments/b1');
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('wiki.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getWikiPages', () => getWikiPages()],
    ['searchWikiPages', () => searchWikiPages('x')],
    ['getWikiPage', () => getWikiPage('contributie')],
    ['createWikiPage', () => createWikiPage({ title: 'X', slug: 'x', content: '' })],
    ['updateWikiPage', () => updateWikiPage('contributie', {})],
    ['deleteWikiPage', () => deleteWikiPage('contributie')],
    ['getWikiPageVersions', () => getWikiPageVersions('contributie')],
    ['getWikiPageVersion', () => getWikiPageVersion('contributie', 'ver-1')],
    ['restoreWikiPageVersion', () => restoreWikiPageVersion('contributie', 'ver-1')],
    ['getWikiAttachments', () => getWikiAttachments('contributie')],
    [
      'uploadWikiAttachment',
      () => uploadWikiAttachment('contributie', new File(['x'], 'x.pdf', { type: 'application/pdf' })),
    ],
    ['deleteWikiAttachment', () => deleteWikiAttachment('contributie', 'b1')],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/wiki.ts', async (_naam, aanroep) => {
    antwoordMet([]);
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/wiki', methode, pad)).toBe(true);
  });

  it('let op de valstrik dat /wiki/search niet als /wiki/:slug gelezen wordt', () => {
    // In Express wint de eerst geregistreerde route. Zou /:slug boven /search
    // komen te staan, dan ging zoeken op zoek naar een pagina met de slug
    // "search" en gaf het altijd 404 - terwijl de zoekbalk er verder normaal
    // uitziet.
    const opGet = routes.filter((r) => r.methode === 'get').map((r) => r.patroon);

    expect(opGet.indexOf('/search')).toBeLessThan(opGet.indexOf('/:slug'));
  });
});
