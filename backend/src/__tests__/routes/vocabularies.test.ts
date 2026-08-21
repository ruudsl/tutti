/**
 * Woordenlijsten (JSKOS): instrumenten, genres en componisten.
 *
 * Deze router is alleen-lezen en de gegevens zijn met opzet globaal - de
 * vocabulary_cache-tabel heeft geen association_id en de antwoordcache staat
 * hier bewust op varyByAssociation: false. De verenigingsgrens speelt hier dus
 * geen rol; wat er wel toe doet:
 *
 * - de volgorde van de routes: /instruments/tree staat boven /instruments/:uri
 *   en moet daar niet door worden afgevangen;
 * - de taalkeuze, die zowel het antwoord als (via de service) de sortering
 *   bepaalt en daarom niet zomaar in een SQL-opdracht mag belanden;
 * - het type: een genre-URI opvragen via /instruments hoort niets op te
 *   leveren, ook al staat het concept gewoon in dezelfde tabel.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import vocabulariesRoutes from '../../routes/vocabularies';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import { createTestAssociation, createTestEnvironment, createTestUser, generateTestToken } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/vocabularies', vocabulariesRoutes);
app.use(errorHandler);

const BLAZERS = 'urn:iaml:wind';
const TROMPET = 'urn:iaml:trumpet';
const FLUIT = 'urn:iaml:flute';
const FAGOT = 'urn:iaml:bassoon';
const MARS = 'urn:lcgft:march';
const MOZART = 'urn:gnd:mozart';

describe('woordenlijsten', () => {
  let lidToken: string;
  let andereVerenigingToken: string;

  beforeEach(() => {
    // De antwoordcache leeft op moduleniveau en overleeft het legen van de
    // database.
    invalidateAllCache();

    const omgeving = createTestEnvironment();
    lidToken = omgeving.memberToken;

    const andere = createTestAssociation({ name: 'Harmonie B' });
    andereVerenigingToken = generateTestToken(createTestUser(andere.id, { email: 'lid-b@test.com' }));

    zetConcept(BLAZERS, 'instrument', { nl: 'Blaasinstrumenten', en: 'Wind instruments' }, { narrower: [TROMPET] });
    zetConcept(
      TROMPET,
      'instrument',
      { nl: 'Trompet', en: 'Trumpet' },
      { broader: [BLAZERS], notation: 'wbt', altLabels: ['Bugel'] },
    );
    zetConcept(FLUIT, 'instrument', { nl: 'Fluit', en: 'Flute' });
    zetConcept(FAGOT, 'instrument', { nl: 'Fagot', en: 'Bassoon' });
    zetConcept(MARS, 'genre', { nl: 'Marsen', en: 'Marches' });
    zetConcept(MOZART, 'composer', { nl: 'Mozart, Wolfgang Amadeus' });
  });

  function zetConcept(
    uri: string,
    type: string,
    prefLabel: Record<string, string>,
    extra: {
      broader?: string[];
      narrower?: string[];
      notation?: string;
      altLabels?: string[];
      expiresAt?: string;
    } = {},
  ): void {
    db.prepare(
      `INSERT INTO vocabulary_cache (uri, vocabulary_type, pref_label, alt_labels, broader, narrower, notation, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uri,
      type,
      JSON.stringify(prefLabel),
      extra.altLabels ? JSON.stringify(extra.altLabels) : null,
      extra.broader ? JSON.stringify(extra.broader) : null,
      extra.narrower ? JSON.stringify(extra.narrower) : null,
      extra.notation ?? null,
      extra.expiresAt ?? '2099-01-01 00:00:00',
    );
  }

  const als = (token: string, pad: string) =>
    request(app).get(`/api/vocabularies${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (pad: string) => als(lidToken, pad);

  describe('GET /api/vocabularies/instruments', () => {
    it('geeft zonder zoekterm alle instrumenten, op Nederlandse naam gesorteerd', async () => {
      const antwoord = await alsLid('/instruments');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.instruments.map((i: any) => i.label)).toEqual([
        'Blaasinstrumenten',
        'Fagot',
        'Fluit',
        'Trompet',
      ]);
      expect(antwoord.body.total).toBe(4);
      // Genres en componisten staan in dezelfde tabel en horen hier niet bij.
      expect(antwoord.body.instruments.map((i: any) => i.uri)).not.toContain(MARS);
    });

    it('zoekt op het begin van de naam', async () => {
      const antwoord = await alsLid('/instruments?q=tro');

      expect(antwoord.body.instruments.map((i: any) => i.uri)).toEqual([TROMPET]);
      expect(antwoord.body.total).toBe(1);
      expect(antwoord.body.query).toBe('tro');
    });

    it('vindt een instrument ook op een alternatieve naam', async () => {
      const antwoord = await alsLid('/instruments?q=bug');

      expect(antwoord.body.instruments.map((i: any) => i.uri)).toEqual([TROMPET]);
    });

    it('beperkt het aantal resultaten maar meldt het volledige totaal', async () => {
      const antwoord = await alsLid('/instruments?q=fa&limit=1');

      // Zonder een juist totaal denkt de aanroeper dat hij alles heeft.
      expect(antwoord.body.instruments).toHaveLength(1);
      expect(antwoord.body.total).toBe(1);

      const breder = await alsLid('/instruments?q=f&limit=1');
      expect(breder.body.instruments).toHaveLength(1);
      expect(breder.body.total).toBe(2);
    });

    it('geeft de labels in de gevraagde taal', async () => {
      // De zoekterm moet bij de taal passen: de service zoekt in de gevraagde
      // taal, het Engels en het Duits - niet in het Nederlands als je om een
      // andere taal vraagt.
      const antwoord = await alsLid('/instruments?q=trum&lang=en');

      expect(antwoord.body.instruments[0].label).toBe('Trumpet');
      // De overige talen blijven meekomen, zodat de aanroeper zelf kan kiezen.
      expect(antwoord.body.instruments[0].labels.nl).toBe('Trompet');
    });

    it('valt terug op een andere taal als het label ontbreekt', async () => {
      const antwoord = await alsLid('/instruments?q=trum&lang=fr');

      expect(antwoord.body.instruments[0].label).toBe('Trumpet');
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/vocabularies/instruments');

      expect(antwoord.status).toBe(401);
    });
  });

  describe('GET /api/vocabularies/instruments/tree', () => {
    it('wordt niet afgevangen door de route voor /:uri', async () => {
      // /instruments/tree staat in de router boven /instruments/:uri. Draait
      // die volgorde om, dan wordt 'tree' als URI opgevat en volgt een 404.
      const antwoord = await alsLid('/instruments/tree');

      expect(antwoord.status).toBe(200);
      expect(Array.isArray(antwoord.body.tree)).toBe(true);
    });

    it('hangt een instrument onder zijn bovenliggende groep', async () => {
      const antwoord = await alsLid('/instruments/tree');

      const wortels = antwoord.body.tree.map((n: any) => n.uri);
      expect(wortels).toContain(BLAZERS);
      expect(wortels).not.toContain(TROMPET);

      const blazers = antwoord.body.tree.find((n: any) => n.uri === BLAZERS);
      expect(blazers.children.map((c: any) => c.uri)).toEqual([TROMPET]);
      expect(blazers.level).toBe(0);
      expect(blazers.children[0].level).toBe(1);
    });

    it('laat genres buiten de instrumentenboom', async () => {
      const antwoord = await alsLid('/instruments/tree');

      const alleUris = JSON.stringify(antwoord.body.tree);
      expect(alleUris).not.toContain(MARS);
    });
  });

  describe('GET /api/vocabularies/instruments/:uri', () => {
    it('geeft het instrument met zijn onderliggende concepten', async () => {
      const antwoord = await alsLid(`/instruments/${encodeURIComponent(BLAZERS)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.instrument.uri).toBe(BLAZERS);
      expect(antwoord.body.instrument.hasChildren).toBe(true);
      expect(antwoord.body.children.map((c: any) => c.uri)).toEqual([TROMPET]);
    });

    it('geeft 404 voor een onbekende URI', async () => {
      const antwoord = await alsLid(`/instruments/${encodeURIComponent('urn:bestaat:niet')}`);

      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 voor een URI die een genre is', async () => {
      // Het concept bestaat wel, maar niet als instrument. Zonder de
      // typecontrole zou /instruments elk concept uit de tabel teruggeven.
      const antwoord = await alsLid(`/instruments/${encodeURIComponent(MARS)}`);

      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 in plaats van een serverfout bij een onleesbare URI', async () => {
      const antwoord = await alsLid('/instruments/100%25');

      expect(antwoord.status).toBe(404);
    });
  });

  describe('GET /api/vocabularies/genres', () => {
    it('geeft alleen genres', async () => {
      const antwoord = await alsLid('/genres');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.genres.map((g: any) => g.uri)).toEqual([MARS]);
      expect(antwoord.body.total).toBe(1);
    });

    it('zoekt binnen de genres', async () => {
      const antwoord = await alsLid('/genres?q=mar');

      expect(antwoord.body.genres.map((g: any) => g.uri)).toEqual([MARS]);
      // Mozart begint ook met 'm', maar is een componist en hoort er niet bij.
      expect(antwoord.body.total).toBe(1);
    });

    it('geeft de genreboom zonder door /:uri te worden afgevangen', async () => {
      const antwoord = await alsLid('/genres/tree');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.tree.map((n: any) => n.uri)).toEqual([MARS]);
    });

    it('geeft een genre op URI', async () => {
      const antwoord = await alsLid(`/genres/${encodeURIComponent(MARS)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.genre.label).toBe('Marsen');
    });

    it('geeft 404 voor een URI die een instrument is', async () => {
      const antwoord = await alsLid(`/genres/${encodeURIComponent(TROMPET)}`);

      expect(antwoord.status).toBe(404);
    });
  });

  describe('GET /api/vocabularies/search', () => {
    it('vereist een zoekterm', async () => {
      const antwoord = await alsLid('/search');

      expect(antwoord.status).toBe(400);
    });

    it('zoekt zonder type door alle soorten heen', async () => {
      const antwoord = await alsLid('/search?q=m');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.type).toBe('all');
      const uris = antwoord.body.concepts.map((c: any) => c.uri);
      expect(uris).toContain(MARS);
      expect(uris).toContain(MOZART);
    });

    it('beperkt de zoektocht tot het gevraagde type', async () => {
      const antwoord = await alsLid('/search?q=m&type=genre');

      expect(antwoord.body.type).toBe('genre');
      expect(antwoord.body.concepts.map((c: any) => c.uri)).toEqual([MARS]);
      expect(antwoord.body.total).toBe(1);
    });

    it('geeft een leeg resultaat voor een term die niets oplevert', async () => {
      const antwoord = await alsLid('/search?q=zzz');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.concepts).toEqual([]);
      expect(antwoord.body.total).toBe(0);
    });
  });

  describe('GET /api/vocabularies/lookup', () => {
    it('vereist de parameter uris', async () => {
      const antwoord = await alsLid('/lookup');

      expect(antwoord.status).toBe(400);
    });

    it('geeft meerdere concepten in een keer', async () => {
      const antwoord = await alsLid(`/lookup?uris=${encodeURIComponent(`${TROMPET},${MARS}`)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.concepts.map((c: any) => c.uri).sort()).toEqual([MARS, TROMPET].sort());
    });

    it('slaat een onbekende URI over zonder te struikelen', async () => {
      const antwoord = await alsLid(`/lookup?uris=${encodeURIComponent(`${TROMPET},urn:bestaat:niet`)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.concepts.map((c: any) => c.uri)).toEqual([TROMPET]);
    });

    it('negeert spaties en lege waarden tussen de URIs', async () => {
      const antwoord = await alsLid(`/lookup?uris=${encodeURIComponent(` ${TROMPET} , , ${MARS} `)}`);

      expect(antwoord.body.concepts).toHaveLength(2);
    });
  });

  describe('GET /api/vocabularies/stats', () => {
    it('telt de concepten per soort', async () => {
      const antwoord = await alsLid('/stats');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.total).toBe(6);
      expect(antwoord.body.byType).toEqual({ instrument: 4, genre: 1, composer: 1 });
      expect(antwoord.body.expired).toBe(0);
    });

    it('telt een verlopen concept apart', async () => {
      zetConcept('urn:oud:concept', 'genre', { nl: 'Oud' }, { expiresAt: '2020-01-01 00:00:00' });

      const antwoord = await alsLid('/stats');

      expect(antwoord.body.expired).toBe(1);
      // Verlopen betekent 'toe aan verversen', niet 'weg': het concept telt
      // gewoon mee in het totaal en blijft opvraagbaar.
      expect(antwoord.body.total).toBe(7);
    });
  });

  describe('taalkeuze', () => {
    it('weigert een taalcode die SQL bevat', async () => {
      // De taalcode wordt in de service rechtstreeks in de SQL-tekst gezet
      // (json_extract(pref_label, '$.<taal>')). Zonder controle kan een
      // aanroeper daarmee de opdracht zelf sturen; met "nl') DESC --" draaide
      // de sortering van het antwoord om.
      const antwoord = await alsLid(`/instruments?lang=${encodeURIComponent("nl') DESC --")}`);

      expect(antwoord.status).toBe(400);
    });

    it('weigert een taalcode met SQL ook bij het zoeken', async () => {
      const antwoord = await alsLid(`/search?q=tro&lang=${encodeURIComponent("nl')) OR 1=1 --")}`);

      expect(antwoord.status).toBe(400);
    });

    it('weigert een taalcode met SQL in de boom', async () => {
      const antwoord = await alsLid(`/instruments/tree?lang=${encodeURIComponent("nl') DESC --")}`);

      expect(antwoord.status).toBe(400);
    });

    it('accepteert een gewone taalcode met streepje', async () => {
      const antwoord = await alsLid('/instruments?lang=nl-BE');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.instruments).toHaveLength(4);
      // Er is geen nl-BE-label, dus valt elk concept terug op het Engelse.
      const trompet = antwoord.body.instruments.find((i: any) => i.uri === TROMPET);
      expect(trompet.label).toBe('Trumpet');
    });
  });

  describe('gedeelde woordenlijst', () => {
    it('geeft een gebruiker van een andere vereniging hetzelfde antwoord', async () => {
      // De woordenlijst is globaal en de antwoordcache staat daarom bewust op
      // varyByAssociation: false. Dat is hier geen lek, maar het moet wel
      // kloppen: er staat niets verenigingsgebonden in het antwoord.
      const eerste = await alsLid('/instruments');
      const tweede = await als(andereVerenigingToken, '/instruments');

      expect(tweede.status).toBe(200);
      expect(tweede.body).toEqual(eerste.body);
    });

    it('weigert elk vocabulaireverzoek zonder token', async () => {
      for (const pad of ['/genres', '/instruments/tree', '/search?q=tro', '/lookup?uris=x', '/stats']) {
        const antwoord = await request(app).get(`/api/vocabularies${pad}`);
        expect(antwoord.status, pad).toBe(401);
      }
    });
  });
});
