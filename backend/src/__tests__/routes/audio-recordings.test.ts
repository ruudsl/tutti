/**
 * Audio-opnames van repetities en secties.
 *
 * Dit bestand stond op nul. Er lopen hier drie grenzen door elkaar:
 *
 * 1. de vereniging (association_id op de opname),
 * 2. de eigenaar - LET OP: de kolom heet `recorded_by`, niet `user_id` -
 *    waarbij een privé-opname alleen van de opnemer zelf is en een publieke
 *    opname van de hele vereniging,
 * 3. de schijf: /stream en DELETE plakken het opgeslagen pad achter
 *    process.cwd(), dus dat pad mag nooit buiten de uploadmap wijzen.
 *
 * Gevonden en gerepareerd: orchestraId, rehearsalId en musicTitleId kwamen
 * ongecontroleerd uit de body in de INSERT en de UPDATE terecht. Omdat GET
 * die kolommen via een LEFT JOIN met naam en al teruggeeft, kon een lid met
 * een id uit een andere vereniging de naam van hun orkest of van hun stuk in
 * het eigen scherm laten verschijnen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import audioRecordingsRoutes from '../../routes/audio-recordings';
import { errorHandler } from '../../middleware/errorHandler';
import {
  addUserToOrchestra,
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestRehearsal,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/audio-recordings', audioRecordingsRoutes);
app.use(errorHandler);

const opnameMap = path.join(process.cwd(), 'uploads', 'recordings');

/** WebM/Matroska EBML-header; isAudio() herkent dit als geldige audio. */
const echteWebm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 0x11)]);
/** Geen audio, hoe hard de client ook roept dat het audio/mpeg is. */
const nepAudio = Buffer.from('dit is gewoon tekst en zeker geen audio');

