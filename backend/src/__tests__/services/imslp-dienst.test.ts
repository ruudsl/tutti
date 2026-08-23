/**
 * De koppeling met IMSLP: zoeken, werkdetails ophalen en een pdf binnenhalen.
 *
 * IMSLP is een dienst van buiten. Er wordt hier geen enkel echt verzoek
 * gedaan: fetch is vervangen, en elke test bepaalt zelf wat de dienst
 * antwoordt. Wat hier toe doet is niet de gelukkige route maar wat er gebeurt
 * als IMSLP 404, 429 of 500 geeft, niets teruggeeft, of iets teruggeeft dat
 * niet op het verwachte antwoord lijkt - dat is precies wanneer een koppeling
 * met een vreemde dienst omvalt.
 *
 * ssrf-bescherming.test.ts dekt de adrescontrole en de doorverwijzingen van
 * downloadPdf af; hier staat alleen wat daar niet aan bod komt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import { searchImslp, getWorkDetails, downloadPdf, findWork } from '../../services/imslp';

/** Wat de nagebootste dienst per aanroep terugkreeg. */
let opgevraagd: string[] = [];

/**
 * De dienst heeft een eigen snelheidsbegrenzer die een seconde wacht tussen
 * twee verzoeken. Die klok wordt hier vooruitgezet, anders duurt elke test met
 * twee verzoeken een seconde langer zonder dat er iets extra's mee bewezen
 * wordt.
 *
 * De teller staat buiten de tests, en niet erbinnen. De begrenzer bewaart de
 * tijd van het vorige verzoek in de module zelf, en die blijft tussen tests
 * staan: een klok die per test opnieuw bij nul begint loopt achter op wat de
 * begrenzer onthouden heeft, en dan gaat hij juist wél wachten - elke test een
 * minuut langer dan de vorige.
 */
let nepTijd = 1_000_000_000_000;

function zetKlokVooruit(): void {
  vi.spyOn(Date, 'now').mockImplementation(() => (nepTijd += 60_000));
}

function stelDienstIn(afhandelaar: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      opgevraagd.push(url);
      return afhandelaar(url);
    }),
  );
}

const jsonAntwoord = (inhoud: unknown) => ({ ok: true, status: 200, json: async () => inhoud });
const statusAntwoord = (status: number) => ({ ok: false, status, json: async () => ({}) });

/** Antwoordt op het zoekadres (ISCR) en op het uitwijkadres (opensearch). */
function stelZoekdienstIn(opties: { iscr?: unknown | number; opensearch?: unknown | number }): void {
  stelDienstIn((url) => {
    const antwoord = url.includes('API.ISCR.php') ? opties.iscr : opties.opensearch;
    if (antwoord === undefined) return statusAntwoord(404);
    if (typeof antwoord === 'number') return statusAntwoord(antwoord);
    return jsonAntwoord(antwoord);
  });
}

const iscrUrls = () => opgevraagd.filter((u) => u.includes('API.ISCR.php'));
const opensearchUrls = () => opgevraagd.filter((u) => u.includes('action=opensearch'));

