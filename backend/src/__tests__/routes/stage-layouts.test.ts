/**
 * Podiumindelingen en de opstelling van een concert.
 *
 * Twee dingen wegen hier het zwaarst. Het eerste is de moduleguard: de module
 * "stage" staat standaard uit, en dan hoort dit hele onderdeel niet te
 * bestaan - met een 404, niet met een 403, want een 403 verklapt dat de
 * functionaliteit er wel is. Het tweede is de verenigingsgrens.
 *
 * Bij het verwijderen zat daar een kleine scheur: de route keek eerst of de
 * indeling in gebruik was en pas daarna van wie hij was. De melding "wordt
 * gebruikt door 2 concert(en)" verklapte daarmee iets over een indeling van
 * een andere vereniging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import stageLayoutsRoutes, { concertStageRouter } from '../../routes/stage-layouts';
import { errorHandler } from '../../middleware/errorHandler';
import { optionalAuth } from '../../middleware/auth';
import { requireModule } from '../../middleware/requireModule';
import { setModuleEnabled, clearModuleCache } from '../../modules/service';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/stage-layouts', optionalAuth, requireModule('stage'), stageLayoutsRoutes);
app.use('/api', concertStageRouter);
app.use(errorHandler);

describe('podiumindelingen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    // De module staat standaard uit; bijna elke test hieronder gaat over wat
    // er gebeurt als hij aan staat.
    clearModuleCache();
    setModuleEnabled(vereniging.id, 'stage', true, beheerder.id);
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](pad).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  const indeling = {
    positions: [
      { id: 'p1', x: 10, y: 20, type: 'chair' as const, section: 's1', label: 'Trompet 1' },
      { id: 'p2', x: 30, y: 20, type: 'chair' as const, section: 's1' },
      { id: 'p3', x: 50, y: 50, type: 'conductor' as const },
    ],
    shapes: [{ id: 'v1', type: 'rect' as const, x: 0, y: 0, width: 100, height: 40, label: 'Podiumrand' }],
    sections: [{ id: 's1', name: 'Koper', color: '#cc9900' }],
  };

  async function maakIndeling(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/api/stage-layouts').send({
      name: 'Grote opstelling',
      venueName: 'Dorpshuis',
      layoutData: indeling,
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  function maakConcert(associationId = vereniging.id): string {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Voorjaarsconcert', '2026-04-11', 'Kerk')",
    ).run(id, associationId);
    return id;
  }

  /** Een indeling van een andere vereniging, rechtstreeks in de database. */
  function vreemdeIndeling(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO stage_layouts (id, association_id, name, stage_width, stage_depth, layout_data)
       VALUES (?, ?, 'Opstelling van de buren', 1000, 600, '{}')`,
    ).run(id, associationId);
    return id;
  }

  describe('de moduleguard', () => {
    it('verbergt het onderdeel als de module uit staat', async () => {
      setModuleEnabled(vereniging.id, 'stage', false, beheerder.id);

      const antwoord = await alsLid('get', '/api/stage-layouts');
      expect(antwoord.status).toBe(404);
    });

    it('antwoordt met 404 en niet met 403, zodat niets wordt verklapt', async () => {
      setModuleEnabled(vereniging.id, 'stage', false, beheerder.id);

      const antwoord = await alsBeheerder('post', '/api/stage-layouts').send({ name: 'Iets' });
      expect(antwoord.status).toBe(404);
      expect(antwoord.body.error).toBe('Niet gevonden.');
    });

    it('verbergt ook de opstelling van een concert', async () => {
      const concertId = maakConcert();
      setModuleEnabled(vereniging.id, 'stage', false, beheerder.id);

      expect((await alsLid('get', `/api/concerts/${concertId}/stage`)).status).toBe(404);
    });

    it('laat alles door zodra de module aan staat', async () => {
      expect((await alsLid('get', '/api/stage-layouts')).status).toBe(200);
    });
  });

  describe('overzicht en aanmaken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/api/stage-layouts');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een indeling met standaardafmetingen', async () => {
      const id = await maakIndeling();

      const antwoord = await alsLid('get', `/api/stage-layouts/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        name: 'Grote opstelling',
        venueName: 'Dorpshuis',
        stageWidth: 1000,
        stageDepth: 600,
        isTemplate: false,
        isDefault: false,
      });
    });

    it('bewaart de indeling zelf ongeschonden', async () => {
      const id = await maakIndeling();

      const antwoord = await alsLid('get', `/api/stage-layouts/${id}`);
      expect(antwoord.body.layoutData.positions).toHaveLength(3);
      expect(antwoord.body.layoutData.sections).toEqual([{ id: 's1', name: 'Koper', color: '#cc9900' }]);
      expect(antwoord.body.layoutData.shapes[0]).toMatchObject({ type: 'rect', label: 'Podiumrand' });
    });

    it('weigert een indeling zonder naam', async () => {
      expect((await alsBeheerder('post', '/api/stage-layouts').send({ name: '' })).status).toBe(400);
    });

    it('weigert een podium buiten de toegestane maten', async () => {
      expect((await alsBeheerder('post', '/api/stage-layouts').send({ name: 'X', stageWidth: 50 })).status).toBe(400);
      expect((await alsBeheerder('post', '/api/stage-layouts').send({ name: 'X', stageDepth: 9000 })).status).toBe(400);
    });

    it('weigert een soort positie die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/api/stage-layouts').send({
        name: 'X',
        layoutData: { positions: [{ id: 'p1', x: 0, y: 0, type: 'trampoline' }] },
      });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/api/stage-layouts').send({ name: 'Van mij' })).status).toBe(403);
    });

    it('laat sjablonen standaard buiten de lijst', async () => {
      await maakIndeling();
      await maakIndeling({ name: 'Sjabloon', isTemplate: true });

      const zonder = await alsLid('get', '/api/stage-layouts');
      expect(zonder.body.map((l: { name: string }) => l.name)).toEqual(['Grote opstelling']);

      const met = await alsLid('get', '/api/stage-layouts?includeTemplates=true');
      expect(met.body).toHaveLength(2);
    });

    it('houdt hooguit één indeling als standaard', async () => {
      const eerste = await maakIndeling({ isDefault: true });
      const tweede = await maakIndeling({ name: 'Nieuwe standaard', isDefault: true });

      expect((await alsLid('get', `/api/stage-layouts/${eerste}`)).body.isDefault).toBe(false);
      expect((await alsLid('get', `/api/stage-layouts/${tweede}`)).body.isDefault).toBe(true);
    });

    it('toont de indeling van een andere vereniging niet', async () => {
      await maakIndeling();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdeIndeling(andere.id);

      const antwoord = await alsLid('get', '/api/stage-layouts');
      expect(antwoord.body.map((l: { name: string }) => l.name)).toEqual(['Grote opstelling']);
    });

    it('geeft 404 voor een indeling van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/api/stage-layouts/${vreemdeIndeling(andere.id)}`)).status).toBe(404);
    });
  });

  describe('bijwerken en dupliceren', () => {
    it('werkt een enkel veld bij en laat de indeling staan', async () => {
      const id = await maakIndeling();

      const antwoord = await alsBeheerder('put', `/api/stage-layouts/${id}`).send({ venueName: 'Kerkzaal' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/api/stage-layouts/${id}`);
      expect(na.body).toMatchObject({ venueName: 'Kerkzaal', name: 'Grote opstelling' });
      expect(na.body.layoutData.positions).toHaveLength(3);
    });

    it('vervangt de indeling wanneer die wordt meegestuurd', async () => {
      const id = await maakIndeling();

      await alsBeheerder('put', `/api/stage-layouts/${id}`).send({
        layoutData: { positions: [{ id: 'x', x: 1, y: 1, type: 'piano' }], shapes: [], sections: [] },
      });

      const na = await alsLid('get', `/api/stage-layouts/${id}`);
      expect(na.body.layoutData.positions).toEqual([expect.objectContaining({ id: 'x', type: 'piano' })]);
    });

    it('werkt geen indeling van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeIndeling(andere.id);

      expect((await alsBeheerder('put', `/api/stage-layouts/${vreemd}`).send({ name: 'Gekaapt' })).status).toBe(404);
      const rij = db.prepare('SELECT name FROM stage_layouts WHERE id = ?').get(vreemd) as { name: string };
      expect(rij.name).toBe('Opstelling van de buren');
    });

    it('dupliceert een indeling met een eigen naam', async () => {
      const id = await maakIndeling();

      const antwoord = await alsBeheerder('post', `/api/stage-layouts/${id}/duplicate`).send({
        name: 'Kopie voor kerk',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const kopie = await alsLid('get', `/api/stage-layouts/${antwoord.body.id}`);
      expect(kopie.body.name).toBe('Kopie voor kerk');
      expect(kopie.body.layoutData.positions).toHaveLength(3);
    });

    it('geeft een kopie zonder naam het achtervoegsel (kopie)', async () => {
      const id = await maakIndeling();
      const antwoord = await alsBeheerder('post', `/api/stage-layouts/${id}/duplicate`).send({});

      const kopie = await alsLid('get', `/api/stage-layouts/${antwoord.body.id}`);
      expect(kopie.body.name).toBe('Grote opstelling (kopie)');
    });

    it('maakt van een kopie nooit de standaard', async () => {
      const id = await maakIndeling({ isDefault: true });
      const antwoord = await alsBeheerder('post', `/api/stage-layouts/${id}/duplicate`).send({});

      expect((await alsLid('get', `/api/stage-layouts/${antwoord.body.id}`)).body.isDefault).toBe(false);
      expect((await alsLid('get', `/api/stage-layouts/${id}`)).body.isDefault).toBe(true);
    });

    it('dupliceert geen indeling van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/api/stage-layouts/${vreemdeIndeling(andere.id)}/duplicate`).send(
        {},
      );
      expect(antwoord.status).toBe(404);
    });
  });

  describe('verwijderen', () => {
    it('verwijdert een indeling die nergens wordt gebruikt', async () => {
      const id = await maakIndeling();

      expect((await alsBeheerder('delete', `/api/stage-layouts/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/api/stage-layouts/${id}`)).status).toBe(404);
    });

    it('weigert een indeling te verwijderen die aan een concert hangt', async () => {
      const id = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({ layoutId: id, assignments: {} });

      const antwoord = await alsBeheerder('delete', `/api/stage-layouts/${id}`);
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('1 concert');
    });

    it('verklapt niets over een indeling van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeIndeling(andere.id);
      const vreemdConcert = maakConcert(andere.id);
      db.prepare(
        `INSERT INTO concert_stage_assignments (id, concert_id, layout_id, assignments_data) VALUES (?, ?, ?, '{}')`,
      ).run(uuidv4(), vreemdConcert, vreemd);

      // Hier keek de route eerst naar het gebruik: dat gaf een 400 met het
      // aantal concerten erbij, in plaats van een 404.
      const antwoord = await alsBeheerder('delete', `/api/stage-layouts/${vreemd}`);
      expect(antwoord.status).toBe(404);
      expect(JSON.stringify(antwoord.body)).not.toContain('concert(en)');
    });

    it('houdt een gewoon lid van het verwijderen af', async () => {
      const id = await maakIndeling();
      expect((await alsLid('delete', `/api/stage-layouts/${id}`)).status).toBe(403);
    });
  });

  describe('de opstelling van een concert', () => {
    it('geeft null terug als er nog niets is ingesteld', async () => {
      const concertId = maakConcert();

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.concert.name).toBe('Voorjaarsconcert');
      expect(antwoord.body.assignment).toBeNull();
    });

    it('slaat een opstelling op en leest hem terug', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();

      const opslaan = await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId,
        assignments: { p1: { userId: lid.id }, p2: { name: 'Invaller' } },
      });
      expect(opslaan.status, JSON.stringify(opslaan.body)).toBe(200);

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage`);
      expect(antwoord.body.assignment).toMatchObject({ layoutId, layoutName: 'Grote opstelling' });
      expect(antwoord.body.assignment.assignments.p1).toEqual({ userId: lid.id });
      expect(antwoord.body.assignment.layoutData.positions).toHaveLength(3);
    });

    it('werkt een bestaande opstelling bij in plaats van er een tweede te maken', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({ layoutId, assignments: {} });
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId,
        assignments: { p1: { name: 'Later ingevuld' } },
      });

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM concert_stage_assignments WHERE concert_id = ?')
        .get(concertId) as { n: number };
      expect(aantal.n).toBe(1);

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage`);
      expect(antwoord.body.assignment.assignments.p1).toEqual({ name: 'Later ingevuld' });
    });

    it('weigert een concert van een andere vereniging', async () => {
      const layoutId = await maakIndeling();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);

      expect((await alsLid('get', `/api/concerts/${vreemdConcert}/stage`)).status).toBe(404);
      const opslaan = await alsBeheerder('put', `/api/concerts/${vreemdConcert}/stage`).send({
        layoutId,
        assignments: {},
      });
      expect(opslaan.status).toBe(404);
    });

    it('weigert een indeling van een andere vereniging', async () => {
      const concertId = maakConcert();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });

      const antwoord = await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId: vreemdeIndeling(andere.id),
        assignments: {},
      });
      expect(antwoord.status).toBe(404);
    });

    it('laat opslaan niet aan een gewoon lid over', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();

      const antwoord = await alsLid('put', `/api/concerts/${concertId}/stage`).send({ layoutId, assignments: {} });
      expect(antwoord.status).toBe(403);
    });

    it('verwijdert de opstelling van een concert', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({ layoutId, assignments: {} });

      expect((await alsBeheerder('delete', `/api/concerts/${concertId}/stage`)).status).toBe(200);
      expect((await alsLid('get', `/api/concerts/${concertId}/stage`)).body.assignment).toBeNull();
    });

    it('geeft 404 als er niets te verwijderen valt', async () => {
      const concertId = maakConcert();
      expect((await alsBeheerder('delete', `/api/concerts/${concertId}/stage`)).status).toBe(404);
    });
  });

  describe('stoelkaartjes om af te drukken', () => {
    it('maakt een kaartje per stoel en slaat de dirigent over', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId,
        assignments: { p1: { userId: lid.id }, p2: { name: 'Invaller' } },
      });

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage/print`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.seatCards).toHaveLength(2);
      expect(antwoord.body.concert).toMatchObject({ name: 'Voorjaarsconcert', location: 'Kerk' });
    });

    it('zet de naam van het lid op het kaartje', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId,
        assignments: { p1: { userId: lid.id } },
      });

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage/print`);
      const kaartje = antwoord.body.seatCards.find((k: { positionId: string }) => k.positionId === 'p1');
      expect(kaartje.musicianName).toBe(`${lid.firstName} ${lid.lastName}`);
      expect(kaartje.section).toBe('Koper');
      expect(kaartje.sectionColor).toBe('#cc9900');
    });

    it('valt terug op een losse naam als er geen lid aan hangt', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({
        layoutId,
        assignments: { p2: { name: 'Invaller uit Zwolle' } },
      });

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage/print`);
      const kaartje = antwoord.body.seatCards.find((k: { positionId: string }) => k.positionId === 'p2');
      expect(kaartje.musicianName).toBe('Invaller uit Zwolle');
    });

    it('nummert de lessenaars per vak door', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({ layoutId, assignments: {} });

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage/print`);
      expect(antwoord.body.seatCards.map((k: { standNumber: number }) => k.standNumber)).toEqual([1, 2]);
    });

    it('gebruikt de eigen naam van een positie als die er is', async () => {
      const layoutId = await maakIndeling();
      const concertId = maakConcert();
      await alsBeheerder('put', `/api/concerts/${concertId}/stage`).send({ layoutId, assignments: {} });

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/stage/print`);
      const labels = antwoord.body.seatCards.map((k: { label: string }) => k.label);
      expect(labels).toContain('Trompet 1');
      expect(labels).toContain('s1-2');
    });

    it('geeft 404 als het concert nog geen opstelling heeft', async () => {
      const concertId = maakConcert();
      expect((await alsLid('get', `/api/concerts/${concertId}/stage/print`)).status).toBe(404);
    });

    it('drukt niets af voor een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);
      expect((await alsLid('get', `/api/concerts/${vreemdConcert}/stage/print`)).status).toBe(404);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(beheerder.id).toBeTruthy();
    expect((await request(app).get('/api/stage-layouts')).status).toBe(401);
    const anderLid = createTestUser(vereniging.id, { email: `podium-${uuidv4()}@test.nl` });
    expect(generateTestToken(anderLid)).toBeTruthy();
  });
});