describe('audio-opnames', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;
  let anderLidToken: string;
  let beheerder: TestUser;
  let beheerderToken: string;
  let orkest: TestOrchestra;

  let andereVereniging: TestAssociation;
  let andereLid: TestUser;
  let andereToken: string;
  let andersOrkest: TestOrchestra;
  let andereTitelId: string;

  const aangemaakteBestanden: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
    anderLidToken = omgeving.musicCommitteeToken;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Fanfare' });

    // createTestEnvironment() gebruikt vaste e-mailadressen en users.email is
    // globaal uniek, dus de tweede vereniging wordt met de hand opgebouwd.
    andereVereniging = createTestAssociation({ name: 'Harmonie Buurdorp' });
    andereLid = createTestUser(andereVereniging.id, { email: `lid-b-${uuidv4()}@test.com` });
    andereToken = generateTestToken(andereLid);
    andersOrkest = createTestOrchestra(andereVereniging.id, { name: 'Orkest van B' });
    andereTitelId = maakTitel(andereVereniging.id, 'Geheim Stuk van B');
  });

  afterEach(() => {
    for (const bestand of aangemaakteBestanden.splice(0)) {
      try {
        fs.unlinkSync(bestand);
      } catch {
        // al opgeruimd door de route zelf
      }
    }
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/audio-recordings${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakTitel(associationId: string, titel: string): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(id, titel, associationId);
    return id;
  }

  /**
   * Zet een opname rechtstreeks in de database en schrijft het bijbehorende
   * bestand weg, zodat de streamroute er echt iets te lezen heeft.
   */
  function maakOpname(
    opties: {
      associationId?: string;
      opnemer?: string;
      titel?: string;
      publiek?: boolean;
      orkestId?: string | null;
      titelId?: string | null;
      instrumentId?: string | null;
      repetitieId?: string | null;
      inhoud?: Buffer;
      bestandspad?: string;
      wanneer?: string;
    } = {},
  ): { id: string; bestandspad: string; inhoud: Buffer } {
    const id = uuidv4();
    const inhoud = opties.inhoud ?? echteWebm;
    const bestandsnaam = `${id}.webm`;
    const bestandspad = opties.bestandspad ?? `/uploads/recordings/${bestandsnaam}`;

    if (!opties.bestandspad) {
      fs.mkdirSync(opnameMap, { recursive: true });
      fs.writeFileSync(path.join(opnameMap, bestandsnaam), inhoud);
      aangemaakteBestanden.push(path.join(opnameMap, bestandsnaam));
    }

    db.prepare(
      `INSERT INTO audio_recordings (
         id, association_id, orchestra_id, rehearsal_id, music_title_id, title, description,
         file_path, file_size, duration_seconds, mime_type, recorded_by, is_public,
         section_instrument_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      opties.associationId ?? vereniging.id,
      opties.orkestId ?? null,
      opties.repetitieId ?? null,
      opties.titelId ?? null,
      opties.titel ?? 'Repetitie 12 maart',
      null,
      bestandspad,
      inhoud.length,
      42,
      'audio/webm',
      opties.opnemer ?? lid.id,
      opties.publiek ? 1 : 0,
      opties.instrumentId ?? null,
      opties.wanneer ?? '2026-08-01 12:00:00',
    );

    return { id, bestandspad, inhoud };
  }

  /** Onthoudt de bestanden die de uploadroute zelf wegschrijft. */
  function onthoudGeuploadBestand(id: string): void {
    const rij = db.prepare('SELECT file_path FROM audio_recordings WHERE id = ?').get(id) as any;
    if (rij) aangemaakteBestanden.push(path.join(process.cwd(), rij.file_path));
  }

  describe('POST / (uploaden)', () => {
    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).post('/api/audio-recordings').field('title', 'Test');
      expect(antwoord.status).toBe(401);
    });

    it('weigert een verzoek zonder bestand', async () => {
      const antwoord = await alsLid('post', '/').field('title', 'Test');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('audio');
    });

    it('weigert een upload zonder titel', async () => {
      const antwoord = await alsLid('post', '/').attach('audio', echteWebm, {
        filename: 'opname.webm',
        contentType: 'audio/webm',
      });

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('Titel');
    });

    // De mimetype uit de browser is te vervalsen; de magic bytes niet.
    it('weigert een bestand dat alleen zegt dat het audio is', async () => {
      const antwoord = await alsLid('post', '/')
        .field('title', 'Nep')
        .attach('audio', nepAudio, { filename: 'opname.mp3', contentType: 'audio/mpeg' });

      expect(antwoord.status).toBe(400);
      expect(db.prepare('SELECT COUNT(*) as n FROM audio_recordings').get()).toMatchObject({ n: 0 });
    });

    it('weigert een bestandstype dat helemaal niet als audio wordt aangeboden', async () => {
      const antwoord = await alsLid('post', '/')
        .field('title', 'Document')
        .attach('audio', Buffer.from('%PDF-1.4'), { filename: 'stuk.pdf', contentType: 'application/pdf' });

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('bestandstype');
    });

    it('slaat de opname op met de eigen vereniging en de eigen naam eronder', async () => {
      const antwoord = await alsLid('post', '/')
        .field('title', 'Repetitie 12 maart')
        .field('description', 'tutti')
        .field('durationSeconds', '95')
        .attach('audio', echteWebm, { filename: 'opname.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(201);
      onthoudGeuploadBestand(antwoord.body.id);

      const rij = db.prepare('SELECT * FROM audio_recordings WHERE id = ?').get(antwoord.body.id) as any;
      expect(rij).toMatchObject({
        association_id: vereniging.id,
        recorded_by: lid.id,
        title: 'Repetitie 12 maart',
        description: 'tutti',
        duration_seconds: 95,
        is_public: 0,
      });
      expect(rij.file_path).toMatch(/^\/uploads\/recordings\/[0-9a-f-]+\.webm$/);
      expect(fs.existsSync(path.join(process.cwd(), rij.file_path))).toBe(true);
    });

    it('zet een opname alleen op publiek als daar expliciet om gevraagd wordt', async () => {
      const publiek = await alsLid('post', '/')
        .field('title', 'Publiek')
        .field('isPublic', 'true')
        .attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });
      onthoudGeuploadBestand(publiek.body.id);

      const prive = await alsLid('post', '/')
        .field('title', 'Prive')
        .field('isPublic', 'nee')
        .attach('audio', echteWebm, { filename: 'b.webm', contentType: 'audio/webm' });
      onthoudGeuploadBestand(prive.body.id);

      expect(
        (db.prepare('SELECT is_public FROM audio_recordings WHERE id = ?').get(publiek.body.id) as any).is_public,
      ).toBe(1);
      expect(
        (db.prepare('SELECT is_public FROM audio_recordings WHERE id = ?').get(prive.body.id) as any).is_public,
      ).toBe(0);
    });

    it('koppelt een orkest, repetitie en titel van de eigen vereniging', async () => {
      const titelId = maakTitel(vereniging.id, 'Bolero');
      const repetitie = createTestRehearsal(vereniging.id, beheerder.id);
      addUserToOrchestra(lid.id, orkest.id);

      const antwoord = await alsLid('post', '/')
        .field('title', 'Sectie koper')
        .field('orchestraId', orkest.id)
        .field('rehearsalId', repetitie.id)
        .field('musicTitleId', titelId)
        .attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(201);
      onthoudGeuploadBestand(antwoord.body.id);

      const rij = db.prepare('SELECT * FROM audio_recordings WHERE id = ?').get(antwoord.body.id) as any;
      expect(rij).toMatchObject({ orchestra_id: orkest.id, rehearsal_id: repetitie.id, music_title_id: titelId });
    });

    // De verenigingsgrens bij het aanmaken: een vreemd id mag niet in de
    // opname belanden, want GET geeft de naam erbij terug.
    it('weigert een orkest van een andere vereniging', async () => {
      const antwoord = await alsLid('post', '/')
        .field('title', 'Poging')
        .field('orchestraId', andersOrkest.id)
        .attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(400);
      expect(db.prepare('SELECT COUNT(*) as n FROM audio_recordings').get()).toMatchObject({ n: 0 });
    });

    it('weigert een titel van een andere vereniging', async () => {
      const antwoord = await alsLid('post', '/')
        .field('title', 'Poging')
        .field('musicTitleId', andereTitelId)
        .attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(400);
      expect(db.prepare('SELECT COUNT(*) as n FROM audio_recordings').get()).toMatchObject({ n: 0 });
    });

    it('weigert een repetitie van een andere vereniging', async () => {
      const vreemdeRepetitie = createTestRehearsal(andereVereniging.id, andereLid.id);

      const antwoord = await alsLid('post', '/')
        .field('title', 'Poging')
        .field('rehearsalId', vreemdeRepetitie.id)
        .attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });

      expect(antwoord.status).toBe(400);
    });

    // multer schrijft het bestand weg voordat de handler draait, dus elke
    // afwijzing daarna moet zelf opruimen.
    it('laat geen weesbestand achter als de upload alsnog wordt afgewezen', async () => {
      const voor = fs.existsSync(opnameMap) ? fs.readdirSync(opnameMap).length : 0;

      await alsLid('post', '/').attach('audio', echteWebm, { filename: 'a.webm', contentType: 'audio/webm' });

      const na = fs.existsSync(opnameMap) ? fs.readdirSync(opnameMap).length : 0;
      expect(na).toBe(voor);
    });
  });

  describe('GET / (overzicht)', () => {
    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/audio-recordings')).status).toBe(401);
    });

    it('geeft de eigen opnames met naam van de opnemer', async () => {
      maakOpname({ titel: 'Mijn opname' });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        title: 'Mijn opname',
        isPublic: false,
        recordedBy: { id: lid.id, name: 'Member User' },
      });
    });

    // De grens tussen leden: een privé-opname is van de opnemer alleen.
    it('toont de privé-opname van een ander lid niet', async () => {
      maakOpname({ opnemer: anderLid.id, titel: 'Prive van een ander' });

      expect((await alsLid('get', '/')).body).toEqual([]);
    });

    it('toont wel de publieke opname van een ander lid', async () => {
      maakOpname({ opnemer: anderLid.id, titel: 'Publiek', publiek: true });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((r: any) => r.title)).toEqual(['Publiek']);
    });

    it('laat met onlyPublic ook de eigen privé-opnames weg', async () => {
      maakOpname({ titel: 'Mijn prive' });
      maakOpname({ titel: 'Publiek', publiek: true });

      const antwoord = await alsLid('get', '/?onlyPublic=true');

      expect(antwoord.body.map((r: any) => r.title)).toEqual(['Publiek']);
    });

    // De verenigingsgrens: een publieke opname is publiek binnen de eigen
    // vereniging, niet daarbuiten.
    it('toont geen opnames van een andere vereniging, ook geen publieke', async () => {
      maakOpname({ associationId: andereVereniging.id, opnemer: andereLid.id, publiek: true, titel: 'Van B' });

      expect((await alsLid('get', '/')).body).toEqual([]);
    });

    it('filtert op orkest, repetitie, titel en sectie', async () => {
      const titelId = maakTitel(vereniging.id, 'Bolero');
      const repetitie = createTestRehearsal(vereniging.id, beheerder.id);
      const instrument = createTestInstrument({ name: `Trompet-${uuidv4().slice(0, 8)}` });
      maakOpname({
        titel: 'Gekoppeld',
        orkestId: orkest.id,
        repetitieId: repetitie.id,
        titelId,
        instrumentId: instrument.id,
      });
      maakOpname({ titel: 'Los' });

      for (const query of [
        `?orchestraId=${orkest.id}`,
        `?rehearsalId=${repetitie.id}`,
        `?musicTitleId=${titelId}`,
        `?sectionInstrumentId=${instrument.id}`,
      ]) {
        const antwoord = await alsLid('get', `/${query}`);
        expect(antwoord.body.map((r: any) => r.title)).toEqual(['Gekoppeld']);
      }
    });

    it('zet de nieuwste opname vooraan', async () => {
      maakOpname({ titel: 'Oud', wanneer: '2026-01-01 10:00:00' });
      maakOpname({ titel: 'Nieuw', wanneer: '2026-06-01 10:00:00' });

      expect((await alsLid('get', '/')).body.map((r: any) => r.title)).toEqual(['Nieuw', 'Oud']);
    });
  });

  describe('GET /:id', () => {
    it('geeft de eigen opname', async () => {
      const opname = maakOpname({ titel: 'Mijn opname' });

      const antwoord = await alsLid('get', `/${opname.id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ id: opname.id, title: 'Mijn opname' });
    });

    it('geeft 403 op de privé-opname van een ander lid', async () => {
      const opname = maakOpname({ opnemer: anderLid.id });

      expect((await alsLid('get', `/${opname.id}`)).status).toBe(403);
    });

    it('geeft de publieke opname van een ander lid wel', async () => {
      const opname = maakOpname({ opnemer: anderLid.id, publiek: true });

      expect((await alsLid('get', `/${opname.id}`)).status).toBe(200);
    });

    // Buiten de vereniging bestaat de opname niet eens: 404, geen 403, zodat
    // het bestaan van de opname niet bevestigd wordt.
    it('geeft 404 op een opname van een andere vereniging', async () => {
      const opname = maakOpname({ associationId: andereVereniging.id, opnemer: andereLid.id, publiek: true });

      expect((await alsLid('get', `/${opname.id}`)).status).toBe(404);
    });

    it('geeft 404 op een onbekende opname', async () => {
      expect((await alsLid('get', `/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('PATCH /:id', () => {
    it('werkt de eigen opname bij', async () => {
      const opname = maakOpname({ titel: 'Oud' });

      const antwoord = await alsLid('patch', `/${opname.id}`).send({
        title: 'Nieuw',
        description: 'aangevuld',
        isPublic: true,
      });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT * FROM audio_recordings WHERE id = ?').get(opname.id) as any;
      expect(rij).toMatchObject({ title: 'Nieuw', description: 'aangevuld', is_public: 1 });
    });

    it('laat de opname ongemoeid als er niets te wijzigen valt', async () => {
      const opname = maakOpname({ titel: 'Oud' });

      const antwoord = await alsLid('patch', `/${opname.id}`).send({});

      expect(antwoord.status).toBe(200);
      expect((db.prepare('SELECT title FROM audio_recordings WHERE id = ?').get(opname.id) as any).title).toBe('Oud');
    });

    it('weigert het bijwerken van de opname van een ander lid', async () => {
      const opname = maakOpname({ opnemer: anderLid.id, titel: 'Van een ander' });

      const antwoord = await alsLid('patch', `/${opname.id}`).send({ title: 'Gekaapt' });

      expect(antwoord.status).toBe(403);
      expect((db.prepare('SELECT title FROM audio_recordings WHERE id = ?').get(opname.id) as any).title).toBe(
        'Van een ander',
      );
    });

    // Bewuste ontwerpkeuze: de beheerder van de vereniging beheert het
    // archief en mag daarom wél bijwerken en verwijderen.
    it('laat de beheerder de opname van een lid wel bijwerken', async () => {
      const opname = maakOpname({ opnemer: lid.id });

      expect((await als(beheerderToken, 'patch', `/${opname.id}`).send({ title: 'Opgeruimd' })).status).toBe(200);
    });

    it('geeft 404 op een opname van een andere vereniging', async () => {
      const opname = maakOpname({ associationId: andereVereniging.id, opnemer: andereLid.id });

      const antwoord = await als(beheerderToken, 'patch', `/${opname.id}`).send({ title: 'Gekaapt' });

      expect(antwoord.status).toBe(404);
    });

    // De verenigingsgrens bij het bijwerken: hetzelfde lek als bij POST, maar
    // dan via de omweg van een bestaande eigen opname.
    it('weigert een titel of orkest van een andere vereniging aan de opname te hangen', async () => {
      const opname = maakOpname({ titel: 'Mijn opname' });

      expect((await alsLid('patch', `/${opname.id}`).send({ musicTitleId: andereTitelId })).status).toBe(400);
      expect((await alsLid('patch', `/${opname.id}`).send({ orchestraId: andersOrkest.id })).status).toBe(400);

      const rij = db.prepare('SELECT * FROM audio_recordings WHERE id = ?').get(opname.id) as any;
      expect(rij.music_title_id).toBeNull();
      expect(rij.orchestra_id).toBeNull();
    });

    it('kan een koppeling wel weer losmaken', async () => {
      const titelId = maakTitel(vereniging.id, 'Bolero');
      const opname = maakOpname({ titelId });

      const antwoord = await alsLid('patch', `/${opname.id}`).send({ musicTitleId: null });

      expect(antwoord.status).toBe(200);
      expect(
        (db.prepare('SELECT music_title_id FROM audio_recordings WHERE id = ?').get(opname.id) as any).music_title_id,
      ).toBeNull();
    });
  });

  describe('DELETE /:id', () => {
    it('verwijdert de eigen opname en het bestand', async () => {
      const opname = maakOpname();
      const opSchijf = path.join(process.cwd(), opname.bestandspad);
      expect(fs.existsSync(opSchijf)).toBe(true);

      const antwoord = await alsLid('delete', `/${opname.id}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM audio_recordings WHERE id = ?').get(opname.id)).toBeUndefined();
      expect(fs.existsSync(opSchijf)).toBe(false);
    });

    it('weigert het verwijderen van de opname van een ander lid', async () => {
      const opname = maakOpname({ opnemer: anderLid.id });

      expect((await alsLid('delete', `/${opname.id}`)).status).toBe(403);
      expect(db.prepare('SELECT id FROM audio_recordings WHERE id = ?').get(opname.id)).toBeDefined();
      expect(fs.existsSync(path.join(process.cwd(), opname.bestandspad))).toBe(true);
    });

    it('laat de beheerder de opname van een lid wel verwijderen', async () => {
      const opname = maakOpname({ opnemer: lid.id });

      expect((await als(beheerderToken, 'delete', `/${opname.id}`)).status).toBe(200);
    });

    it('geeft 404 op een opname van een andere vereniging', async () => {
      const opname = maakOpname({ associationId: andereVereniging.id, opnemer: andereLid.id });

      expect((await als(beheerderToken, 'delete', `/${opname.id}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM audio_recordings WHERE id = ?').get(opname.id)).toBeDefined();
    });

    // Padverkeer bij het verwijderen: een pad met '..' zou een willekeurig
    // bestand van de schijf halen. file_path wordt bij het uploaden zelf
    // gezet, maar de route moet daar niet blind op vertrouwen.
    it('verwijdert geen bestand buiten de uploadmap', async () => {
      const buitenstaander = path.join(process.cwd(), `niet-verwijderen-${uuidv4()}.txt`);
      fs.writeFileSync(buitenstaander, 'belangrijk');
      aangemaakteBestanden.push(buitenstaander);

      const opname = maakOpname({ bestandspad: `/uploads/recordings/../../${path.basename(buitenstaander)}` });

      const antwoord = await alsLid('delete', `/${opname.id}`);

      expect(antwoord.status).toBe(200);
      expect(fs.existsSync(buitenstaander)).toBe(true);
    });
  });

  describe('GET /:id/stream', () => {
    it('streamt de eigen opname', async () => {
      const opname = maakOpname();

      const antwoord = await alsLid('get', `/${opname.id}/stream`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toContain('audio/webm');
      expect(antwoord.headers['content-length']).toBe(String(opname.inhoud.length));
    });

    it('geeft 403 op de privé-opname van een ander lid', async () => {
      const opname = maakOpname({ opnemer: anderLid.id });

      expect((await alsLid('get', `/${opname.id}/stream`)).status).toBe(403);
    });

    it('streamt de publieke opname van een ander lid wel', async () => {
      const opname = maakOpname({ opnemer: anderLid.id, publiek: true });

      expect((await alsLid('get', `/${opname.id}/stream`)).status).toBe(200);
    });

    it('geeft 404 op een opname van een andere vereniging', async () => {
      const opname = maakOpname({ associationId: andereVereniging.id, opnemer: andereLid.id, publiek: true });

      expect((await alsLid('get', `/${opname.id}/stream`)).status).toBe(404);
    });

    it('geeft 404 als het bestand van de schijf verdwenen is', async () => {
      const opname = maakOpname();
      fs.unlinkSync(path.join(process.cwd(), opname.bestandspad));

      expect((await alsLid('get', `/${opname.id}/stream`)).status).toBe(404);
    });

    it('beantwoordt een Range-verzoek met 206 en het gevraagde stuk', async () => {
      const opname = maakOpname();

      const antwoord = await alsLid('get', `/${opname.id}/stream`).set('Range', 'bytes=0-3');

      expect(antwoord.status).toBe(206);
      expect(antwoord.headers['content-range']).toBe(`bytes 0-3/${opname.inhoud.length}`);
      expect(antwoord.headers['content-length']).toBe('4');
    });

    it('beantwoordt een open Range met de rest van het bestand', async () => {
      const opname = maakOpname();

      const antwoord = await alsLid('get', `/${opname.id}/stream`).set('Range', 'bytes=4-');

      expect(antwoord.status).toBe(206);
      expect(antwoord.headers['content-range']).toBe(`bytes 4-${opname.inhoud.length - 1}/${opname.inhoud.length}`);
    });

    // Padverkeer bij het uitleveren: het pad uit de database mag nooit buiten
    // de uploadmap wijzen, anders is de streamroute een leesvenster op de
    // hele server.
    it('serveert geen bestand buiten de uploadmap', async () => {
      const buitenstaander = path.join(process.cwd(), `geheim-${uuidv4()}.txt`);
      fs.writeFileSync(buitenstaander, 'staatsgeheim');
      aangemaakteBestanden.push(buitenstaander);

      const opname = maakOpname({ bestandspad: `/uploads/recordings/../../${path.basename(buitenstaander)}` });

      const antwoord = await alsLid('get', `/${opname.id}/stream`);

      expect(antwoord.status).toBe(404);
      expect(antwoord.text).not.toContain('staatsgeheim');
    });

    it('geeft geen serverfout bij een onzinnige Range-header', async () => {
      const opname = maakOpname();

      for (const range of ['bytes=onzin-', 'bytes=-', 'bytes=99999-100000', 'bytes=5-2']) {
        const antwoord = await alsLid('get', `/${opname.id}/stream`).set('Range', range);
        expect(antwoord.status).not.toBe(500);
      }
    });
  });
});