beforeEach(() => {
  opgevraagd = [];
  zetKlokVooruit();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Zoeken bij IMSLP', () => {
  it('geeft een leeg resultaat terug bij een leeg antwoord', async () => {
    stelZoekdienstIn({ iscr: {} });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works).toEqual([]);
    expect(resultaat.totalCount).toBe(0);
    expect(resultaat.searchUrl).toContain('mars');
    // Een leeg antwoord is een geldig antwoord: er hoeft niet uitgeweken te
    // worden naar het tweede adres.
    expect(opensearchUrls()).toHaveLength(0);
  });

  it('zet een gevonden werk om naar titel, componist en jaartal', async () => {
    stelZoekdienstIn({
      iscr: {
        metadata: { count: 1 },
        0: {
          id: 'Symphony No.5',
          permlink: 'https://imslp.org/wiki/Symphony_No.5_(Beethoven,_Ludwig_van)',
          type: 'Symphony',
          instrumentation: 'orkest',
          date: '1808',
        },
      },
    });

    const resultaat = await searchImslp('Symphony');

    expect(resultaat.works).toHaveLength(1);
    expect(resultaat.works[0]).toMatchObject({
      id: 'Symphony_No.5',
      title: 'Symphony No.5',
      composer: 'Beethoven, Ludwig van',
      workCategory: 'Symphony',
      instrumentation: 'orkest',
      year: '1808',
      permalink: 'https://imslp.org/wiki/Symphony_No.5_(Beethoven,_Ludwig_van)',
    });
    // type=2 is de zoekopdracht op werktitel.
    expect(iscrUrls()[0]).toContain('type=2');
  });

  it('houdt alleen de werken over die op de zoekterm lijken', async () => {
    stelZoekdienstIn({
      iscr: {
        0: { id: 'Marche militaire', permlink: '/wiki/Marche_militaire_(Schubert,_Franz)' },
        1: { id: 'Nocturne', permlink: '/wiki/Nocturne_(Chopin,_Frederic)' },
      },
    });

    const resultaat = await searchImslp('marche');

    expect(resultaat.works.map((w) => w.title)).toEqual(['Marche militaire']);
    // Een permlink zonder protocol wordt aangevuld tot een volledig adres.
    expect(resultaat.works[0].permalink).toBe('https://imslp.org/wiki/Marche_militaire_(Schubert,_Franz)');
  });

  it('leest de toonsoort uit de titel', async () => {
    stelZoekdienstIn({
      iscr: { 0: { id: 'Sonata', permlink: '/wiki/Sonata_in_C_major_(Mozart,_Wolfgang_Amadeus)' } },
    });

    const resultaat = await searchImslp('sonata');

    expect(resultaat.works[0].key).toBe('C major');
  });

  it('stapt over rommel in het antwoord heen', async () => {
    // De dienst is van iemand anders: er kan van alles in staan waar de code
    // geen rekening mee houdt. Struikelen mag daar niet op.
    stelZoekdienstIn({
      iscr: {
        metadata: { count: 4 },
        0: null,
        1: 'zomaar tekst',
        2: { geen: 'id' },
        3: { id: 'Zonder permlink' },
        4: { id: 'Mars', permlink: '/wiki/Mars_(Componist,_Iemand)' },
      },
    });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works.map((w) => w.title)).toEqual(['Mars']);
  });

  it('beperkt het aantal werken tot vijftig maar telt ze allemaal', async () => {
    const veel: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) {
      veel[i] = { id: `Werk ${i}`, permlink: `/wiki/Werk_${i}_(Componist,_Iemand)` };
    }
    stelZoekdienstIn({ iscr: veel });

    const resultaat = await searchImslp('');

    expect(resultaat.works).toHaveLength(50);
    expect(resultaat.totalCount).toBe(60);
  });
});

describe('Zoeken als IMSLP het laat afweten', () => {
  const opensearchAntwoord = [
    'mars',
    ['Marche militaire (Schubert, Franz)', 'Category:Schubert, Franz'],
    ['', ''],
    ['https://imslp.org/wiki/Marche_militaire', 'https://imslp.org/wiki/Category:Schubert'],
  ];

  it.each([404, 429, 500, 503])('wijkt bij status %i uit naar het tweede zoekadres', async (status) => {
    stelZoekdienstIn({ iscr: status, opensearch: opensearchAntwoord });

    const resultaat = await searchImslp('mars');

    expect(opensearchUrls()).toHaveLength(1);
    expect(resultaat.works).toHaveLength(1);
    expect(resultaat.works[0]).toMatchObject({
      title: 'Marche militaire',
      composer: 'Schubert, Franz',
      permalink: 'https://imslp.org/wiki/Marche_militaire',
    });
  });

  it('laat een categoriepagina niet als werk doorgaan', async () => {
    stelZoekdienstIn({ iscr: 500, opensearch: opensearchAntwoord });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works.map((w) => w.title)).not.toContain('Category:Schubert, Franz');
  });

  it('wijkt ook uit als het antwoord geen geldige JSON is', async () => {
    stelDienstIn((url) => {
      if (url.includes('API.ISCR.php')) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
          },
        };
      }
      return jsonAntwoord(opensearchAntwoord);
    });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works).toHaveLength(1);
  });

  it('geeft een leeg resultaat als ook het tweede adres het niet doet', async () => {
    stelZoekdienstIn({ iscr: 500, opensearch: 500 });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works).toEqual([]);
    expect(resultaat.totalCount).toBe(0);
    expect(resultaat.searchUrl).toContain('mars');
  });

  it.each([
    ['een object in plaats van een lijst', {}],
    ['een te korte lijst', ['mars', ['Marche']]],
    ['helemaal niets', null],
  ])('houdt het hoofd koel bij %s van het tweede adres', async (_naam, antwoord) => {
    stelZoekdienstIn({ iscr: 500, opensearch: antwoord });

    const resultaat = await searchImslp('mars');

    expect(resultaat.works).toEqual([]);
  });
});

describe('Zoeken op componist', () => {
  it('haalt de werken van de gevonden componist op', async () => {
    stelDienstIn((url) => {
      if (url.includes('type=1')) return jsonAntwoord({ 0: { id: 'Schubert, Franz' } });
      if (url.includes('type=3')) {
        return jsonAntwoord({
          metadata: { count: 2 },
          0: { id: 'Marche militaire', permlink: '/wiki/Marche_militaire_(Schubert,_Franz)' },
          1: { id: 'Nocturne', permlink: '/wiki/Nocturne_(Schubert,_Franz)' },
        });
      }
      return statusAntwoord(404);
    });

    const resultaat = await searchImslp('marche', 'Schubert, Franz');

    expect(resultaat.works).toHaveLength(1);
    expect(resultaat.works[0]).toMatchObject({ title: 'Marche militaire', composer: 'Schubert, Franz' });
    expect(resultaat.searchUrl).toContain(encodeURIComponent('Schubert, Franz marche'));
  });

  it('probeert het rechtstreekse zoekadres als de componist niets oplevert', async () => {
    stelDienstIn((url) => {
      if (url.includes('type=1')) return jsonAntwoord({ 0: { id: 'Onbekend, Iemand' } });
      if (url.includes('type=3')) return jsonAntwoord({});
      if (url.includes('action=opensearch')) {
        return jsonAntwoord([
          'marche',
          ['Marche militaire (Schubert, Franz)'],
          [''],
          ['https://imslp.org/wiki/Marche_militaire'],
        ]);
      }
      return statusAntwoord(404);
    });

    const resultaat = await searchImslp('marche', 'Onbekend, Iemand');

    expect(opensearchUrls()).toHaveLength(1);
    expect(resultaat.works.map((w) => w.title)).toEqual(['Marche militaire']);
  });

  it('gaat door als de werkenlijst van de componist stukloopt', async () => {
    stelDienstIn((url) => {
      if (url.includes('type=1')) return jsonAntwoord({ 0: { id: 'Schubert, Franz' } });
      if (url.includes('type=3')) return statusAntwoord(429);
      if (url.includes('action=opensearch')) return jsonAntwoord(['marche', [], [], []]);
      return statusAntwoord(404);
    });

    const resultaat = await searchImslp('marche', 'Schubert, Franz');

    expect(resultaat.works).toEqual([]);
    // Er is wel geprobeerd om het langs het andere adres alsnog te vinden.
    expect(opensearchUrls()).toHaveLength(1);
  });

  it('geeft via findWork alleen de werken terug', async () => {
    stelZoekdienstIn({
      iscr: { 0: { id: 'Mars', permlink: '/wiki/Mars_(Componist,_Iemand)' } },
    });

    const werken = await findWork('mars');

    expect(Array.isArray(werken)).toBe(true);
    expect(werken.map((w) => w.title)).toEqual(['Mars']);
  });
});

describe('Werkdetails ophalen', () => {
  const paginaAntwoord = (parse: unknown) => jsonAntwoord({ parse });

  it('leest titel, componist, toonsoort en bezetting uit de pagina', async () => {
    stelDienstIn(() =>
      paginaAntwoord({
        title: 'Sonata in C major (Mozart, Wolfgang Amadeus)',
        text: { '*': '' },
        categories: [
          { '*': 'Scores featuring the piano' },
          { '*': 'Pieces for orchestra' },
          { '*': 'Compositions by Composer X' },
          { title: 'Works first published in 1800' },
        ],
      }),
    );

    const werk = await getWorkDetails('12345');

    expect(werk).toMatchObject({
      id: '12345',
      title: 'Sonata in C major',
      composer: 'Mozart, Wolfgang Amadeus',
      key: 'C major',
      instrumentation: 'Scores featuring the piano, Pieces for orchestra',
      scores: [],
    });
    expect(werk!.permalink).toContain('Sonata_in_C_major');
  });

  it('haalt de bladmuziek uit de pagina en laat dubbele adressen weg', async () => {
    const html = `
      <a href="//ks.imslp.net/files/a/PMLP12345-Symphony_Breitkopf.pdf">Partituur</a>
      <a href="//ks.imslp.net/files/a/PMLP12345-Symphony_Breitkopf.pdf">Nog eens dezelfde</a>
      <a href="/files/b/Peters_score.pdf">Partij</a>
    `;
    stelDienstIn(() => paginaAntwoord({ title: 'Symphony (Componist, Iemand)', text: { '*': html } }));

    const werk = await getWorkDetails('12345');

    expect(werk!.scores).toHaveLength(2);
    expect(werk!.scores[0]).toMatchObject({
      id: '12345_0',
      filename: 'PMLP12345-Symphony_Breitkopf.pdf',
      description: 'Symphony Breitkopf',
      fileUrl: 'https://ks.imslp.net/files/a/PMLP12345-Symphony_Breitkopf.pdf',
      publisher: 'Breitkopf & Hartel',
    });
    expect(werk!.scores[1]).toMatchObject({
      fileUrl: 'https://imslp.org/files/b/Peters_score.pdf',
      publisher: 'C.F. Peters',
    });
  });

  it('laat de uitgever leeg als de bestandsnaam er geen noemt', async () => {
    stelDienstIn(() =>
      paginaAntwoord({ title: 'Mars', text: { '*': '<a href="/files/c/Onbekende_uitgever.pdf">x</a>' } }),
    );

    const werk = await getWorkDetails('1');

    expect(werk!.scores[0].publisher).toBe('');
  });

  it('valt terug op bestandspaginas als er geen los pdf-adres in staat', async () => {
    // De eerste zoekslag pakt alleen adressen die op .pdf eindigen. Een
    // bestandspagina met een parameter erachter valt daarbuiten; dan komt de
    // tweede zoekslag aan bod, die naar bestandspaginas kijkt.
    const html =
      '<a href="https://imslp.org/wiki/File:PMLP1-Mars.pdf?action=download">Bestand</a>' +
      '<a href="/wiki/Mars">Werk</a>';
    stelDienstIn(() => paginaAntwoord({ title: 'Mars', text: { '*': html } }));

    const werk = await getWorkDetails('1');

    expect(werk!.scores).toHaveLength(1);
    expect(werk!.scores[0].filename).toBe('PMLP1-Mars.pdf?action=download');
    expect(werk!.scores[0].fileUrl).toContain('Special:IMSLPFile');
  });

  it('geeft niets terug als IMSLP zegt dat het werk niet bestaat', async () => {
    stelDienstIn(() => jsonAntwoord({ error: { code: 'nosuchpageid', info: 'There is no page with ID 999' } }));

    await expect(getWorkDetails('999')).resolves.toBeNull();
  });

  /**
   * BEWIJS. Bij een antwoord zonder `parse` - een leeg antwoord, of een
   * onderhoudspagina die als JSON binnenkomt - las de code meteen
   * `parseResult.title`. Dat gooide een TypeError, die in routes/imslp.ts als
   * 502 "IMSLP is nu niet bereikbaar" naar buiten kwam. Maar IMSLP was wel
   * bereikbaar: het werk was er gewoon niet, en dat hoort net als bij
   * `data.error` een 404 te zijn.
   *
   * Zonder de reparatie in services/imslp.ts meldt vitest:
   *   AssertionError: promise rejected "TypeError: Cannot read properties of
   *   undefined (reading 'title')" instead of resolving
   */
  it.each([
    ['een leeg antwoord', {}],
    ['een antwoord zonder inhoud', { parse: null }],
    ['iets dat helemaal geen object is', 'onderhoud'],
  ])('geeft niets terug bij %s', async (_naam, antwoord) => {
    stelDienstIn(() => jsonAntwoord(antwoord));

    await expect(getWorkDetails('1')).resolves.toBeNull();
  });

  it.each([404, 429, 500])('geeft de fout door bij status %i', async (status) => {
    stelDienstIn(() => statusAntwoord(status));

    await expect(getWorkDetails('1')).rejects.toThrow(`IMSLP API error: ${status}`);
  });

  it('geeft een netwerkfout door', async () => {
    stelDienstIn(() => {
      throw new TypeError('fetch failed');
    });

    await expect(getWorkDetails('1')).rejects.toThrow('fetch failed');
  });
});

describe('Een pdf binnenhalen die achter een pagina zit', () => {
  const htmlAntwoord = (html: string) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html,
  });

  const pdfAntwoord = () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/pdf' }),
    arrayBuffer: async () => new ArrayBuffer(16),
  });

  it('volgt de downloadlink op een tussenpagina', async () => {
    stelDienstIn(() =>
      opgevraagd.length === 1 ? htmlAntwoord('<a href="/files/a/echt.pdf">Download</a>') : pdfAntwoord(),
    );

    const bestand = await downloadPdf('https://imslp.org/wiki/Special:IMSLPFile/mars.pdf');

    expect(bestand).toBeInstanceOf(Buffer);
    expect(bestand).toHaveLength(16);
    expect(opgevraagd[1]).toBe('https://imslp.org/files/a/echt.pdf');
  });

  it('volgt ook een doorverwijzing die in een script staat', async () => {
    stelDienstIn(() =>
      opgevraagd.length === 1
        ? htmlAntwoord('<script>window.location = "//ks2.imslp.net/files/a/echt.pdf";</script>')
        : pdfAntwoord(),
    );

    await expect(downloadPdf('https://imslp.org/mars.pdf')).resolves.toBeInstanceOf(Buffer);
    expect(opgevraagd[1]).toBe('https://ks2.imslp.net/files/a/echt.pdf');
  });

  it('laat de tussenpagina niet naar een vreemde host wijzen', async () => {
    // Het adres op de pagina komt net zo goed van buiten als het adres in de
    // aanvraag, en gaat dus langs dezelfde controle.
    stelDienstIn(() => htmlAntwoord('<a href="https://kwaadaardig.example/echt.pdf">Download</a>'));

    await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow(/host is not allowed/);
  });

  it('meldt het als er geen downloadlink op de pagina staat', async () => {
    stelDienstIn(() => htmlAntwoord('<p>Deze pagina is tijdelijk niet beschikbaar.</p>'));

    await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow('Could not find PDF download link');
  });

  it.each([404, 429, 500])('geeft status %i door als de download mislukt', async (status) => {
    stelDienstIn(() => ({ ok: false, status, headers: new Headers() }));

    await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow(`Failed to download PDF: ${status}`);
  });

  it('geeft ook de status door als het tweede verzoek mislukt', async () => {
    stelDienstIn(() =>
      opgevraagd.length === 1
        ? htmlAntwoord('<a href="/files/a/echt.pdf">Download</a>')
        : { ok: false, status: 403, headers: new Headers() },
    );

    await expect(downloadPdf('https://imslp.org/mars.pdf')).rejects.toThrow('Failed to download PDF: 403');
  });

  it('haalt een bestand zonder tussenpagina rechtstreeks binnen', async () => {
    stelDienstIn(() => pdfAntwoord());

    const bestand = await downloadPdf('https://ks5.imslp.net/files/a/mars.pdf');

    expect(bestand).toHaveLength(16);
    expect(opgevraagd).toHaveLength(1);
  });
});
